---
name: Daylight
description: A calm, supportive study space that makes the next schoolwork step feel doable.
colors:
  ink: "#232c2c"
  muted: "#78817e"
  line: "#e8ebe6"
  paper: "#f7f8f4"
  white: "#ffffff"
  green: "#387e67"
  green-dark: "#28654f"
  mint: "#e5f3e9"
  mint-deep: "#cde9d8"
  sun: "#f2bf63"
  lavender: "#eeeafa"
  peach: "#f8e9dc"
  dark-paper: "#171d1b"
  dark-surface: "#202824"
  dark-ink: "#e7eee9"
typography:
  display:
    fontFamily: "Manrope, sans-serif"
    fontSize: "34px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-1.25px"
  title:
    fontFamily: "Manrope, sans-serif"
    fontSize: "21px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.45px"
  body:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "10px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "1.35px"
rounded:
  sm: "9px"
  md: "13px"
  lg: "18px"
  xl: "20px"
spacing:
  xs: "5px"
  sm: "9px"
  md: "14px"
  lg: "20px"
  xl: "34px"
components:
  button-primary:
    backgroundColor: "{colors.green}"
    textColor: "{colors.white}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 17px"
    height: "43px"
  button-secondary:
    backgroundColor: "{colors.white}"
    textColor: "{colors.green-dark}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "40px"
  card:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "20px"
  input:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "46px"
---

## Overview

**Creative North Star: "A Softer Start."**

Daylight is a quiet, optimistic student workspace. Its visual system makes the interface feel approachable rather than demanding: warm paper backgrounds, leafy green actions, small moments of sun and mint, and generous breathing room around the next step. The design should feel like a calm desk at the beginning of a study session, not a productivity scoreboard.

The product uses tonal layering instead of dramatic decoration. White cards sit gently on cool paper, progress surfaces use pale green, and typography carries hierarchy through weight and scale. Dark mode keeps the same emotional character with deep green-black surfaces and readable mint-tinted text.

**Key Characteristics:**
- Calm and supportive rather than urgent.
- Tactile but lightweight rounded surfaces.
- Green as the action and progress voice.
- Clear hierarchy with Manrope display text and DM Sans utility copy.
- Progress without streak pressure or visual noise.

## Colors

The light theme is anchored by `--paper` and `--white`, with `--ink` for primary copy and `--muted` for supporting copy. `--green` is reserved for actions, active navigation, and progress. Mint, sun, lavender, and peach are small contextual accents, not competing brand colors.

Dark mode preserves these relationships by moving the canvas to `#171d1b`, surfaces to `#202824`, and primary text to `#e7eee9`. Secondary copy must remain visibly lighter than the dark surface; never reuse light-theme gray values unchanged in dark mode.

**The Green Action Rule.** Use green for choices that move the student forward: primary buttons, active navigation, progress, and focused states. Do not use it as a decorative wash everywhere.

## Typography

Manrope is the display voice for page titles, card titles, and important encouragement. DM Sans is the practical reading voice for labels, controls, metadata, and longer copy. Headings are compact with slightly negative tracking; body copy stays open and quiet.

Use uppercase eyebrow labels sparingly as orientation cues. They should support a heading, not replace it. Keep the most important action or next step visually dominant.

## Layout

The desktop shell uses a fixed 248px sidebar and a fluid content area with a 54px horizontal gutter. The main home surface is a two-column grid: a larger next-step area and a narrower momentum area. Content should remain scannable, with generous separation between the welcome block, next action, priorities, and supporting progress.

At 1100px, the sidebar narrows and gutters reduce. At 800px, navigation becomes a bottom mobile bar, the home grid becomes one column, and page content uses 28px gutters. At 520px, gutters reduce to 19px and cards simplify their density.

## Elevation & Depth

Daylight uses restrained ambient shadows rather than hard offset shadows. The primary shadow is `0 12px 34px rgba(39,66,54,.055)`. Cards are primarily separated through white-on-paper tonal contrast and a 1px neutral border. Hover states lift a surface by 1–2px or shift its border toward green; they do not use large glows.

## Shapes

The base radius is 18px. Large cards use 17–20px, controls use 9–13px, and compact status elements use 7–9px. Borders are thin, pale, and low contrast in light mode; dark mode uses the `#2d3934` line token. Focus rings are 3px green with a 3px offset and must remain visible in both themes.

## Components

- **Primary button:** Moss-green filled action with white text, 43px height, 12–13px radius, and a subtle ambient shadow. Hover darkens and lifts by 1px.
- **Secondary and quiet actions:** White or tonal-surface controls with a thin border. They support the primary action and should not compete with it.
- **Cards:** White, softly bordered surfaces on the paper canvas. Use 16–20px radius and 14–28px internal padding depending on density.
- **Navigation:** Sidebar navigation uses 46px rows and a pale green active background. Mobile navigation becomes a fixed, translucent bottom bar with compact labels.
- **Settings switch:** A 38×22px pill track with a 16px thumb. The checked state uses the green action token; the focus ring is always visible.
- **Eyebrow and chip:** Small uppercase labels and compact tonal chips orient the user without adding visual weight.

## Do's and Don'ts

### Do

- Do make the next small step the clearest visual priority.
- Do use `#387e67` for meaningful forward actions and progress.
- Do preserve readable contrast for secondary text in both themes.
- Do use whitespace and tonal surfaces to create calm hierarchy.
- Do keep motion subtle and respect the reduced-motion preference.
- Do keep language supportive, practical, and free of shame.

### Don't

- Don't introduce streaks, warning-red urgency, or competitive dashboards.
- Don't use gradients, hard offset shadows, or decorative visual noise.
- Don't make every element a rounded card; reserve cards for meaningful grouped content.
- Don't use dark gray text on dark surfaces or light gray text on light surfaces.
- Don't replace the moss-green action voice with many saturated accent colors.
- Don't turn the coach into a clinical, diagnostic, or authoritative care experience.
