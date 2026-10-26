import { useCallback } from "react";
import type { DragEndEvent } from "@dnd-kit/react";
import { isSortable } from "@dnd-kit/react/sortable";
import { useFieldArray, useFormContext } from "react-hook-form";
import type { PageFormValues } from "@/app/features/page/model/page-form-schema";
import type { TtsFormValues } from "@/app/features/tts/model/tts-form-schema";
import type { AvatarOverride, VoiceOption } from "@/_schemas";
import { getVoiceValue } from "@/app/features/editor";
import { useSelectedPage } from "@/app/features/page";
import { useProjectRoute } from "@/app/features/project/context/project-route-context";
import { useSettings } from "@/app/features/settings";
import {
  applyTtsTextChange,
  applyTtsVoiceChange,
  createTtsInput,
  getTtsMoveState,
  resolveTtsIndexAfterInsert,
  resolveTtsIndexAfterRemove,
  useTts,
  useTtsTextFocus,
} from "@/app/features/tts";

function cloneTtsItem(item: TtsFormValues): TtsFormValues {
  return {
    ...item,
    speech: { ...item.speech },
  };
}

export function useTtsList() {
  const form = useFormContext<PageFormValues>();
  const { pageId } = useSelectedPage();
  const { projectPath } = useProjectRoute();
  const { selectedTtsId, selectTts, clearSelection } = useTts();
  const { options } = useSettings();
  const { requestTextFocus } = useTtsTextFocus();
  const { fields, move, insert, remove, append } = useFieldArray({
    control: form.control,
    keyName: "fieldKey",
    name: "tts",
  });
  const selectedTtsIndex = fields.findIndex((field) => field.id === selectedTtsId);

  const removeTts = useCallback(
    (index: number) => {
      const ttsBefore = form.getValues("tts") ?? [];
      if (index < 0 || index >= ttsBefore.length) {
        return;
      }

      const nextTtsIndex = resolveTtsIndexAfterRemove(ttsBefore.length, index);
      const ttsAfter = ttsBefore.filter((_, itemIndex) => itemIndex !== index).map(cloneTtsItem);

      if (nextTtsIndex === null) {
        clearSelection();
      } else {
        const nextTts = ttsAfter[nextTtsIndex];
        if (nextTts) {
          selectTts(nextTts.id);
          requestTextFocus(nextTts.id);
        }
      }

      remove(index);
    },
    [clearSelection, form, remove, requestTextFocus, selectTts],
  );

  const insertTtsAfter = useCallback(
    (index: number) => {
      const ttsBefore = form.getValues("tts") ?? [];
      if (index < 0 || index >= ttsBefore.length) {
        return;
      }

      const nextTtsIndex = resolveTtsIndexAfterInsert(index);
      const nextTts = createTtsInput(options, ttsBefore[index]);
      insert(nextTtsIndex, nextTts);
      selectTts(nextTts.id);
      requestTextFocus(nextTts.id);
    },
    [form, insert, options, requestTextFocus, selectTts],
  );

  const appendTts = useCallback(
    ({
      text,
      voice,
      avatar,
    }: {
      text: string;
      voice: VoiceOption;
      avatar: AvatarOverride | undefined;
    }) => {
      const draft = createTtsInput(options, undefined);
      const nextTts = {
        ...applyTtsTextChange(applyTtsVoiceChange(draft, voice), text),
        ...(avatar ? { avatar } : {}),
      };
      append(nextTts);
      selectTts(nextTts.id);
      requestAnimationFrame(() => {
        document.querySelector(`[data-tts-id="${nextTts.id}"]`)?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      });
    },
    [append, options, selectTts],
  );

  const ttsValues = form.getValues("tts") ?? [];
  const initialVoiceSource =
    (selectedTtsIndex >= 0 ? ttsValues[selectedTtsIndex] : undefined) ?? ttsValues.at(-1);
  const sourceVoiceId = initialVoiceSource ? getVoiceValue(initialVoiceSource) : "";
  const initialVoiceId = options.some((option) => getVoiceValue(option) === sourceVoiceId)
    ? sourceVoiceId
    : options[0]
      ? getVoiceValue(options[0])
      : "";

  const moveTts = useCallback(
    (fromIndex: number, toIndex: number) => {
      const ttsMove = getTtsMoveState(
        fields.map((field) => field.id),
        selectedTtsIndex >= 0 ? selectedTtsIndex : null,
        fromIndex,
        toIndex,
      );
      if (!ttsMove) {
        return;
      }

      move(ttsMove.fromIndex, ttsMove.toIndex);
    },
    [fields, move, selectedTtsIndex],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (event.canceled) {
        return;
      }
      const { source } = event.operation;
      if (!isSortable(source)) {
        return;
      }
      moveTts(source.initialIndex, source.index);
    },
    [moveTts],
  );

  const selectTtsOnFocus = useCallback(
    (index: number) => {
      const field = fields[index];
      if (field) {
        selectTts(field.id);
      }
    },
    [fields, selectTts],
  );

  return {
    selectedTtsIndex: selectedTtsIndex >= 0 ? selectedTtsIndex : null,
    fields,
    initialVoiceId,
    pageId: `${projectPath ?? ""}:${pageId}`,
    removeTts,
    insertTtsAfter,
    appendTts,
    handleDragEnd,
    selectTtsOnFocus,
    selectTts: (index: number) => {
      const field = fields[index];
      if (field) {
        selectTts(field.id);
      }
    },
  };
}
