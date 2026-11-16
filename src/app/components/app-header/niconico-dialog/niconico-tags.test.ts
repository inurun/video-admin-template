import { afterEach, describe, expect, it, vi } from "vitest";
import { projectNiconicoMetaSchema } from "@/_schemas/project";
import { createNiconicoTags } from "./niconico-tags";
import { fromNiconicoFormValues, toNiconicoFormValues } from "./niconico-dialog.lib";

afterEach(() => vi.restoreAllMocks());

describe("saved Niconico tags", () => {
  it("fills the remaining slots and redraws character tags on every dialog save", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    const form = {
      title: "Nico",
      description: "desc",
      thumbnailTime: "00:00.000",
      parentWorkIds: "",
      fixedParentWorkIds: "",
      tags: "日記 実況 ゲーム 音声合成",
    };
    const first = fromNiconicoFormValues(form);
    expect(first.tags).toEqual(["日記", "実況", "ゲーム", "音声合成", "ずんだもん", "あんこもん"]);
    expect(projectNiconicoMetaSchema.parse(first)).toEqual(first);
    expect(toNiconicoFormValues(first)).toEqual(form);
    random.mockReturnValue(0.999);
    const second = fromNiconicoFormValues(toNiconicoFormValues(first));
    expect(second.tags).toEqual(["日記", "実況", "ゲーム", "音声合成", "双葉湊音", "重音テト"]);
    expect(random).toHaveBeenCalledTimes(4);
  });

  it("fills all open slots and does not promote generated characters to configured tags", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const saved = fromNiconicoFormValues({
      title: "",
      description: "",
      thumbnailTime: "00:00.000",
      parentWorkIds: "",
      fixedParentWorkIds: "",
      tags: "日記 日記",
    });
    expect(saved.tags).toEqual([
      "日記",
      "ずんだもん",
      "あんこもん",
      "冥鳴ひまり",
      "小夜/sayo",
      "櫻歌ミコ",
    ]);
    expect(toNiconicoFormValues(saved).tags).toBe("日記");
    expect(createNiconicoTags([])).toEqual([
      "ずんだもん",
      "あんこもん",
      "冥鳴ひまり",
      "小夜/sayo",
      "櫻歌ミコ",
      "重音テト",
    ]);
  });

  it("adds one random character when five tags are configured", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(createNiconicoTags(["1", "2", "3", "4", "5"])).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "ずんだもん",
    ]);
  });

  it("does not draw when six tags are configured", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    expect(createNiconicoTags(["1", "2", "3", "4", "5", "6"])).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
    ]);
    expect(random).not.toHaveBeenCalled();
  });

  it("rejects more than six saved tags", () => {
    expect(
      projectNiconicoMetaSchema.safeParse({ tags: ["1", "2", "3", "4", "5", "6", "7"] }).success,
    ).toBe(false);
  });
});
