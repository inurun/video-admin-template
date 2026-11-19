import { copyVoiceIdentity, hasVoiceIdentity, toVoiceIdentity } from "@/_schemas";
import type { G2pItem } from "@/_schemas";
import type { TtsFormValues } from "@/app/features/tts/model/tts-form-schema";

export type PreviewSynthesisPayload = {
  provider: TtsFormValues["provider"];
  projectPath: string;
  g2p?: G2pItem;
  text: string;
  voiceName?: string;
  voiceVersion?: string;
  speakerUuid?: string;
  styleId?: number;
  modelVersion?: string;
  synthesisSettings?: NonNullable<TtsFormValues["synthesisSettings"]>;
};

function getTextForSynthesis(item: TtsFormValues) {
  return item.readText?.trim() || item.text;
}

function getG2pPart(item: TtsFormValues) {
  return item.speech?.g2p ? { g2p: item.speech.g2p } : {};
}

export function getPreviewPayload(
  item: TtsFormValues,
  projectPath: string,
): PreviewSynthesisPayload {
  const identity = toVoiceIdentity(item);
  if (!identity || !hasVoiceIdentity(identity)) {
    throw new Error("Voice is required");
  }

  if (identity.provider !== "coeiroink") {
    const voiceName = identity.voiceName.trim();
    if (!voiceName) {
      throw new Error("Voice is required");
    }
    const voiceVersion = identity.voiceVersion?.trim();
    return {
      provider: identity.provider,
      projectPath,
      text: getTextForSynthesis(item),
      ...getG2pPart(item),
      voiceName,
      ...(voiceVersion ? { voiceVersion } : {}),
      ...(item.synthesisSettings ? { synthesisSettings: item.synthesisSettings } : {}),
    };
  }

  return {
    projectPath,
    text: getTextForSynthesis(item),
    ...getG2pPart(item),
    ...copyVoiceIdentity(identity),
    ...(item.synthesisSettings ? { synthesisSettings: item.synthesisSettings } : {}),
  };
}
