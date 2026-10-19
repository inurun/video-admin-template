const DELIMITER = /([|/、？！])/u;
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
 * LLM の kana のうち、読みやアクセントの判断が要らない書式崩れだけを直す。
 * 連続する 、（…… を 、、 と書く）、末尾の /、surface 側の ' が対象。
 */
export function normalizeLlmKana(kana: string) {
  return kana
    .replace(REPEATED_PAUSE, "、")
    .replace(TRAILING_SLASH, "")
    .split(DELIMITER)
    .map((part, index) => (index % 2 === 0 ? moveSurfaceAccent(part) : part))
    .join("");
}
