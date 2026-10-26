import { describe, expect, it } from "vitest";
import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { parseAvatarTokens, serializeAvatarTokens } from "../avatar-tokens";
import { createZenCompletionSource } from "../components/zen-editor/zen-completion";

describe("avatar dot tokens", () => {
  it("accepts all fields in any order and leaves omitted fields unset", () => {
    expect(parseAvatarTokens(["m.opened", "e.shaded-opened", "b.normal"], "demo")).toEqual({
      base: "normal",
      eyes: "shaded-opened",
      mouth: "opened",
    });
    expect(parseAvatarTokens(["e.shaded-opened"], "demo")).toEqual({ eyes: "shaded-opened" });
    expect(parseAvatarTokens([], "demo")).toBeUndefined();
  });
  it.each(["opened", "e:opened", "x.opened", "b.missing", "e.closed", "m.closed", "e."])(
    "rejects invalid token %s",
    (token) => {
      expect(() => parseAvatarTokens([token], "demo")).toThrow();
    },
  );
  it("rejects repeated keys", () => {
    expect(() => parseAvatarTokens(["e.opened", "e.shaded-opened"], "demo")).toThrow("Duplicate");
  });
  it("serializes set override fields and round trips them", () => {
    const avatar = parseAvatarTokens(["m.opened", "e.shaded-opened"], "demo");
    expect(serializeAvatarTokens(avatar)).toBe("e.shaded-opened m.opened");
    expect(parseAvatarTokens(serializeAvatarTokens(avatar).split(" "), "demo")).toEqual(avatar);
    expect(serializeAvatarTokens(undefined)).toBe("");
  });
  it("completes keys and values without repeating used fields", () => {
    const complete = createZenCompletionSource([{ alias: "speaker", avatarType: "demo" }]);
    const labels = (doc: string) =>
      complete(new CompletionContext(EditorState.create({ doc }), doc.length, false))?.options.map(
        (option) => option.label,
      );
    expect(labels("@speaker ")).toEqual(["b.normal", "e.opened", "e.shaded-opened", "m.opened"]);
    expect(labels("@speaker b.normal e.sh")).toEqual(["e.shaded-opened"]);
    expect(labels("@speaker e.opened ")).toEqual(["b.normal", "m.opened"]);
    expect(labels("@sp")).toEqual(["speaker"]);
  });
});
