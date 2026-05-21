# PRD: Ruler & Guide System for Infinite Canvas

**Owner:** Xiaoyu · The Sea AI / Beachside
**Status:** Ready for engineering
**Target surface:** Infinite canvas (generative image workspace)

---

## 1. Summary

A ruler and guide system that gives users precise spatial reference and reusable alignment aids on the infinite canvas. Rulers run along the top and left edges of the viewport, with a draggable origin in the corner. Guides drag in from the rulers, snap to the relevant context (scene frame or global canvas), and persist with their parent.

The system must feel native to professionals coming from Figma, Photoshop, and Illustrator while behaving correctly in an infinite, multi-scene environment.

---

## 2. Goals

- Give users a stable, predictable coordinate reference at any zoom level.
- Let users place reusable alignment guides quickly with familiar gestures.
- Keep visual presence minimal — rulers and guides are *reference*, not focus.
- Make context (which scene a guide belongs to) visually obvious without explanation.

## 3. Non-goals (this release)

- Angled guides
- Guide-from-object (convert a path to a guide)
- Smart guides / dynamic alignment lines (handled in a separate workstream)
- A guides manager panel
- Per-guide locking
- Numeric input field for guide position
- Multiple unit systems — pixels only

---

## 4. Coordinate system

### 4.1 Default behavior

- **Default origin:** World coordinates, with `(0, 0)` at a fixed point in canvas space. The origin does *not* track the viewport.
- **Auto-shift to selection:** When the user selects a **scene frame**, the ruler origin temporarily shifts to the top-left of the scene's bounding box. Labels recalculate relative to the scene's origin.
- **Layer selection does not shift the origin.** Selecting a layer *inside* a scene leaves the current origin unchanged (whether that's the scene's origin from a prior scene selection, the world default, or a user-defined origin). This keeps the user's frame of reference stable while they work inside a scene.
- **Returning to world:** When the scene selection is cleared (and no other scene becomes selected), origin returns to `(0, 0)`.

### 4.2 Origin states

| State | Trigger | Origin location |
|---|---|---|
| Default | Initial load, no scene selected | World `(0, 0)` |
| Selection-relative | User selects a **scene** (not a layer) | Top-left of scene bbox |
| Reset | User presses `Cmd/Ctrl + Alt + R` | Back to default `(0, 0)` |

Selecting a layer inside an already-selected scene does *not* change the origin. The origin only responds to scene-level selection.

### 4.3 Unit

- **Pixels only** in v1. No unit switcher in the UI.
- Labels display integers when zoomed out, fractional values only when zoom > 4× (when sub-pixel precision is meaningful).

---

## 5. Tick algorithm

### 5.1 Rule

Ticks remain legible at any zoom level using a "nice number" sequence: `1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, …`

At every zoom change, recompute the step size so that the visual gap between *major* (labeled) ticks is at least **60px on screen**. Pick the smallest value from the nice-number sequence that satisfies this constraint.

### 5.2 Tick hierarchy

| Tick type | Visual | Label |
|---|---|---|
| Major | 8px length, higher contrast | Yes |
| Minor | 4px length, lower contrast | No |

- Each major tick contains **5 minor ticks** evenly subdividing the interval.
- Tick origin is anchored to the active origin (world `(0,0)`, user-defined, or selection-relative).

### 5.3 Tick density transitions

When the zoom level crosses a threshold and the step size changes:

- The outgoing tick density fades out and the incoming density fades in over **150ms**.
- Use opacity crossfade (linear easing) — do not hard-swap.
- Labels follow the same crossfade.

---

## 6. Visual design

### 6.1 Rulers

- **Width/height:** 24px
- **Background:** Low-contrast neutral. Recedes from the canvas content.
- **Tick color:** Slightly higher contrast than the ruler background.
- **Label color:** High contrast (the only "loud" element on the ruler).
- **Label font:** Monospace, 10–11px. Sentence-case numerics only.
- **Border:** A single 0.5px hairline separating the ruler from the canvas body.

### 6.2 Corner

- 24×24px square at the top-left intersection.
- Contains a small crosshair icon.
- Right-click opens the same context menu as the ruler area.

### 6.3 Guides

- **Color:** Red (single accent, reserved for guides only — does not appear elsewhere in the UI chrome).
- **Style:** 1px dashed line. Dash pattern: 4px on, 3px off.
- **Hover state:** Solid line, slightly darker red.
- **Cursor over guide:** `ew-resize` (vertical guides) or `ns-resize` (horizontal guides).

---

## 7. Guide system

### 7.1 Guide types (v1)

- **Horizontal guides** — created by dragging from the top ruler. A horizontal line spanning the full canvas width at a fixed Y position.
- **Vertical guides** — created by dragging from the left ruler. A vertical line spanning the full canvas height at a fixed X position.

