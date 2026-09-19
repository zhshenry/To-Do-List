---
version: 1
slug: "src-minicard-tsx"
primary_target: "src/MiniCard.tsx"
related_targets: ["src/mini-card.css","src/AssistantApp.tsx","src/SettingsPanel.tsx","electron/main.ts"]
---

# Mini card extension

Mode: Operate. Scope: the existing Windows main window, a 176 px persistent-titlebar compact mode and shared AI conversation; preserve the dormant dock implementation and the visible standalone assistant. The shipping build does not create the dock window or expose its controls. User explicitly approved the interactive design on 2026-09-18. Reference: docs/design-proposals/2026-09-18-persistent-titlebar-card/preview.html and README.md. This is a precisely specified extension; no new identity or seed tournament.

## Direction contract

THESIS: A thin desktop card with a persistent titlebar, one stack of today's and overdue unfinished items, one actionable suggestion and two primary actions.

OWN-WORLD: Existing Segoe UI / Chinese fallback typography, warm white surface, quiet warm-orange icons, 18 px outer radius, stacked white item card and two compact actions. Real Phosphor icons, no shipping raster.

STORY: Read the current due or untimed item from today and overdue work, open one useful suggestion, add a fully configured item, ask the existing Pi assistant, review real tool activity and explicitly apply changes, then return or expand.

FIRST VIEWPORT: At 440 by 176 or 340 by 176, the full 52 px titlebar remains fixed and only the 124 px content area changes. General settings exposes these as persisted Standard and Narrow window-width presets; expanded and collapsed states share the selected width, and switching keeps the current height and nearest horizontal screen edge. Home stacks today's and overdue unfinished items, placing concrete times first and breaking ties by creation time, with two right-side actions. Add and AI replace only that content area. Attached selectors and the provider-grouped model menu temporarily extend the native window downward while preserving top and width. Collapse raises the bottom edge over 180 ms; expansion lowers it over 240 ms and restores prior height. AI uses a subtle horizontal wipe, scan and moving warm border glow. Reduced motion removes these effects. The shipping surface has no dock control or dock window.

FORM: User-selected reference card, approved HTML preview. No random seed: the narrow extension is a user-selectable product width preset, not a separate visual mode. Both AI surfaces share sessions/drafts; expanded main toolbar gains a separate collapse button.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
