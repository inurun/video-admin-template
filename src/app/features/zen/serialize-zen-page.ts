import type { PageFormValues } from "@/app/features/page/model/page-form-schema";
import type { TtsFormValues } from "@/app/features/tts/model/tts-form-schema";
import { ttsVoiceId } from "@/_schemas";
import { avatarOverridesEqual, toAvatarOverride } from "@/app/features/tts/lib/avatar-override";
import { createVoiceAliasMap } from "@/app/features/zen/create-alias-map";
import { serializeAvatarTokens } from "@/app/features/zen/avatar-tokens";
import type { ZenAliasTarget, ZenSpeakerBlock } from "@/app/features/zen/types";

function serializeSpeechText(text: string) {
  return text.replaceAll("\n", "  ");
}

function resolveAlias(item: TtsFormValues, voiceAliases: Map<string, string>) {
  const voiceId = ttsVoiceId(item);
  return (
    voiceAliases.get(voiceId) ??
    (item.provider === "coeiroink" ? item.speakerUuid : item.voiceName) ??
    "unknown"
  );
}

function toSpeakerBlocks(
  tts: TtsFormValues[],
  voiceAliases: Map<string, string>,
): ZenSpeakerBlock[] {
  const speakers: ZenSpeakerBlock[] = [];

  for (const item of tts) {
    const alias = resolveAlias(item, voiceAliases);
    const avatar = toAvatarOverride(item.avatar);
    const last = speakers.at(-1);
    if (last && last.alias === alias && avatarOverridesEqual(last.avatar, avatar)) {
      last.lines.push(serializeSpeechText(item.text));
      continue;
    }

    speakers.push({
      alias,
      avatar,
      lines: [serializeSpeechText(item.text)],
      lineNumber: 0,
    });
  }

  return speakers;
}

export function serializeZenPage(
  page: Pick<PageFormValues, "title" | "meta" | "tts">,
  aliases: Map<string, ZenAliasTarget>,
) {
  const voiceAliases = createVoiceAliasMap(aliases);
  const lines: string[] = [];
  const title = page.title.trim();
  if (!title) {
    lines.push("---");
  } else {
    lines.push(`# ${title}`);
  }

  const tags = page.meta.tags.filter(Boolean);
  if (tags.length > 0) {
    lines.push(tags.map((tag) => `#${tag}`).join(" "));
  }

  const speakers = toSpeakerBlocks(page.tts, voiceAliases);
  for (const speaker of speakers) {
    if (lines.at(-1) !== "---") {
      lines.push("");
    }

    const tokens = serializeAvatarTokens(speaker.avatar);
    lines.push(`@${speaker.alias}${tokens ? ` ${tokens}` : ""}`);
    for (const line of speaker.lines) {
      lines.push(line);
    }
  }

  return `${lines.join("\n")}\n`;
}
