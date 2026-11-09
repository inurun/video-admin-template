import { Settings } from "lucide-react";
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
import { Separator } from "@/app/components/ui/separator";
import { AppearanceSection } from "@/app/components/app-sidebar/settings-dialog/appearance-section/appearance-section";
import { PublishSection } from "@/app/components/app-sidebar/settings-dialog/publish-section/publish-section";
import { HotkeysSection } from "@/app/components/app-sidebar/settings-dialog/hotkeys-section/hotkeys-section";
import { useSettingsDialog } from "@/app/components/app-sidebar/settings-dialog/use-settings-dialog";
import { VoicesSection } from "@/app/components/app-sidebar/settings-dialog/voices-section/voices-section";

export function SettingsDialog() {
  const dialog = useSettingsDialog();

  return (
    <Dialog open={dialog.open} onOpenChange={dialog.handleOpenChange}>
      <DialogTrigger
        render={
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            title="Settings"
            aria-label="Settings"
          />
        }
      >
        <Settings />
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[min(92vw,760px)]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <DialogMain className="grid gap-5">
          <AppearanceSection />
          <Separator />
          <VoicesSection form={dialog.form} settingsOpen={dialog.open} />
          <Separator />
          <HotkeysSection form={dialog.form} />
          <Separator />
          <PublishSection form={dialog.form} />
        </DialogMain>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
          <Button type="button" disabled={!dialog.canSave} onClick={dialog.save}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
