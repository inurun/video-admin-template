import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/app/components/ui/tabs";
import type { G2pReviewFilter } from "@/app/features/g2p-review/lib/review-queue";
import { useAppG2pReviewHotkeys } from "./app-g2p-review.hotkeys";
import { G2pReviewDetail } from "./g2p-review-detail/g2p-review-detail";
import { useAppG2pReview } from "./use-app-g2p-review";

const FILTERS: Array<{ value: G2pReviewFilter; label: string }> = [
  { value: "unreviewed", label: "Unreviewed" },
  { value: "mismatched", label: "Mismatched" },
  { value: "all", label: "All" },
];

export function AppG2pReview() {
  const state = useAppG2pReview();
  useAppG2pReviewHotkeys(state);

  return (
    <div className="grid min-h-0 flex-1 gap-2 overflow-hidden lg:grid-cols-[24rem_minmax(0,1fr)]">
      <Card className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        <CardHeader>
          <CardTitle>G2P review</CardTitle>
          <CardAction className="text-sm text-muted-foreground">{state.progress}</CardAction>
        </CardHeader>
        <CardContent className="grid min-h-0 flex-1 grid-rows-[auto_auto_minmax(0,1fr)] gap-2">
          <Tabs value={state.setName} onValueChange={state.setSetName}>
            <TabsList>
              {state.sets.map((name) => (
                <TabsTrigger key={name} value={name}>
                  {name}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Tabs
            value={state.filter}
            onValueChange={(value) => state.setFilter(value as G2pReviewFilter)}
          >
            <TabsList>
              {FILTERS.map(({ value, label }) => (
                <TabsTrigger key={value} value={value}>
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="grid content-start gap-1 overflow-y-auto">
            {state.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {state.items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`rounded-lg px-3 py-2 text-left text-sm hover:bg-muted ${state.selected?.id === item.id ? "bg-muted" : ""}`}
                onClick={() => state.selectItem(item.id)}
              >
                <span className="line-clamp-2">{item.text}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        <CardContent className="grid min-h-0 flex-1">
          {state.selected ? (
            <G2pReviewDetail
              item={state.selected}
              kana={state.kana}
              pending={state.pending}
              onKanaChange={state.setKana}
              onPlay={(kana) => void state.play(kana)}
              onToggleAlternative={(candidate) => void state.toggleAlternative(candidate)}
              onConfirm={() => void state.confirm()}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Nothing to review.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
