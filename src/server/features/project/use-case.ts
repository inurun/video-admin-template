import fs from "node:fs/promises";
import {
  type SavedPage,
  type SavedProject,
  type SavedSequenceItem,
  type SavedTts,
  type VoicePreset,
  DEFAULT_PROJECT_META,
  DEFAULT_VOICE_PRESETS,
  savedProjectSchema,
  copyVoiceIdentity,
  hasVoiceIdentity,
  toVoiceIdentity,
} from "@/_schemas";
import { nowIso } from "@/_shared/lib/date/date";
import { getEffectiveTtsSynthesisSettings } from "@/server/features/tts/synthesis-settings";
import { normalizeProjectMeta } from "@/server/features/project/normalize-project-meta";
import {
  isProjectTtsSrc,
  listSavedProjects,
  readSavedProject,
  readSavedProjectDocument,
  createSavedProject,
  getProjectFileStem,
  resolvePublicAssetPath,
  writeSavedProject,
} from "@/server/_shared/storage";
import type {
  ProjectFileSummary,
  SavePageItem,
  SaveProjectChangesRequest,
  SaveSequenceItem,
  SaveTransitionItem,
  SaveTtsItem,
} from "@/server/features/project/contract";
import { isSaveTransitionItem, savePageItemSchema } from "@/server/features/project/contract";
import type { ServerEnv } from "@/server/core/env";
import { analyzeTexts } from "@/server/features/haqumei-api/analyze";
import { assertHaqumeiTextLength } from "@/server/features/haqumei-api/limits";
import {
  createPreviousTtsComparisonInput,
  createTtsComparisonInput,
  getTtsProvider,
} from "@/server/features/tts/providers/registry";
import {
  getUsableG2p,
  getEffectiveReadText,
  g2pAudioIdentity,
} from "@/server/features/tts/providers/comparison";
import { stableStringify } from "@/server/_shared/stable-stringify";
import type { PlannedSynthesis, TtsComparisonInput } from "@/server/features/tts/providers/types";
import { readCachedWav } from "@/server/features/tts/wav-cache";
import type { SynthesizeResponse } from "@/server/features/tts/contract";
import { AUDIO_PADDING_SECONDS } from "@/constants";
import { enqueueProjectMutation } from "@/server/features/project/project-mutation-queue";
import {
  hasInFlightSynthesisJob,
  startSynthesisBatch,
  type SynthesisJob,
} from "@/server/features/project/tts-synthesis-jobs";
import {
  startAnalysisBatch,
  type AnalysisJobTarget,
} from "@/server/features/project/tts-analysis-jobs";
import { listCommentGroupPlaybackTts } from "@/server/features/project/comments-presentation";
import { createTtsAnalysisKey } from "@/server/features/tts/analysis-key";
import { hasOpenRouterApiKey } from "@/server/features/tts/llm-g2p-profile";

const DEFAULT_TTS_PLAYBACK_SETTINGS = {
  padBeforeSec: 0,
  padAfterSec: 0,
  volume: 1,
};

function getTtsPlaybackSettings(
  item: Pick<SaveTtsItem, "padBeforeSec" | "padAfterSec" | "volume">,
) {
  return {
    padBeforeSec: item.padBeforeSec ?? DEFAULT_TTS_PLAYBACK_SETTINGS.padBeforeSec,
    padAfterSec: item.padAfterSec ?? DEFAULT_TTS_PLAYBACK_SETTINGS.padAfterSec,
    volume: item.volume ?? DEFAULT_TTS_PLAYBACK_SETTINGS.volume,
  };
}

function validateSequenceItems(items: Array<SaveSequenceItem | SavedSequenceItem>) {
  if (items.length === 0) {
    return;
  }

  const first = items[0];
  const last = items[items.length - 1];
  if (!first || !last) {
    return;
  }

  if (first.type === "transition" || last.type === "transition") {
    throw new Error("transition must be between content pages");
  }

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!item || item.type !== "transition") {
      continue;
    }

    const prev = items[index - 1];
    const next = items[index + 1];
    if (!prev || !next || prev.type === "transition" || next.type === "transition") {
      throw new Error(`transition ${item.id} must be between content pages`);
    }
  }
}

