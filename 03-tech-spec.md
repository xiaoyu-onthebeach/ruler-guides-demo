# Technical Specification

Companion to `01-PRD.md`. Defines data structures, algorithms, and rendering architecture.

---

## 1. Data model

```typescript
type Axis = 'x' | 'y';

interface Guide {
  id: string;
  axis: Axis;
  // Scene-scoped: offset from scene bbox origin (scene-local px).
  // Global: world coordinate (px).
  position: number;
  scope: GuideScope;
}

type GuideScope =
  | { kind: 'global' }
  | { kind: 'scene'; sceneId: string };

type OriginMode =
  | { kind: 'default' }                        // world (0,0)
  | { kind: 'selection'; x: number; y: number }; // auto-shifted to scene top-left

interface RulerState {
  origin: OriginMode;
  guidesVisible: boolean;
  currentStep: number;          // active major-tick step (world px)
  previousStep: number | null;  // for crossfade
  crossfadeStartedAt: number | null; // performance.now()
}
```

### Persistence

- Guides persist to the canvas document (same lifecycle as scenes and layers).
- Scene-scoped guides serialize as children of their scene.
- Global guides serialize at the document root under `guides: Guide[]`.
- Guide create, move, and delete operations push entries onto the host document's undo/redo stack — use whatever transactional API the host already uses for scene edits.
- `RulerState` is session-only — visibility resets to "shown" on document open, origin resets to default.

---

## 2. Tick-step algorithm

```typescript
const NICE_NUMBERS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
const MIN_MAJOR_TICK_GAP_PX = 60;

function pickStep(zoom: number): number {
  const targetWorldStep = MIN_MAJOR_TICK_GAP_PX / zoom;
  for (const step of NICE_NUMBERS) {
    if (step >= targetWorldStep) return step;
  }
  return NICE_NUMBERS[NICE_NUMBERS.length - 1];
}
```

**Properties to verify in tests:**

- At `zoom = 1.0`, `pickStep` returns `100` (since 60/1 = 60, next nice number ≥ 60 is 100).
- At `zoom = 0.1`, returns `1000`.
- At `zoom = 10.0`, returns `10`.
- At any zoom, screen gap between major ticks is ≥ 60px.

Minor ticks are always `step / 5`.

---

## 3. Coordinate transforms

```typescript
// Active origin in world coordinates
function activeOrigin(state: RulerState): { x: number; y: number } {
  switch (state.origin.kind) {
    case 'default': return { x: 0, y: 0 };
    case 'selection': return { x: state.origin.x, y: state.origin.y };
  }
}

// Convert a world coordinate to its display value (relative to active origin)
function displayValue(worldCoord: number, axis: Axis, state: RulerState): number {
  const origin = activeOrigin(state);
  return worldCoord - origin[axis];
}

// Screen-space transforms (existing host context provides zoom + pan)
function worldToScreenX(wx: number, ctx: CanvasContext): number {
  return RULER_SIZE + (wx - ctx.panX) * ctx.zoom;
}
function worldToScreenY(wy: number, ctx: CanvasContext): number {
  return RULER_SIZE + (wy - ctx.panY) * ctx.zoom;
}
function screenToWorldX(sx: number, ctx: CanvasContext): number {
  return ctx.panX + (sx - RULER_SIZE) / ctx.zoom;
}
function screenToWorldY(sy: number, ctx: CanvasContext): number {
  return ctx.panY + (sy - RULER_SIZE) / ctx.zoom;
}
```

`RULER_SIZE = 24` (constant).

---

## 4. Origin state machine

```
          ┌──────────────┐
          │   default    │
          │  (0,0)       │
          └──────┬───────┘
                 │
        ┌────────┴────────┐
        │                 │
   sceneId changes    (no event)
   (null → non-null)      │
        │                 │
        ▼                 │
  ┌──────────┐            │
  │selection │            │
  └────┬─────┘            │
       │                  │
  scene deselected         │
  (sceneId → null)         │
       │                  │
       ▼                  │
  back to default ────────┘
```

### Rules

- The origin state machine watches `selection.sceneId`. It responds only when `sceneId` changes value (null → non-null, non-null → null, or one scene id to another). Layer selection within the same scene does not change `sceneId` and therefore does not shift the origin.
- When `sceneId` becomes non-null, transition to `selection` and set origin to the scene's `bbox` top-left.
- When `sceneId` becomes null, return to `default` `(0, 0)`.
- Switching directly from scene A to scene B (sceneId changes to a different non-null value) updates the `selection` origin to the new scene's bbox.
- `Cmd/Ctrl + Alt + R` returns the origin to `default` from any state.

