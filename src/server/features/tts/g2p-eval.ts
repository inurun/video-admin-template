import { splitKanaMoras } from "@/_schemas/dictionary";

const CLOSER = /([/、？！])/u;

export type ProsodyPhrase = {
  /** 発話全体のモーラ位置。end は含まない。 */
  start: number;
  end: number;
  /** 句頭からのモーラ数で、' の直前まで。' が無い句は undefined。 */
  accent: number | undefined;
  closer: string;
};

/** kana から surface を捨てた発音・句境界・アクセント核だけの形。 */
export type KanaProsody = {
  moras: string[];
  phrases: ProsodyPhrase[];
};

/**
 * reading が違えばモーラ位置が揃わないので、句境界とアクセントは reading が一致したときだけ比べる。
 */
export type G2pComparison =
  | { reading: false }
  | {
      reading: true;
      boundaries: number;
      missingBoundaries: number;
      extraBoundaries: number;
      alignedPhrases: number;
      wrongAccents: number;
    };

export function parseKanaProsody(kana: string): KanaProsody {
  const moras: string[] = [];
  const phrases: ProsodyPhrase[] = [];
  const parts = kana.split(CLOSER);
  for (let index = 0; index < parts.length; index += 2) {
    const body = parts[index] ?? "";
    if (!body) {
      continue;
    }
    const start = moras.length;
    let accent: number | undefined;
    for (const word of body.split("|")) {
      const reading = word.slice(word.indexOf(":") + 1);
      const quote = reading.indexOf("'");
      if (quote >= 0 && accent === undefined) {
        accent = moras.length - start + splitKanaMoras(reading.slice(0, quote)).length;
      }
      moras.push(...splitKanaMoras(reading.replaceAll("'", "")));
    }
    phrases.push({ start, end: moras.length, accent, closer: parts[index + 1] ?? "" });
  }
  return { moras, phrases };
}

export function formatKanaProsody(prosody: KanaProsody) {
  return prosody.phrases
    .map((phrase) => {
      const moras = prosody.moras.slice(phrase.start, phrase.end);
      if (phrase.accent !== undefined) {
        moras.splice(phrase.accent, 0, "'");
      }
      return `${moras.join("")}${phrase.closer}`;
    })
    .join("");
}

function boundariesOf(prosody: KanaProsody) {
  return new Set(prosody.phrases.slice(0, -1).map((phrase) => phrase.end));
}

export function compareKana(truthKana: string, predictedKana: string): G2pComparison {
  const truth = parseKanaProsody(truthKana);
  const predicted = parseKanaProsody(predictedKana);
  if (truth.moras.join("") !== predicted.moras.join("")) {
    return { reading: false };
  }

  const truthBoundaries = boundariesOf(truth);
  const predictedBoundaries = boundariesOf(predicted);
  const predictedPhrases = new Map(
    predicted.phrases.map((phrase) => [`${phrase.start}-${phrase.end}`, phrase]),
  );
  let alignedPhrases = 0;
  let wrongAccents = 0;
  for (const phrase of truth.phrases) {
    const match = predictedPhrases.get(`${phrase.start}-${phrase.end}`);
    if (!match) {
      continue;
    }
    alignedPhrases += 1;
    if (match.accent !== phrase.accent) {
      wrongAccents += 1;
    }
  }

  return {
    reading: true,
    boundaries: truthBoundaries.size,
    missingBoundaries: [...truthBoundaries].filter((at) => !predictedBoundaries.has(at)).length,
    extraBoundaries: [...predictedBoundaries].filter((at) => !truthBoundaries.has(at)).length,
    alignedPhrases,
    wrongAccents,
  };
}

/** どれか1つと一致すれば正解。外れたときは先頭の正解との差を返す。 */
export function compareKanaToAny(truths: readonly string[], predictedKana: string): G2pComparison {
  const comparisons = truths.map((truth) => compareKana(truth, predictedKana));
  return comparisons.find(isExactMatch) ?? comparisons[0] ?? { reading: false };
}

export function isExactMatch(comparison: G2pComparison) {
  return (
    comparison.reading &&
    comparison.missingBoundaries === 0 &&
    comparison.extraBoundaries === 0 &&
    comparison.wrongAccents === 0
  );
}
