export const DEFAULT_HOTKEYS = {
  save: "ctrl+s",
  analyze: "ctrl+shift+s",
  addTts: "ctrl+enter",
  deleteTts: "ctrl+shift+delete",
  addPage: "ctrl+t",
  commentsQaDone: "ctrl+shift+enter",
} as const;

export type AppHotkeyAction = keyof typeof DEFAULT_HOTKEYS;

export type AppHotkeys = Record<AppHotkeyAction, string>;

export const APP_HOTKEY_LABELS: Record<AppHotkeyAction, string> = {
  save: "Save",
  analyze: "Regenerate G2P",
  addTts: "Add TTS",
  deleteTts: "Delete TTS",
  addPage: "Add Page",
  commentsQaDone: "Q&A Done",
};

type ParsedHotkey = {
  alt: boolean;
  key: string;
  meta: boolean;
  shift: boolean;
  ctrl: boolean;
};

export function normalizeHotkey(value: string) {
  return value.trim().toLowerCase();
}

export function findDuplicateHotkeys(hotkeys: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of hotkeys) {
    const hotkey = normalizeHotkey(value);
    if (!hotkey) {
      continue;
    }

    if (seen.has(hotkey)) {
      duplicates.add(hotkey);
    }
    seen.add(hotkey);
  }

  return duplicates;
}

function parseHotkey(hotkeyValue: string): ParsedHotkey | null {
  const hotkey = normalizeHotkey(hotkeyValue);
  if (!hotkey) {
    return null;
  }

  const parts = hotkey.split("+");
  const key = parts.find((part) => !["ctrl", "shift", "alt", "meta"].includes(part));
  if (!key) {
    return null;
  }

  return {
    alt: parts.includes("alt"),
    ctrl: parts.includes("ctrl"),
    key,
    meta: parts.includes("meta"),
    shift: parts.includes("shift"),
  };
}

function keysMatch(eventKey: string, hotkeyKey: string) {
  if (eventKey === hotkeyKey) {
    return true;
  }

  return (
    (eventKey === "delete" || eventKey === "backspace") &&
    (hotkeyKey === "delete" || hotkeyKey === "backspace")
  );
}

function primaryModifierMatches(event: KeyboardEvent, hotkey: ParsedHotkey) {
  if (hotkey.ctrl && hotkey.meta) {
    return event.ctrlKey && event.metaKey;
  }

  if (hotkey.ctrl) {
    return event.ctrlKey || event.metaKey;
  }

  if (hotkey.meta) {
    return event.metaKey && !event.ctrlKey;
  }

  return !event.ctrlKey && !event.metaKey;
}

function keyboardEventMatchesParsedHotkey(event: KeyboardEvent, hotkey: ParsedHotkey) {
  return (
    primaryModifierMatches(event, hotkey) &&
    event.shiftKey === hotkey.shift &&
    event.altKey === hotkey.alt &&
    keysMatch(event.key.toLowerCase(), hotkey.key)
  );
}

export function eventMatchesHotkey(event: KeyboardEvent, hotkeyValue: string) {
  const hotkey = parseHotkey(hotkeyValue);
  return hotkey !== null && keyboardEventMatchesParsedHotkey(event, hotkey);
}
