/**
 * MMRI canonical design tokens for JS/TS consumers.
 *
 * CSS in design/tokens.css remains the rendering authority. This file mirrors
 * that same blue/white system so future TS-driven UI cannot accidentally
 * reintroduce the retired purple/gray palette.
 */
export const designTokens = {
  color: {
    canvas: '#F2F7FE',
    surface: '#FFFFFF',
    surfaceSubtle: '#EAF2FC',
    surfaceStrong: '#D6E4F6',
    textStrong: '#0F2447',
    text: '#34476A',
    textMuted: '#5F7194',
    textFaint: '#8493AE',
    border: '#D3E2F5',
    borderStrong: '#B3C9E6',
    brand: '#1B63D8',
    brandHover: '#1553BD',
    brandPressed: '#0F43A0',
    brandSoft: '#E6F0FD',
    focus: '#1B63D8',
    success: '#16825D',
    successSoft: '#E8F6EF',
    warning: '#8A541B',
    warningSoft: '#FFF3DD',
    danger: '#B74343',
    dangerHover: '#9E3838',
    dangerSoft: '#FCE9E8',
    info: '#2C5FA8',
    infoSoft: '#EAF1FB',
    onBrand: '#FFFFFF',
    overlayScrim: 'rgba(10,30,70,.42)',
    chartGrid: '#DCE8F7',
    chartComparison: '#8EA3C2',
    chartFuture: '#C8D9F0',
  },
  typography: {
    displayPublic: { size: 60, line: 64 },
    displayProduct: { size: 44, line: 50 },
    page: { size: 36, line: 42 },
    section: { size: 24, line: 32 },
    bodyLarge: { size: 18, line: 28 },
    body: { size: 16, line: 25 },
    compact: { size: 15, line: 22 },
    meta: { size: 13, line: 18 },
    readingLine: 25,
    weights: { regular: 400, medium: 500, semibold: 600, display: 650 },
    tracking: { display: -0.035, heading: -0.018, compact: 0, meta: 0.018 },
  },
  radius: { small: 8, control: 12, surface: 18, focal: 24, pill: 999 },
  controlHeight: { compact: 36, default: 46, touch: 48 },
  motion: {
    instant: 0,
    press: 80,
    feedback: 120,
    state: 150,
    content: 180,
    overlay: 200,
    progress: 240,
    loading: 760,
    shimmer: 1500,
    reduced: 0.001,
    distanceSmall: 4,
    distanceMedium: 8,
    easingStandard: 'cubic-bezier(.2,.6,.2,1)',
    easingEnter: 'cubic-bezier(.16,1,.3,1)',
  },
  component: {
    spinner: 16,
    indicator: 20,
    radioMark: 18,
    radioPrefix: 32,
    menuMin: 220,
    popoverMin: 260,
    dialogMax: 560,
    statusSquare: 42,
    domainIconLarge: 72,
  },
  layout: {
    max: 1360,
    reading: 760,
    report: 1120,
    gridColumns: 12,
    shellHeight: 64,
    bottomNavHeight: 64,
  },
  spacing: [4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96, 128] as const,
} as const;

/**
 * The five strong category colors are product semantics, not decoration.
 * `ink` is the accessible foreground version used for text/icons on light UI.
 */
export const domainVisualTokens = {
  marketing: { accent: '#32D7C6', ink: '#075F4C', soft: 'rgba(50,215,198,.12)', secondary: '#B8F5EE', deep: '#0E8C80' },
  it: { accent: '#49B7FF', ink: '#0F6E8C', soft: 'rgba(73,183,255,.12)', secondary: '#CDEBFF', deep: '#1B78C2' },
  finance: { accent: '#FFC25A', ink: '#80500A', soft: 'rgba(255,194,90,.12)', secondary: '#FFE8B8', deep: '#B87A12' },
  people: { accent: '#A879FF', ink: '#5B33A6', soft: 'rgba(168,121,255,.12)', secondary: '#E3D3FF', deep: '#6D45C4' },
  operations: { accent: '#FF5BCF', ink: '#841E70', soft: 'rgba(255,91,207,.12)', secondary: '#FFD2F0', deep: '#B0238E' },
} as const;

export const responsiveBreakpoints = { compactPhone: 479, phone: 767, tablet: 1023 } as const;
export const responsiveLayout = { touchTargetMin: 48, bottomNavHeight: 64, qrMobileMax: 320 } as const;