function validatePage(page: SavePageItem) {
  if (page.type === "comments") {
    savePageItemSchema.parse(page);
    return;
  }

  if (page.type !== "intro" && page.type !== "main") {
    return;
  }

  if (page.tts.length === 0) {
    throw new Error(`at least one tts is required for page ${page.id}`);
  }
}

function validateTts(item: SaveTtsItem) {
  if (!item.text.trim()) {
    throw new Error(`text is required for tts ${item.id}`);
  }

  if (!hasVoiceIdentity(item)) {
    throw new Error(`voice is required for tts ${item.id}`);
  }
}

async function audioFileExists(src: string) {
  if (!src.trim()) {
    return false;
  }

  try {
    await fs.access(resolvePublicAssetPath(src));
    return true;
  } catch {
    return false;
  }
}

function withEffectiveSynthesisSettings<T extends SaveTtsItem>(
  item: T,
  presets: Record<string, VoicePreset>,
): T {
  const synthesisSettings = getEffectiveTtsSynthesisSettings(item, presets);
  return {
    ...item,
    synthesisSettings: synthesisSettings ?? undefined,
  };
}

function comparisonSnapshot(input: TtsComparisonInput<SaveTtsItem["provider"]>) {
  return {
    ...input,
    g2p: g2pAudioIdentity(input.g2p),
  };
}

function comparisonInputMatches(
  item: SaveTtsItem,
  previous: SavedTts,
  nextPresets: Record<string, VoicePreset>,
  previousPresets: Record<string, VoicePreset>,
) {
  return (
    stableStringify(
      comparisonSnapshot(
        createPreviousTtsComparisonInput(withEffectiveSynthesisSettings(previous, previousPresets)),
      ),
    ) ===
    stableStringify(
      comparisonSnapshot(
        createTtsComparisonInput(withEffectiveSynthesisSettings(item, nextPresets)),
      ),
    )
  );
}

type TtsReuseKind = "ready" | "pending" | "analyzing" | "none";

function canKeepAnalyzing(item: SaveTtsItem, previous: SavedTts) {
  if (previous.audio.status !== "analyzing") {
    return false;
  }
  if (item.provider === "voicepeak" || previous.provider === "voicepeak") {
    return false;
  }
  if (!getTtsProvider(item.provider).usesG2p) {
    return false;
  }

  const previousReadText = getEffectiveReadText(previous);
  const nextReadText = getEffectiveReadText(item);
  if (item.text !== previous.text || nextReadText !== previousReadText) {
    return false;
  }

  // 生成中に手で書いた g2p が届いたら、生成を待たずにそれで合成する。
  return !getUsableG2p(item.speech?.g2p, nextReadText);
}

async function classifyTtsReuse(
  item: SaveTtsItem,
  projectPath: string,
  previous: SavedTts | undefined,
  nextPresets: Record<string, VoicePreset>,
  previousPresets: Record<string, VoicePreset>,
  forceResynthesis: boolean,
): Promise<TtsReuseKind> {
  if (!previous) {
    return "none";
  }

  if (canKeepAnalyzing(item, previous)) {
    return "analyzing";
  }

  if (forceResynthesis || previous.audio.status === "failed") {
    return "none";
  }

  if (!comparisonInputMatches(item, previous, nextPresets, previousPresets)) {
    return "none";
  }

  if (previous.audio.status === "pending") {
    return "pending";
  }

  if (previous.audio.status === "analyzing" || previous.audio.status === "idle") {
    return "none";
  }

  if (!isProjectTtsSrc(previous.audio.src, projectPath)) {
    return "none";
  }

  if (!(await audioFileExists(previous.audio.src))) {
    return "none";
  }

  return "ready";
}