---

## 5. Crossfade transition

When `pickStep(newZoom) !== pickStep(oldZoom)`:

```typescript
const CROSSFADE_DURATION_MS = 150;

// In RulerState
state.previousStep = state.currentStep;
state.currentStep = newStep;
state.crossfadeStartedAt = performance.now();
```

Renderer logic each frame:

```typescript
function getRenderOpacities(state: RulerState, now: number) {
  if (state.previousStep === null || state.crossfadeStartedAt === null) {
    return { current: 1, previous: 0, isAnimating: false };
  }
  const elapsed = now - state.crossfadeStartedAt;
  if (elapsed >= CROSSFADE_DURATION_MS) {
    return { current: 1, previous: 0, isAnimating: false };
  }
  const t = elapsed / CROSSFADE_DURATION_MS;
  return { current: t, previous: 1 - t, isAnimating: true };
}
```

During animation, draw both tick sets:
- Previous step at `previous` opacity (fading out)
- Current step at `current` opacity (fading in)

When `isAnimating === false`, set `previousStep = null` and clear `crossfadeStartedAt`.

The render loop must request another frame while `isAnimating === true`.

---

## 6. Guide rendering

### Global guides

Draw a dashed line (4px on, 3px off) across the full viewport:
- Horizontal guide (axis `'y'`): `x: RULER_SIZE → canvas.width` at `sy = worldToScreenY(guide.position, ctx)`
- Vertical guide (axis `'x'`): `y: RULER_SIZE → canvas.height` at `sx = worldToScreenX(guide.position, ctx)`

### Scene-scoped guides

Scene-scoped guides store position in **scene-local coordinates**. Convert to world before screen transforms:

```typescript
function sceneLocalToWorld(guide: Guide, scene: Scene): number {
  return guide.axis === 'x'
    ? scene.bbox.x + guide.position
    : scene.bbox.y + guide.position;
}
```

Render across the full viewport in two visual segments — solid inside the scene, dashed outside:

```typescript
function drawSceneGuide(guide: Guide, scene: Scene, ctx: CanvasContext, canvas: HTMLCanvasElement) {
  const worldPos = sceneLocalToWorld(guide, scene);
  const screenBbox = {
    x: worldToScreenX(scene.bbox.x, ctx),
    y: worldToScreenY(scene.bbox.y, ctx),
    w: scene.bbox.width * ctx.zoom,
    h: scene.bbox.height * ctx.zoom,
  };

  if (guide.axis === 'x') {
    const sx = worldToScreenX(worldPos, ctx);
    if (sx < RULER_SIZE || sx > canvas.width) return;
    // Dashed: top of canvas to scene top edge
    drawDashedLine(sx, RULER_SIZE, sx, Math.max(RULER_SIZE, screenBbox.y));
    // Solid: within scene bounds
    drawSolidLine(sx, Math.max(RULER_SIZE, screenBbox.y), sx, Math.min(canvas.height, screenBbox.y + screenBbox.h));
    // Dashed: scene bottom edge to bottom of canvas
    drawDashedLine(sx, Math.min(canvas.height, screenBbox.y + screenBbox.h), sx, canvas.height);
  } else {
    const sy = worldToScreenY(worldPos, ctx);
    if (sy < RULER_SIZE || sy > canvas.height) return;
    // Dashed: left of canvas to scene left edge
    drawDashedLine(RULER_SIZE, sy, Math.max(RULER_SIZE, screenBbox.x), sy);
    // Solid: within scene bounds
    drawSolidLine(Math.max(RULER_SIZE, screenBbox.x), sy, Math.min(canvas.width, screenBbox.x + screenBbox.w), sy);
    // Dashed: scene right edge to right of canvas
    drawDashedLine(Math.min(canvas.width, screenBbox.x + screenBbox.w), sy, canvas.width, sy);
  }
}
```

No clipping context needed. The solid/dashed segments communicate scope visually.

---

## 7. Interaction layer

### Hit testing

