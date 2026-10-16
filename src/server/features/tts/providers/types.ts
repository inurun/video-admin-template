import type { SavedTts, G2pItem } from "@/_schemas";
import type { SaveTtsItem } from "@/server/features/project/contract";
import type { ServerEnv } from "@/server/core/env";
import type { SynthesizeResponse } from "@/server/features/tts/contract";
import type { PlannedWav } from "@/server/features/tts/wav-cache";

export type TtsProvider = SaveTtsItem["provider"];
export type TtsInputForProvider<TProvider extends TtsProvider> = Extract<
  SaveTtsItem,
  { provider: TProvider }
>;
export type SavedTtsForProvider<TProvider extends TtsProvider> = Extract<
  SavedTts,
  { provider: TProvider }
>;

type ComparisonBase<TProvider extends TtsProvider> = {
  provider: TProvider;
  text: string;
  readText: string;
  g2p?: G2pItem;
  synthesisSettings?: NonNullable<TtsInputForProvider<TProvider>["synthesisSettings"]>;
};

export type TtsComparisonInput<TProvider extends TtsProvider = TtsProvider> = Extract<
  | (ComparisonBase<"voisona"> & { voiceName: string; voiceVersion: string })
  | (ComparisonBase<"voicevox"> & { voiceName: string; voiceVersion: string })
  | (ComparisonBase<"voicepeak"> & { voiceName: string; voiceVersion: string })
  | (ComparisonBase<"coeiroink"> & {
      speakerUuid: string;
      styleId: number;
      modelVersion: string;
    }),
  { provider: TProvider }
>;

export type TtsSynthesisInput<TProvider extends TtsProvider> = TtsComparisonInput<TProvider> & {
  projectPath: string;
};

export type PlannedSynthesis = {
  wav: PlannedWav;
  run: () => Promise<SynthesizeResponse>;
};

export type TtsProviderAdapter<TProvider extends TtsProvider> = {
  provider: TProvider;
  usesG2p: boolean;
  createComparisonInput: (item: TtsInputForProvider<TProvider>) => TtsComparisonInput<TProvider>;
  createPreviousComparisonInput: (
    item: SavedTtsForProvider<TProvider>,
  ) => TtsComparisonInput<TProvider>;
  plan: (serverEnv: ServerEnv, input: TtsSynthesisInput<TProvider>) => PlannedSynthesis;
  synthesize: (
    serverEnv: ServerEnv,
    input: TtsSynthesisInput<TProvider>,
  ) => Promise<SynthesizeResponse>;
};
