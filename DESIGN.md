---
name: Grid-Sense – Workplace Energy Manager
description: Blueprint-styled energy management dashboard for planning EV charging one day ahead.
colors:
  bg: "#0a1f3d"
  panel: "#0f2850"
  ink: "#e8f0fa"
  ink-dim: "#9bb3d4"
  line: "#2a4a7f"
  line-bright: "#4a6fa8"
  accent: "#00e676"
  solar: "#ffab00"
  danger: "#b71c1c"
  building: "#7fb3ff"
  grid: "#ff5252"
typography:
  display:
    fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.02em"
  subhead:
    fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.2
  kpi:
    fontFamily: "ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "1.25rem"
    fontWeight: 800
    lineHeight: 1
  outcome:
    fontFamily: "ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "1.125rem"
    fontWeight: 800
    lineHeight: 1
  body:
    fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "0.6875rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.03em"
rounded:
  none: "0px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.bg}"
    rounded: "{rounded.none}"
    padding: "8px 14px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "8px 14px"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "#ffffff"
    rounded: "{rounded.none}"
    padding: "8px 14px"
---

# Design System: Grid-Sense – Workplace Energy Manager

## Overview

**Creative North Star: "The Engineering Blueprint Turned Control Surface"**

A deep blueprint-blue ground ruled with horizontal ink lines, white/cream ink text, and sharp (zero-radius) corners. The visual world is an engineering drawing title block: product name at display scale, guide-words time range, a ruled legend, and KPI cells separated by hairline borders. Color is functional: electric green marks the EV "course" layer that never edits the base demand beneath it; amber marks solar; red marks total grid demand and danger.

**Key Characteristics:**
- Blueprint blue ground (#0a1f3d) with ruled horizontal lines.
- Sharp corners everywhere (no radius).
- Monospace labels for measurement; sans body for data.
- Electric green as the signature overlay color.

## Colors

Blueprint ink-on-blue palette; color does real jobs.

### Primary
- **Electric Green** (#00e676): EV charging course layer, approval/success, primary accent.

### Secondary
- **Solar Amber** (#ffab00): Solar generation series and degraded-state emphasis.

### Tertiary
- **Grid Red** (#ff5252): Total grid demand series and critical/danger state.

### Neutral
- **Blueprint Blue** (#0a1f3d): Page ground.
- **Panel Blue** (#0f2850): Card/panel surfaces.
- **Ink** (#e8f0fa): Primary text and rules.
- **Ink Dim** (#9bb3d4): Secondary text, labels.
- **Line** (#2a4a7f): Hairline borders and grid.

## Typography

**Display Font:** system-ui stack (with platform fallback)
**Body Font:** system-ui stack (with platform fallback)
**Label/Mono Font:** ui-monospace stack (SF Mono, Menlo, Consolas)

**Character:** Technical, precise, drawing-like; labels in monospace uppercase, data in sans.

### Hierarchy
- **Display** (800, 2.125rem, 1): Product name in title block.
- **Body** (400, 0.8125rem, 1.5): Table cells and control text.
- **Label** (700, 0.75rem, 0.03em tracking, uppercase): KPI labels, section titles, tab labels.

## Layout

Ruled grid ground; container max-width 1600px; KPI strip as a single bordered row of cells; tabs as a ruled row; cards separated by 16px. Responsive: KPIs wrap via auto-fit; overview row collapses to single column under 1100px; before/after charts stack under 900px.

## Elevation & Depth

Flat by default. Depth conveyed by 1px hairline borders and panel fills on the blueprint ground; no shadows. The Flat-By-Default Rule: surfaces are flat at rest; emphasis comes from ink weight and fill, not shadow.

## Shapes

Sharp corners (0px radius) throughout. Borders are 1px hairlines in --line; primary emphasis uses 2px ink rules (section titles, title block bottom). No rounded containers.

## Components

### Buttons
- **Shape:** 0px radius, uppercase monospace, 1px letter-spacing 0.5px.
- **Primary:** ink background, blueprint text, 8px 14px padding.
- **Hover:** opacity 0.85.
- **Secondary:** transparent background, ink border.
- **Danger:** #b71c1c background, white text.

### Cards / Containers
- **Corner Style:** 0px.
- **Background:** panel blue (#0f2850).
- **Border:** 1px line-bright.
- **Internal Padding:** 14px.

### Tables
- **Style:** monospace 12px, 6px 8px cell padding, bottom hairline borders, 2px ink header rule.

### Tabs
- **Style:** uppercase monospace 12px, 1px line border, active state ink fill with blueprint text.

### KPI Strip
- **Style:** single bordered row of cells, 26px bold value, 12px dim label.

## Do's and Don'ts

### Do:
- **Do** keep corners sharp and borders as hairlines.
- **Do** use monospace uppercase labels for measurements.
- **Do** reserve electric green for the EV course layer and success states.
- **Do** label all financial values as SIMULATED.

### Don't:
- **Don't** introduce rounded corners or soft shadows.
- **Don't** use the kicker/eyebrow label above headings (heading carries its own weight).
- **Don't** surface employee identity or attendance analysis.
- **Don't** use gradients or glass decoration.
