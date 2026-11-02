import { describe, expect, it } from "vitest";
import {
  createBlankEndcardAdvertiser,
  mergeFetchedAdvertisers,
} from "@/app/features/page/lib/endcard";

const advertiser = (identityKey: string, message: string, id = identityKey) =>
  createBlankEndcardAdvertiser({ id, identityKey, message });

describe("mergeFetchedAdvertisers", () => {
  it("keeps a local addition after the fetched message", () => {
    const merged = mergeFetchedAdvertisers(
      [advertiser("user:1", "よろしく（追記）", "local")],
      [advertiser("user:1", "よろしく", "fetched")],
    );
    expect(merged).toEqual([advertiser("user:1", "よろしく（追記）", "local")]);
  });

  it("keeps a local message for a gift without a message", () => {
    const merged = mergeFetchedAdvertisers(
      [advertiser("user:1", "ありがとう")],
      [advertiser("user:1", "")],
    );
    expect(merged[0]?.message).toBe("ありがとう");
  });

  it("takes the fetched message when the local one no longer starts with it", () => {
    const merged = mergeFetchedAdvertisers(
      [advertiser("user:1", "", "local")],
      [advertiser("user:1", "新しい広告", "fetched")],
    );
    expect(merged).toEqual([advertiser("user:1", "新しい広告", "fetched")]);
  });

  it("follows the fetched order and drops advertisers no longer fetched", () => {
    const merged = mergeFetchedAdvertisers(
      [advertiser("user:1", "a"), advertiser("user:9", "z")],
      [advertiser("user:2", "b"), advertiser("user:1", "a")],
    );
    expect(merged.map((item) => item.identityKey)).toEqual(["user:2", "user:1"]);
  });
});
