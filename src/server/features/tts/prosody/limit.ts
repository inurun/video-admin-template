import type { ProsodyExtract } from "@/_schemas";

type Mora = ProsodyExtract["moras"][number];

/**
 * Soft-limits each voiced mora's log F0 to `limit` standard deviations from the utterance mean
 * (`limit * tanh(z / limit)`), on both sides. Values near the mean barely move; one spike or dip
 * no longer widens the spread the engine maps the rest onto.
 */
export function limitPitch(moras: readonly Mora[], limit: number): Mora[] {
  const voiced = moras.flatMap((mora) => (mora.log_f0 === null ? [] : [mora.log_f0]));
  const mean = voiced.reduce((sum, value) => sum + value, 0) / voiced.length;
  const std = Math.sqrt(
    voiced.reduce((sum, value) => sum + (value - mean) ** 2, 0) / voiced.length,
  );
  if (!(std > 0)) {
    return [...moras];
  }
  return moras.map((mora) => {
    if (mora.log_f0 === null) {
      return mora;
    }
    const z = (mora.log_f0 - mean) / std;
    return { ...mora, log_f0: mean + std * limit * Math.tanh(z / limit) };
  });
}
