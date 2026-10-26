import { LoaderCircle, SmilePlus } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { useAutoExpressionButton } from "@/app/components/app-editor/editor-card/page-header/auto-expression-button/use-auto-expression-button";

export function AutoExpressionButton() {
  const { pending, run } = useAutoExpressionButton();

  return (
    <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={run}>
      {pending ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : (
        <SmilePlus className="size-4" />
      )}
      Auto expression
    </Button>
  );
}
