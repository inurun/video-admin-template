import { describe, expect, it } from "vitest";
import type { NamedVoiceProvider, VoiceOption } from "@/_schemas";
import { getVoiceId } from "@/_schemas";
import type { PageFormValues } from "@/app/features/page/model/page-form-schema";
import type { TtsFormValues } from "@/app/features/tts/model/tts-form-schema";
import { createG2pItem } from "@/_schemas/__tests__/g2p-fixture";
import { createAliasMap } from "@/app/features/zen/create-alias-map";
import { parseZenScript } from "@/app/features/zen/parse-zen-script";
import { serializeZenPage } from "@/app/features/zen/serialize-zen-page";
import { applyZenTtsList } from "@/app/features/zen/apply-zen-tts";
import { applyZenPage } from "@/app/features/zen/apply-zen-page";
import type { VoiceSettings } from "@/app/features/settings/storage/use-settings-store";

function voice(
  voiceName: string,
  displayName: string,
  provider: NamedVoiceProvider = "voicevox",
): VoiceOption {
  return { provider, voiceName, voiceVersion: "", displayName };
}

function aliases(entries: Array<{ alias: string; voice: VoiceOption }>) {
  const voices = entries.map((entry) => entry.voice);
  const voiceSettings = Object.fromEntries(
    entries.map((entry) => [
      getVoiceId(entry.voice),
      { label: entry.voice.displayName, alias: entry.alias, hotkey: "" } satisfies VoiceSettings,
    ]),
  );
  return createAliasMap(voices, voiceSettings);
}

const { aliases: aliasMap } = aliases([
  { alias: "zunda", voice: voice("3", "Zunda") },
  { alias: "himari", voice: voice("14", "Himari") },
]);

function ttsItem(
  overrides: Partial<Extract<TtsFormValues, { provider: "voicevox" }>>,
): TtsFormValues {
  return {
    id: "id",
    provider: "voicevox",
    text: "",
    readText: "",
    voiceName: "3",
    voiceVersion: "",
    padBeforeSec: 1,
    padAfterSec: 2,
    volume: 0.5,
    synthesisSettings: null,
    speech: { g2p: createG2pItem("kept") },
    ...overrides,
  };
}

function mainPage(
  overrides: Partial<Extract<PageFormValues, { type: "main" }>> = {},
): PageFormValues {
  return {
    id: "page-1",
    title: "タイトル",
    type: "main",
    meta: { tags: ["news"] },
    padBeforeSec: 3,
    padAfterSec: 4,
    richText: "<p>keep</p>",
    tts: [],
    ...overrides,
  };
}

describe("serializeZenPage", () => {
  it("serializes a titled page and round-trips content", () => {
    const source = serializeZenPage(
      mainPage({
        tts: [
          ttsItem({ id: "a", text: "hello", readText: "hello" }),
          ttsItem({ id: "b", text: "world", readText: "world" }),
          ttsItem({
            id: "c",
            voiceName: "14",
            text: "line\nbreak",
            readText: "line\nbreak",
            avatar: { eyes: "shaded-opened" },
          }),
        ],
      }),
      aliasMap,
    );

    expect(source).toBe(`# タイトル
#news

@zunda
hello
world

@himari e.shaded-opened
line  break
`);

    const parsed = parseZenScript(source, { aliases: aliasMap });
    expect(parsed.errors).toEqual([]);
    expect(parsed.pages[0]?.title).toBe("タイトル");
    expect(parsed.pages[0]?.meta.tags).toEqual(["news"]);
    expect(parsed.pages[0]?.tts.map((item) => item.text)).toEqual([
      "hello",
      "world",
      "line\nbreak",
    ]);
  });

  it("serializes an untitled page with a leading separator", () => {
    const source = serializeZenPage(
      mainPage({
        title: "",
        meta: { tags: ["tag1", "tag2"] },
        tts: [ttsItem({ text: "hello", readText: "hello" })],
      }),
      aliasMap,
    );

    expect(source).toBe(`---
#tag1 #tag2

@zunda
hello
`);
  });
});

