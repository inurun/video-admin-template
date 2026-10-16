import { hasVoiceIdentity } from "@/_schemas";
import type { TtsFormValues } from "@/app/features/tts/model/tts-form-schema";

function hasText(item: TtsFormValues) {
  return Boolean((item.text ?? "").trim());
}

export function isTtsActionReady(
  item: TtsFormValues | undefined,
  canRunTts: boolean,
): item is TtsFormValues {
  if (!item || !canRunTts) {
    return false;
  }

  return hasText(item) && hasVoiceIdentity(item);
}

export function canStartTtsAnalyze(
  item: TtsFormValues | undefined,
  canRunTts: boolean,
  pageId: string | null | undefined,
  analyzingIds: ReadonlySet<string>,
): item is TtsFormValues {
  if (!pageId || !isTtsActionReady(item, canRunTts) || item.provider === "voicepeak") {
    return false;
  }
  return !analyzingIds.has(item.id);
}
