import { describe, expect, it, vi } from "vitest";
import { createG2pItem } from "@/_schemas/__tests__/g2p-fixture";

vi.mock("@/video/config", async () => ({
  ...(await vi.importActual<typeof import("@/video/config")>("@/video/config")),
  speechVoiceConfig: {
    voice: "hina",
    defaultTag: "[calm]",
    tags: { "voicevox::113::": "[tired]", "voicevox::14::": "" },
  },
}));
vi.mock("@/server/_shared/storage", () => ({ PROSODY_CACHE_DIR: "/cache/prosody" }));

import { prosodyExtractPath } from "../cache";
import { prosodySourceFor } from "../source-config";

describe("prosodySourceFor", () => {
  it("reads every character with the shared voice", () => {
    expect(prosodySourceFor({ provider: "voicevox", voiceName: "113" }).voice).toBe("hina");
    expect(prosodySourceFor({ provider: "voisona", voiceName: "x" }).voice).toBe("hina");
  });

  it("uses a character's own tag, or the default", () => {
    expect(prosodySourceFor({ provider: "voicevox", voiceName: "113" }).tag).toBe("[tired]");
    expect(prosodySourceFor({ provider: "voicevox", voiceName: "14" }).tag).toBe("");
    expect(prosodySourceFor({ provider: "voicevox", voiceName: "3" }).tag).toBe("[calm]");
    expect(prosodySourceFor({ provider: "voicevox" }).tag).toBe("[calm]");
  });

  it("puts the line's voice emotion after the character's tag; neutral adds nothing", () => {
    expect(
      prosodySourceFor({ provider: "voicevox", voiceName: "113", voiceEmotion: "joy" }).tag,
    ).toBe("[tired] [happy, cheerful]");
    expect(
      prosodySourceFor({ provider: "voicevox", voiceName: "14", voiceEmotion: "annoyed" }).tag,
    ).toBe("[annoyed, irritated]");
    expect(
      prosodySourceFor({ provider: "voicevox", voiceName: "14", voiceEmotion: "neutral" }).tag,
    ).toBe("");
  });

  it("gives each tag its own extract", () => {
    const g2p = createG2pItem("日本語でOK", "日本語:ニホンゴ|で:デ'/ＯＫ:オ'ーケー");
    const anko = prosodySourceFor({ provider: "voicevox", voiceName: "113" });
    const shared = prosodySourceFor({ provider: "voicevox", voiceName: "3" });
    expect(prosodyExtractPath(g2p, anko)).not.toBe(prosodyExtractPath(g2p, shared));
    expect(prosodyExtractPath(g2p, shared)).toBe(
      prosodyExtractPath(g2p, prosodySourceFor({ provider: "voisona", voiceName: "x" })),
    );
  });
});
