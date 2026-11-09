import type { UseFormReturn } from "react-hook-form";
import { Switch } from "@/app/components/ui/switch";
import type { SettingsFormValues } from "@/app/components/app-sidebar/settings-dialog/use-settings-dialog";
import { usePublishSection } from "@/app/components/app-sidebar/settings-dialog/publish-section/use-publish-section";

export function PublishSection({ form }: { form: UseFormReturn<SettingsFormValues> }) {
  const publish = usePublishSection(form);

  return (
    <section className="grid gap-3">
      <h3 className="text-sm font-medium">Publish</h3>
      <label className="flex items-center justify-between gap-3 text-sm">
        <span>Submit post after preparing</span>
        <Switch checked={publish.autoSubmit} onCheckedChange={publish.setAutoSubmit} />
      </label>
    </section>
  );
}
