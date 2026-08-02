import { uiColors } from "../ui";

export const SPORT_COLORS = {
  bg: uiColors.appBg,
  subSidebar: uiColors.sidebarBg,
  card: uiColors.surface1,
  cardStrong: uiColors.surface2,
  cardHover: uiColors.surfaceHover,
  input: uiColors.surface1,
  border: uiColors.border,
  borderStrong: uiColors.borderStrong,
  text: uiColors.textPrimary,
  textSecond: uiColors.textSecondary,
  textMuted: uiColors.textTertiary,
  textDisabled: uiColors.textDisabled,
  blue: uiColors.primaryText,
  blueBg: uiColors.primarySubtle,
  green: uiColors.success,
  greenBg: uiColors.successSubtle,
  warning: uiColors.warning,
  warningBg: uiColors.warningSubtle,
  danger: uiColors.danger,
  dangerBg: uiColors.dangerSubtle,
  purple: uiColors.violet,
} as const;

export const DISCIPLINE_META = {
  strength: { label: "Siłownia", color: SPORT_COLORS.blue },
  running: { label: "Bieganie", color: SPORT_COLORS.green },
  rehab: { label: "Rehabilitacja", color: SPORT_COLORS.warning },
  mobility: { label: "Stretching / yoga", color: SPORT_COLORS.purple },
  cycling: { label: "Rower", color: SPORT_COLORS.textSecond },
  custom: { label: "Inna aktywność", color: SPORT_COLORS.textSecond },
} as const;

export const STATUS_META = {
  scheduled: { label: "Zaplanowany", color: SPORT_COLORS.blue, bg: SPORT_COLORS.blueBg },
  in_progress: { label: "Trwający", color: SPORT_COLORS.warning, bg: SPORT_COLORS.warningBg },
  completed: { label: "Wykonany", color: SPORT_COLORS.green, bg: SPORT_COLORS.greenBg },
  incomplete: { label: "Niedokończony", color: SPORT_COLORS.warning, bg: SPORT_COLORS.warningBg },
  missed: { label: "Pominięty", color: SPORT_COLORS.danger, bg: SPORT_COLORS.dangerBg },
} as const;
