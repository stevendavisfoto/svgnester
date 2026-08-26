/**
 * Design tokens — all colors used across the app in one place.
 *
 * Every entry in `c` is a CSS custom-property reference (`var(--c-*)`).
 * The actual values are defined by `ThemeVariables` below, which injects
 * both dark and light palettes onto `[data-theme]` on the root element.
 *
 * Usage in styled-components:
 *   import { c } from 'src/theme';
 *   const Foo = styled.div`color: ${c.textPrimary};`;
 *
 * To change a color app-wide, edit the token maps at the bottom of this file.
 */

import { createGlobalStyle } from "styled-components";

// ─── CSS variable references ────────────────────────────────────────────────

export const c = {
  // Surfaces
  bgApp: "var(--c-bg-app)",
  bgSidebar: "var(--c-bg-sidebar)",
  bgElevated: "var(--c-bg-elevated)",
  bgTooltip: "var(--c-bg-tooltip)",
  surfaceFaint: "var(--c-surface-faint)",
  surfaceSubtle: "var(--c-surface-subtle)",
  surfaceCard: "var(--c-surface-card)",
  surfaceIcon: "var(--c-surface-icon)",
  surfaceControl: "var(--c-surface-control)",
  surfaceSecondary: "var(--c-surface-secondary)",
  surfaceHover: "var(--c-surface-hover)",
  surfaceHoverMid: "var(--c-surface-hover-mid)",
  surfaceOverlay: "var(--c-surface-overlay)",
  scrim: "var(--c-scrim)",
  // Borders
  borderFaint: "var(--c-border-faint)",
  borderDefault: "var(--c-border-default)",
  borderStrong: "var(--c-border-strong)",
  borderBold: "var(--c-border-bold)",
  // Text
  textPrimary: "var(--c-text-primary)",
  textHeading: "var(--c-text-heading)",
  textSecondary: "var(--c-text-secondary)",
  textTooltip: "var(--c-text-tooltip)",
  textMuted: "var(--c-text-muted)",
  textFaint: "var(--c-text-faint)",
  textDim: "var(--c-text-dim)",
  textHint: "var(--c-text-hint)",
  textGhost: "var(--c-text-ghost)",
  textPlaceholder: "var(--c-text-placeholder)",
  // Accent
  accent: "var(--c-accent)",
  accentHover: "var(--c-accent-hover)",
  accentLight: "var(--c-accent-light)",
  accentFaint: "var(--c-accent-faint)",
  accentBgFaintest: "var(--c-accent-bg-faintest)",
  accentBg: "var(--c-accent-bg)",
  accentBgFocus: "var(--c-accent-bg-focus)",
  accentBgHover: "var(--c-accent-bg-hover)",
  accentBgBadge: "var(--c-accent-bg-badge)",
  accentBgStrong: "var(--c-accent-bg-strong)",
  accentBorderSubtle: "var(--c-accent-border-subtle)",
  accentBorder: "var(--c-accent-border)",
  accentBorderFocus: "var(--c-accent-border-focus)",
  // Danger
  danger: "var(--c-danger)",
  dangerHover: "var(--c-danger-hover)",
  dangerText: "var(--c-danger-text)",
  dangerBgSubtle: "var(--c-danger-bg-subtle)",
  dangerBg: "var(--c-danger-bg)",
  dangerBgHover: "var(--c-danger-bg-hover)",
  dangerBorder: "var(--c-danger-border)",
  dangerBorderHover: "var(--c-danger-border-hover)",
  // Warning
  warning: "var(--c-warning)",
  warningBg: "var(--c-warning-bg)",
  warningBorder: "var(--c-warning-border)",
  // Shadows
  shadowMd: "var(--c-shadow-md)",
  shadowLg: "var(--c-shadow-lg)",
} as const;

export type Colors = typeof c;

// ─── Token maps ─────────────────────────────────────────────────────────────

const dark = {
  // Surfaces
  "--c-bg-app": "#0f0f13",
  "--c-bg-sidebar": "#0d0d11",
  "--c-bg-elevated": "#16161f",
  "--c-bg-tooltip": "#1b1b26",
  "--c-surface-faint": "rgba(255,255,255,0.02)",
  "--c-surface-subtle": "rgba(255,255,255,0.04)",
  "--c-surface-card": "rgba(255,255,255,0.03)",
  "--c-surface-icon": "rgba(255,255,255,0.07)",
  "--c-surface-control": "rgba(255,255,255,0.05)",
  "--c-surface-secondary": "rgba(255,255,255,0.06)",
  "--c-surface-hover": "rgba(255,255,255,0.08)",
  "--c-surface-hover-mid": "rgba(255,255,255,0.10)",
  "--c-surface-overlay": "rgba(22,22,31,0.85)",
  "--c-scrim": "rgba(10,10,18,0.70)",
  // Borders
  "--c-border-faint": "#1e1e2a",
  "--c-border-default": "#2a2a38",
  "--c-border-strong": "#34344a",
  "--c-border-bold": "#3a3a4a",
  // Text
  "--c-text-primary": "#e2e2e6",
  "--c-text-heading": "#e0dfee",
  "--c-text-secondary": "#c0bfcf",
  "--c-text-tooltip": "#cfcedd",
  "--c-text-muted": "#9d9cb0",
  "--c-text-faint": "#8b8a9e",
  "--c-text-dim": "#6b6b80",
  "--c-text-hint": "#6f6e82",
  "--c-text-ghost": "#4a4a5a",
  "--c-text-placeholder": "#3a3a4a",
  // Accent
  "--c-accent": "#6c63ff",
  "--c-accent-hover": "#7c74ff",
  "--c-accent-light": "#9b94ff",
  "--c-accent-faint": "#b3adff",
  "--c-accent-bg-faintest": "rgba(108,99,255,0.05)",
  "--c-accent-bg": "rgba(108,99,255,0.08)",
  "--c-accent-bg-focus": "rgba(108,99,255,0.10)",
  "--c-accent-bg-hover": "rgba(108,99,255,0.12)",
  "--c-accent-bg-badge": "rgba(108,99,255,0.15)",
  "--c-accent-bg-strong": "rgba(108,99,255,0.25)",
  "--c-accent-border-subtle": "rgba(108,99,255,0.35)",
  "--c-accent-border": "rgba(108,99,255,0.40)",
  "--c-accent-border-focus": "rgba(108,99,255,0.50)",
  // Danger
  "--c-danger": "#e05555",
  "--c-danger-hover": "#f06565",
  "--c-danger-text": "#ff6b6b",
  "--c-danger-bg-subtle": "rgba(255,80,80,0.10)",
  "--c-danger-bg": "rgba(255,80,80,0.12)",
  "--c-danger-bg-hover": "rgba(255,80,80,0.20)",
  "--c-danger-border": "rgba(255,80,80,0.30)",
  "--c-danger-border-hover": "rgba(255,80,80,0.50)",
  // Warning
  "--c-warning": "#ff922b",
  "--c-warning-bg": "rgba(255,146,43,0.12)",
  "--c-warning-border": "rgba(255,146,43,0.35)",
  // Shadows
  "--c-shadow-md": "rgba(0,0,0,0.50)",
  "--c-shadow-lg": "rgba(0,0,0,0.55)",
};