describe("applyZenTtsList", () => {
  it("keeps ids when text is unchanged", () => {
    const existing = [
      ttsItem({ id: "a", text: "hello", readText: "hello" }),
      ttsItem({ id: "b", text: "world", readText: "world" }),
    ];
    const parsed = parseZenScript(
      `@zunda
hello
world
`,
      { aliases: aliasMap },
    );

    const result = applyZenTtsList(existing, parsed.pages[0]?.tts ?? [], aliasMap);
    expect(result.map((item) => item.id)).toEqual(["a", "b"]);
    expect(result[0]?.padBeforeSec).toBe(1);
    expect(result[0]?.volume).toBe(0.5);
    expect(result[0]?.speech?.g2p).toEqual(createG2pItem("kept"));
  });

  it("applies all avatar fields and resets omitted fields without losing TTS settings", () => {
    const existing = [
      ttsItem({
        text: "hello",
        avatar: { base: "old", eyes: "shaded-opened", mouth: "old" },
      }),
    ];
    const parsed = parseZenScript("@zunda b.normal m.opened\nhello", { aliases: aliasMap });
    const result = applyZenTtsList(existing, parsed.pages[0]!.tts, aliasMap);
    expect(result[0]).toMatchObject({
      id: "id",
      padBeforeSec: 1,
      padAfterSec: 2,
      volume: 0.5,
      speech: { g2p: createG2pItem("kept") },
    });
    expect(result[0]?.avatar).toEqual({ base: "normal", mouth: "opened" });
  });

  it("clears the avatar override when the script has no tokens", () => {
    const existing = [ttsItem({ text: "hello", avatar: { eyes: "shaded-opened" } })];
    const parsed = parseZenScript("@zunda\nhello", { aliases: aliasMap });
    const result = applyZenTtsList(existing, parsed.pages[0]!.tts, aliasMap);
    expect(result[0]).not.toHaveProperty("avatar");
  });

  it("keeps id and updates text with readText on a substitution", () => {
    const existing = [ttsItem({ id: "a", text: "hello", readText: "hello" })];
    const parsed = parseZenScript(
      `@zunda
hello edited
`,
      { aliases: aliasMap },
    );

    const result = applyZenTtsList(existing, parsed.pages[0]?.tts ?? [], aliasMap);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("a");
    expect(result[0]?.text).toBe("hello edited");
    expect(result[0]?.readText).toBe("hello edited");
    expect(result[0]?.padBeforeSec).toBe(1);
    expect(result[0]?.speech?.g2p).toEqual(createG2pItem("kept"));
  });

  it("keeps later ids when a line is inserted", () => {
    const existing = [
      ttsItem({ id: "a", text: "hello", readText: "hello" }),
      ttsItem({ id: "b", text: "world", readText: "world" }),
    ];
    const parsed = parseZenScript(
      `@zunda
hello
inserted
world
`,
      { aliases: aliasMap },
    );

    const result = applyZenTtsList(existing, parsed.pages[0]?.tts ?? [], aliasMap);
    expect(result.map((item) => item.text)).toEqual(["hello", "inserted", "world"]);
    expect(result[0]?.id).toBe("a");
    expect(result[2]?.id).toBe("b");
    expect(result[1]?.id).not.toBe("a");
    expect(result[1]?.id).not.toBe("b");
  });

  it("drops removed lines and reorders existing ids", () => {
    const existing = [
      ttsItem({ id: "a", text: "hello", readText: "hello" }),
      ttsItem({ id: "b", text: "world", readText: "world" }),
    ];
    const parsed = parseZenScript(
      `@zunda
world
hello
`,
      { aliases: aliasMap },
    );

    const result = applyZenTtsList(existing, parsed.pages[0]?.tts ?? [], aliasMap);
    expect(result.map((item) => item.id)).toEqual(["b", "a"]);
  });
});

describe("applyZenPage", () => {
  it("updates title and tags while keeping page id and pads", () => {
    const existing = mainPage({
      tts: [ttsItem({ id: "a", text: "hello", readText: "hello" })],
    });
    const parsed = parseZenScript(
      `---
#tag2

@zunda
hello
`,
      { aliases: aliasMap },
    );

    const result = applyZenPage(existing, parsed.pages[0] as PageFormValues, aliasMap);
    expect(result.id).toBe("page-1");
    expect(result.title).toBe("");
    expect(result.meta.tags).toEqual(["tag2"]);
    expect(result.padBeforeSec).toBe(3);
    expect(result.richText).toBe("<p>keep</p>");
    expect(result.tts[0]?.id).toBe("a");
  });

  it("edits intro while preserving its kind and non-Zen fields", () => {
    const existing = { ...mainPage(), type: "intro" as const };
    const next = mainPage({ title: "New", meta: { tags: ["intro"] } });
    const result = applyZenPage(existing, next, aliasMap);
    expect(result).toMatchObject({
      id: existing.id,
      type: "intro",
      title: "New",
      meta: { tags: ["intro"] },
      padBeforeSec: 3,
      padAfterSec: 4,
      richText: "<p>keep</p>",
    });
  });

  it("keeps endcard lists when updating tags", () => {
    const existing: PageFormValues = {
      id: "endcard-1",
      title: "Endcard",
      type: "endcard",
      meta: {
        tags: ["old"],
        nicoadSource: "sm9",
        credits: [{ id: "c1", title: "BGM", url: "https://example.com" }],
        advertisers: [
          {
            id: "a1",
            identityKey: "user:1",
            introductionCount: 1,
            userId: 1,
            name: "Ada",
            message: "hi",
          },
        ],
        messages: [{ id: "m1", text: "Thanks" }],
      },
      padBeforeSec: 0,
      padAfterSec: 0,
      richText: null,
      tts: [],
    };

    const result = applyZenPage(
      existing,
      mainPage({ title: "Next", meta: { tags: ["tag2"] } }),
      aliasMap,
    );
    expect(result).toMatchObject({
      type: "endcard",
      title: "Next",
      meta: {
        tags: ["tag2"],
        nicoadSource: "sm9",
        credits: [{ id: "c1", title: "BGM", url: "https://example.com" }],
      },
    });
  });
});
