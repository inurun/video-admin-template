const PAUSE_CHARS = "、。，．,…";
const QUESTION_CHARS = "？?";
const EXCLAMATION_CHARS = "！!";
const TRANSPARENT_AFTER_CLOSER = /[」』）)\s]/u;
const TRAILING_PAUSE = /[、。，．,…][」』）)\s]*$/u;
const KANA_CLOSERS = new Set(["、", "？", "！"]);

function closerOf(char: string) {
  if (PAUSE_CHARS.includes(char)) return "、";
  if (QUESTION_CHARS.includes(char)) return "？";
  if (EXCLAMATION_CHARS.includes(char)) return "！";
  return "";
}

/** 原文の句読点を kana の句末記号の並びにする。連続するポーズは1つ、文末のポーズは省略できる。 */
function expectedClosers(text: string) {
  const out: string[] = [];
  let previous = "";
  for (const char of text) {
    const closer = closerOf(char);
    if (closer && !(closer === "、" && previous === "、")) {
      out.push(closer);
    }
    previous = closer || (TRANSPARENT_AFTER_CLOSER.test(char) ? previous : "");
  }
  if (out.at(-1) === "、" && TRAILING_PAUSE.test(text)) {
    out.pop();
  }
  return out.join("");
}

function actualClosers(kana: string) {
  const body = kana.at(-1) === "、" ? kana.slice(0, -1) : kana;
  return Array.from(body)
    .filter((char) => KANA_CLOSERS.has(char))
    .join("");
}

/** v3 の validate は原文の句読点を照合しないので、ここで並びを確かめる。 */
export function closerMismatchMessage(text: string, kana: string) {
  const expected = expectedClosers(text);
  const actual = actualClosers(kana);
  if (expected === actual) {
    return undefined;
  }
  return `phrase closers must follow the text punctuation: expected "${expected}", got "${actual}"`;
}
