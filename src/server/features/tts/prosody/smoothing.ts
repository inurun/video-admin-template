import type { ProsodyExtract } from "@/_schemas";

type Mora = ProsodyExtract["moras"][number];

/**
 * Mixes each mora's log F0 with the mean of its voiced neighbors: `amount` 0 keeps it, 1 is
 * half its own and half the neighbors' (1/4 each with two). The mora always keeps at least half,
 * so an alternating high-low contour is evened out, never turned upside down.
 * Neighbors across a pause or without F0 are left out; the input values are used throughout.
 */
export function smoothPitch(
  moras: readonly Mora[],
  pauses: ProsodyExtract["pauses"],
  amount: number,
): Mora[] {
  if (amount === 0) {
    return [...moras];
  }
  const pauseAfter = new Set(pauses.map((pause) => pause.after_mora));
  const pitchAt = (index: number) => moras[index]?.log_f0 ?? null;
  return moras.map((mora, index) => {
    if (mora.log_f0 === null) {
      return mora;
    }
    const neighbors = [
      index > 0 && !pauseAfter.has(index - 1) ? pitchAt(index - 1) : null,
      pauseAfter.has(index) ? null : pitchAt(index + 1),
    ].filter((value) => value !== null);
    if (neighbors.length === 0) {
      return mora;
    }
    const mean = neighbors.reduce((sum, value) => sum + value, 0) / neighbors.length;
    const weight = amount / 2;
    return { ...mora, log_f0: (1 - weight) * mora.log_f0 + weight * mean };
  });
}
