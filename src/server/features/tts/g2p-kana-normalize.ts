const DELIMITER = /([|/、？！])/u;
const PHRASE_CLOSER = /([/、？！])/u;
const REPEATED_PAUSE = /、{2,}/gu;
const TRAILING_SLASH = /\/+$/u;

/** surface に付いた ' は直前のモーラ = reading の末尾の核として読む。 */
function moveSurfaceAccent(word: string) {
  const colon = word.indexOf(":");
  if (colon < 0) {
    return word;
  }
  const surface = word.slice(0, colon);
  const reading = word.slice(colon + 1);
  if (!surface.endsWith("'") || reading.includes("'")) {
    return word;
  }
  return `${surface.slice(0, -1)}:${reading}'`;
}

/**
 * ' の無い句は平板として句末に ' を足す。LLM は平板の ' を書き落としやすく、
 * repair させても 9 割はこの直し方になっていた（diary の v3 ログ）。
 */
function markFlatPhrase(phrase: string) {
  return phrase.includes(":") && !phrase.includes("'") ? `${phrase}'` : phrase;
}

/**
 * LLM の kana のうち、repair に回すまでもない崩れを直す。
 * 連続する 、（…… を 、、 と書く）、末尾の /、surface 側の '、平板の ' の書き落としが対象。
 */
export function normalizeLlmKana(kana: string) {
  return kana
    .replace(REPEATED_PAUSE, "、")
    .replace(TRAILING_SLASH, "")
    .split(DELIMITER)
    .map((part, index) => (index % 2 === 0 ? moveSurfaceAccent(part) : part))
    .join("")
    .split(PHRASE_CLOSER)
    .map((part, index) => (index % 2 === 0 ? markFlatPhrase(part) : part))
    .join("");
}
