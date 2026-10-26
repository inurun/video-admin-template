import { Plus, Settings, Trash2 } from "lucide-react";
import { Controller } from "react-hook-form";
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
import { CommentImport } from "./comment-import/comment-import";
import { MainAvatarDefaultsField } from "./main-avatar-defaults-field/main-avatar-defaults-field";
import { usePageSettingsDialog } from "@/app/components/app-editor/editor-card/page-header/page-settings-dialog/use-page-settings-dialog";
import { cn } from "@/_shared/lib/utils";

export function PageSettingsDialog() {
  const dialog = usePageSettingsDialog();
  const isComments = Boolean(dialog.commentsPage);

  return (
    <Dialog open={dialog.open} onOpenChange={dialog.handleOpenChange}>
      <DialogTrigger
        render={
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            title="Page settings"
            aria-label="Page settings"
          />
        }
      >
        <Settings />
      </DialogTrigger>
      <DialogContent
        className={cn(
          "max-h-[90vh]",
          isComments
            ? "w-[min(96vw,960px)]"
            : dialog.isMain
              ? "w-[min(92vw,560px)]"
              : "w-[min(92vw,420px)]",
        )}
      >
        <form
          className="flex min-h-0 flex-1 flex-col gap-4"
          onSubmit={(event) => void dialog.submit(event)}
        >
          <DialogHeader>
            <DialogTitle>Page Settings</DialogTitle>
          </DialogHeader>
          <DialogMain
            className={cn(
              "grid min-h-0 flex-1 gap-4",
              dialog.isMain ? "overflow-y-auto" : "overflow-hidden",
            )}
          >
            <Field data-invalid={Boolean(dialog.form.formState.errors.title)}>
              <label className="grid gap-2 text-sm font-medium">
                Title
                <Input autoFocus={!isComments} {...dialog.form.register("title")} />
              </label>
              <FieldError errors={[dialog.form.formState.errors.title]} />
            </Field>
            {isComments ? (
              <Field>
                <label className="grid gap-2 text-sm font-medium">
                  Presentation
                  <Controller
                    control={dialog.form.control}
                    name="presentation"
                    render={({ field }) => (
                      <select
                        className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none"
                        value={field.value}
                        onChange={(event) =>
                          field.onChange(event.target.value as typeof field.value)
                        }
                      >
                        <option value="single">Single</option>
                        <option value="triple">Triple</option>
                      </select>
                    )}
                  />
                </label>
              </Field>
            ) : null}
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Tags</span>
                <Button type="button" size="sm" variant="outline" onClick={dialog.addTag}>
                  <Plus />
                  Add tag
                </Button>
              </div>
              {dialog.tagFields.map((field, index) => {
                const error = dialog.form.formState.errors.tags?.[index]?.value;
                return (
                  <Field key={field.id} data-invalid={Boolean(error)}>
                    <div className="flex gap-2">
                      <Input
                        aria-invalid={Boolean(error)}
                        placeholder="Tag"
                        {...dialog.form.register(`tags.${index}.value`)}
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        title="Remove tag"
                        onClick={() => dialog.removeTag(index)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                    <FieldError errors={[error]} />
                  </Field>
                );
              })}
            </div>
            {dialog.isMain ? (
              <Controller
                control={dialog.form.control}
                name="avatars"
                render={({ field }) => (
                  <MainAvatarDefaultsField
                    avatarTypes={dialog.avatarTypes}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            ) : null}
            {isComments ? <CommentImport importer={dialog.importer} /> : null}
            {dialog.applyError ? <FieldError errors={[{ message: dialog.applyError }]} /> : null}
          </DialogMain>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            {isComments ? (
              <Button
                type="button"
                variant="secondary"
                disabled={
                  dialog.importer.selectedInsertIds.length === 0 || !dialog.importer.fetchValid
                }
                onClick={dialog.insertSelected}
              >
                Insert {dialog.importer.selectedInsertIds.length} comments
              </Button>
            ) : null}
            <Button type="submit">Save settings</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
