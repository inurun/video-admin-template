import { type SavedSequenceItem, type SavedTts } from "@/_schemas";
import { listSavedPageTtsInPlaybackOrder } from "@/server/features/project/comments-playback";
import type { G2pDictionaryHint } from "@/server/features/tts/g2p-dictionary";
import { getEffectiveReadText } from "@/server/features/tts/providers/comparison";

export type G2pUtterance = {
  id: string;
  text: string;
  target: boolean;
  /** 読み上げるエンジン。target だけが持ち、句の切り方をエンジンに合わせる。 */
  provider?: SavedTts["provider"];
  dictionary?: G2pDictionaryHint[];
};

export type G2pPageContext = {
  id: string;
  title: string;
  utterances: G2pUtterance[];
};

export type G2pTarget = {
  pageId: string;
  ttsId: string;
};

function toUtterance(item: SavedTts, target: boolean): G2pUtterance {
  const text = getEffectiveReadText(item);
  return target
    ? { id: item.id, text, target, provider: item.provider }
    : { id: item.id, text, target };
}

export function contextForChunk(
  pages: readonly G2pPageContext[],
  targetIds: ReadonlySet<string>,
): G2pPageContext[] {
  return pages.flatMap((page) => {
    if (!page.utterances.some((utterance) => targetIds.has(utterance.id))) {
      return [];
    }

    return [
      {
        id: page.id,
        title: page.title,
        utterances: page.utterances.map((utterance) =>
          targetIds.has(utterance.id)
            ? { ...utterance, target: true }
            : { id: utterance.id, text: utterance.text, target: false },
        ),
      },
    ];
  });
}

export function buildG2pContext(
  pages: readonly SavedSequenceItem[],
  targets: readonly G2pTarget[],
): G2pPageContext[] {
  const targetPageByTtsId = new Map(targets.map((target) => [target.ttsId, target.pageId]));
  const pagesWithTargets = new Set(targets.map((target) => target.pageId));

  return pages.flatMap((page) => {
    if (page.type === "transition" || !pagesWithTargets.has(page.id)) {
      return [];
    }
    const isTarget = (item: SavedTts) => targetPageByTtsId.get(item.id) === page.id;

    if (page.type === "comments") {
      return page.commentGroups.flatMap((group) => {
        const utterances = listSavedPageTtsInPlaybackOrder({
          ...page,
          commentGroups: [group],
          commentScenes: [{ id: group.id, groupIds: [group.id] }],
        }).map((item) => toUtterance(item, isTarget(item)));
        if (!utterances.some((utterance) => utterance.target)) {
          return [];
        }
        return [{ id: page.id, title: page.title, utterances }];
      });
    }

    return [
      {
        id: page.id,
        title: page.title,
        utterances: page.tts.map((item) => toUtterance(item, isTarget(item))),
      },
    ];
  });
}

/** 1文だけ作り直すときの文脈。前後の発話は保存前の編集内容でもよいので、リクエストから受け取る。 */
export function buildSingleG2pContext(input: {
  pageId: string;
  id: string;
  text: string;
  provider: SavedTts["provider"];
  previous?: string;
  next?: string;
}): G2pPageContext[] {
  const neighbor = (key: "previous" | "next", text: string | undefined): G2pUtterance[] =>
    text ? [{ id: `${input.id}:${key}`, text, target: false }] : [];
  return [
    {
      id: input.pageId,
      title: "",
      utterances: [
        ...neighbor("previous", input.previous),
        { id: input.id, text: input.text, target: true, provider: input.provider },
        ...neighbor("next", input.next),
      ],
    },
  ];
}
