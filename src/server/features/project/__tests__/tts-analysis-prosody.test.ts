import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_TIMELINE, type SavedProject, type SavedTimeline } from "@/_schemas";
import { createG2pItem } from "@/_schemas/__tests__/g2p-fixture";
import type { SaveSequenceItem } from "@/server/features/project/contract";
import { toTimeline } from "../to-timeline";
import { buildG2pContext } from "@/server/features/tts/g2p-context";
import { createSavedTts } from "@/app/features/editor/store/__tests__/fixtures";

const mocks = vi.hoisted(() => ({
  readSavedProject: vi.fn(),
  writeSavedProject: vi.fn(),
  generateG2p: vi.fn(),
  analyzeProsody: vi.fn(),
  findSynthesisProsody: vi.fn(),
  planVoicevox: vi.fn(),
  planVoisona: vi.fn(),
  synthesize: vi.fn(),
}));

vi.mock("@/video/config", async () => ({
  ...(await vi.importActual<typeof import("@/video/config")>("@/video/config")),
  speechConfig: {
    voicevox: { pipeline: "prosody", timingWeight: 0.4 },
    voisona: { pipeline: "llm-g2p" },
  },
}));

vi.mock("node:fs/promises", () => ({
  default: { access: vi.fn(async () => undefined), mkdir: vi.fn(), writeFile: vi.fn() },
}));

vi.mock("@/server/_shared/storage", async () => ({
  ...(await vi.importActual<typeof import("@/server/_shared/storage")>("@/server/_shared/storage")),
  readSavedProject: mocks.readSavedProject,
  readSavedProjectDocument: async (projectPath: string) => ({
    project: await mocks.readSavedProject(projectPath),
    timeline: EMPTY_TIMELINE,
  }),
  writeSavedProject: mocks.writeSavedProject,
}));

vi.mock("@/server/features/haqumei-api/synthesis", () => ({
  planVoicevoxSynthesis: mocks.planVoicevox,
  planVoisonaSynthesis: mocks.planVoisona,
}));

vi.mock("@/server/features/tts/wav-cache", async () => ({
  ...(await vi.importActual<typeof import("@/server/features/tts/wav-cache")>(
    "@/server/features/tts/wav-cache",
  )),
  readCachedWav: async () => null,
}));

vi.mock("@/server/features/tts/llm-g2p", () => ({
  generateG2p: mocks.generateG2p,
  generateG2pWithCache: mocks.generateG2p,
}));
vi.mock("@/server/features/tts/g2p-cache", () => ({ recordG2pCache: vi.fn() }));
vi.mock("@/server/features/tts/prosody/pipeline", () => ({ analyzeProsody: mocks.analyzeProsody }));
vi.mock("@/server/features/tts/prosody/cache", () => ({
  findSynthesisProsody: mocks.findSynthesisProsody,
}));

const env = { OPENROUTER_API_KEY: "secret" };
const meta = {
  title: "project",
  description: "",
  width: 1920,
  height: 1080,
  weather: {},
  niconico: {
    title: "",
    description: "",
    thumbnailTime: "00:00.000",
    parentWorkIds: [],
    tags: [],
  },
};
const extract = {
  schema_version: "3",
  aligner_version: "mms-fa-1",
  score: 0.7,
  moras: [{ start: 0, vowel_start: 0.05, end: 0.1, log_f0: 5.4 }],
  pauses: [],
};
const synthesisProsody = {
  moras: extract.moras,
  pauses: [],
  pitch_weight: 0.8,
  timing_weight: 0.4,
};

function tts(id: string, provider: "voicevox" | "voisona", text: string, g2p?: unknown) {
  return {
    id,
    provider,
    text,
    voiceName: provider === "voicevox" ? "3" : "voice",
    padBeforeSec: 0,
    padAfterSec: 0,
    volume: 1,
    speech: g2p ? { g2p } : {},
  };
}

