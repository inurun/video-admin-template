import { g2pItemSchema, type G2pItem } from "@/_schemas";
import type { ServerEnv } from "@/server/core/env";
import { getHaqumeiApiClient, unwrapHaqumeiData } from "./client";
import { assertHaqumeiValidateBatch, HAQUMEI_SCHEMA_VERSION } from "./limits";

export async function validateG2pItems(
  serverEnv: ServerEnv,
  items: Array<Pick<G2pItem, "text" | "kana">>,
): Promise<G2pItem[]> {
  if (items.length === 0) {
    return [];
  }

  assertHaqumeiValidateBatch(items.map((item) => item.text));

  const response = await getHaqumeiApiClient(serverEnv).POST("/v1/g2p/validate", {
    body: {
      schema_version: HAQUMEI_SCHEMA_VERSION,
      items: items.map((item) => ({ text: item.text, kana: item.kana })),
    },
  });
  const data = unwrapHaqumeiData(response);
  if (data.schema_version !== HAQUMEI_SCHEMA_VERSION) {
    throw new Error(`haqumei-api validate returned schema_version ${data.schema_version}`);
  }
  if (data.items.length !== items.length) {
    throw new Error(
      `haqumei-api validate returned ${data.items.length} items for ${items.length} texts`,
    );
  }

  return data.items.map((item) => g2pItemSchema.parse(item));
}

export async function validateG2pItem(
  serverEnv: ServerEnv,
  item: Pick<G2pItem, "text" | "kana">,
): Promise<G2pItem> {
  const [validated] = await validateG2pItems(serverEnv, [item]);
  if (!validated) {
    throw new Error("haqumei-api validate returned no items");
  }
  return validated;
}