```typescript
function hitTest(sx: number, sy: number): HitTarget {
  // Corner
  if (sx < RULER_SIZE && sy < RULER_SIZE) return { kind: 'corner' };
  // Top ruler
  if (sy < RULER_SIZE) return { kind: 'top-ruler' };
  // Left ruler
  if (sx < RULER_SIZE) return { kind: 'left-ruler' };
  // Guide (4px hit slop)
  const guide = findGuideAt(sx, sy, /* slop */ 4);
  if (guide) return { kind: 'guide', guideId: guide.id };
  return { kind: 'canvas' };
}
```

### Drag state machine

```typescript
type DragState =
  | { kind: 'none' }
  | { kind: 'creating-guide'; axis: Axis; guideId: string }
  | { kind: 'moving-guide'; guideId: string };
```

### Mousedown branches

| Hit | Action |
|---|---|
| `corner` | No drag action; right-click opens context menu |
| `top-ruler` | Create horizontal guide (axis `'y'`) at cursor Y; enter `creating-guide` |
| `left-ruler` | Create vertical guide (axis `'x'`) at cursor X; enter `creating-guide` |
| `guide` | Enter `moving-guide` |
| `canvas` | Let event fall through to host pan/zoom handler |

### Scope assignment at guide creation

```typescript
function determineScope(currentSelection: Selection | null): GuideScope {
  if (currentSelection?.sceneId) {
    return { kind: 'scene', sceneId: currentSelection.sceneId };
  }
  return { kind: 'global' };
}
```

Scene-scoped guides store position in scene-local coordinates. At creation time:

```typescript
// For axis 'x' (vertical guide, from left ruler):
guide.position = screenToWorldX(sx, ctx) - scene.bbox.x;
// For axis 'y' (horizontal guide, from top ruler):
guide.position = screenToWorldY(sy, ctx) - scene.bbox.y;
```

Global guides store position in world coordinates directly.

### Drag-to-delete

On mouseup during `moving-guide` or `creating-guide`:

```typescript
const hit = hitTest(mouseX, mouseY);
if ((guide.axis === 'y' && hit.kind === 'top-ruler') ||
    (guide.axis === 'x' && hit.kind === 'left-ruler')) {
  deleteGuide(guide.id);
}
```

---

## 8. Keyboard shortcut

```typescript
function handleKeydown(e: KeyboardEvent) {
  // Cmd+; on macOS, Ctrl+; on Windows/Linux
  const modifierPressed = e.metaKey || e.ctrlKey;
  if (modifierPressed && e.key === ';') {
    e.preventDefault();
    state.guidesVisible = !state.guidesVisible;
    requestRedraw();
  }
}
```

Attach to `window` when the canvas has focus; detach when it loses focus.

---

## 9. Context menu

A small React component rendered at the cursor position on right-click. Single item: "Hide guides" / "Show guides" (toggles based on current state). Closes on any subsequent click or Escape.

**Scope:** The context menu only opens when right-click hits the ruler area — that is, when `hitTest()` returns `top-ruler`, `left-ruler`, or `corner`. Right-click on the canvas body falls through to the host application's own context menu handler.

```typescript
function handleContextMenu(e: MouseEvent) {
  const p = pointerPos(e);
  const hit = hitTest(p.x, p.y);
  if (hit.kind === 'top-ruler' || hit.kind === 'left-ruler' || hit.kind === 'corner') {
    e.preventDefault();
    showContextMenu(p.x, p.y);
  }
  // Otherwise let the event bubble to the host
}
```

---

## 10. Rendering architecture

### Layer order (bottom to top)

1. Existing canvas content (host renders)
2. Guides (this system, behind rulers but above content)
3. Rulers + corner
4. Cursor markers (overlay on rulers)
5. Context menu (DOM, not canvas)

### Render loop integration

The host calls a single `renderRulerGuides(ctx, hostCtx, state)` function each frame after rendering scene content. Internally that function calls:

```
drawGuides(ctx, state, hostCtx)
drawRulers(ctx, state, hostCtx, opacities)
drawCorner(ctx, state)
```

### High-DPI handling

Multiply canvas backing-store size by `window.devicePixelRatio`. Apply `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` before any drawing. All coordinates remain in CSS pixels.

### Crisp lines

Offset 1px lines by 0.5 (`Math.round(x) + 0.5`) so they fall on pixel boundaries and don't blur.

---

## 11. Performance budget

- Tick rendering must complete in ≤ 2ms per frame on 1× zoom, default viewport.
- Guide rendering must remain O(n) where n = number of guides; no per-guide allocations in the hot path.
- Crossfade adds one additional tick pass; budget 4ms total during animation.
- 50+ guides on screen should not drop frames during pan or zoom.