async function save(ttsItems: unknown[]) {
  const { saveProjectSettingsSchema } = await import("../contract");
  const { saveProjectChanges } = await import("../use-case");
  const page = {
    id: "page-1",
    title: "Page 1",
    type: "main",
    meta: { tags: [] },
    padBeforeSec: 0,
    padAfterSec: 0,
    richText: "<p>x</p>",
    tts: ttsItems,
  };
  return saveProjectChanges(env, "project", {
    project: saveProjectSettingsSchema.parse({ meta, bgm: [] }),
    upsertItems: [page] as unknown as SaveSequenceItem[],
    removedItemIds: [],
    sequenceOrder: ["page-1"],
  });
}

function savedTts(project: SavedProject) {
  const page = project.pages[0];
  if (!page || page.type === "transition") {
    throw new Error("expected content page");
  }
  return page.tts;
}

function lastWritten() {
  return mocks.writeSavedProject.mock.calls.at(-1)?.[1] as SavedProject;
}

function planned(provider: string) {
  let sequence = 0;
  return (input: { projectPath: string }) => {
    sequence += 1;
    const fileName = `${provider}-${sequence}.wav`;
    const audioSrc = `/tts/${input.projectPath}/${fileName}`;
    return {
      wav: { fileName, outputPath: `/tmp/${fileName}`, audioSrc },
      run: async () => {
        await mocks.synthesize(input);
        return { audioSrc, outputPath: `/tmp/${fileName}`, durationSec: 1 };
      },
    };
  };
}

async function flushJobs() {
  const { flushAnalysisJobsForTests } = await import("../tts-analysis-jobs");
  const { flushSynthesisJobsForTests } = await import("../tts-synthesis-jobs");
  await flushAnalysisJobsForTests();
  await flushSynthesisJobsForTests();
}

