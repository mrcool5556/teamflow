# Appearance and design your own

Each user's look lives in their profile (`appearance` in `packages/core/src/profile.ts`), is saved on the server and applied by `applyUserProfile` in `apps/web/src/profile.ts`, which sets `data-*` attributes and a few CSS variables on `<html>`.

## Base settings

| Field | Values | Attribute |
|---|---|---|
| `theme` | dark, light, system | `data-theme` (always dark or light) |
| `colorPreset` + `customColors` | default, sunset, ocean, forest, custom | `data-color-preset`, inline `--primary` / `--accent` |
| `shape` | sharp, soft, round, octagon | `data-shape` |
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
