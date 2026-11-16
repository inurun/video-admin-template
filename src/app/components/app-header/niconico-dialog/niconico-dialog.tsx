import { RefreshCw, Tv } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogMain,
  DialogTitle,
  DialogTrigger,
} from "@/app/components/ui/dialog";
import { Field, FieldError } from "@/app/components/ui/field";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import { useNiconicoDialog } from "./use-niconico-dialog";

export function NiconicoDialog() {
  const dialog = useNiconicoDialog();

  return (
    <Dialog open={dialog.open} onOpenChange={dialog.handleOpenChange}>
      <DialogTrigger
        render={<Button type="button" size="icon-sm" variant="ghost" title="Niconico" />}
      >
        <Tv />
      </DialogTrigger>
      <DialogContent className="w-[min(92vw,520px)] max-h-[90vh]">
        <form
          className="flex min-h-0 flex-1 flex-col gap-4"
          onSubmit={(event) => void dialog.submit(event)}
        >
          <DialogHeader>
            <DialogTitle>Niconico</DialogTitle>
          </DialogHeader>
          <DialogMain className="grid gap-4">
            <Field data-invalid={Boolean(dialog.form.formState.errors.title)}>
              <label className="grid gap-2 text-sm font-medium">
                Title
                <Input {...dialog.form.register("title")} />
              </label>
              <FieldError errors={[dialog.form.formState.errors.title]} />
            </Field>
            <Field data-invalid={Boolean(dialog.form.formState.errors.description)}>
              <label className="grid gap-2 text-sm font-medium">
                Description
                <Textarea rows={4} {...dialog.form.register("description")} className="text-xs" />
              </label>
              <FieldError errors={[dialog.form.formState.errors.description]} />
            </Field>
            <Field data-invalid={Boolean(dialog.form.formState.errors.tags)}>
              <label className="grid gap-2 text-sm font-medium">
                Tags
                <Textarea rows={2} placeholder="tag1 tag2 tag3" {...dialog.form.register("tags")} />
              </label>
              <FieldError errors={[dialog.form.formState.errors.tags]} />
            </Field>
            <Field data-invalid={Boolean(dialog.form.formState.errors.thumbnailTime)}>
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">Thumbnail time</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={dialog.setThumbnailTimeFromPreview}
                  >
                    Set current time
                  </Button>
                </div>
                <Input placeholder="00:00.000" {...dialog.form.register("thumbnailTime")} />
              </div>
              <FieldError errors={[dialog.form.formState.errors.thumbnailTime]} />
            </Field>
            <Field data-invalid={Boolean(dialog.form.formState.errors.parentWorkIds)}>
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">Parent works</span>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="outline"
                    title="Refresh"
                    onClick={dialog.refreshParentWorks}
                  >
                    <RefreshCw />
                  </Button>
                </div>
                <Textarea
                  rows={3}
                  placeholder="sm9 ss123 im123"
                  {...dialog.form.register("parentWorkIds")}
                />
              </div>
              <FieldError errors={[dialog.form.formState.errors.parentWorkIds]} />
            </Field>
            <Field data-invalid={Boolean(dialog.form.formState.errors.fixedParentWorkIds)}>
              <label className="grid gap-2 text-sm font-medium">
                Fixed parent works
                <Textarea
                  rows={2}
                  placeholder="im123"
                  {...dialog.form.register("fixedParentWorkIds")}
                />
              </label>
              <FieldError errors={[dialog.form.formState.errors.fixedParentWorkIds]} />
            </Field>
          </DialogMain>
          <DialogFooter>
            <DialogClose
              render={<Button type="button" variant="outline" disabled={dialog.isPending} />}
            >
              Cancel
            </DialogClose>
            <Button type="submit" disabled={dialog.isPending}>
              {dialog.isPending ? "Saving" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
