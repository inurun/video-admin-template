import crypto from "node:crypto";
import { stableStringify } from "@/server/_shared/stable-stringify";
import { LLM_G2P_PROFILE } from "@/server/features/tts/llm-g2p-profile";

export const G2P_ANALYSIS_VERSION = "oneshot-g2p-v1";

export function createTtsAnalysisKey(input: {
  projectPath: string;
  pageId: string;
  ttsId: string;
  provider: string;
  text: string;
  effectiveReadText: string;
}) {
  return crypto
    .createHash("md5")
    .update(
      stableStringify({
        version: G2P_ANALYSIS_VERSION,
        projectPath: input.projectPath,
        pageId: input.pageId,
        ttsId: input.ttsId,
        provider: input.provider,
        text: input.text,
        effectiveReadText: input.effectiveReadText,
        profileId: LLM_G2P_PROFILE.id,
      }),
    )
    .digest("hex");
}
