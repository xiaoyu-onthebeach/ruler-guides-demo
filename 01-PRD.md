# PRD: Ruler & Guide System for Infinite Canvas

**Owner:** Xiaoyu · The Sea AI / Beachside
**Status:** Implemented (Phase 1–7 complete)
**Target surface:** Infinite canvas (generative image workspace)

---

## 1. Summary

A ruler and guide system that gives users precise spatial reference and reusable alignment aids on the infinite canvas. Rulers run along the top and left edges of the viewport, with a draggable origin in the corner. Guides drag in from the rulers or the corner, snap to the relevant context (scene frame or global canvas), and persist with their parent.

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
- Labels display integers. Number labels can be toggled on/off via a control button.

---

## 5. Tick algorithm

### 5.1 Rule

Ticks remain legible at any zoom level using a "nice number" sequence: `1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, …`

At every zoom change, recompute the step size so that the visual gap between *major* (labeled) ticks is at least **60px on screen**. Pick the smallest value from the nice-number sequence that satisfies this constraint.

### 5.2 Tick hierarchy

| Tick type | Visual | Label |
|---|---|---|
| Major | 8px length, higher contrast | Yes (toggleable) |
| Minor | 4px length, lower contrast | No |

- Each major tick contains **5 minor ticks** evenly subdividing the interval.
- Tick origin is anchored to the active origin (world `(0,0)`, user-defined, or selection-relative).
- Both minor ticks and number labels can be toggled independently via UI buttons.

### 5.3 Tick density transitions

When the zoom level crosses a threshold and the step size changes:

- The outgoing tick density fades out and the incoming density fades in over **150ms**.
- Use opacity crossfade (linear easing) — do not hard-swap.
- Labels follow the same crossfade.

---

## 6. Visual design

### 6.1 Rulers

- **Width/height:** 24px
- **Background:** Low-contrast neutral (`#131316`). Recedes from the canvas content.
- **Tick color:** Slightly higher contrast than the ruler background.
- **Label color:** Semi-transparent white. Labels center-align with their major tick mark.
- **Label font:** Monospace, 10px.
- **Border:** A single 0.5px hairline separating the ruler from the canvas body.

### 6.2 Corner

- 24×24px square at the top-left intersection.
- Contains a small crosshair icon.
- **Left-click drag:** Creates a **cross-guide** — both a horizontal and vertical guide simultaneously, constrained to the cursor position throughout the drag. Guide scope follows the active scene selection, same as ruler drags.
- Right-click opens the context menu.

### 6.3 Guides

- **Color:** Red (`#FF4444` inactive, `#CC1111` active). Reserved for guides only — does not appear elsewhere in the UI chrome.
- **Active state:** Solid line, darker red. Shown while dragging or hovering.
- **Inactive state:** Solid red, 60% opacity.
- **Cursor over guide:** `ew-resize` (vertical guides) or `ns-resize` (horizontal guides).
- **Pending delete state:** Guide dragged back to ruler edge — gray, 30% opacity, clamped to ruler edge.

---

## 7. Guide system

### 7.1 Guide types

- **Horizontal guides** — created by dragging from the top ruler or corner. A horizontal line spanning the full canvas width at a fixed Y position.
- **Vertical guides** — created by dragging from the left ruler or corner. A vertical line spanning the full canvas height at a fixed X position.
- **Cross-guides** — created by dragging from the top-left corner. A matched pair of one horizontal and one vertical guide created simultaneously, sharing the same scope. Both guides track the cursor position during the drag.

### 7.2 Guide scoping

Guides belong to one of two scopes:

| Scope | When created | Behavior |
|---|---|---|
| **Scene-scoped** | A scene frame is selected when the guide is dragged in | Guide is a child of that scene. Moves and scales with the scene. Visible when the scene is on screen. |
| **Global** | No selection when the guide is dragged in | Guide is a child of the canvas. Stays at fixed world coordinates regardless of any scene's position. |

A guide's scope is set at creation time and is permanent. Moving a guide to a different position does *not* change its scope.

### 7.3 Visual differentiation

**During creation:**
When a guide is being actively dragged out from the ruler (or corner), it renders as a **full solid line** across the viewport regardless of scene bounds. Once the cursor enters the scene's bounding area, the display transitions to the final state: solid within the scene, dashed outside.

**Scene-scoped guides (at rest):**
The portion within the scene's bounding region is a **solid** line. The portions outside the scene (extending to the canvas edges) are **dashed** (4px on, 4px off). This communicates scope without hard clipping — solid = inside scene, dashed = outside.

**Global guides (at rest):**
Solid line extending across the entire viewport within the canvas area.

No color difference between guide types — line style and spatial extent communicate scope.

### 7.4 Render layering

Scene content and guides render in the following order (bottom to top):

1. **Scene bodies** — background fill, dot grid, image layers (all scenes)
2. **Scene-scoped guides** — rendered above scene bodies but *behind* scene frames
3. **Scene frames** — outer fill (header/padding area with evenodd hole to reveal body), scene name label, border stroke
4. **Global guides** — always on top of all scene layers
5. **Rulers** (when visible)
6. **Guide ruler labels** (active guide coordinate in ruler band)

This layering means scene-scoped guides appear to pass through the body of a scene but sit beneath the frame chrome. Global guides are always fully visible above all scene content.

### 7.5 Interactions

