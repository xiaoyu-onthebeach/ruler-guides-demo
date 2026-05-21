# Phased Implementation Plan

Build in this order. Each phase is independently testable. Pause at the end of each and confirm before moving on.

---

## Phase 1 — Core rendering & tick algorithm

**Goal:** Static rulers with correct ticks at the current zoom.

### Build

- `tickAlgorithm.ts` with `pickStep` + unit tests
- `coordinateSystem.ts` with world↔screen transforms + unit tests
- `rulerRenderer.ts` rendering top/left rulers, ticks (major + minor), labels
- High-DPI canvas setup with `setTransform(dpr, …)`
- Demo harness with hardcoded zoom slider + pan

### Acceptance

- Drag zoom slider through full range (10% → 1000%). Tick spacing always ≥ 60px between major ticks. Labels show nice numbers only.
- Pan via host context — labels update, no jitter.
- Lines are crisp at 1× and 2× DPR.

### Tests passing

- `pickStep` returns expected values at zoom 0.1, 0.5, 1, 2, 5, 10.
- `worldToScreen` and `screenToWorld` are inverses to within floating-point tolerance.

---

## Phase 2 — Corner & coordinate readout

**Goal:** Static corner and live coordinate readout in the demo harness.

### Build

- Static corner square at top-left (non-interactive, visual only)
- Live coordinate readout (X, Y in px) somewhere in the demo harness that updates on `mousemove`

### Acceptance

- Corner renders at 24×24px at the ruler intersection.
- Coordinate readout shows the cursor's world position, formatted to integers at zoom < 4×, to 1 decimal at zoom ≥ 4×.

---

## Phase 3 — Origin system

**Goal:** Two-state origin system (default and selection-relative) working.

### Build

- `RulerState` with `origin: OriginMode` (`default` | `selection`)
- Hook into host selection: when `selection.sceneId` changes, update origin accordingly
- Auto-shift to `selection` mode when `sceneId` becomes non-null; return to `default` when it becomes null
- Reset shortcut: `Cmd/Ctrl + Alt + R`

### Acceptance

- Select a scene → labels recalculate relative to scene's top-left.
- Select a layer inside that scene (same `sceneId`) → origin **does not change**.
- Switch directly from scene A to scene B → origin updates to B's top-left.
- Deselect the scene entirely → labels return to `(0, 0)`.
- `Cmd/Ctrl + Alt + R` → labels return to `(0, 0)` from any state.

---

## Phase 4 — Crossfade transition

**Goal:** Tick density transitions smoothly.

### Build

- `crossfade.ts` with the opacity calculation from the tech spec
- Render loop emits a second tick set during animation
- Frame loop continues while `isAnimating === true`

### Acceptance

- Slow zoom across a step threshold → visible 150ms crossfade.
- Fast zoom (wheel) across multiple thresholds → still animates the most recent transition only (no stutter).
- No flicker when `previousStep` is cleared.

---

## Phase 5 — Global guides

**Goal:** Drag from ruler to create global guides; drag back to delete.

### Build

- `guideStore.ts` (just global guides for now)
- `guideRenderer.ts` with dashed red lines spanning full viewport
- `interactionLayer.ts` with the mousedown → `creating-guide` → `moving-guide` → mouseup state machine
- Hover state on guides

### Acceptance

- Drag down from top ruler → vertical guide follows cursor, drops when released.
- Drag the guide back onto the top ruler → deleted.
- Hover an existing guide → cursor changes, guide darkens.
- 50+ guides render at 60fps during pan/zoom.

---

## Phase 6 — Scene-scoped guides

**Goal:** Guides become scene-scoped when a scene is selected at creation.

### Build

- Scope assignment in `determineScope` based on host selection
- Scene-scoped guides store position in scene-local coordinates
- Render in two segments: solid line within scene bounds, dashed line outside (extending to canvas edges)
- Guides translate with their parent scene (scene-local storage makes this automatic)

### Acceptance

- With scene A selected, drag from ruler → new guide is scoped to A. Verify by checking the guide list.
- Move scene A → its guides move with it (solid segment follows the scene).
- Deselect → solid segment is clipped to A's scene bounds; dashed extensions remain visible outside.
- Select scene B → A's guides are still visible. B's selection-relative origin is now active.
- Delete scene A → its guides are deleted.

---

## Phase 7 — Hide/show + shortcut + context menu

**Goal:** Full visibility control.

### Build

- `keyboardShortcuts.ts` with `Cmd/Ctrl + ;` toggle
- `contextMenu.tsx` rendered on right-click **only when the click hits the ruler area** (top ruler, left ruler, or corner). Right-click on the canvas body falls through to the host.
- Hidden guides are not interactive (hit testing disabled)

### Acceptance

- `Cmd/Ctrl + ;` toggles guides on/off across the whole canvas.
- Right-click on the top ruler → menu with "Hide guides" / "Show guides".
- Right-click on the left ruler → same menu.
- Right-click on the corner → same menu.
- Right-click on the canvas body → no guide menu (host context menu, if any, behaves normally).
- Hidden guides cannot be hovered or grabbed.
- Visibility persists across pans/zooms (session-level).

---

## Phase 8 — Persistence & undo/redo

**Goal:** Guides survive document close/reopen and participate in undo/redo.

### Build

- Extend the host document serializer:
  - Global guides serialize at the document root.
  - Scene-scoped guides serialize as children of their parent scene.
- Hook guide create/move/delete into the host's existing undo/redo / transactional API.
- Deserialization on document open restores all guides at correct positions and scopes.
- Multi-user sync (if the host supports it): guides flow through the same channel as other document edits.

### Acceptance

- Create several guides (mix of global + scene-scoped). Close and reopen the document → all guides return at the same positions and scopes.
- Duplicate a scene with scoped guides → guides duplicate with the new scene at the same relative positions.
- Delete a scene with scoped guides → guides are deleted.
- Create a guide → `Cmd/Ctrl + Z` undoes it. `Cmd/Ctrl + Shift + Z` redoes it.
- Move a guide → undo restores the previous position.
- Delete a guide → undo restores it (with the same scope and position).
- In a shared session, a guide created by user A appears for user B within the normal sync latency.

---

## Phase 9 — Polish & edge cases

**Goal:** Production-ready feel.

### Build

- Crossfade tuning (test on slow hardware)
- Cursor changes refined (correct cursor at every hit target)
- Edge cases from PRD §9: extreme world coords, zoom during drag, scene duplication
- Label truncation if > 80px wide
- README with integration instructions

### Acceptance

- Manual run-through of every acceptance criterion from PRD §10.
- No frame drops under stress test (200 guides, fast zoom).
- All tests passing.
- README covers integration, public API, known limitations.

---

## Out-of-scope (track separately)

These came up in the design discussion but were deferred:

- Smart guides (object-snap alignment hints)
- Angled guides
- Guide-from-object (convert path to guide)
- Per-guide locking
- Guides manager panel
- Numeric input for guide position
- Multiple unit systems (mm, in)

Don't build these in this workstream.
