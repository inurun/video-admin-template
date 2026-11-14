import type { ServerEnv } from "@/server/core/env";
import { planCoeiroinkSynthesis } from "@/server/features/haqumei-api/synthesis";
import {
  createDraftComparisonInput,
  createPreviousComparisonInput,
  getEffectiveReadText,
} from "./comparison";
import type { TtsInputForProvider, SavedTtsForProvider, TtsProviderAdapter } from "./types";

export const coeiroinkProvider = {
  provider: "coeiroink",
  pipelines: { "llm-g2p": true },
  createComparisonInput(item: TtsInputForProvider<"coeiroink">) {
    return createDraftComparisonInput("coeiroink", item, getEffectiveReadText(item));
  },
  createPreviousComparisonInput(item: SavedTtsForProvider<"coeiroink">) {
    return createPreviousComparisonInput("coeiroink", item);
  },
  plan(serverEnv: ServerEnv, input) {
    if (!input.g2p) {
      throw new Error("COEIROINK synthesis requires g2p");
    }

    return planCoeiroinkSynthesis({
      serverEnv,
      projectPath: input.projectPath,
      g2p: input.g2p,
      speakerUuid: input.speakerUuid,
      styleId: input.styleId,
      modelVersion: input.modelVersion,
      ...(input.synthesisSettings ? { synthesisSettings: input.synthesisSettings } : {}),
    });
  },
  synthesize(serverEnv: ServerEnv, input) {
    return this.plan(serverEnv, input).run();
  },
} satisfies TtsProviderAdapter<"coeiroink">;
