import type { AvatarOverride } from "@/_schemas";
import type {
  AvatarExpressionGenerateRequest,
  AvatarExpressionGenerateResponse,
} from "@/server/features/avatar-expression/contract";
import type { MainPageFormValues } from "@/app/features/page/model/page-form-schema";

export function toAvatarExpressionPage(
  values: MainPageFormValues,
): AvatarExpressionGenerateRequest["page"] {
  return {
    title: values.title,
    avatars: values.meta.avatars,
    tts: values.tts.map((tts) => ({
      id: tts.id,
      text: tts.text,
      provider: tts.provider,
      voiceName: "voiceName" in tts ? tts.voiceName : undefined,
      speakerUuid: "speakerUuid" in tts ? tts.speakerUuid : undefined,
      avatar: tts.avatar,
    })),
  };
}

/** Form writes for a response: tts index → override and its auto source, plus the page defaults. */
export function toAvatarExpressionWrites(
  values: MainPageFormValues,
  response: AvatarExpressionGenerateResponse,
) {
  const indexById = new Map(values.tts.map((tts, index) => [tts.id, index]));
  return {
    avatars: Object.keys(response.avatars).length > 0 ? response.avatars : undefined,
    tts: response.tts.flatMap((item) => {
      const index = indexById.get(item.id);
      return index === undefined
        ? []
        : [
            {
              index,
              avatar: (item.avatar ?? undefined) as AvatarOverride | undefined,
              avatarSource: item.avatarSource,
            },
          ];
    }),
  };
}
