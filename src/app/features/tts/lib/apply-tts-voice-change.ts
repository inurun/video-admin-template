import type { VoiceOption } from "@/_schemas";
import type { TtsFormValues } from "@/app/features/tts/model/tts-form-schema";

export function applyTtsVoiceChange(item: TtsFormValues, voice: VoiceOption): TtsFormValues {
  const shared = {
    id: item.id,
    text: item.text,
    readText: item.readText,
    padBeforeSec: item.padBeforeSec,
    padAfterSec: item.padAfterSec,
    volume: item.volume,
    synthesisSettings: null,
    speech: {
      ...item.speech,
    },
    ...(item.avatar ? { avatar: item.avatar } : {}),
    ...(item.avatarSource ? { avatarSource: item.avatarSource } : {}),
  };

  if (voice.provider === "coeiroink") {
    return {
      ...shared,
      provider: "coeiroink",
      speakerUuid: voice.speakerUuid,
      styleId: voice.styleId,
      modelVersion: voice.modelVersion,
    } as TtsFormValues;
  }

  return {
    ...shared,
    provider: voice.provider,
    voiceName: voice.voiceName,
    voiceVersion: voice.voiceVersion ?? "",
  } as TtsFormValues;
}
