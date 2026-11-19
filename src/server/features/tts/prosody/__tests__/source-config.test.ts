import { describe, expect, it, vi } from "vitest";
import { createG2pItem } from "@/_schemas/__tests__/g2p-fixture";

vi.mock("@/video/config", async () => ({
  ...(await vi.importActual<typeof import("@/video/config")>("@/video/config")),
  speechVoiceConfig: {
    source: "eleven-v4-turbo",
    voice: "bella",
    defaultTag: "[in a monotone]",
    tags: { "voicevox::113::": "[tired]", "voicevox::14::": "" },
  },
}));
vi.mock("@/server/_shared/storage", () => ({ PROSODY_CACHE_DIR: "/cache/prosody" }));

import { prosodyExtractPath } from "../cache";
import { prosodySourceFor } from "../source-config";

describe("prosodySourceFor", () => {
  it("reads every character with the shared voice", () => {
    expect(prosodySourceFor({ provider: "voicevox", voiceName: "113" }).voice).toBe("bella");
    expect(prosodySourceFor({ provider: "voisona", voiceName: "x" }).voice).toBe("bella");
  });

  it("names the configured source and its adapter's version", () => {
    expect(prosodySourceFor({ provider: "voicevox", voiceName: "3" })).toMatchObject({
      source: "eleven-v4-turbo",
      version: "eleven-v4-turbo-v1",
    });
    const drama = prosodySourceFor(
      { provider: "voicevox", voiceName: "3" },
      { source: "drama-3", voice: "fish-id", defaultTag: "", tags: {} },
    );
    expect(drama).toEqual({ source: "drama-3", version: "drama3-v1", voice: "fish-id", tag: "" });
  });

  it("uses a character's own tag, or the default", () => {
    expect(prosodySourceFor({ provider: "voicevox", voiceName: "113" }).tag).toBe("[tired]");
    expect(prosodySourceFor({ provider: "voicevox", voiceName: "14" }).tag).toBe("");
    expect(prosodySourceFor({ provider: "voicevox", voiceName: "3" }).tag).toBe("[in a monotone]");
    expect(prosodySourceFor({ provider: "voicevox" }).tag).toBe("[in a monotone]");
  });

  it("gives each source its own extract", () => {
    const g2p = createG2pItem("日本語でOK", "日本語:ニホンゴ|で:デ'/ＯＫ:オ'ーケー");
    const speaker = { provider: "voicevox", voiceName: "3" } as const;
    const drama = prosodySourceFor(speaker, {
      source: "drama-3",
      voice: "bella",
      defaultTag: "[in a monotone]",
      tags: {},
    });
    expect(prosodyExtractPath(g2p, drama)).not.toBe(
      prosodyExtractPath(g2p, prosodySourceFor(speaker)),
    );
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
