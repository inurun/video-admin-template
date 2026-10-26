import { describe, expect, it } from "vitest";
import type { MainPageFormValues } from "@/app/features/page/model/page-form-schema";
import { toAvatarExpressionPage, toAvatarExpressionWrites } from "../avatar-expression-form";

const values = {
  id: "page",
  type: "main",
  title: "回",
  meta: { tags: [], avatars: { himari: { base: "bunny" } } },
  tts: [
    { id: "a", text: "一", provider: "voicevox", voiceName: "43", avatar: { eyes: "x" } },
    { id: "b", text: "二", provider: "coeiroink", speakerUuid: "uuid", styleId: 0 },
  ],
} as unknown as MainPageFormValues;

describe("avatar expression form", () => {
  it("sends the voice identity and current overrides of each line", () => {
    expect(toAvatarExpressionPage(values)).toEqual({
      title: "回",
      avatars: { himari: { base: "bunny" } },
      tts: [
        {
          id: "a",
          text: "一",
          provider: "voicevox",
          voiceName: "43",
          speakerUuid: undefined,
          avatar: { eyes: "x" },
        },
        {
          id: "b",
          text: "二",
          provider: "coeiroink",
          voiceName: undefined,
          speakerUuid: "uuid",
          avatar: undefined,
        },
      ],
    });
  });

  it("maps the response to form indexes and clears empty page defaults", () => {
    expect(
      toAvatarExpressionWrites(values, {
        avatars: {},
        tts: [
          { id: "b", avatar: { eyes: "closed" }, avatarSource: { kind: "auto", key: "k1" } },
          { id: "a", avatar: null, avatarSource: { kind: "auto", key: "k2" } },
          { id: "gone", avatar: null, avatarSource: { kind: "auto", key: "k3" } },
        ],
      }),
    ).toEqual({
      avatars: undefined,
      tts: [
        { index: 1, avatar: { eyes: "closed" }, avatarSource: { kind: "auto", key: "k1" } },
        { index: 0, avatar: undefined, avatarSource: { kind: "auto", key: "k2" } },
      ],
    });
  });
});
