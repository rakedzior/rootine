/**
 * Runtime aliases for the CSS custom properties defined in styles/tokens.css.
 * Use these values when an existing inline style cannot yet be expressed as a class.
 */
export const uiColors = {
  appBg: "var(--color-app-bg)",
  sidebarBg: "var(--color-sidebar-bg)",
  surface1: "var(--color-surface-1)",
  surface2: "var(--color-surface-2)",
  surfaceHover: "var(--color-surface-hover)",
  border: "var(--color-border)",
  textPrimary: "var(--color-text-primary)",
  textTertiary: "var(--color-text-tertiary)",
  primary: "var(--color-primary)",
  primaryText: "var(--color-primary-text)",
  primaryHover: "var(--color-primary-hover)",
  primarySubtle: "var(--color-primary-subtle)",
  warningText: "var(--color-warning-text)",
  warningSubtle: "var(--color-warning-subtle)",
  successText: "var(--color-success-text)",
  successSubtle: "var(--color-success-subtle)",
  dangerText: "var(--color-danger-text)",
  dangerSubtle: "var(--color-danger-subtle)",
  progressTrack: "var(--color-progress-track)",
  disabledBg: "var(--color-disabled-bg)",
  precisionBlue: "var(--color-precision-blue)",
  precisionBlueText: "var(--color-precision-blue-text)",
  precisionBlueStrong: "var(--color-precision-blue-strong)",
  precisionBlueSoft: "var(--color-precision-blue-soft)",
  graphiteShell: "var(--color-graphite-shell)",
  graphiteSidebar: "var(--color-graphite-sidebar)",
  graphiteInput: "var(--color-graphite-input)",
  graphiteCanvas: "var(--color-graphite-canvas)",
  graphitePanel: "var(--color-graphite-panel)",
  graphiteCard: "var(--color-graphite-card)",
  graphiteHover: "var(--color-graphite-hover)",
  borderSubtle: "var(--color-border-subtle)",
  borderStrong: "var(--color-border-strong)",
  chalkWhite: "var(--color-chalk-white)",
  textSecondary: "var(--color-text-secondary)",
  textMuted: "var(--color-text-muted)",
  textDisabled: "var(--color-text-disabled)",
  success: "var(--color-success)",
  successSoft: "var(--color-success-soft)",
  warning: "var(--color-warning)",
  warningSoft: "var(--color-warning-soft)",
  danger: "var(--color-danger)",
  dangerSoft: "var(--color-danger-soft)",
  violet: "var(--color-accent-violet)",
  violetSoft: "var(--color-violet-soft)",
  categorySky: "var(--color-category-sky)",
  categoryTeal: "var(--color-category-teal)",
  categorySand: "var(--color-category-sand)",
  categoryRose: "var(--color-category-rose)",
  categorySlate: "var(--color-category-slate)",
  categoryUnlisted: "var(--color-category-unlisted)",
} as const;

export const uiRadii = {
  xs: "var(--radius-xs)",
  sm: "var(--radius-sm)",
  md: "var(--radius-md)",
  lg: "var(--radius-lg)",
  xl: "var(--radius-xl)",
  pill: "var(--radius-pill)",
} as const;

export const uiSpacing = {
  xs: "var(--space-xs)",
  sm: "var(--space-sm)",
  md: "var(--space-md)",
  lg: "var(--space-lg)",
  xl: "var(--space-xl)",
  xxl: "var(--space-2xl)",
  xxxl: "var(--space-3xl)",
} as const;

export const uiShadows = {
  floating: "var(--shadow-floating)",
  modal: "var(--shadow-modal)",
  sm: "var(--shadow-sm)",
  md: "var(--shadow-md)",
  control: "var(--shadow-control)",
} as const;

export const uiMotion = {
  instant: "var(--motion-instant)",
  fast: "var(--motion-fast)",
  normal: "var(--motion-normal)",
  slow: "var(--motion-slow)",
  page: "var(--motion-page)",
  ritual: "var(--motion-ritual)",
  progress: "var(--motion-progress)",
  progressSlow: "var(--motion-progress-slow)",
  toggle: "var(--motion-toggle)",
  disclosure: "var(--motion-disclosure)",
  standard: "var(--ease-standard)",
  enter: "var(--ease-enter)",
  exit: "var(--ease-exit)",
  out: "var(--ease-out)",
} as const;

export const uiTypography = {
  nano: "var(--text-nano)",
  micro: "var(--text-micro)",
  label: "var(--text-label)",
  meta: "var(--text-meta)",
  body: "var(--text-body)",
  bodyEmphasis: "var(--text-body-emphasis)",
  pageTitle: "var(--text-page-title)",
  title: "var(--text-title)",
  headline: "var(--text-headline)",
  display: "var(--text-display)",
} as const;

export const uiFocus = {
  ring: "var(--focus-ring)",
  width: "var(--focus-ring-width)",
} as const;

export const uiLayers = {
  negative: "var(--layer-negative)",
  base: "var(--layer-base)",
  raised: "var(--layer-raised)",
  local: "var(--layer-local)",
  menuLocal: "var(--layer-menu-local)",
  sticky: "var(--layer-sticky)",
  context: "var(--layer-context)",
  detailBackdrop: "var(--layer-detail-backdrop)",
  detail: "var(--layer-detail)",
  detailDrawer: "var(--layer-detail-drawer)",
  pinnedPanel: "var(--layer-pinned-panel)",
  appOverlay: "var(--layer-app-overlay)",
  popover: "var(--layer-popover)",
  drawer: "var(--layer-drawer)",
  overlay: "var(--layer-overlay)",
  modal: "var(--layer-modal)",
  toast: "var(--layer-toast)",
  ambient: "var(--layer-ambient)",
  floating: "var(--layer-floating)",
  featurePopup: "var(--layer-feature-popup)",
  goalToast: "var(--layer-goal-toast)",
  system: "var(--layer-system)",
  nestedPopover: "var(--layer-nested-popover)",
  systemOverlay: "var(--layer-system-overlay)",
} as const;

export const uiStates = {
  hoverSurface: "var(--state-hover-surface)",
  selectedSurface: "var(--state-selected-surface)",
  focusRing: "var(--state-focus-ring)",
  disabledOpacity: "var(--state-disabled-opacity)",
  completedOpacity: "var(--state-completed-opacity)",
} as const;

export const uiChartColors = {
  axis: "var(--color-chart-axis)",
  grid: "var(--color-chart-grid)",
  series1: "var(--color-chart-series-1)",
  series2: "var(--color-chart-series-2)",
  series3: "var(--color-chart-series-3)",
  goal: "var(--color-chart-goal)",
  average: "var(--color-chart-average)",
} as const;

export const uiLayout = {
  pageHeaderHeight: "var(--page-header-height)",
  appSidebarWidth: "var(--app-sidebar-width)",
  contextSidebarWidth: "var(--context-sidebar-width)",
  detailPanelWidth: "var(--detail-panel-width)",
} as const;
