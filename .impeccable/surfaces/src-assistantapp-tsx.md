---
version: 1
slug: "src-assistantapp-tsx"
primary_target: "src/AssistantApp.tsx"
related_targets: ["src/AIConversation.tsx","src/assistant-updates.css"]
---

# Standalone AI assistant redesign

Mode: Operate. Scope: the standalone `AssistantApp` window and the non-compact branch of `AIConversation`; the collapsed `MiniCard` and `src/mini-card.css` are reference-only and must remain unchanged. Preserve the current model selector, persisted local sessions and drafts, real tool events, cancellation, streaming text, pending-proposal confirmation, discard, and error recovery.

## Direction contract

THESIS: A quiet local AI workbench where the user can understand the request, the live work, the answer, and any proposed changes in one continuous conversation rail.

OWN-WORLD: Keep the product's existing Segoe UI and Chinese fallback typography, warm off-white paper, deep ink, muted terracotta, thin warm-gray rules, modest 12-16 px radii, and soft offset depth. Reuse the compact assistant's truthful status language and sparkle identity without changing that surface. Use only the existing Phosphor icon system and CSS geometry; no shipping raster artwork.

STORY: Choose a local conversation and working model, ask for help, watch streamed text and real tool work without raw logs taking over the page, inspect the completed processing record, then explicitly apply or discard proposed changes. When AI is unavailable, the page explains why and leads directly to AI settings without pretending to be online.

FIRST VIEWPORT: At the default 380 by 620 assistant window, the command rail and local-session strip stay compact, conversation owns the available height, and the multiline composer remains reachable at the bottom. At the 320 px minimum width, title characters never stack vertically, secondary controls compress before primary identity, tool summaries wrap cleanly, and proposal actions remain usable. The active-work rail uses one subtle warm sweep plus the existing streaming cursor; reduced motion removes both. Tool details are collapsed by default, keyboard focus is visible, and user/assistant/proposal/error/empty/configuration states stay legible.

FORM: Directly shaped extension of the established product world, using the current standalone screenshots plus the approved compact streaming, tool-loop, and confirmation states as interaction references. Generated concepts `exec-7cd7e840-26a8-4122-a863-b46bd085e990.png` and `exec-35d4f4b0-0251-4607-8fa9-b79586dd3043.png` define hierarchy and density, not literal assets or fabricated data.

FINISH: Complete only after focused unit/build checks, Electron screenshots for disabled, streaming, tool, proposal, and 320 px narrow states, side-by-side visual inspection against the references, a fresh finish review, and durable DESIGN.md documentation. Browser plugin is unavailable, so Electron Playwright is the visual verification surface.
