import { describe, expect, it } from "vitest";
import { getProjectVideoSizePresetId, normalizeProjectMeta } from "../normalize-project-meta";

describe("project meta", () => {
  it("normalizes unsupported project sizes to landscape", () => {
    expect(
      normalizeProjectMeta({
        title: "Demo",
        description: "",
        width: 999,
        height: 999,
      }),
    ).toEqual({
      title: "Demo",
      description: "",
      width: 1920,
      height: 1080,
      weather: {},
      niconico: {
        title: "",
        description: "",
        thumbnailTime: "00:00.000",
        parentWorkIds: [],
        fixedParentWorkIds: [],
        tags: [],
      },
    });
  });

  it("keeps frame metadata while normalizing size", () => {
    expect(
      normalizeProjectMeta({
        title: "Demo",
        description: "",
        width: 1920,
        height: 1080,
        updatedAt: "2026-07-27T09:40:00.000Z",
        weather: {
          tokyo: {
            temperatureC: 23,
            precipitationProbability: 50,
            condition: "cloudy",
          },
        },
      }),
    ).toMatchObject({
      updatedAt: "2026-07-27T09:40:00.000Z",
      weather: {
        tokyo: {
          temperatureC: 23,
          precipitationProbability: 50,
          condition: "cloudy",
        },
      },
    });
  });

  it("normalizes niconico parent work ids", () => {
    expect(
      normalizeProjectMeta({
        title: "Demo",
        niconico: {
          title: "  Nico  ",
          description: "desc",
          thumbnailTime: "01:23.456",
          parentWorkIds: ["sm9", " bad ", "sm9", "ss1", "im2"],
          fixedParentWorkIds: [" im10778297 ", "bad"],
          tags: [],
        },
      }).niconico,
    ).toEqual({
      title: "Nico",
      description: "desc",
      thumbnailTime: "01:23.456",
      parentWorkIds: ["sm9", "ss1", "im2"],
      fixedParentWorkIds: ["im10778297"],
      tags: [],
    });
  });

  it("resolves video size preset ids", () => {
    expect(getProjectVideoSizePresetId({ width: 1280, height: 1280 })).toBe("square");
    expect(getProjectVideoSizePresetId({ width: 1080, height: 1920 })).toBe("portrait");
    expect(getProjectVideoSizePresetId({ width: 999, height: 999 })).toBe("landscape");
  });
});
