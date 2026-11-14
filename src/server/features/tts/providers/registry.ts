import type { SavedTts } from "@/_schemas";
import type { SaveTtsItem } from "@/server/features/project/contract";
import type { TtsProvider, TtsProviderAdapter } from "./types";
import { voisonaProvider } from "./voisona-provider";
import { voicepeakProvider } from "./voicepeak-provider";
import { voicevoxProvider } from "./voicevox-provider";
import { coeiroinkProvider } from "./coeiroink-provider";

export const ttsProviders = {
  voisona: voisonaProvider,
  voicevox: voicevoxProvider,
  voicepeak: voicepeakProvider,
  coeiroink: coeiroinkProvider,
} satisfies { [TProvider in TtsProvider]: TtsProviderAdapter<TProvider> };

export function getTtsProvider<TProvider extends TtsProvider>(provider: TProvider) {
  return ttsProviders[provider];
}

export function createTtsComparisonInput(item: SaveTtsItem) {
  return getTtsProvider(item.provider).createComparisonInput(item as never);
}

export function createPreviousTtsComparisonInput(item: SavedTts) {
  return getTtsProvider(item.provider).createPreviousComparisonInput(item as never);
}
