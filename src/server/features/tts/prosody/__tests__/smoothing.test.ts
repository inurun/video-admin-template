import { describe, expect, it } from "vitest";
import { smoothPitch } from "../smoothing";

const mora = (log_f0: number | null) => ({ start: 0, vowel_start: 0, end: 0.1, log_f0 });

describe("smoothPitch", () => {
  it("keeps the moras at 0", () => {
    const moras = [mora(5), mora(6), mora(5)];
    expect(smoothPitch(moras, [], 0)).toEqual(moras);
  });

  it("mixes each mora with the mean of its neighbors, half and half at 1", () => {
    const smoothed = smoothPitch([mora(5), mora(6), mora(4)], [], 1);
    expect(smoothed.map((m) => m.log_f0)).toEqual([5.5, 5.25, 5]);
  });

  it("evens out an alternating contour without turning it upside down", () => {
    const smoothed = smoothPitch([mora(4), mora(6), mora(4), mora(6)], [], 1);
    expect(smoothed.map((m) => m.log_f0)).toEqual([5, 5, 5, 5]);
    const half = smoothPitch([mora(4), mora(6), mora(4), mora(6)], [], 0.5);
    expect(half.map((m) => m.log_f0)).toEqual([4.5, 5.5, 4.5, 5.5]);
  });

  it("leaves out unvoiced neighbors and keeps unvoiced moras", () => {
    const smoothed = smoothPitch([mora(5), mora(null), mora(6)], [], 1);
    expect(smoothed.map((m) => m.log_f0)).toEqual([5, null, 6]);
  });

  it("does not mix across a pause", () => {
    const smoothed = smoothPitch([mora(5), mora(6)], [{ after_mora: 0, sec: 0.2 }], 1);
    expect(smoothed.map((m) => m.log_f0)).toEqual([5, 6]);
  });
});