describe("tts analysis by speech pipeline", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.readSavedProject.mockImplementation(
      async () => mocks.writeSavedProject.mock.calls.at(-1)?.[1] ?? { pages: [] },
    );
    mocks.writeSavedProject.mockImplementation(
      async (_path: string, project: SavedProject, previous?: SavedTimeline) => ({
        project,
        timeline: toTimeline(project, previous),
      }),
    );
    mocks.planVoicevox.mockImplementation(planned("voicevox"));
    mocks.planVoisona.mockImplementation(planned("voisona"));
    mocks.findSynthesisProsody.mockResolvedValue(undefined);
    const { resetAnalysisJobsForTests } = await import("../tts-analysis-jobs");
    const { resetSynthesisJobsForTests } = await import("../tts-synthesis-jobs");
    const { resetProjectMutationQueueForTests } = await import("../project-mutation-queue");
    resetAnalysisJobsForTests();
    resetSynthesisJobsForTests();
    resetProjectMutationQueueForTests();
  });

  afterEach(async () => {
    await flushJobs();
  });

  it("sends prosody engines to the prosody pipeline and the rest to LLM G2P", async () => {
    const prosodyG2p = createG2pItem("犬", "犬:イ'ヌ");
    const llmG2p = createG2pItem("猫", "猫:ネコ'");
    mocks.analyzeProsody.mockResolvedValueOnce([{ g2p: prosodyG2p, prosody: extract }]);
    mocks.generateG2p.mockResolvedValueOnce(new Map([["tts-2", { g2p: llmG2p, source: "llm" }]]));

    const saved = await save([tts("tts-1", "voicevox", "犬"), tts("tts-2", "voisona", "猫")]);
    expect(savedTts(saved.project).map((item) => item.audio.status)).toEqual([
      "analyzing",
      "analyzing",
    ]);
    await flushJobs();

    expect(mocks.analyzeProsody).toHaveBeenCalledWith(env, "project", [
      expect.objectContaining({ readText: "犬" }),
    ]);
    expect(mocks.generateG2p.mock.calls[0]?.[1]).toMatchObject({
      mode: "page",
      pages: [
        {
          utterances: [
            { id: "tts-1", target: false },
            { id: "tts-2", target: true },
          ],
        },
      ],
    });
    expect(mocks.planVoicevox).toHaveBeenCalledWith(
      expect.objectContaining({ g2p: prosodyG2p, prosody: synthesisProsody }),
    );
    expect(mocks.planVoisona).toHaveBeenCalledWith(expect.objectContaining({ g2p: llmG2p }));
    expect(mocks.planVoisona.mock.calls[0]?.[0]).not.toHaveProperty("prosody");
    expect(savedTts(lastWritten()).map((item) => [item.audio.status, item.speech.g2p])).toEqual([
      ["ready", prosodyG2p],
      ["ready", llmG2p],
    ]);
  });

  it("runs one prosody analysis for duplicate texts", async () => {
    const g2p = createG2pItem("犬", "犬:イ'ヌ");
    mocks.analyzeProsody.mockResolvedValueOnce([{ g2p }]);

    await save([tts("tts-1", "voicevox", "犬"), tts("tts-2", "voicevox", "犬")]);
    await flushJobs();

    expect(mocks.analyzeProsody).toHaveBeenCalledWith(env, "project", [
      expect.objectContaining({ readText: "犬" }),
    ]);
    expect(mocks.generateG2p).not.toHaveBeenCalled();
    // Without prosody the kana is synthesized as before.
    expect(mocks.planVoicevox).toHaveBeenCalledTimes(2);
    expect(mocks.planVoicevox.mock.calls[0]?.[0]).not.toHaveProperty("prosody");
    expect(savedTts(lastWritten()).map((item) => item.speech.g2p)).toEqual([g2p, g2p]);
  });

  it("gives each prosody target up to two utterances on each side as context", async () => {
    const texts = ["一。", "二。", "三。", "四。", "五。"];
    mocks.analyzeProsody.mockResolvedValueOnce(
      texts.map((t) => ({ g2p: createG2pItem(t, `${t}:イ'`) })),
    );

    await save(texts.map((t, index) => tts(`tts-${index}`, "voicevox", t)));
    await flushJobs();

    const targets = mocks.analyzeProsody.mock.calls[0]?.[2] as { context?: unknown }[];
    expect(targets.map((target) => target.context)).toEqual([
      { next: "二。三。" },
      { previous: "一。", next: "三。四。" },
      { previous: "一。二。", next: "四。五。" },
      { previous: "二。三。", next: "五。" },
      { previous: "三。四。" },
    ]);
  });

  it("shares one analysis for a duplicate text with the first one's context", async () => {
    const g2p = createG2pItem("犬", "犬:イ'ヌ");
    mocks.analyzeProsody.mockResolvedValueOnce([{ g2p }, { g2p }]);

    await save([
      tts("tts-1", "voicevox", "犬"),
      tts("tts-2", "voicevox", "猫"),
      tts("tts-3", "voicevox", "犬"),
    ]);
    await flushJobs();

    expect(mocks.analyzeProsody.mock.calls[0]?.[2]).toEqual([
      expect.objectContaining({ readText: "犬", context: { next: "猫犬" } }),
      expect.objectContaining({ readText: "猫", context: { previous: "犬", next: "犬" } }),
    ]);
  });

  it("keeps an edited kana while its prosody is made", async () => {
    const edited = createG2pItem("犬", "犬:イヌ'");
    mocks.analyzeProsody.mockResolvedValueOnce([{ g2p: edited, prosody: extract }]);

    const saved = await save([tts("tts-1", "voicevox", "犬", edited)]);
    expect(savedTts(saved.project)[0]).toMatchObject({
      audio: { status: "analyzing" },
      speech: { g2p: edited },
    });
    await flushJobs();

    expect(mocks.analyzeProsody).toHaveBeenCalledWith(env, "project", [
      expect.objectContaining({ readText: "犬", g2p: edited }),
    ]);
    expect(mocks.planVoicevox).toHaveBeenCalledWith(
      expect.objectContaining({ g2p: edited, prosody: synthesisProsody }),
    );
  });

  it("synthesizes right away with cached prosody", async () => {
    const edited = createG2pItem("犬", "犬:イヌ'");
    mocks.findSynthesisProsody.mockResolvedValue(synthesisProsody);

    const saved = await save([tts("tts-1", "voicevox", "犬", edited)]);

    expect(savedTts(saved.project)[0]?.audio.status).toBe("pending");
    expect(mocks.findSynthesisProsody).toHaveBeenCalledWith(
      "project",
      expect.objectContaining({ provider: "voicevox" }),
      edited,
    );
    expect(mocks.planVoicevox).toHaveBeenCalledWith(
      expect.objectContaining({ g2p: edited, prosody: synthesisProsody }),
    );
    expect(mocks.analyzeProsody).not.toHaveBeenCalled();
  });

  it("synthesizes an LLM G2P engine's kana without looking for prosody", async () => {
    const g2p = createG2pItem("猫", "猫:ネコ'");
    mocks.findSynthesisProsody.mockImplementation(async (_path, voice) =>
      voice.provider === "voicevox" ? synthesisProsody : undefined,
    );

    const saved = await save([tts("tts-1", "voisona", "猫", g2p)]);

    expect(savedTts(saved.project)[0]?.audio.status).toBe("pending");
    expect(mocks.planVoisona.mock.calls[0]?.[0]).not.toHaveProperty("prosody");
  });
  it("keeps saved audio without cached prosody, and makes it again for a new one", async () => {
    const g2p = createG2pItem("犬", "犬:イ'ヌ");
    const item = tts("tts-1", "voicevox", "犬", g2p);
    mocks.findSynthesisProsody.mockResolvedValue(synthesisProsody);
    await save([item]);
    await flushJobs();
    const ready = savedTts(lastWritten())[0]?.audio;
    expect(ready).toMatchObject({ status: "ready" });

    // Say the reference voice changed: no prosody for the new one yet.
    mocks.findSynthesisProsody.mockResolvedValue(undefined);
    const kept = await save([item]);
    expect(savedTts(kept.project)[0]?.audio).toEqual(ready);
    expect(mocks.analyzeProsody).not.toHaveBeenCalled();

    // A prosody that plans another WAV (the mock gives every plan its own path).
    mocks.findSynthesisProsody.mockResolvedValue(synthesisProsody);
    const remade = await save([item]);
    expect(savedTts(remade.project)[0]?.audio.status).toBe("pending");
  });
});

