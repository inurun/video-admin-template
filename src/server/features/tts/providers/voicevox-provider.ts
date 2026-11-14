import type { ServerEnv } from "@/server/core/env";
import { planVoicevoxSynthesis } from "@/server/features/haqumei-api/synthesis";
import {
  createDraftComparisonInput,
  createPreviousComparisonInput,
  getEffectiveReadText,
  getOptionalVoiceVersion,
} from "./comparison";
import type { TtsInputForProvider, SavedTtsForProvider, TtsProviderAdapter } from "./types";

export const voicevoxProvider = {
  provider: "voicevox",
  pipelines: { "llm-g2p": true, prosody: { pitchWeight: 1 } },
  createComparisonInput(item: TtsInputForProvider<"voicevox">) {
    return createDraftComparisonInput("voicevox", item, getEffectiveReadText(item));
  },
  createPreviousComparisonInput(item: SavedTtsForProvider<"voicevox">) {
    return createPreviousComparisonInput("voicevox", item);
  },
  plan(serverEnv: ServerEnv, input) {
    if (!input.g2p) {
      throw new Error("VOICEVOX synthesis requires g2p");
    }

    const voiceVersion = getOptionalVoiceVersion(input.voiceVersion);
    return planVoicevoxSynthesis({
      serverEnv,
      projectPath: input.projectPath,
      g2p: input.g2p,
      voiceName: input.voiceName,
      ...(voiceVersion ? { voiceVersion } : {}),
      ...(input.synthesisSettings ? { synthesisSettings: input.synthesisSettings } : {}),
      ...(input.prosody ? { prosody: input.prosody } : {}),
    });
  },
  synthesize(serverEnv: ServerEnv, input) {
    return this.plan(serverEnv, input).run();
  },
} satisfies TtsProviderAdapter<"voicevox">;