### 7.2 Guide scoping

Guides belong to one of two scopes:

| Scope | When created | Behavior |
|---|---|---|
| **Scene-scoped** | A scene frame is selected when the guide is dragged in | Guide is a child of that scene. Moves and scales with the scene. Visible when the scene is on screen. Hidden when the scene is not. |
| **Global** | No selection when the guide is dragged in | Guide is a child of the canvas. Stays at fixed world coordinates regardless of any scene's position. |

A guide's scope is set at creation time and is permanent. Moving a guide to a different position does *not* change its scope.

### 7.3 Visual differentiation

- **Scene-scoped guides:** Same red, rendered across the full viewport but in two visual segments. The portion within the scene's bounding region is a **solid** line. The portions outside the scene (extending to the canvas edges) are **dashed** (same 4px on, 3px off pattern). This communicates scope without hard clipping — solid = inside scene, dashed = outside.
- **Global guides:** Same red, solid dashed line (4px on, 3px off) extending across the entire viewport.
- No color difference between guide types — line style and spatial extent communicate scope.

### 7.4 Interactions

| Interaction | Result |
|---|---|
| Drag from top ruler down into canvas | Creates a horizontal guide |
| Drag from left ruler right into canvas | Creates a vertical guide |
| Drag an existing guide back onto its ruler | Deletes the guide |
| Drag an existing guide to a new position | Moves the guide |
| Hover an existing guide | Cursor changes to resize cursor; guide darkens slightly |
| Right-click on the ruler area (top or left ruler, or corner) | Context menu with "Hide guides" / "Show guides" toggle |
| Press `Cmd/Ctrl + ;` | Toggle guide visibility globally |

Right-click on the canvas body (not the ruler) is reserved for the host application's own context menu and does not trigger the guide menu.

### 7.5 Hide/show behavior

- Hidden guides remain in the document — they are visually suppressed only.
- Hiding guides also suppresses guide hover states (you can't accidentally grab an invisible guide).
- State persists per session.

---

## 8. Persistence

Guides persist with the document, alongside scenes and layers.

- **Storage location:**
  - Global guides serialize at the document root under `guides: Guide[]`.
  - Scene-scoped guides serialize as children of their parent scene.
- **Lifecycle:**
  - Reopening a document restores all guides at their saved positions.
  - Duplicating a scene duplicates its scoped guides at the same relative positions.
  - Deleting a scene deletes its scoped guides.
  - Exporting a scene as a template includes its scoped guides.
- **Shared documents:** When multiple users open the same document, they see the same guides. Guide edits sync through the same channel as other document edits.
- **Undo/redo:** Guide create, move, and delete operations participate in the document undo/redo stack, the same as edits to scenes or layers.

`RulerState` (visibility toggle, current origin mode) is **session-only** and not persisted. Visibility resets to "shown" on document open, and origin resets to default.

## 9. Edge cases

- **Guide at extreme world coordinates:** Ruler labels truncate gracefully if they would exceed 80px wide (rare at normal use).
- **Zoom during guide drag:** The guide's world position stays fixed; its screen position updates with the zoom.
- **Scene deletion with scene-scoped guides:** Guides are deleted with the scene.
- **Scene duplication:** Scene-scoped guides duplicate with the scene at offset positions.
- **Very dense guide collections:** No special handling; rendering remains 1px per guide.
- **Origin during scene switch:** Switching directly from scene A to scene B updates the origin to B's top-left without intermediate reset.

---

## 10. Acceptance criteria

A working implementation must satisfy all of the following:

1. Rulers render on the top and left edges at all zoom levels with correct tick spacing per §5.
2. Major-tick spacing is always ≥60px on screen.
3. Crossfade transition is visible when zooming across a tick-density threshold.
4. Origin auto-shifts to the scene bounding box when a scene frame is selected. Selecting a layer inside the scene does *not* change the origin.
5. Origin returns to `(0, 0)` when the scene is deselected.
6. `Cmd/Ctrl + Alt + R` resets the origin to default `(0, 0)`.
7. Dragging from a ruler creates a guide that follows the cursor in real time.
8. Dragging a guide back onto its source ruler deletes it.
9. Scene-scoped guides move with their scene. Within scene bounds: solid red line. Outside scene bounds: dashed red line extending to canvas edges.
10. Global guides remain at fixed world coordinates.
11. `Cmd/Ctrl + ;` toggles guide visibility.
12. Right-click on the ruler area (top, left, or corner) opens a context menu with a show/hide toggle. Right-click on the canvas body does not.
13. Guides persist across document close/reopen.
14. Guide create, move, and delete operations are undoable.
15. All rendering remains crisp at high-DPI (Retina) displays.
16. No frame drops during pan or zoom on a canvas with 50+ guides.
