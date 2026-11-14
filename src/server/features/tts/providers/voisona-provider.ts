import type { ServerEnv } from "@/server/core/env";
import { planVoisonaSynthesis } from "@/server/features/haqumei-api/synthesis";
import {
  createDraftComparisonInput,
  createPreviousComparisonInput,
  getEffectiveReadText,
  getOptionalVoiceVersion,
} from "./comparison";
import type { TtsInputForProvider, SavedTtsForProvider, TtsProviderAdapter } from "./types";

export const voisonaProvider = {
  provider: "voisona",
  // VoiSona takes only H/L from the kana, so the reference pitch is not mixed in.
  pipelines: { "llm-g2p": true, prosody: {} },
  createComparisonInput(item: TtsInputForProvider<"voisona">) {
    return createDraftComparisonInput("voisona", item, getEffectiveReadText(item));
  },
  createPreviousComparisonInput(item: SavedTtsForProvider<"voisona">) {
    return createPreviousComparisonInput("voisona", item);
  },
  plan(serverEnv: ServerEnv, input) {
    if (!input.g2p) {
      throw new Error("VoiSona synthesis requires g2p");
    }

    const voiceVersion = getOptionalVoiceVersion(input.voiceVersion);
    return planVoisonaSynthesis({
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
} satisfies TtsProviderAdapter<"voisona">;
