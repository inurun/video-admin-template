import { splitKanaMoras } from "@/_schemas/dictionary";

export type PhraseCloser = "slash" | "pause" | "question" | "exclamation" | "end";

export type KanaViewWord = {
  /** schema v3 の `表記:読み` の表記。 */
  surface?: string;
  moras: string[];
};

export type KanaViewPhrase = {
  words: KanaViewWord[];
  accent: number;
  closer: PhraseCloser;
};

const CLOSERS: Record<string, PhraseCloser> = {
  "/": "slash",
  "、": "pause",
  "？": "question",
  "！": "exclamation",
};

type Token =
  | { type: "surface"; text: string }
  | { type: "mora"; text: string }
  | { type: "quote" }
  | { type: "pipe" }
  | { type: "closer"; closer: PhraseCloser };

function tokenizeKana(kana: string): Token[] | null {
  const tokens: Token[] = [];
  let index = 0;

  while (index < kana.length) {
    const char = kana[index]!;
    if (char === "'") {
      tokens.push({ type: "quote" });
      index += 1;
      continue;
    }
    if (char === "|") {
      tokens.push({ type: "pipe" });
      index += 1;
      continue;
    }
    const closer = CLOSERS[char];
    if (closer) {
      tokens.push({ type: "closer", closer });
      index += 1;
      continue;
    }

    let end = index + 1;
    while (
      end < kana.length &&
      kana[end] !== "'" &&
      kana[end] !== "|" &&
      !(kana[end]! in CLOSERS)
    ) {
      end += 1;
    }
    const colon = kana.indexOf(":", index);
    if (colon >= 0 && colon < end) {
      tokens.push({ type: "surface", text: kana.slice(index, colon) });
      index = colon + 1;
      continue;
    }
    const moras = splitKanaMoras(kana.slice(index, end));
    if (moras.length === 0) {
      return null;
    }
    for (const mora of moras) {
      tokens.push({ type: "mora", text: mora });
    }
    index = end;
  }

  return tokens;
}

function moraCount(phrase: Pick<KanaViewPhrase, "words">) {
  return phrase.words.reduce((count, word) => count + word.moras.length, 0);
}

function toDisplayAccent(quotePos: number, total: number) {
  return quotePos === total ? 0 : quotePos;
}

function toQuotePos(accent: number, total: number) {
  return accent === 0 ? total : accent;
}

export function parseKanaView(kana: string): KanaViewPhrase[] | null {
  const tokens = tokenizeKana(kana);
  if (!tokens || tokens.length === 0) {
    return null;
  }

  const phrases: KanaViewPhrase[] = [];
  let words: KanaViewWord[] = [];
  let moras: string[] = [];
  let surface: string | undefined;
  let quotePos: number | undefined;
  let phraseMora = 0;
  let lastWasMora = false;
  let expectWord = true;

  function finishWord() {
    if (moras.length === 0) {
      return false;
    }
    words.push(surface === undefined ? { moras } : { surface, moras });
    moras = [];
    surface = undefined;
    lastWasMora = false;
    return true;
  }

  function finishPhrase(closer: PhraseCloser) {
    if (!finishWord() || words.length === 0 || quotePos === undefined) {
      return false;
    }
    const total = moraCount({ words });
    if (quotePos < 1 || quotePos > total) {
      return false;
    }
    phrases.push({
      words,
      accent: toDisplayAccent(quotePos, total),
      closer,
    });
    words = [];
    quotePos = undefined;
    phraseMora = 0;
    expectWord = true;
    return true;
  }

  for (const [index, token] of tokens.entries()) {
    if (token.type === "surface") {
      if (moras.length > 0 || surface !== undefined || !token.text) {
        return null;
      }
      surface = token.text;
      continue;
    }

    if (token.type === "mora") {
      if (!expectWord && moras.length === 0 && words.length === 0) {
        return null;
      }
      expectWord = false;
      moras.push(token.text);
      phraseMora += 1;
      lastWasMora = true;
      continue;
    }

    if (token.type === "quote") {
      if (!lastWasMora || quotePos !== undefined) {
        return null;
      }
      quotePos = phraseMora;
      lastWasMora = false;
      continue;
    }

    if (token.type === "pipe") {
      if (!finishWord() || index === tokens.length - 1) {
        return null;
      }
      expectWord = true;
      continue;
    }

    if (!finishPhrase(token.closer)) {
      return null;
    }
    if (token.closer === "slash" && index === tokens.length - 1) {
      return null;
    }
  }

  if (moras.length > 0 || words.length > 0 || quotePos !== undefined) {
    if (!finishPhrase("end")) {
      return null;
    }
  }

  if (phrases.length === 0) {
    return null;
  }
  return phrases;
}

