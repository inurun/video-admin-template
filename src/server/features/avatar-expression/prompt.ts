import { z } from "zod";
import { AVATAR_TYPES, avatarExpressions, type AvatarType } from "@/_schemas/catalog";
import type { ExpressionHistory, ExpressionRates } from "./examples";
import {
  DEFAULT_EXPRESSION,
  expressionChoices,
  type ExpressionField,
  type ExpressionLabels,
} from "./expression";

const FIELDS = ["base", "eyes", "mouth"] as const satisfies readonly ExpressionField[];

const INSTRUCTIONS = `You pick avatar expressions for a Japanese comedy diary video. Characters talk in short lines; their avatar is shown while they speak.

# Input
- title: the page title (may be empty).
- characters: per character on the page, the options you may pick for each field and the page default ("default" shows it).
- turns: in playback order. A turn is consecutive lines by one character; the avatar stays on screen through the whole turn, so it gets one expression.

# Output
- turns: one entry per input turn id with eyes and mouth. Each is "default" or one of that character's options for the field.
- bases: one entry per character that has base options. A base is a costume worn for the whole page: pick one only when the page's topic calls for it, else "default".

# Rules
- "default" is the normal face. Leave a field default unless the turn clearly calls for an option. The usage rates show how often each character leaves the default.
- Most turns are plain talk: explaining, asking, answering, agreeing. Those stay default; pick an option only for a clear mood or reaction.
- Eyes and mouth are picked separately; combine them when both fit.
- Judge from what the turn means in the conversation (what it answers, the joke, the mood), not from punctuation such as "…".
- Keep one character's expression across their nearby turns while the mood holds.`;

function meaningsSection() {
  const lines: string[] = [];
  for (const avatar of AVATAR_TYPES) {
    const fields = FIELDS.filter((field) => expressionChoices(avatar, field).length > 0);
    if (fields.length === 0) {
      continue;
    }
    lines.push(`## ${avatar}`);
    for (const field of fields) {
      const options = Object.entries(avatarExpressions[avatar][field] as Record<string, string>);
      lines.push(
        `- ${field}: ${options.map(([option, meaning]) => `${option}=${meaning}`).join(" / ")}`,
      );
    }
  }
  return lines.join("\n");
}

export function buildSystemPrompt(examples: ExpressionHistory, rates: ExpressionRates) {
  const shownRates = Object.fromEntries(
    Object.entries(rates).map(([avatar, fields]) => [
      avatar,
      Object.fromEntries(
        FIELDS.filter(
          (field) => fields?.[field] && expressionChoices(avatar as AvatarType, field).length > 0,
        ).map((field) => [field, fields![field]]),
      ),
    ]),
  );
  return [
    INSTRUCTIONS,
    "# Meanings",
    meaningsSection(),
    "# Usage rates (past videos; turns for eyes / mouth, pages for base)",
    JSON.stringify(shownRates),
    "# Examples: turns (past videos; context = the turns just before)",
    examples.turns.map((record) => JSON.stringify(record)).join("\n"),
    "# Examples: bases (past videos; first lines of the character on the page)",
    examples.bases.map((record) => JSON.stringify(record)).join("\n"),
  ].join("\n\n");
}

export type PromptTurn = { id: string; avatar: AvatarType; lines: string[] };

export function buildUserContent(input: {
  title: string;
  defaults: Partial<Record<AvatarType, ExpressionLabels>>;
  turns: readonly PromptTurn[];
}) {
  const characters = Object.fromEntries(
    Object.entries(input.defaults).map(([avatar, labels]) => [
      avatar,
      {
        options: Object.fromEntries(
          FIELDS.map((field) => [field, expressionChoices(avatar as AvatarType, field)]),
        ),
        pageDefault: labels,
      },
    ]),
  );
  return JSON.stringify({ title: input.title, characters, turns: input.turns });
}

export const expressionOutputSchema = z.object({
  bases: z.array(z.object({ avatar: z.string(), base: z.string() })),
  turns: z.array(z.object({ id: z.string(), eyes: z.string(), mouth: z.string() })),
});

export type ExpressionOutput = z.infer<typeof expressionOutputSchema>;

function labelEnum(avatars: readonly AvatarType[], field: ExpressionField) {
  return [
    DEFAULT_EXPRESSION,
    ...new Set(avatars.flatMap((avatar) => expressionChoices(avatar, field))),
  ];
}

/** Enums are unions over the page's characters; the server checks each pick against its own character. */
export function buildOutputJsonSchema(avatars: readonly AvatarType[], turnIds: readonly string[]) {
  const object = (properties: Record<string, unknown>) => ({
    type: "object",
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  });
  return object({
    bases: {
      type: "array",
      items: object({
        avatar: { type: "string", enum: [...avatars] },
        base: { type: "string", enum: labelEnum(avatars, "base") },
      }),
    },
    turns: {
      type: "array",
      items: object({
        id: { type: "string", enum: [...turnIds] },
        eyes: { type: "string", enum: labelEnum(avatars, "eyes") },
        mouth: { type: "string", enum: labelEnum(avatars, "mouth") },
      }),
    },
  });
}
