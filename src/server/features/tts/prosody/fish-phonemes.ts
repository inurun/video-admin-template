import { pitchesForAccent, splitKanaMoras } from "@/_schemas";
import { applyReadings } from "./reading-check";

/**
 * Fish Audio phoneme tags for the reference TTS: OpenJTalk romaji with a pitch digit after each
 * mora (1 high, 0 low), as in Fish's Japanese phoneme control. `ッ` is `cl` with no digit.
 */
const PHONEME_START = "<|phoneme_start|>";
const PHONEME_END = "<|phoneme_end|>";

const ROWS: Record<string, string> = {
  "": "アイウエオ",
  k: "カキクケコ",
  g: "ガギグゲゴ",
  s: "サ.スセソ",
  z: "ザ.ズゼゾ",
  t: "タ..テト",
  d: "ダ..デド",
  n: "ナニヌネノ",
  h: "ハヒ.ヘホ",
  b: "バビブベボ",
  p: "パピプペポ",
  m: "マミムメモ",
  y: "ヤ.ユ.ヨ",
  r: "ラリルレロ",
  w: "ワ...",
};
const VOWELS = "aiueo";
const YOON: Record<string, string> = {
  キ: "ky",
  ギ: "gy",
  ニ: "ny",
  ヒ: "hy",
  ビ: "by",
  ピ: "py",
  ミ: "my",
  リ: "ry",
  シ: "sh",
  ジ: "j",
  ヂ: "j",
  チ: "ch",
  テ: "ty",
  デ: "dy",
  フ: "fy",
};

const MORA_PHONEMES = new Map<string, string>([
  ...Object.entries(ROWS).flatMap(([consonant, row]) =>
    [...row].flatMap((kana, i): [string, string][] =>
      kana === "." ? [] : [[kana, `${consonant}${VOWELS[i]}`]],
    ),
  ),
  ["シ", "shi"],
  ["ジ", "ji"],
  ["チ", "chi"],
  ["ツ", "tsu"],
  ["ヂ", "ji"],
  ["ヅ", "zu"],
  ["フ", "fu"],
  ["ヲ", "o"],
  ["ヰ", "i"],
  ["ヱ", "e"],
  ["ヴ", "vu"],
  ["ン", "N"],
  ["ッ", "cl"],
  ...[..."ァィゥェォ"].map((kana, i) => [kana, VOWELS[i]!] as [string, string]),
  ...Object.entries(YOON).flatMap(([kana, consonant]) =>
    [
      ["ャ", "a"],
      ["ュ", "u"],
      ["ョ", "o"],
      ["ェ", "e"],
    ].map(([small, vowel]) => [`${kana}${small}`, `${consonant}${vowel}`] as [string, string]),
  ),
  ["ティ", "ti"],
  ["ディ", "di"],
  ["トゥ", "tu"],
  ["ドゥ", "du"],
  ["ファ", "fa"],
  ["フィ", "fi"],
  ["フェ", "fe"],
  ["フォ", "fo"],
  ["ウィ", "wi"],
  ["ウェ", "we"],
  ["ウォ", "wo"],
  ["ヴァ", "va"],
  ["ヴィ", "vi"],
  ["ヴェ", "ve"],
  ["ヴォ", "vo"],
  ["ツァ", "tsa"],
  ["ツィ", "tsi"],
  ["ツェ", "tse"],
  ["ツォ", "tso"],
  ["イェ", "ye"],
]);

/**
 * One accent phrase as Fish phonemes; `accent` is the number of moras before the nucleus mark
 * (a mark after the last mora is a flat phrase). `undefined` when a mora has no phoneme.
 */
export function fishPhrasePhonemes(moras: readonly string[], accent: number | undefined) {
  const nucleus = accent === undefined || accent >= moras.length ? 0 : accent;
  const pitches = pitchesForAccent(moras.length, nucleus);
  let out = "";
  let vowel: string | undefined;
  for (const [index, mora] of moras.entries()) {
    const phoneme = mora === "ー" ? vowel : MORA_PHONEMES.get(mora);
    if (!phoneme) {
      return undefined;
    }
    if (phoneme === "cl") {
      out += phoneme;
      vowel = undefined;
      continue;
    }
    out += `${phoneme}${pitches[index] === "high" ? 1 : 0}`;
    vowel = phoneme === "N" ? undefined : phoneme.at(-1);
  }
  return out;
}

type Phrase = {
  /** Global word indexes, counted like `wordsOf`. */
  words: { index: number; surface: string; reading: string }[];
  moras: string[];
  accent: number | undefined;
};

const CLOSER = /[/、？！]/u;

function phrasesOf(kana: string): Phrase[] {
  const phrases: Phrase[] = [];
  let index = 0;
  for (const body of kana.split(CLOSER)) {
    if (!body) {
      continue;
    }
    const phrase: Phrase = { words: [], moras: [], accent: undefined };
    for (const word of body.split("|")) {
      if (!word) {
        continue;
      }
      const colon = word.indexOf(":");
      const reading = colon < 0 ? word : word.slice(colon + 1);
      const plain = reading.replaceAll("'", "");
      const quote = reading.indexOf("'");
      if (quote >= 0 && phrase.accent === undefined) {
        phrase.accent = phrase.moras.length + splitKanaMoras(reading.slice(0, quote)).length;
      }
      phrase.words.push({
        index: index++,
        surface: colon < 0 ? plain : word.slice(0, colon),
        reading: plain,
      });
      phrase.moras.push(...splitKanaMoras(plain));
    }
    phrases.push(phrase);
  }
  return phrases;
}

/**
 * The text the reference TTS reads: every accent phrase holding one of the given words is
 * replaced by Fish phonemes of the kana with those readings put in (the pitch of a word only
 * exists within its phrase). A phrase whose moras have no phoneme falls back to the words in
 * katakana. Words are matched in the text by surface, left to right.
 */
export function phonemeSpell(text: string, kana: string, readings: ReadonlyMap<number, string>) {
  if (readings.size === 0) {
    return text;
  }
  let out = "";
  let written = 0;
  let cursor = 0;
  for (const phrase of phrasesOf(applyReadings(kana, new Map(readings)))) {
    const spans: { word: Phrase["words"][number]; at: number; end: number }[] = [];
    for (const word of phrase.words) {
      const at = text.indexOf(word.surface, cursor);
      if (at >= 0) {
        cursor = at + word.surface.length;
        spans.push({ word, at, end: cursor });
      }
    }
    const first = spans[0];
    const last = spans.at(-1);
    if (!first || !last || !phrase.words.some((word) => readings.has(word.index))) {
      continue;
    }
    const phonemes = fishPhrasePhonemes(phrase.moras, phrase.accent);
    if (phonemes) {
      out += `${text.slice(written, first.at)}${PHONEME_START}${phonemes}${PHONEME_END}`;
      written = last.end;
      continue;
    }
    for (const { word, at, end } of spans) {
      if (readings.has(word.index)) {
        out += `${text.slice(written, at)}${word.reading}`;
        written = end;
      }
    }
  }
  return out + text.slice(written);
}
