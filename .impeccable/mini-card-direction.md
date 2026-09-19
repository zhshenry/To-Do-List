# Mini card extension

Mode: Operate. Scope: the existing Windows main window, a 150 px compact mode and shared AI conversation; preserve the independently visible dock and standalone assistant. User explicitly approved the local interactive 150 px design on 2026-09-17. Reference: docs/design-proposals/2026-09-17-mini-card/home.png and overview.png. This is a precisely specified extension; no new identity or seed tournament.

## Direction contract

THESIS: A thin desktop card with one useful task preview and four actions, switching content in place without increasing height.

OWN-WORLD: Existing Segoe UI / Chinese fallback typography, warm white surface, quiet warm-orange icons, 18 px outer radius and four white 13 px shortcut tiles. Real Phosphor icons, no shipping raster.

STORY: Read next task, complete or add tasks, ask the existing AI, review and explicitly apply changes, then return or expand.

FIRST VIEWPORT: At 440 by 150 (and 340 by 150), 10 px insets, a 36 px top preview row and four equal action tiles. Task and AI views use a 26 px header, internal content scroll, fixed input or confirmation controls. Main width and top position stay fixed on collapse; expansion restores prior height subject to screen bounds.

FORM: User-selected reference card, approved HTML preview. No random seed: narrow extension selected directly by the user. Both AI surfaces share sessions/drafts; expanded main toolbar gains a separate collapse button.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