const light = {
  // Surfaces
  "--c-bg-app": "#f8f7ff",
  "--c-bg-sidebar": "#f0eeff",
  "--c-bg-elevated": "#ffffff",
  "--c-bg-tooltip": "#ffffff",
  "--c-surface-faint": "rgba(0,0,0,0.02)",
  "--c-surface-subtle": "rgba(0,0,0,0.03)",
  "--c-surface-card": "rgba(0,0,0,0.025)",
  "--c-surface-icon": "rgba(108,99,255,0.10)",
  "--c-surface-control": "rgba(0,0,0,0.04)",
  "--c-surface-secondary": "rgba(0,0,0,0.05)",
  "--c-surface-hover": "rgba(0,0,0,0.06)",
  "--c-surface-hover-mid": "rgba(0,0,0,0.09)",
  "--c-surface-overlay": "rgba(240,238,254,0.92)",
  "--c-scrim": "rgba(0,0,0,0.35)",
  // Borders
  "--c-border-faint": "#e4e2f8",
  "--c-border-default": "#d5d2ef",
  "--c-border-strong": "#c0bcdf",
  "--c-border-bold": "#a8a4cc",
  // Text
  "--c-text-primary": "#1a1830",
  "--c-text-heading": "#2a2844",
  "--c-text-secondary": "#4a4868",
  "--c-text-tooltip": "#3a3858",
  "--c-text-muted": "#6b6884",
  "--c-text-faint": "#7b789a",
  "--c-text-dim": "#8b88a8",
  "--c-text-hint": "#9b98b8",
  "--c-text-ghost": "#b8b5d8",
  "--c-text-placeholder": "#d0cef0",
  // Accent (darker shades for legibility on light backgrounds)
  "--c-accent": "#6c63ff",
  "--c-accent-hover": "#5a52e0",
  "--c-accent-light": "#5548d0",
  "--c-accent-faint": "#6058d8",
  "--c-accent-bg-faintest": "rgba(108,99,255,0.05)",
  "--c-accent-bg": "rgba(108,99,255,0.08)",
  "--c-accent-bg-focus": "rgba(108,99,255,0.10)",
  "--c-accent-bg-hover": "rgba(108,99,255,0.12)",
  "--c-accent-bg-badge": "rgba(108,99,255,0.12)",
  "--c-accent-bg-strong": "rgba(108,99,255,0.18)",
  "--c-accent-border-subtle": "rgba(108,99,255,0.30)",
  "--c-accent-border": "rgba(108,99,255,0.45)",
  "--c-accent-border-focus": "rgba(108,99,255,0.55)",
  // Danger (darker for light bg readability)
  "--c-danger": "#c83030",
  "--c-danger-hover": "#b82020",
  "--c-danger-text": "#c03030",
  "--c-danger-bg-subtle": "rgba(200,48,48,0.07)",
  "--c-danger-bg": "rgba(200,48,48,0.09)",
  "--c-danger-bg-hover": "rgba(200,48,48,0.15)",
  "--c-danger-border": "rgba(200,48,48,0.28)",
  "--c-danger-border-hover": "rgba(200,48,48,0.50)",
  // Warning (darker for light bg)
  "--c-warning": "#c47010",
  "--c-warning-bg": "rgba(196,112,16,0.10)",
  "--c-warning-border": "rgba(196,112,16,0.32)",
  // Shadows (much softer on light)
  "--c-shadow-md": "rgba(0,0,0,0.12)",
  "--c-shadow-lg": "rgba(0,0,0,0.18)",
};

// ─── Global style injector ───────────────────────────────────────────────────

function tokensToCSS(tokens: Record<string, string>): string {
  return Object.entries(tokens)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");
}

export const ThemeVariables = createGlobalStyle`
  :root, [data-theme="dark"] {
${tokensToCSS(dark)}
  }
  [data-theme="light"] {
${tokensToCSS(light)}
  }
`;
