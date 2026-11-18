import { AvatarOverrideFields } from "@/app/components/app-editor/avatar-override-fields/avatar-override-fields";
import { useAvatarSettingsField } from "./use-avatar-settings-field";

export function AvatarSettingsField() {
  const field = useAvatarSettingsField();

  if (!field) {
    return null;
  }

  return (
    <div className="grid gap-2">
      <AvatarOverrideFields {...field.avatar} />
      <select
        aria-label="Voice emotion"
        className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        value={field.voiceEmotion}
        onChange={(event) => field.onVoiceEmotionChange(event.target.value)}
      >
        {field.voiceEmotionOptions.map((emotion) => (
          <option key={emotion} value={emotion}>
            {emotion}
          </option>
        ))}
      </select>
    </div>
  );
}
