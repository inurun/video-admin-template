export const avatarOptions = {
  demo: {
    base: ["normal"],
    eyes: ["opened", "shaded-opened"],
    mouth: ["opened", "closed"],
  },
} as const;

export type AvatarType = keyof typeof avatarOptions;

export type AvatarAppearance = {
  base: string;
  eyes: string;
  mouth: string;
};

type AvatarMouthFamily<T extends AvatarType> =
  (typeof avatarOptions)[T]["mouth"][number] extends infer M
    ? M extends `${infer F}-opened`
      ? F
      : never
    : never;

/** What auto expression may pick, with what each option means. Options left out are never picked. */
export type AvatarExpressionCatalog = {
  [T in AvatarType]: {
    base: Partial<Record<(typeof avatarOptions)[T]["base"][number], string>>;
    eyes: Partial<Record<(typeof avatarOptions)[T]["eyes"][number], string>>;
    /** Keyed by family: `angry` stands for `angry-opened` / `angry-closed`. */
    mouth: Partial<Record<AvatarMouthFamily<T>, string>>;
  };
};

export const avatarExpressions: AvatarExpressionCatalog = {
  demo: {
    base: {},
    eyes: { "shaded-opened": "落ち込み・げんなり・ドン引き" },
    mouth: {},
  },
};

export const AVATAR_TYPES = Object.keys(avatarOptions) as [AvatarType, ...AvatarType[]];

export const DEFAULT_AVATAR_TYPE: AvatarType = "demo";

export const voiceNameAvatarMap: Record<string, AvatarType> = {};

function pickOption<T extends string>(
  options: readonly T[],
  value: string | undefined,
  fallback: T,
) {
  return options.find((option) => option === value) ?? fallback;
}

export function getAvatarTypeByVoiceName(voiceName: string | undefined): AvatarType {
  return voiceName ? (voiceNameAvatarMap[voiceName] ?? DEFAULT_AVATAR_TYPE) : DEFAULT_AVATAR_TYPE;
}

export function getAvatarTypeForVoice(voice: {
  provider?: string;
  voiceName?: string;
}): AvatarType {
  if (voice.provider === "coeiroink") {
    return DEFAULT_AVATAR_TYPE;
  }
  return getAvatarTypeByVoiceName(voice.voiceName);
}

export function getOpenedMouthOptions(type: AvatarType) {
  return avatarOptions[type].mouth.filter((mouth) => mouth.endsWith("opened"));
}

function getDefaultAvatarSettings(type: AvatarType): AvatarAppearance {
  const options = avatarOptions[type];
  return {
    base: options.base[0],
    eyes: options.eyes[0],
    mouth: getOpenedMouthOptions(type)[0] ?? options.mouth[0],
  };
}

/** Resolves each field from the first layer holding a valid value, then the catalog default. */
export function resolveAvatarSettings(
  type: AvatarType,
  ...layers: Array<Partial<AvatarAppearance> | undefined>
): AvatarAppearance {
  const options = avatarOptions[type];
  const openedMouthOptions = getOpenedMouthOptions(type);
  const defaults = getDefaultAvatarSettings(type);
  const pick = <T extends string>(
    fieldOptions: readonly T[],
    field: keyof AvatarAppearance,
    fallback: T,
  ) =>
    layers.reduceRight<T>(
      (current, layer) => pickOption(fieldOptions, layer?.[field], current),
      fallback,
    );

  return {
    base: pick(options.base, "base", defaults.base),
    eyes: pick(options.eyes, "eyes", defaults.eyes),
    mouth: pick(openedMouthOptions, "mouth", defaults.mouth),
  };
}