type PlannedTts = {
  item: SaveTtsItem;
  previous?: SavedTts;
  nextInput: TtsComparisonInput<SaveTtsItem["provider"]>;
  reuse: TtsReuseKind;
  spoken: boolean;
  needsG2pAnalyze: boolean;
};

function computeNeedsG2pAnalyze(
  reuse: TtsReuseKind,
  spoken: boolean,
  nextInput: TtsComparisonInput<SaveTtsItem["provider"]>,
) {
  if (reuse !== "none" || !spoken) {
    return false;
  }

  if (!getTtsProvider(nextInput.provider).usesG2p) {
    return false;
  }

  return !getUsableG2p(nextInput.g2p, nextInput.readText);
}

/** LLM が使えないときだけ、保存時に analyze で g2p を埋める。使えるときは analyzing にして後で生成する。 */
async function assignBatchG2p(serverEnv: ServerEnv, plans: PlannedTts[]) {
  const targets = plans.filter((plan) => plan.needsG2pAnalyze);
  if (targets.length === 0 || hasOpenRouterApiKey(serverEnv)) {
    return;
  }

  for (const plan of targets) {
    assertHaqumeiTextLength(plan.nextInput.readText, plan.item.id);
  }

  const items = await analyzeTexts(
    serverEnv,
    targets.map((plan) => plan.nextInput.readText),
  );

  for (const [index, plan] of targets.entries()) {
    const g2p = items[index];
    if (!g2p) {
      throw new Error(`haqumei-api analyze returned no item for tts ${plan.item.id}`);
    }
    plan.nextInput = { ...plan.nextInput, g2p };
  }
}

function voiceFieldsFromComparison(nextInput: TtsComparisonInput<SaveTtsItem["provider"]>) {
  if (nextInput.provider === "coeiroink") {
    return {
      provider: "coeiroink" as const,
      speakerUuid: nextInput.speakerUuid,
      styleId: nextInput.styleId,
      modelVersion: nextInput.modelVersion,
    };
  }

  return {
    provider: nextInput.provider,
    voiceName: nextInput.voiceName,
    ...(nextInput.voiceVersion ? { voiceVersion: nextInput.voiceVersion } : {}),
  };
}

function createTtsFields(
  item: SaveTtsItem,
  nextInput: TtsComparisonInput<SaveTtsItem["provider"]>,
) {
  return {
    id: item.id,
    text: item.text,
    readText: nextInput.readText,
    ...voiceFieldsFromComparison(nextInput),
    ...getTtsPlaybackSettings(item),
    ...(item.synthesisSettings ? { synthesisSettings: item.synthesisSettings } : {}),
    ...(item.avatar ? { avatar: item.avatar } : {}),
    speech: nextInput.g2p ? { g2p: nextInput.g2p } : {},
  };
}

function createReusedSavedTts(item: SaveTtsItem, previous: SavedTts) {
  return {
    ...createTtsFields(item, createPreviousTtsComparisonInput(previous)),
    audio: previous.audio,
  };
}

function createReadySavedTts(
  item: SaveTtsItem,
  nextInput: TtsComparisonInput<SaveTtsItem["provider"]>,
  audio: SynthesizeResponse,
) {
  return {
    ...createTtsFields(item, nextInput),
    audio: {
      status: "ready" as const,
      src: audio.audioSrc,
      durationSec: audio.durationSec + AUDIO_PADDING_SECONDS,
    },
  };
}

function createPendingSavedTts(
  item: SaveTtsItem,
  nextInput: TtsComparisonInput<SaveTtsItem["provider"]>,
  audioSrc: string,
) {
  return {
    ...createTtsFields(item, nextInput),
    audio: {
      status: "pending" as const,
      src: audioSrc,
    },
  };
}

