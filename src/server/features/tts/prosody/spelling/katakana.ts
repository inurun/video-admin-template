import { normalizeReading, wordsOf } from "../reading-check";

/**
 * Spells the words of `readings` (by kana word index) in katakana inside the text; words are
 * matched in the text by surface, left to right.
 */
export function katakanaSpell(text: string, kana: string, readings: ReadonlyMap<number, string>) {
  let out = "";
  let cursor = 0;
  for (const word of wordsOf(kana)) {
    const at = text.indexOf(word.surface, cursor);
    if (at < 0) {
      continue;
    }
    const reading = readings.get(word.index);
    out += text.slice(cursor, at) + (reading ? normalizeReading(reading) : word.surface);
    cursor = at + word.surface.length;
  }
  return out + text.slice(cursor);
}
