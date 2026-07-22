export const SPORT_COLORS = {
  bg: "#242424",
  subSidebar: "#202020",
  card: "#2A2A2A",
  cardStrong: "#2E2E2E",
  cardHover: "#303030",
  input: "#222222",
  border: "#383838",
  borderStrong: "#484848",
  text: "#F0F0F0",
  textSecond: "#A0A0A0",
  textMuted: "#646464",
  textDisabled: "#444444",
  blue: "#4772FA",
  blueBg: "rgba(71,114,250,0.11)",
  green: "#70B89F",
  greenBg: "rgba(112,184,159,0.11)",
  warning: "#D4AA68",
  warningBg: "rgba(212,170,104,0.10)",
  danger: "#C7776A",
  dangerBg: "rgba(199,119,106,0.10)",
  purple: "#A78BC4",
} as const;

export const DISCIPLINE_META = {
  strength: { label: "Siłownia", color: SPORT_COLORS.blue },
  running: { label: "Bieganie", color: SPORT_COLORS.green },
  rehab: { label: "Rehabilitacja", color: SPORT_COLORS.warning },
  mobility: { label: "Stretching / yoga", color: SPORT_COLORS.purple },
  cycling: { label: "Rower", color: "#7E9FC4" },
  custom: { label: "Inna aktywność", color: SPORT_COLORS.textSecond },
} as const;

export const STATUS_META = {
  scheduled: { label: "Zaplanowany", color: SPORT_COLORS.blue, bg: SPORT_COLORS.blueBg },
  in_progress: { label: "Trwający", color: SPORT_COLORS.warning, bg: SPORT_COLORS.warningBg },
  completed: { label: "Wykonany", color: SPORT_COLORS.green, bg: SPORT_COLORS.greenBg },
  incomplete: { label: "Niedokończony", color: SPORT_COLORS.warning, bg: SPORT_COLORS.warningBg },
  missed: { label: "Pominięty", color: SPORT_COLORS.danger, bg: SPORT_COLORS.dangerBg },
} as const;