function createAnalyzingSavedTts(
  item: SaveTtsItem,
  nextInput: TtsComparisonInput<SaveTtsItem["provider"]>,
  analysisKey: string,
) {
  return {
    ...createTtsFields(item, nextInput),
    audio: {
      status: "analyzing" as const,
      analysisKey,
    },
  };
}

function createIdleSavedTts(
  item: SaveTtsItem,
  nextInput: TtsComparisonInput<SaveTtsItem["provider"]>,
) {
  return {
    ...createTtsFields(item, nextInput),
    audio: { status: "idle" as const },
  };
}

function createAnalyzingReuseTts(
  item: SaveTtsItem,
  nextInput: TtsComparisonInput<SaveTtsItem["provider"]>,
  previous: SavedTts,
) {
  if (previous.audio.status !== "analyzing") {
    throw new Error(`expected analyzing audio for tts ${item.id}`);
  }

  return {
    ...createTtsFields(item, { ...nextInput, g2p: previous.speech.g2p }),
    audio: previous.audio,
  };
}

async function planSavedTts(
  projectPath: string,
  item: SaveTtsItem,
  previous: SavedTts | undefined,
  nextPresets: Record<string, VoicePreset>,
  previousPresets: Record<string, VoicePreset>,
  spoken: boolean,
  forceResynthesis = false,
): Promise<PlannedTts> {
  validateTts(item);
  const nextInput = createTtsComparisonInput(withEffectiveSynthesisSettings(item, nextPresets));
  const reuse = await classifyTtsReuse(
    item,
    projectPath,
    previous,
    nextPresets,
    previousPresets,
    forceResynthesis,
  );
  return {
    item,
    previous,
    nextInput,
    reuse,
    spoken,
    needsG2pAnalyze: computeNeedsG2pAnalyze(reuse, spoken, nextInput),
  };
}

function planProviderSynthesis(
  serverEnv: ServerEnv,
  projectPath: string,
  itemId: string,
  nextInput: TtsComparisonInput<SaveTtsItem["provider"]>,
): PlannedSynthesis {
  const provider = getTtsProvider(nextInput.provider);
  if (provider.usesG2p) {
    assertHaqumeiTextLength(nextInput.readText, itemId);
  }

  return provider.plan(serverEnv, {
    ...nextInput,
    projectPath,
  } as never);
}

function shouldSkipPendingJob(
  projectPath: string,
  previous: SavedTts | undefined,
  audioSrc: string,
  forceResynthesis: boolean,
) {
  if (!forceResynthesis || !previous || previous.audio.status !== "pending") {
    return false;
  }

  return previous.audio.src === audioSrc && hasInFlightSynthesisJob(projectPath, audioSrc);
}

async function buildSavedTts(
  serverEnv: ServerEnv,
  projectPath: string,
  pageId: string,
  plan: PlannedTts,
  forceResynthesis: boolean,
): Promise<{ tts: SavedTts; job?: SynthesisJob; analysis?: AnalysisJobTarget }> {
  if (plan.reuse === "analyzing" && plan.previous?.audio.status === "analyzing") {
    return {
      tts: createAnalyzingReuseTts(plan.item, plan.nextInput, plan.previous) as SavedTts,
      analysis: forceResynthesis
        ? {
            pageId,
            ttsId: plan.item.id,
            analysisKey: plan.previous.audio.analysisKey,
          }
        : undefined,
    };
  }

  if (plan.reuse !== "none" && plan.previous) {
    return { tts: createReusedSavedTts(plan.item, plan.previous) as SavedTts };
  }

  if (!plan.spoken) {
    return { tts: createIdleSavedTts(plan.item, plan.nextInput) as SavedTts };
  }

  if (plan.needsG2pAnalyze && hasOpenRouterApiKey(serverEnv)) {
    const analysisKey = createTtsAnalysisKey({
      projectPath,
      pageId,
      ttsId: plan.item.id,
      provider: plan.nextInput.provider,
      text: plan.item.text,
      effectiveReadText: plan.nextInput.readText,
    });
    return {
      tts: createAnalyzingSavedTts(
        plan.item,
        { ...plan.nextInput, g2p: undefined },
        analysisKey,
      ) as SavedTts,
      analysis: {
        pageId,
        ttsId: plan.item.id,
        analysisKey,
      },
    };
  }

  const planned = planProviderSynthesis(serverEnv, projectPath, plan.item.id, plan.nextInput);
  const cached = await readCachedWav(planned.wav);
  if (cached) {
    return {
      tts: createReadySavedTts(plan.item, plan.nextInput, cached) as SavedTts,
    };
  }

  const tts = createPendingSavedTts(plan.item, plan.nextInput, planned.wav.audioSrc) as SavedTts;
  if (shouldSkipPendingJob(projectPath, plan.previous, planned.wav.audioSrc, forceResynthesis)) {
    return { tts };
  }

  return {
    tts,
    job: {
      pageId,
      ttsId: plan.item.id,
      wav: planned.wav,
      run: planned.run,
    },
  };
}

