import type { DictionaryEntry } from "@/_schemas";

const CONTEXTUAL_EXAMPLE_LIMIT = 3;

export type G2pDictionaryHint =
  | { kind: "fixed"; surface: string; reading: string; accent: number }
  | {
      kind: "contextual";
      surface: string;
      candidates: Array<{ reading: string; examples: string[] }>;
    };

function toHint(entry: DictionaryEntry): G2pDictionaryHint {
  if (entry.kind === "fixed") {
    return {
      kind: "fixed",
      surface: entry.surface,
      reading: entry.pronunciation || entry.reading,
      accent: entry.accent_nucleus,
    };
  }
  return {
    kind: "contextual",
    surface: entry.surface,
    candidates: entry.candidates.map((candidate) => ({
      reading: candidate.morphemes
        .map((morpheme) => morpheme.pronunciation || morpheme.reading)
        .join(""),
      examples: candidate.examples.slice(0, CONTEXTUAL_EXAMPLE_LIMIT),
    })),
  };
}

export function selectDictionaryHints(entries: readonly DictionaryEntry[], text: string) {
  const lower = text.toLowerCase();
  return entries
    .filter((entry) => entry.enabled && lower.includes(entry.surface.toLowerCase()))
    .map(toHint);
}
