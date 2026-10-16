# Zoom Web Local Transcript Design System

## 0. Research Log

- Embedded refs: operational UI routes selected `taste-skill.md`; the supporting reference project is SKAIT, but this MVP intentionally uses a compact single-workspace surface instead of its feature-heavy layout.
- Skipped lanes: Lazyweb and image drafts are not relevant to this consent-sensitive local transcription control panel; no image assets are needed.

## 1. Atmosphere & Identity

A calm, focused local utility for a meeting in progress. The signature is a clearly separated live transcript paper: controls are compact and quiet, while the accumulating Korean text remains the visual priority.

## 2. Color

| Role | Token | Value | Usage |
|---|---|---|---|
| Surface/primary | `--surface-primary` | `#f6f7f5` | Page background |
| Surface/elevated | `--surface-elevated` | `#ffffff` | Workspace panels |
| Surface/subtle | `--surface-subtle` | `#edf0ec` | Secondary areas |
| Text/primary | `--text-primary` | `#1e2922` | Primary text |
| Text/secondary | `--text-secondary` | `#5d6c62` | Supporting copy |
| Border/default | `--border-default` | `#d8dfd9` | Panel separation |
| Accent/primary | `--accent-primary` | `#176b4d` | Start and download actions |
| Accent/hover | `--accent-hover` | `#10543c` | Accent hover |
| Status/success | `--status-success` | `#176b4d` | Recording status |
| Status/warning | `--status-warning` | `#8a5a00` | Queue status |
| Status/error | `--status-error` | `#a63b32` | Errors and stop action |
| Focus | `--focus-ring` | `#146c9e` | Keyboard focus ring |

Only these semantic tokens may be used in CSS.

## 3. Typography

| Level | Size | Weight | Line Height | Usage |
|---|---:|---:|---:|---|
| H1 | 32px | 650 | 1.2 | Page title |
| H2 | 20px | 650 | 1.3 | Transcript heading |
| Body | 16px | 400 | 1.6 | Main copy and transcript |
| Body/sm | 14px | 400 | 1.5 | Status details |
| Caption | 12px | 600 | 1.4 | Labels |

- Primary: `ui-sans-serif, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`
- Mono: `ui-monospace, SFMono-Regular, Menlo, monospace`

## 4. Spacing & Layout

All spacing uses a 4px base unit. `--space-2` 8px, `--space-3` 12px, `--space-4` 16px, `--space-5` 20px, `--space-6` 24px, `--space-8` 32px, and `--space-12` 48px.

- Max content width: 960px.
- A two-column status/control strip collapses to one column below 768px.
- The transcript owns the page's main scrolling surface.

## 5. Components

### Action button

- **Structure**: native `button` with an explicit type.
- **Variants**: primary, secondary, danger.
- **States**: default, hover, active, focus-visible, disabled.
- **Accessibility**: visible focus ring, keyboard activation, text-only labels.

### Status strip

- **Structure**: status label, state message, queue count.
- **States**: idle, selecting, recording, stopped, error.
- **Accessibility**: `role="status"` and `aria-live="polite"`.

### Transcript paper

- **Structure**: labelled `section` containing transcript paragraphs or an empty-state paragraph.
- **States**: empty, accumulating.
- **Accessibility**: semantic heading and readable Korean text at 16px.

## 6. Motion & Interaction

- Micro feedback uses a 120ms `ease-out` transform/color transition.
- Buttons depress by 1px when active.
- Non-essential transitions are disabled for `prefers-reduced-motion`.

## 7. Depth & Surface

Strategy: borders-only. Elevated panels use `1px solid var(--border-default)` with tonal surface contrast; no box shadows.

## 8. Accessibility Constraints & Accepted Debt

- WCAG 2.2 AA target: all controls retain visible focus and text contrast.
- The browser's native screen-share picker is owned by Chrome; its options cannot be programmatically enforced, so the application gives explicit pre-capture guidance.
- No accepted visual debt.