function listSavePageTtsInPlaybackOrder(page: SavePageItem) {
  if (page.type !== "comments") {
    return page.tts;
  }
  return listCommentGroupPlaybackTts(
    page.commentGroups,
    page.commentScenes,
    page.tts,
    page.meta.presentation,
  );
}

async function planSavedPage(
  projectPath: string,
  page: SavePageItem,
  previousTtsById: Map<string, SavedTts>,
  nextPresets: Record<string, VoicePreset>,
  previousPresets: Record<string, VoicePreset>,
  forceResynthesis = false,
) {
  validatePage(page);
  const spokenTtsIds = new Set(listSavePageTtsInPlaybackOrder(page).map((item) => item.id));
  const tts = await Promise.all(
    page.tts.map((item) =>
      planSavedTts(
        projectPath,
        item,
        previousTtsById.get(item.id),
        nextPresets,
        previousPresets,
        spokenTtsIds.has(item.id),
        forceResynthesis,
      ),
    ),
  );

  return { page, tts };
}

async function buildSavedPage(
  serverEnv: ServerEnv,
  projectPath: string,
  planned: { page: SavePageItem; tts: PlannedTts[] },
  forceResynthesis: boolean,
): Promise<{ page: SavedPage; jobs: SynthesisJob[]; analysisTargets: AnalysisJobTarget[] }> {
  const built = await Promise.all(
    planned.tts.map((plan) =>
      buildSavedTts(serverEnv, projectPath, planned.page.id, plan, forceResynthesis),
    ),
  );
  const tts = built.map((item) => item.tts);
  const jobs = built.flatMap((item) => (item.job ? [item.job] : []));
  const analysisTargets = built.flatMap((item) => (item.analysis ? [item.analysis] : []));
  const page = planned.page;

  if (page.type === "comments") {
    return {
      jobs,
      analysisTargets,
      page: {
        id: page.id,
        title: page.title,
        type: "comments",
        meta: page.meta,
        comments: page.comments,
        commentGroups: page.commentGroups,
        commentScenes: page.commentScenes,
        padBeforeSec: page.padBeforeSec,
        padAfterSec: page.padAfterSec,
        richText: null,
        tts,
      },
    };
  }

  return {
    jobs,
    analysisTargets,
    page: {
      id: page.id,
      title: page.title,
      type: page.type,
      meta: page.meta,
      padBeforeSec: page.padBeforeSec,
      padAfterSec: page.padAfterSec,
      richText: page.richText,
      tts,
    } as SavedPage,
  };
}

function buildSavedTransition(transition: SaveTransitionItem) {
  return {
    id: transition.id,
    type: "transition" as const,
    variant: transition.variant,
  };
}

function buildPreviousTtsMap(previousProject?: SavedProject) {
  return new Map(
    previousProject?.pages
      .filter((item) => item.type !== "transition")
      .flatMap((page) => page.tts)
      .map((item) => [item.id, item]) ?? [],
  );
}

