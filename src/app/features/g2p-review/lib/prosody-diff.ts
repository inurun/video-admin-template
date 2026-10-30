const PHRASE = /[^/、？！]+[/、？！]?/gu;
const CLOSER = /[/、？！]$/u;

function splitPhrases(prosody: string) {
  return prosody.match(PHRASE) ?? [];
}

/** base に同じ句がない所を changed にして、候補どうしで割れた箇所を見つけやすくする。 */
export function diffProsody(prosody: string, base: string) {
  const basePhrases = new Set(splitPhrases(base).map((phrase) => phrase.replace(CLOSER, "")));
  return splitPhrases(prosody).map((text) => ({
    text,
    changed: !basePhrases.has(text.replace(CLOSER, "")),
  }));
}
