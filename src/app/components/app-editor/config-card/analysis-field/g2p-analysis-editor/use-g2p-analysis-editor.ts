import { useEffect, useMemo, useRef, useState } from "react";
import { g2pItemSchema, type G2pItem } from "@/_schemas";
import { getErrorMessage } from "@/_shared/lib/error-message";
import { requestValidateG2p } from "@/app/features/tts/api/tts-api";
import {
  canToggleChain,
  parseKanaView,
  phraseBoundaryLabel,
  setPhraseAccent,
  togglePhraseChain,
} from "./g2p-kana-view";
import { getUnknownSourceSpans, getWarningsWithoutSourceSpan } from "./unknown-spans";

type ParsedG2pState =
  | { status: "empty" }
  | { status: "error"; message: string }
  | { status: "ready"; item: G2pItem };

function parseG2pState(value: G2pItem | undefined): ParsedG2pState {
  if (!value) {
    return { status: "empty" };
  }

  const parsed = g2pItemSchema.safeParse(value);
  if (!parsed.success) {
    return { status: "error", message: "Invalid analysis" };
  }

  return { status: "ready", item: parsed.data };
}

export function shouldApplyValidatedG2p(
  started: { text: string; kana: string },
  latest: G2pItem | undefined,
  requestId: number,
  latestRequestId: number,
) {
  if (requestId !== latestRequestId) {
    return false;
  }

  const parsed = parseG2pState(latest);
  return (
    parsed.status === "ready" &&
    parsed.item.text === started.text &&
    parsed.item.kana === started.kana
  );
}

export function useG2pAnalysisEditor(
  value: G2pItem | undefined,
  onChange: (value: G2pItem) => void,
) {
  const parsed = useMemo(() => parseG2pState(value), [value]);
  const committedKana = parsed.status === "ready" ? parsed.item.kana : "";
  const committedText = parsed.status === "ready" ? parsed.item.text : "";
  const [draft, setDraft] = useState(committedKana);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const valueRef = useRef(value);
  const requestIdRef = useRef(0);
  valueRef.current = value;

  useEffect(() => {
    setDraft(committedKana);
    setError(undefined);
  }, [committedKana, committedText]);

  const unknownSpans = parsed.status === "ready" ? getUnknownSourceSpans(parsed.item) : [];
  const warningsWithoutSpan =
    parsed.status === "ready" ? getWarningsWithoutSourceSpan(parsed.item) : [];
  const phrases = useMemo(() => parseKanaView(draft), [draft]);

  async function commitKana(nextKana: string) {
    if (parsed.status !== "ready" || pending) {
      return;
    }
    if (nextKana === parsed.item.kana) {
      setDraft(nextKana);
      return;
    }

    const started = { text: parsed.item.text, kana: parsed.item.kana };
    const requestId = ++requestIdRef.current;
    setDraft(nextKana);
    setPending(true);
    try {
      const g2p = await requestValidateG2p({ text: started.text, kana: nextKana });
      if (!shouldApplyValidatedG2p(started, valueRef.current, requestId, requestIdRef.current)) {
        return;
      }
      onChange(g2p);
      setDraft(g2p.kana);
      setError(undefined);
    } catch (cause) {
      if (!shouldApplyValidatedG2p(started, valueRef.current, requestId, requestIdRef.current)) {
        return;
      }
      setError(getErrorMessage(cause, "Validate failed"));
    } finally {
      if (requestId === requestIdRef.current) {
        setPending(false);
      }
    }
  }

  function getPhraseViews() {
    if (!phrases) {
      return [];
    }

    return phrases.map((phrase, phraseIndex) => ({
      key: `phrase-${phraseIndex}`,
      accent: phrase.accent,
      moras: phrase.words.flatMap((word) => word.moras),
      boundary: phraseBoundaryLabel(phrase.closer),
      words: phrase.words.map((word, wordIndex) => ({
        key: `word-${phraseIndex}-${wordIndex}`,
        label: word.surface ? `${word.surface} ${word.moras.join("")}` : word.moras.join(""),
        chained: wordIndex > 0,
        onToggleChain: canToggleChain(phrases, phraseIndex, wordIndex)
          ? () => {
              const next = togglePhraseChain(phrases, phraseIndex, wordIndex);
              if (next) void commitKana(next);
            }
          : undefined,
      })),
      onAccentChange: (accent: number) => {
        const next = setPhraseAccent(phrases, phraseIndex, accent);
        if (next) void commitKana(next);
      },
    }));
  }

  return {
    parsed,
    draft,
    error,
    pending,
    unknownSpans,
    warningsWithoutSpan,
    phrases,
    getPhraseViews,
    setDraft,
    commit: () => commitKana(draft),
  };
}