function toSaveTtsItemFromSaved(item: SavedTts): SaveTtsItem {
  const identity = toVoiceIdentity(item);
  return {
    id: item.id,
    text: item.text,
    readText: item.readText,
    ...(identity ? copyVoiceIdentity(identity) : { provider: item.provider }),
    padBeforeSec: item.padBeforeSec,
    padAfterSec: item.padAfterSec,
    volume: item.volume,
    ...(item.synthesisSettings ? { synthesisSettings: item.synthesisSettings } : {}),
    ...(item.avatar ? { avatar: item.avatar } : {}),
    speech: item.speech.g2p ? { g2p: item.speech.g2p } : {},
  } as SaveTtsItem;
}

function toSavePageItemFromSaved(page: SavedPage): SavePageItem {
  const tts = page.tts.map(toSaveTtsItemFromSaved);
  if (page.type === "outro") {
    return {
      id: page.id,
      title: page.title,
      type: "outro",
      meta: page.meta,
      padBeforeSec: page.padBeforeSec,
      padAfterSec: page.padAfterSec,
      richText: page.richText,
      tts,
    };
  }

  if (page.type === "endcard") {
    return {
      id: page.id,
      title: page.title,
      type: "endcard",
      meta: page.meta,
      padBeforeSec: page.padBeforeSec,
      padAfterSec: page.padAfterSec,
      richText: page.richText,
      tts,
    };
  }

  if (page.type === "comments") {
    return {
      id: page.id,
      title: page.title,
      type: "comments",
      meta: page.meta,
      comments: page.comments,
      commentGroups: page.commentGroups,
      commentScenes: page.commentScenes,
      padBeforeSec: page.padBeforeSec,
      padAfterSec: page.padAfterSec,
      richText: null,
      tts,
    };
  }

  return {
    id: page.id,
    title: page.title,
    type: page.type,
    meta: page.meta,
    padBeforeSec: page.padBeforeSec,
    padAfterSec: page.padAfterSec,
    richText: page.richText,
    tts,
  };
}

function pageNeedsResynthesisForPresets(
  page: SavedPage,
  previousPresets: Record<string, VoicePreset>,
  nextPresets: Record<string, VoicePreset>,
) {
  return page.tts.some((item) => {
    return (
      stableStringify(getEffectiveTtsSynthesisSettings(item, previousPresets)) !==
      stableStringify(getEffectiveTtsSynthesisSettings(item, nextPresets))
    );
  });
}

function resolveSequenceOrder(
  previous: SavedProject,
  itemsById: Map<string, SavedSequenceItem>,
  sequenceOrder: string[] | undefined,
) {
  const requested = sequenceOrder ?? previous.pages.map((item) => item.id);
  const nextOrder = requested.filter((itemId) => itemsById.has(itemId));
  for (const itemId of itemsById.keys()) {
    if (!nextOrder.includes(itemId)) {
      nextOrder.push(itemId);
    }
  }
  return nextOrder;
}

export async function listProjects(): Promise<ProjectFileSummary[]> {
  return listSavedProjects();
}

export async function createProject(projectPath: string) {
  return createSavedProject(
    projectPath,
    savedProjectSchema.parse({
      meta: {
        ...DEFAULT_PROJECT_META,
        title: getProjectFileStem(projectPath),
        updatedAt: nowIso(),
      },
      bgm: [],
      pages: [],
      voicePresets: DEFAULT_VOICE_PRESETS,
    }),
  );
}

export async function copyProject(sourceProjectPath: string, targetProjectPath: string) {
  const project = await readSavedProject(sourceProjectPath);
  return createSavedProject(targetProjectPath, {
    ...project,
    meta: {
      ...project.meta,
      updatedAt: nowIso(),
    },
  });
}

export async function loadProject(projectPath: string) {
  return readSavedProjectDocument(projectPath);
}

