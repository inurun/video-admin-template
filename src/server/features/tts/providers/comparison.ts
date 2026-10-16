import { g2pItemSchema, type G2pItem } from "@/_schemas";
import { toG2pItem } from "@/server/features/tts/g2p-item";
import type {
  TtsInputForProvider,
  SavedTtsForProvider,
  TtsComparisonInput,
  TtsProvider,
} from "@/server/features/tts/providers/types";

export function getEffectiveReadText(item: { text: string; readText?: string }) {
  return item.readText?.trim() || item.text;
}

export function getOptionalVoiceVersion(value: string) {
  return value || undefined;
}

function normalizeOptionalString(value?: string) {
  return value ?? "";
}

function normalizeSynthesisSettings<TSettings>(value: TSettings | null | undefined) {
  return value ?? undefined;
}

export function getUsableG2p(g2p: unknown, readText: string): G2pItem | undefined {
  const parsed = g2pItemSchema.safeParse(g2p);
  if (!parsed.success || parsed.data.text !== readText) {
    return undefined;
  }

  return parsed.data;
}

export function g2pAudioIdentity(g2p: G2pItem | undefined) {
  return g2p ? toG2pItem(g2p) : undefined;
}

export function createDraftComparisonInput<TProvider extends TtsProvider>(
  provider: TProvider,
  item: TtsInputForProvider<TProvider>,
  readText: string,
): TtsComparisonInput<TProvider> {
  const raw = item as TtsInputForProvider<TtsProvider>;
  const g2p = raw.speech?.g2p;
  const base = {
    provider,
    text: raw.text,
    readText,
    ...(g2p ? { g2p } : {}),
    synthesisSettings: normalizeSynthesisSettings(raw.synthesisSettings),
  };

  if (raw.provider === "coeiroink") {
    return {
      ...base,
      speakerUuid: raw.speakerUuid,
      styleId: raw.styleId,
      modelVersion: raw.modelVersion,
    } as unknown as TtsComparisonInput<TProvider>;
  }

  return {
    ...base,
    voiceName: raw.voiceName?.trim() || "",
    voiceVersion: raw.voiceVersion?.trim() || "",
  } as unknown as TtsComparisonInput<TProvider>;
}

export function createPreviousComparisonInput<TProvider extends TtsProvider>(
  provider: TProvider,
  item: SavedTtsForProvider<TProvider>,
): TtsComparisonInput<TProvider> {
  const raw = item as SavedTtsForProvider<TtsProvider>;
  const g2p = raw.speech.g2p;
  const base = {
    provider,
    text: raw.text,
    readText: normalizeOptionalString(raw.readText),
    ...(g2p ? { g2p } : {}),
    synthesisSettings: normalizeSynthesisSettings(raw.synthesisSettings),
  };

  if (raw.provider === "coeiroink") {
    return {
      ...base,
      speakerUuid: raw.speakerUuid,
      styleId: raw.styleId,
      modelVersion: raw.modelVersion,
    } as unknown as TtsComparisonInput<TProvider>;
  }

  return {
    ...base,
    voiceName: normalizeOptionalString(raw.voiceName),
    voiceVersion: normalizeOptionalString(raw.voiceVersion),
  } as unknown as TtsComparisonInput<TProvider>;
}
