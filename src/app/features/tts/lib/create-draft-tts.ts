import { hasVoiceIdentity, type VoiceOption } from "@/_schemas";
import type { TtsFormValues } from "@/app/features/tts/model/tts-form-schema";
import { applyTtsVoiceChange } from "@/app/features/tts/lib/apply-tts-voice-change";

/** A new line starts from the source's avatar and who set it; auto re-reads it for the new text. */
function sourceAvatar(sourceTts: TtsFormValues | undefined) {
  return {
    ...(sourceTts?.avatar ? { avatar: sourceTts.avatar } : {}),
    ...(sourceTts?.avatarSource ? { avatarSource: sourceTts.avatarSource } : {}),
  };
}

function emptyDraft(id: string, sourceTts: TtsFormValues | undefined): TtsFormValues {
  return {
    id,
    provider: "voisona",
    text: "",
    readText: "",
    voiceName: "",
    voiceVersion: "",
    padBeforeSec: 0,
    padAfterSec: 0,
    volume: 1,
    synthesisSettings: null,
    speech: {},
    ...sourceAvatar(sourceTts),
  };
}

export function createTtsInput(
  options: VoiceOption[],
  sourceTts: TtsFormValues | undefined,
): TtsFormValues {
  const draft = emptyDraft(crypto.randomUUID(), sourceTts);

  if (sourceTts && hasVoiceIdentity(sourceTts)) {
    if (sourceTts.provider === "coeiroink") {
      return {
        id: draft.id,
        provider: "coeiroink",
        text: "",
        readText: "",
        speakerUuid: sourceTts.speakerUuid,
        styleId: sourceTts.styleId,
        modelVersion: sourceTts.modelVersion,
        padBeforeSec: 0,
        padAfterSec: 0,
        volume: 1,
        synthesisSettings: null,
        speech: {},
        ...sourceAvatar(sourceTts),
      };
    }

    return {
      id: draft.id,
      provider: sourceTts.provider,
      text: "",
      readText: "",
      voiceName: sourceTts.voiceName,
      voiceVersion: sourceTts.voiceVersion ?? "",
      padBeforeSec: 0,
      padAfterSec: 0,
      volume: 1,
      synthesisSettings: null,
      speech: {},
      ...sourceAvatar(sourceTts),
    };
  }

  const catalogVoice = options.find((voice) => hasVoiceIdentity(voice));
  if (!catalogVoice) {
    return draft;
  }

  const next = applyTtsVoiceChange(draft, catalogVoice);
  if (sourceTts?.avatar) {
    return {
      ...next,
      ...sourceAvatar(sourceTts),
      text: "",
      readText: "",
      synthesisSettings: null,
      speech: {},
    };
  }
  return { ...next, text: "", readText: "", synthesisSettings: null, speech: {} };
}
