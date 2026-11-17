import { describe, expect, it } from "vitest";
import { limitPitch } from "../limit";

const mora = (log_f0: number | null) => ({ start: 0, vowel_start: 0, end: 0.1, log_f0 });

describe("limitPitch", () => {
  it("pulls a spike and a dip toward the mean by the same rule", () => {
    // mean 5, std 1: z = -1, 1, -1, 1 limited to 1 -> tanh(1).
    const limited = limitPitch([mora(4), mora(6), mora(4), mora(6)], 1);
    const values = limited.map((m) => m.log_f0!);
    expect(values[0]).toBeCloseTo(5 - Math.tanh(1));
    expect(values[1]).toBeCloseTo(5 + Math.tanh(1));
  });

  it("barely moves values near the mean", () => {
    // z = -1 with limit 4 -> 4 * tanh(0.25), 2% in.
    const limited = limitPitch([mora(4), mora(6), mora(4), mora(6)], 4);
    expect(limited[0]!.log_f0).toBeCloseTo(5 - 4 * Math.tanh(0.25));
    expect(limited[0]!.log_f0! - 4).toBeLessThan(0.03);
  });

  it("keeps unvoiced moras and ignores them in the statistics", () => {
    const limited = limitPitch([mora(4), mora(null), mora(6)], 1);
    expect(limited[1]!.log_f0).toBeNull();
    expect(limited[0]!.log_f0).toBeCloseTo(5 - Math.tanh(1));
  });

  it("keeps a flat or empty utterance", () => {
    const flat = [mora(5), mora(5)];
    expect(limitPitch(flat, 1)).toEqual(flat);
    expect(limitPitch([mora(null)], 1)).toEqual([mora(null)]);
  });
});
