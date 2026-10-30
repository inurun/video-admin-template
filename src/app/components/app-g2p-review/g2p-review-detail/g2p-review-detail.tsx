import { Check, Play, ThumbsUp } from "lucide-react";
import { G2pAnalysisEditor } from "@/app/components/app-editor/config-card/analysis-field/g2p-analysis-editor/g2p-analysis-editor";
import { Button } from "@/app/components/ui/button";
import { diffProsody } from "@/app/features/g2p-review/lib/prosody-diff";
import type { G2pReviewCandidate, G2pReviewViewItem } from "@/server/features/g2p-review/contract";

export function G2pReviewDetail({
  item,
  kana,
  pending,
  onKanaChange,
  onPlay,
  onToggleAlternative,
  onConfirm,
}: {
  item: G2pReviewViewItem;
  kana: string;
  pending: boolean;
  onKanaChange: (kana: string) => void;
  onPlay: (kana: string) => void;
  onToggleAlternative: (candidate: G2pReviewCandidate) => void;
  onConfirm: () => void;
}) {
  const base = item.candidates[0]?.prosody ?? "";

  return (
    <div className="grid content-start gap-4 overflow-y-auto">
      <div className="grid gap-1">
        {item.previous && <p className="text-sm text-muted-foreground">{item.previous}</p>}
        <p className="text-lg font-medium whitespace-pre-line">{item.text}</p>
        {item.next && <p className="text-sm text-muted-foreground">{item.next}</p>}
      </div>

      <div className="grid gap-1">
        {item.candidates.map((candidate, index) => (
          <div key={candidate.prosody} className="flex items-center gap-2">
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={() => onPlay(candidate.kana)}
            >
              <Play />
            </Button>
            <Button
              type="button"
              size="sm"
              variant={candidate.kana === kana ? "secondary" : "ghost"}
              className="h-auto min-w-0 justify-start font-mono whitespace-normal"
              onClick={() => onKanaChange(candidate.kana)}
            >
              <span className="text-muted-foreground">{index + 1}</span>
              <span>
                {diffProsody(candidate.prosody, base).map((phrase, phraseIndex) => (
                  <span key={phraseIndex} className={phrase.changed ? "text-primary" : undefined}>
                    {phrase.text}
                  </span>
                ))}
              </span>
              <span className="text-muted-foreground">×{candidate.count}</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant={candidate.status === "alternative" ? "default" : "outline"}
              disabled={pending || !item.kana || candidate.status === "truth"}
              onClick={() => onToggleAlternative(candidate)}
            >
              {candidate.status === "truth" ? <Check /> : <ThumbsUp />}
              {candidate.status === "truth" ? "Truth" : "Also OK"}
            </Button>
          </div>
        ))}
        {item.candidates.length === 0 && (
          <p className="text-sm text-muted-foreground">No candidates. Run pnpm g2p:eval.</p>
        )}
      </div>

      {kana && (
        <G2pAnalysisEditor
          key={item.id}
          value={{ text: item.text, kana, warnings: [] }}
          onChange={(value) => onKanaChange(value.kana)}
        />
      )}

      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => onPlay(kana)}>
          <Play /> Play
        </Button>
        <Button type="button" disabled={pending || !kana} onClick={onConfirm}>
          <Check /> Reviewed
        </Button>
      </div>
    </div>
  );
}
