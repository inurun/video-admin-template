import type { G2pReviewItem } from "@/_schemas";
import type { G2pReviewView, G2pReviewViewItem } from "@/server/features/g2p-review/contract";
import { api } from "@/app/lib/api-client";
import { parseApiJson } from "@/app/lib/fetch-json";

export const g2pReviewKeys = { set: (name: string) => ["g2p-review", name] as const };

export async function fetchG2pReview(name: string) {
  return parseApiJson<G2pReviewView>(await api["g2p-review"][":name"].$get({ param: { name } }));
}

export async function updateG2pReviewItem(
  name: string,
  id: string,
  json: { kana: string; reviewed: boolean },
) {
  return parseApiJson<G2pReviewViewItem>(
    await fetch(`/api/g2p-review/${name}/items/${encodeURIComponent(id)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(json),
    }),
  );
}

export async function setG2pReviewAlternative(
  name: string,
  id: string,
  json: { kana: string; accepted: boolean },
) {
  return parseApiJson<G2pReviewViewItem>(
    await fetch(`/api/g2p-review/${name}/items/${encodeURIComponent(id)}/alternatives`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(json),
    }),
  );
}

export async function requestG2pReviewAudio(name: string, item: G2pReviewItem, kana: string) {
  const data = await parseApiJson<{ audioSrc: string }>(
    await api.tts.synthesize.$post({
      json: {
        ...item.voice,
        projectPath: `g2p-eval/${name}`,
        text: item.text,
        g2p: { text: item.text, kana, warnings: [] },
      },
    }),
  );
  return data.audioSrc;
}
