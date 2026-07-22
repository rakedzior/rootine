import { uiColors } from "../ui";

export const SPORT_COLORS = {
  bg: uiColors.graphiteCanvas,
  subSidebar: uiColors.graphiteSidebar,
  card: uiColors.graphitePanel,
  cardStrong: uiColors.graphiteCard,
  cardHover: uiColors.graphiteHover,
  input: uiColors.graphiteInput,
  border: uiColors.borderSubtle,
  borderStrong: uiColors.borderStrong,
  text: uiColors.chalkWhite,
  textSecond: uiColors.textSecondary,
  textMuted: uiColors.textMuted,
  textDisabled: uiColors.textDisabled,
  blue: uiColors.precisionBlueText,
  blueBg: uiColors.precisionBlueSoft,
  green: uiColors.success,
  greenBg: uiColors.successSoft,
  warning: uiColors.warning,
  warningBg: uiColors.warningSoft,
  danger: uiColors.danger,
  dangerBg: uiColors.dangerSoft,
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