export function serializeKanaView(phrases: KanaViewPhrase[]) {
  let out = "";
  for (const phrase of phrases) {
    const total = moraCount(phrase);
    const quotePos = toQuotePos(phrase.accent, total);
    let moraIndex = 0;
    for (const [wordIndex, word] of phrase.words.entries()) {
      if (wordIndex > 0) {
        out += "|";
      }
      if (word.surface !== undefined) {
        out += `${word.surface}:`;
      }
      for (const mora of word.moras) {
        moraIndex += 1;
        out += mora;
        if (moraIndex === quotePos) {
          out += "'";
        }
      }
    }
    if (phrase.closer === "slash") out += "/";
    if (phrase.closer === "pause") out += "、";
    if (phrase.closer === "question") out += "？";
    if (phrase.closer === "exclamation") out += "！";
  }
  return out;
}

export function setPhraseAccent(phrases: KanaViewPhrase[], phraseIndex: number, accent: number) {
  const phrase = phrases[phraseIndex];
  if (!phrase) {
    return null;
  }
  const total = moraCount(phrase);
  const nextAccent = accent === 0 || accent >= total ? 0 : Math.max(accent, 1);
  const next = phrases.map((item, index) =>
    index === phraseIndex ? { ...item, accent: nextAccent } : item,
  );
  return serializeKanaView(next);
}

export function canToggleChain(phrases: KanaViewPhrase[], phraseIndex: number, wordIndex: number) {
  if (wordIndex > 0) {
    return true;
  }
  const previous = phrases[phraseIndex - 1];
  return wordIndex === 0 && previous?.closer === "slash";
}

export function togglePhraseChain(
  phrases: KanaViewPhrase[],
  phraseIndex: number,
  wordIndex: number,
) {
  if (!canToggleChain(phrases, phraseIndex, wordIndex)) {
    return null;
  }

  if (wordIndex > 0) {
    const phrase = phrases[phraseIndex];
    if (!phrase) {
      return null;
    }
    const leftWords = phrase.words.slice(0, wordIndex);
    const rightWords = phrase.words.slice(wordIndex);
    const leftTotal = moraCount({ words: leftWords });
    const total = moraCount(phrase);
    const quotePos = toQuotePos(phrase.accent, total);
    const left: KanaViewPhrase = {
      words: leftWords,
      accent: quotePos <= leftTotal ? toDisplayAccent(quotePos, leftTotal) : 0,
      closer: "slash",
    };
    const right: KanaViewPhrase = {
      words: rightWords,
      accent: quotePos > leftTotal ? toDisplayAccent(quotePos - leftTotal, total - leftTotal) : 0,
      closer: phrase.closer,
    };
    return serializeKanaView([
      ...phrases.slice(0, phraseIndex),
      left,
      right,
      ...phrases.slice(phraseIndex + 1),
    ]);
  }

  const left = phrases[phraseIndex - 1];
  const right = phrases[phraseIndex];
  if (!left || !right) {
    return null;
  }
  const leftTotal = moraCount(left);
  const combined: KanaViewPhrase = {
    words: [...left.words, ...right.words],
    accent: left.accent !== 0 ? left.accent : right.accent === 0 ? 0 : leftTotal + right.accent,
    closer: right.closer,
  };
  return serializeKanaView([
    ...phrases.slice(0, phraseIndex - 1),
    combined,
    ...phrases.slice(phraseIndex + 1),
  ]);
}

export function phraseBoundaryLabel(closer: PhraseCloser) {
  if (closer === "pause") return "pause";
  if (closer === "question") return "question";
  if (closer === "exclamation") return "exclamation";
  return undefined;
}
