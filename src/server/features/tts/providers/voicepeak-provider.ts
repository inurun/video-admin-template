import type { ServerEnv } from "@/server/core/env";
import { planVoicepeakSynthesis } from "@/server/features/voicepeak/use-case";
import {
  createDraftComparisonInput,
  createPreviousComparisonInput,
  getEffectiveReadText,
  getOptionalVoiceVersion,
} from "./comparison";
import type { TtsInputForProvider, SavedTtsForProvider, TtsProviderAdapter } from "./types";

export const voicepeakProvider = {
  provider: "voicepeak",
  pipelines: {},
  createComparisonInput(item: TtsInputForProvider<"voicepeak">) {
    return createDraftComparisonInput("voicepeak", item, getEffectiveReadText(item));
  },
  createPreviousComparisonInput(item: SavedTtsForProvider<"voicepeak">) {
    return createPreviousComparisonInput("voicepeak", item);
  },
  plan(serverEnv: ServerEnv, input) {
    const voiceVersion = getOptionalVoiceVersion(input.voiceVersion);
    return planVoicepeakSynthesis({
      serverEnv,
      projectPath: input.projectPath,
      text: input.readText,
      voiceName: input.voiceName,
      ...(voiceVersion ? { voiceVersion } : {}),
      ...(input.synthesisSettings ? { synthesisSettings: input.synthesisSettings } : {}),
    });
  },
  synthesize(serverEnv: ServerEnv, input) {
    return this.plan(serverEnv, input).run();
  },
} satisfies TtsProviderAdapter<"voicepeak">;