async function saveProjectChangesLocked(
  serverEnv: ServerEnv,
  projectPath: string,
  request: SaveProjectChangesRequest,
) {
  const previousDocument = await readSavedProjectDocument(projectPath);
  const previousProject = previousDocument.project;
  const itemsById = new Map(previousProject.pages.map((item) => [item.id, item]));
  const updatedItemIds: string[] = [];

  for (const itemId of request.removedItemIds) {
    itemsById.delete(itemId);
  }

  const nextPresets = request.project?.voicePresets ?? previousProject.voicePresets ?? {};
  const previousPresets = previousProject.voicePresets ?? {};
  const pagesToProcess = new Map<string, SavePageItem>();
  const forceResynthesis = Boolean(request.forceResynthesis);
  const presetsUnchanged = stableStringify(previousPresets) === stableStringify(nextPresets);

  for (const item of request.upsertItems) {
    if (isSaveTransitionItem(item)) {
      itemsById.set(item.id, buildSavedTransition(item));
      updatedItemIds.push(item.id);
      continue;
    }
    pagesToProcess.set(item.id, item);
  }

  if (forceResynthesis) {
    for (const [itemId, saved] of itemsById) {
      if (pagesToProcess.has(itemId) || saved.type === "transition") {
        continue;
      }
      pagesToProcess.set(itemId, toSavePageItemFromSaved(saved));
    }
  } else if (request.project && !presetsUnchanged) {
    for (const [itemId, saved] of itemsById) {
      if (pagesToProcess.has(itemId) || saved.type === "transition") {
        continue;
      }
      if (pageNeedsResynthesisForPresets(saved, previousPresets, nextPresets)) {
        pagesToProcess.set(itemId, toSavePageItemFromSaved(saved));
      }
    }
  }

  const previousTtsById = buildPreviousTtsMap(previousProject);
  const plannedPages = await Promise.all(
    [...pagesToProcess.values()].map((page) =>
      planSavedPage(
        projectPath,
        page,
        previousTtsById,
        nextPresets,
        previousPresets,
        forceResynthesis,
      ),
    ),
  );
  await assignBatchG2p(
    serverEnv,
    plannedPages.flatMap((planned) => planned.tts),
  );

  const jobs: SynthesisJob[] = [];
  const analysisJobs: AnalysisJobTarget[] = [];
  for (const planned of plannedPages) {
    const built = await buildSavedPage(serverEnv, projectPath, planned, forceResynthesis);
    itemsById.set(built.page.id, built.page);
    jobs.push(...built.jobs);
    analysisJobs.push(...built.analysisTargets);
    if (!updatedItemIds.includes(built.page.id)) {
      updatedItemIds.push(built.page.id);
    }
  }

  const sequenceOrder = resolveSequenceOrder(previousProject, itemsById, request.sequenceOrder);
  const assembled = sequenceOrder.flatMap((itemId) => {
    const item = itemsById.get(itemId);
    return item ? [item] : [];
  });
  validateSequenceItems(assembled);
  const pages = assembled;

  const meta = {
    ...normalizeProjectMeta(request.project?.meta ?? previousProject.meta, {
      titleFallback: getProjectFileStem(projectPath),
    }),
    updatedAt: nowIso(),
  };
  const saved = savedProjectSchema.parse({
    meta,
    bgm: request.project?.bgm ?? previousProject.bgm,
    pages,
    voicePresets: nextPresets,
  });
  const { project, timeline } = await writeSavedProject(
    projectPath,
    saved,
    previousDocument.timeline,
  );
  startAnalysisBatch(serverEnv, projectPath, analysisJobs);
  startSynthesisBatch(projectPath, jobs);
  return { project, timeline, updatedItemIds };
}

export async function saveProjectChanges(
  serverEnv: ServerEnv,
  projectPath: string,
  request: SaveProjectChangesRequest,
) {
  return enqueueProjectMutation(projectPath, () =>
    saveProjectChangesLocked(serverEnv, projectPath, request),
  );
}
