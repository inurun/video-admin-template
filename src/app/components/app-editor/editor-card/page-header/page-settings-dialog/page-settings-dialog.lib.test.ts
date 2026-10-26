import { describe, expect, it } from "vitest";
import {
  getPageAvatarTypes,
  getPageSettingsTags,
  getSelectedPageSettingsFormValues,
  pageSettingsFormSchema,
  toMainPageMeta,
  toPageSettingsFormValues,
} from "./page-settings-dialog.lib";

describe("page settings values", () => {
  it("preserves tag order and duplicates while trimming values", () => {
    const parsed = pageSettingsFormSchema.parse({
      title: "Page",
      tags: [{ value: " travel " }, { value: "news" }, { value: " travel " }],
      presentation: "single",
      avatars: {},
    });

    expect(getPageSettingsTags(parsed)).toEqual(["travel", "news", "travel"]);
  });

  it("converts existing page values to field rows", () => {
    expect(toPageSettingsFormValues({ title: "Page", tags: ["travel", "news"] })).toEqual({
      title: "Page",
      tags: [{ value: "travel" }, { value: "news" }],
      presentation: "single",
      avatars: {},
    });
  });

  it("resolves selected and missing page values", () => {
    expect(
      getSelectedPageSettingsFormValues({ title: "Page", meta: { tags: ["travel"] } }),
    ).toEqual({
      title: "Page",
      tags: [{ value: "travel" }],
      presentation: "single",
      avatars: {},
    });
    expect(getSelectedPageSettingsFormValues(null)).toEqual({
      title: "",
      tags: [],
      presentation: "single",
      avatars: {},
    });
  });

  it("rejects blank tags and accepts an empty list", () => {
    expect(
      pageSettingsFormSchema.safeParse({
        title: "",
        tags: [],
        presentation: "single",
        avatars: {},
      }).success,
    ).toBe(true);
    expect(
      pageSettingsFormSchema.safeParse({
        title: "",
        tags: [{ value: "   " }],
        presentation: "single",
        avatars: {},
      }).success,
    ).toBe(false);
  });

  it("builds main page meta and drops empty defaults", () => {
    expect(
      toMainPageMeta({
        title: "",
        tags: [{ value: " a " }],
        presentation: "single",
        avatars: { demo: { eyes: "shaded-opened", mouth: undefined } },
      }),
    ).toEqual({ tags: ["a"], avatars: { demo: { eyes: "shaded-opened" } } });
    expect(
      toMainPageMeta({ title: "", tags: [], presentation: "single", avatars: { demo: {} } }),
    ).toEqual({ tags: [] });
  });

  it("lists speaking and configured avatars in catalog order", () => {
    expect(getPageAvatarTypes([{ provider: "voisona", voiceName: "demo" }], undefined)).toEqual([
      "demo",
    ]);
    expect(getPageAvatarTypes([], undefined)).toEqual([]);
  });
});
