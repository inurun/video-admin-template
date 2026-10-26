import { describe, expect, it } from "vitest";
import type { VoiceOption } from "@/_schemas";
import { parseTtsComposeInput } from "@/app/features/tts/lib/tts-compose-command";

const voice: VoiceOption = {
  provider: "voisona",
  voiceName: "demo",
  displayName: "Demo",
};

describe("parseTtsComposeInput", () => {
  it("applies leading commands and removes them from multiline text", () => {
    expect(
      parseTtsComposeInput("/e.shaded-opened /m.opened First line\nSecond line", voice),
    ).toEqual({
      ok: true,
      text: "First line\nSecond line",
      avatar: { eyes: "shaded-opened", mouth: "opened" },
    });
  });

  it("leaves the avatar unset without commands", () => {
    expect(parseTtsComposeInput("Text", voice)).toEqual({
      ok: true,
      text: "Text",
      avatar: undefined,
    });
  });

  it("supports all command fields in any order", () => {
    expect(parseTtsComposeInput("/m.opened /b.normal /e.opened Text", voice)).toMatchObject({
      ok: true,
      text: "Text",
      avatar: { base: "normal", eyes: "opened", mouth: "opened" },
    });
  });

  it.each([
    ["", "Text is required."],
    ["/e.opened", "Text is required after commands."],
    ["/e.closed Text", 'Unknown eyes "closed".'],
    ["/e.opened /e.shaded-opened Text", 'Duplicate command "/e".'],
    ["/x.value Text", 'Unknown command "/x".'],
    ["/broken Text", 'Invalid command "/broken".'],
  ])("rejects %j", (source, error) => {
    expect(parseTtsComposeInput(source, voice)).toEqual({ ok: false, error });
  });

  it("unescapes a leading slash and leaves later slashes unchanged", () => {
    expect(parseTtsComposeInput("\\/literal https://example.com/a/b", voice)).toMatchObject({
      ok: true,
      text: "/literal https://example.com/a/b",
    });
    expect(parseTtsComposeInput("See /e.opened", voice)).toMatchObject({
      ok: true,
      text: "See /e.opened",
    });
  });
});
