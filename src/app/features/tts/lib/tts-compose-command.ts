import {
  avatarOptions,
  getAvatarTypeForVoice,
  getOpenedMouthOptions,
  type AvatarOverride,
  type VoiceOption,
} from "@/_schemas";
import { toAvatarOverride } from "@/app/features/tts/lib/avatar-override";

const commandDefinitions = {
  b: {
    field: "base",
    values: (voice: VoiceOption) => avatarOptions[getAvatarTypeForVoice(voice)].base,
  },
  e: {
    field: "eyes",
    values: (voice: VoiceOption) => avatarOptions[getAvatarTypeForVoice(voice)].eyes,
  },
  m: {
    field: "mouth",
    values: (voice: VoiceOption) => getOpenedMouthOptions(getAvatarTypeForVoice(voice)),
  },
} as const;

type CommandKey = keyof typeof commandDefinitions;

export type TtsComposeResult =
  | { ok: true; text: string; avatar: AvatarOverride | undefined }
  | { ok: false; error: string };

export function getTtsComposeCommandOptions(voice: VoiceOption, used: Set<string> = new Set()) {
  return (
    Object.entries(commandDefinitions) as Array<
      [CommandKey, (typeof commandDefinitions)[CommandKey]]
    >
  )
    .filter(([key]) => !used.has(key))
    .flatMap(([key, definition]) => definition.values(voice).map((value) => `/${key}.${value}`));
}

export function parseTtsComposeInput(source: string, voice: VoiceOption): TtsComposeResult {
  const input = source.trim();
  if (!input) {
    return { ok: false, error: "Text is required." };
  }
  if (input.startsWith("\\/")) {
    const text = input.slice(1).trim();
    return text ? { ok: true, text, avatar: undefined } : { ok: false, error: "Text is required." };
  }

  let rest = input;
  const values: Partial<Record<CommandKey, string>> = {};
  while (rest.startsWith("/")) {
    const match = /^\/([a-z]+)\.([^\s]+)(?:\s+|$)/.exec(rest);
    if (!match) {
      return { ok: false, error: `Invalid command "${rest.split(/\s/, 1)[0]}".` };
    }
    const key = match[1] as CommandKey;
    const definition = commandDefinitions[key];
    if (!definition) {
      return { ok: false, error: `Unknown command "/${match[1]}".` };
    }
    if (values[key] !== undefined) {
      return { ok: false, error: `Duplicate command "/${key}".` };
    }
    const value = match[2];
    if (!(definition.values(voice) as readonly string[]).includes(value)) {
      return { ok: false, error: `Unknown ${definition.field} "${value}".` };
    }
    values[key] = value;
    rest = rest.slice(match[0].length);
  }

  const text = rest.trim();
  if (!text) {
    return { ok: false, error: "Text is required after commands." };
  }
  const avatar: AvatarOverride = {};
  for (const [key, value] of Object.entries(values) as Array<[CommandKey, string]>) {
    avatar[commandDefinitions[key].field] = value;
  }
  return { ok: true, text, avatar: toAvatarOverride(avatar) };
}
