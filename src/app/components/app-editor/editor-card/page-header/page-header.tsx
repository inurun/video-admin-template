import { PocketKnife } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { PageSettingsDialog } from "@/app/components/app-editor/editor-card/page-header/page-settings-dialog/page-settings-dialog";
import { ZenDialog } from "@/app/components/app-editor/editor-card/page-header/zen-dialog/zen-dialog";
import { CommentsQaDialog } from "@/app/components/app-editor/editor-card/page-header/comments-qa-dialog/comments-qa-dialog";
import { AutoExpressionButton } from "@/app/components/app-editor/editor-card/page-header/auto-expression-button/auto-expression-button";
import { usePageHeader } from "@/app/components/app-editor/editor-card/page-header/use-page-header";

export function PageHeader() {
  const header = usePageHeader();

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0 text-sm text-muted-foreground">
        <p className="text-[0.5rem] text-muted-foreground font-mono">ID: {header.selectedPageId}</p>
      </div>
      {header.isTransition ? null : (
        <div className="flex items-center gap-1">
          {header.supportsAutoExpression ? <AutoExpressionButton /> : null}
          {header.supportsZen ? <ZenDialog key={header.selectedPageId} /> : null}
          {header.supportsCommentsTools ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={!header.canSort}
                onClick={header.sortByTime}
              >
                Sort by time
              </Button>
              <CommentsQaDialog disabled={!header.canOpenQa} />
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                onClick={() => header.openCommentsZen()}
              >
                <PocketKnife className="size-4 rotate-90 -scale-x-100" />
              </Button>
            </>
          ) : null}
          <PageSettingsDialog />
        </div>
      )}
    </div>
  );
}
