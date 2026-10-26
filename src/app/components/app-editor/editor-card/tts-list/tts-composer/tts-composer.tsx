import CodeMirror from "@uiw/react-codemirror";
import { Controller } from "react-hook-form";
import { Send } from "lucide-react";
import type { AvatarOverride, VoiceOption } from "@/_schemas";
import { Button } from "@/app/components/ui/button";
import { FieldError } from "@/app/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { getVoiceValue } from "@/app/features/editor";
import { useTtsComposer } from "@/app/components/app-editor/editor-card/tts-list/tts-composer/use-tts-composer";

export function TtsComposer({
  initialVoiceId,
  pageId,
  onAppend,
}: {
  initialVoiceId: string;
  pageId: string;
  onAppend: (input: {
    text: string;
    voice: VoiceOption;
    avatar: AvatarOverride | undefined;
  }) => void;
}) {
  const composer = useTtsComposer({ initialVoiceId, pageId, onAppend });

  return (
    <div
      data-tts-composer=""
      className="sticky bottom-0 z-10 rounded-xl border bg-accent-foreground/10 shadow-lg backdrop-blur-xs"
    >
      <div className="flex items-center gap-2 p-2">
        <Controller
          name="voiceId"
          control={composer.control}
          render={({ field }) => (
            <Select value={field.value || null} onValueChange={field.onChange}>
              <SelectTrigger size="sm" className="max-w-52">
                <SelectValue placeholder="Actor">{composer.voice?.displayName ?? null}</SelectValue>
              </SelectTrigger>
              <SelectContent align="start">
                {composer.options.map((option) => (
                  <SelectItem key={getVoiceValue(option)} value={getVoiceValue(option)}>
                    {option.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <Controller
          name="text"
          control={composer.control}
          render={({ field }) => (
            <CodeMirror
              ref={composer.editorRef}
              value={field.value}
              minHeight="36px"
              maxHeight="120px"
              theme={composer.theme}
              extensions={composer.extensions}
              basicSetup={{
                lineNumbers: false,
                foldGutter: false,
                highlightActiveLine: false,
                highlightActiveLineGutter: false,
              }}
              placeholder="Message"
              onChange={field.onChange}
              className="overflow-hidden flex-1 rounded-xl"
            />
          )}
        />
        <Button type="button" size="icon" disabled={!composer.voice} onClick={composer.submit}>
          <Send />
        </Button>
      </div>
      <FieldError errors={[composer.textError]} className="line-clamp-2 text-right text-xs" />
    </div>
  );
}
