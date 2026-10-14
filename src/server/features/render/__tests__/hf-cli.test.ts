import { describe, expect, it } from "vitest";
import { frameToSnapshotSeconds, hfRenderArgs, hfSnapshotArgs } from "../hf-cli";

describe("hfRenderArgs", () => {
  it("renders the project to the output at the former bitrate", () => {
    expect(hfRenderArgs("/tmp/hf", "/out/a.mp4")).toEqual([
      "render",
      "/tmp/hf",
      "-o",
      "/out/a.mp4",
      "--quality",
      "standard",
      "--video-bitrate",
      "12M",
      "--workers",
      "1",
    ]);
  });
});

describe("hfSnapshotArgs", () => {
  it("captures only the requested time", () => {
    const args = hfSnapshotArgs("/tmp/hf", 65.5003, "/tmp/hf/snapshots");
    expect(args.slice(0, 5)).toEqual(["snapshot", "/tmp/hf", "--at", "65.5003", "--no-end"]);
    expect(args.slice(-2)).toEqual(["-o", "/tmp/hf/snapshots"]);
  });
});

describe("frameToSnapshotSeconds", () => {
  it("lands inside the frame", () => {
    expect(Math.floor(frameToSnapshotSeconds(1965, 30) * 30)).toBe(1965);
    expect(Math.floor(frameToSnapshotSeconds(0, 30) * 30)).toBe(0);
  });
});
