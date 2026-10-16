import type { G2pItem } from "@/_schemas";

export function createG2pItem(text: string, kana = "ア'"): G2pItem {
  return {
    text,
    kana,
    warnings: [],
  };
}
