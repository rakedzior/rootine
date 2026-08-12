/**
 * Versioned, persisted taxonomy palette.
 *
 * These values are data, not component presentation: workspaces serialize them and
 * older payloads may still contain previous palette values. Keep every mapping here so
 * feature modules never duplicate hex literals or reinterpret status colours as taxonomy.
 */
export const TAXONOMY_COLORS = {
  sky: "#7FA6C9",
  teal: "#79A8A4",
  sand: "#B9A171",
  rose: "#BC8EA5",
  slate: "#8793A1",
  violet: "#7D7FA8",
} as const;

export type TaxonomyColorId = keyof typeof TAXONOMY_COLORS;

const CURRENT_VALUES = new Set<string>(Object.values(TAXONOMY_COLORS));

const LEGACY_COLORS: Record<string, string> = {
  "#4772FA": TAXONOMY_COLORS.sky,
  "#3E63DA": TAXONOMY_COLORS.sky,
  "#809AF4": TAXONOMY_COLORS.sky,
  "#70B89F": TAXONOMY_COLORS.teal,
  "#D4AA68": TAXONOMY_COLORS.sand,
  "#C77DBB": TAXONOMY_COLORS.slate,
  "#9B8CE8": TAXONOMY_COLORS.violet,
  "#CF777C": TAXONOMY_COLORS.rose,
  "#A0A0A0": TAXONOMY_COLORS.slate,
};

export function normalizeTaxonomyColor(
  value: string,
  fallback: TaxonomyColorId = "sky",
): string {
  const normalized = value.trim().toUpperCase();
  if (CURRENT_VALUES.has(normalized)) return normalized;
  return LEGACY_COLORS[normalized] ?? TAXONOMY_COLORS[fallback];
}

export const TAXONOMY_COLOR_OPTIONS = [
  { id: "sky", value: TAXONOMY_COLORS.sky, label: "Błękit" },
  { id: "teal", value: TAXONOMY_COLORS.teal, label: "Morskie szkło" },
  { id: "sand", value: TAXONOMY_COLORS.sand, label: "Piasek" },
  { id: "slate", value: TAXONOMY_COLORS.slate, label: "Neutralny" },
] as const;