| Interaction | Result |
|---|---|
| Drag from top ruler down into canvas | Creates a horizontal guide |
| Drag from left ruler right into canvas | Creates a vertical guide |
| Drag from top-left corner | Creates both a horizontal and vertical guide (cross-guide) |
| Drag an existing guide back onto its ruler | Deletes the guide (shown in gray while dragging to edge) |
| Drag an existing guide to a new position | Moves the guide |
| Hover an existing guide | Cursor changes to resize cursor; guide becomes solid active red |
| Right-click on top ruler or corner | Context menu: "Hide rulers" + separator + "Remove all horizontal guides" |
| Right-click on left ruler | Context menu: "Hide rulers" + separator + "Remove all vertical guides" |
| Right-click when rulers are hidden (within 16px of top or left edge) | Context menu: "Show rulers" only |
| Press `Cmd/Ctrl + R` | Toggle ruler (and guide) visibility |
| Press `Cmd/Ctrl + Alt + R` | Reset ruler origin to world `(0, 0)` |

Right-click on the canvas body (not the ruler or edge zone) does not trigger the guide/ruler menu.

### 7.6 Ruler and guide visibility

- **Hiding rulers** also hides all guides. Guides are not accessible while rulers are hidden.
- When rulers are hidden, the ruler band disappears and the canvas extends to the full viewport edges.
- A 16px edge strip along the top and left remains hit-testable while rulers are hidden, allowing the "Show rulers" menu to be triggered.
- Visibility is toggled via `Cmd/Ctrl + R` or the context menu.
- Hidden guides remain in the document — they are visually suppressed only.
- State persists per session.

### 7.7 Display controls

Two toggle buttons are provided in the canvas UI (lower-right corner):

| Button | Default | Effect |
|---|---|---|
| **Numbers** | On | Show/hide ruler tick labels |
| **Minor ticks** | On | Show/hide minor (unlabeled) tick marks |

These controls affect the ruler display only and do not affect guides.

---

## 8. Image layers

Scenes support embedded image layers. Users can drop image files onto a scene body; the image is placed as a layer within the scene at the drop position.

- Images are positioned in scene-local coordinates.
- Images can be repositioned by dragging.
- Multiple images per scene are supported.
- Image layers render above the scene dot grid but below guides and scene frames.

---

## 9. Persistence

Guides persist with the document, alongside scenes and layers.

- **Storage location:**
  - Global guides serialize at the document root under `guides: Guide[]`.
  - Scene-scoped guides serialize as children of their parent scene.
- **Lifecycle:**
  - Reopening a document restores all guides at their saved positions.
  - Duplicating a scene duplicates its scoped guides at the same relative positions.
  - Deleting a scene deletes its scoped guides.
- **Undo/redo:** Guide create, move, and delete operations participate in the document undo/redo stack.

`RulerState` (visibility toggle, current origin mode) is **session-only** and not persisted. Visibility resets to "shown" on document open, and origin resets to default.

---

## 10. Edge cases

- **Guide at extreme world coordinates:** Ruler labels truncate gracefully.
- **Zoom during guide drag:** The guide's world position stays fixed; its screen position updates with the zoom.
- **Scene deletion with scene-scoped guides:** Guides are deleted with the scene.
- **Scene duplication:** Scene-scoped guides duplicate with the scene at offset positions.
- **Very dense guide collections:** No special handling; rendering remains 1px per guide.
- **Origin during scene switch:** Switching directly from scene A to scene B updates the origin to B's top-left without intermediate reset.
- **Cross-guide at scene boundary:** Both guides in a cross-guide pair share the same scope. If one is dragged back to delete, only that guide is removed; the other remains.

---

## 11. Acceptance criteria

A working implementation must satisfy all of the following:

1. Rulers render on the top and left edges at all zoom levels with correct tick spacing per §5.
2. Major-tick spacing is always ≥60px on screen. Major tick number labels are center-aligned on the tick mark.
3. Crossfade transition is visible when zooming across a tick-density threshold.
4. Origin auto-shifts to the scene bounding box when a scene frame is selected. Selecting a layer inside the scene does *not* change the origin.
5. Origin returns to `(0, 0)` when the scene is deselected.
6. `Cmd/Ctrl + Alt + R` resets the origin to default `(0, 0)`.
7. `Cmd/Ctrl + R` toggles ruler and guide visibility.
8. Dragging from a ruler creates a guide that follows the cursor in real time.
9. Dragging from the corner creates both a horizontal and vertical guide simultaneously.
10. During guide creation, the guide appears as a full solid line. Once the cursor enters the scene bounds, the outside portions become dashed.
11. Dragging a guide back onto its source ruler deletes it.
12. Scene-scoped guides render: solid within scene bounds, dashed outside. Global guides render as solid across the full canvas.
13. Scene-scoped guides render above scene bodies but behind scene frame chrome. Global guides render above all scene layers.
14. Global guides remain at fixed world coordinates.
15. Right-click on top ruler/corner opens "Hide rulers" + "Remove all horizontal guides". Right-click on left ruler opens "Hide rulers" + "Remove all vertical guides". When rulers are hidden, the 16px edge zone shows "Show rulers" only.
16. Hiding rulers also hides all guides. Showing rulers restores guide visibility.
17. Minor tick and number label toggles work independently and take effect immediately.
18. Images dropped onto a scene body are placed as image layers and can be repositioned by dragging.
19. All rendering remains crisp at high-DPI (Retina) displays.
20. No frame drops during pan or zoom on a canvas with 50+ guides.
