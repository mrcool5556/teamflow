# Appearance and design your own

Each user's look lives in their profile (`appearance` in `packages/core/src/profile.ts`), is saved on the server and applied by `applyUserProfile` in `apps/web/src/profile.ts`, which sets `data-*` attributes and a few CSS variables on `<html>`.

## Base settings

| Field | Values | Attribute |
|---|---|---|
| `theme` | dark, light, system | `data-theme` (always dark or light) |
| `colorPreset` + `customColors` | default, sunset, ocean, forest, custom | `data-color-preset`, inline `--primary` / `--accent` |
| `shape` | sharp, soft, round, octagon, pill | `data-shape` |
| `chromeStyle` (UI style) | industrial, minimal, soft, classic, glass, terminal, paper, neon | `data-chrome-style` |
| `textContrast`, `semanticContrast` | see the schema | `data-text-contrast`, `data-semantic-contrast` |

## Design-your-own aspects

Ported from the UI/UX design library's "make it yours" model (`D:\projects\UI-UX-Design`, `project/customization.md`). The rules are copied into Teamflow's own CSS; the library's bundle is not loaded. Every aspect defaults to `auto` (or Teamflow's colours), which removes the attribute so the UI style draws as before; old profiles look the same.

| Field | Values | Attribute |
|---|---|---|
| `colorTheme` | teamflow, studio, glass, machined, arcade, cozy, retro-console | `data-palette` (none for teamflow) |
| `fontSet` | auto, studio, machined, paper, pixel, neon | `data-font` |
| `surface` (windows and cards) | auto, flat, soft-inset, indented, glass, paper, bevel | `data-surface` |
| `buttons` | auto, flat, raised, inset, lipped, cut-paper, neon, bevel95 | `data-buttons` |
| `lip`, `lipShadow` | gold, silver, bronze, ink, accent; none, drop | `data-lip`, `data-lip-shadow` (lipped buttons only) |
| `inputs` (text fields) | auto, boxed, sunk, underline, notebook | `data-inputs` |
| `toggles` (switches) | auto, pill, flap, retro | `data-toggles` |

An unknown value in a saved or imported profile falls back to the default instead of rejecting the profile.

## Fonts

Every `font-family` in the app reads a token from `styles/tokens.css`: `--font-body`, `--font-display` (headings), `--font-mono` (codes, counts, labels), `--font-serif` (the Paper UI style's headings) and `--font-hand` (notebook fields).

## Colour themes

`styles/themes.css` holds the nine library themes as Teamflow tokens: Studio Dark/Light, Night Glass/Lavender Glass (`glass`), Machined/Machined Light, Arcade (dark only), Cozy and Retro Console (light only). `theme` (dark, light, system) picks the partner of a paired theme; a single-mode theme keeps its own mode (`COLOR_THEME_FIXED_MODE`), and `data-theme` is set to that mode so the light/dark rules still apply.

Token mapping: surface-000 → `--bg`, surface-100 → `--surface` / `--panel`, surface-200 → `--cell`, line / line-strong → `--border` / `--border-strong`, ink → `--text`, ink-muted → `--muted` (with `--text-soft` between the two), accent → `--primary`, on-accent → `--chrome-btn-text`, info → `--accent` / `--accent-text`, danger → `--danger` / `--danger-text`, success → `--done`. Translucent library values are flattened onto the page colour so menus stay opaque. Text contrast (Stronger, Softer) has its own values per theme.

The accent colour setting (`colorPreset`) overrides a theme: "default" means the theme's own accent, any other choice paints over it. With Teamflow's colours, "default" is still orange and cyan.

`apps/web/tests/colorThemes.test.ts` reads `tokens.css` and `themes.css` and checks, for Teamflow dark and light and every library theme with each text contrast level: body and soft text at 4.5:1 on every background, muted text at 3:1, and for library themes also button text on the accent, accent text, error text (4.5:1) and control borders (3:1). The theme CSS was generated from the library's `tokens.json`; regenerate rather than hand-edit if the library changes.

## Font sets

`styles/fonts.css` declares the library's font sets on `data-font`: Studio (Bricolage Grotesque, Atkinson Hyperlegible, JetBrains Mono), Machined (Encode Sans Semi Condensed, Manrope, IBM Plex Mono), Paper (Special Elite, Atkinson Hyperlegible, Caveat for notebook fields), Pixel (Pixelify Sans, VT323) and Neon (Orbitron, Atkinson Hyperlegible). Choosing any set also replaces the Paper UI style's serif headings.

The files are self-hosted in `apps/web/src/assets/fonts`, one folder per family with its licence (SIL OFL 1.1; Special Elite is Apache 2.0) and a README listing the sources. Vite bundles them into `/assets`, and `@font-face` only downloads a file when a set that uses it is chosen, so unused sets cost nothing. VT323 is scaled up 25% (`size-adjust`) to match the other sets. `tests/fontSets.test.ts` checks every `@font-face` file exists and every family has a licence.

## Corners

`shape` sets the radius tokens in `tokens.css`. Two extra tokens let Pill round controls fully without turning cards into capsules: `--radius-control` (buttons, fields, search boxes, segmented controls) and `--radius-chip` (issue id, due and priority chips). They follow `--radius-sm` and `--radius-xs` for the other shapes; Pill sets both to 999px and gives boxes larger radii (8 to 28px).
