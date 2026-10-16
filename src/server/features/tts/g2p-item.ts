import type { G2pItem, G2pWarning } from "@/_schemas";

export function toG2pItem(item: { text: string; kana: string; warnings?: G2pWarning[] }): G2pItem {
  return {
    text: item.text,
    kana: item.kana,
    warnings: item.warnings ?? [],
  };
}