describe("prosody contexts", () => {
  it("takes the neighbors from the target's comment group in playback order", async () => {
    const { prosodyContexts } = await import("../tts-analysis-jobs");
    const comment = (no: number, body: string) => ({
      id: `sm1:thread:main:${no}`,
      threadId: "thread",
      fork: "main" as const,
      no,
      body,
      vposMs: no,
      postedAt: "2026-09-16T00:00:00.000Z",
      hidden: false,
    });
    const page = {
      id: "page-comments",
      title: "Comments",
      type: "comments" as const,
      meta: {
        tags: [],
        niconico: { videoId: "sm1", fetchedAt: "2026-09-16T00:00:00.000Z" },
        presentation: "single" as const,
      },
      comments: [comment(1, "うぽつ"), comment(2, "質問")],
      commentGroups: [
        { id: "g1", commentIds: ["sm1:thread:main:1"], displayText: null, ttsIds: ["r1", "t1"] },
        { id: "g2", commentIds: ["sm1:thread:main:2"], displayText: null, ttsIds: ["r2"] },
      ],
      commentScenes: [
        { id: "s1", groupIds: ["g1"] },
        { id: "s2", groupIds: ["g2"] },
      ],
      padBeforeSec: 0,
      padAfterSec: 0,
      richText: null,
      tts: [
        createSavedTts({ id: "t1", text: "ありがとう", readText: "ありがとう" }),
        createSavedTts({ id: "r2", text: "質問", readText: "質問" }),
        createSavedTts({ id: "r1", text: "うぽつ", readText: "うぽつ" }),
      ],
    };

    const contexts = prosodyContexts(
      buildG2pContext(
        [page],
        ["t1", "r2"].map((ttsId) => ({ pageId: "page-comments", ttsId })),
      ),
    );

    expect(Object.fromEntries(contexts)).toEqual({ t1: { previous: "うぽつ" } });
  });
});
