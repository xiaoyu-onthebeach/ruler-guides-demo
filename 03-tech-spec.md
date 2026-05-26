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
  | { kind: 'default' }                         // world (0,0)
  | { kind: 'selection'; x: number; y: number }; // auto-shifted to scene top-left

interface RulerState {
  origin: OriginMode;
  guidesVisible: boolean;   // false = rulers and guides both hidden
  currentStep: number;       // active major-tick step (world px)
  previousStep: number | null;
  crossfadeStartedAt: number | null; // performance.now()
}

interface Scene {
  id: string;
  name: string;
  bbox: { x: number; y: number; width: number; height: number };
}

interface ImageLayer {
  id: string;
  sceneId: string;
  x: number;       // scene-local px
  y: number;
  width: number;
  height: number;
  bitmap: ImageBitmap;
}
```

### Drag state

```typescript
type ActiveDrag =
  | { kind: 'none' }
  | { kind: 'panning'; startX: number; startY: number; startPanX: number; startPanY: number }
  | { kind: 'moving-scene'; sceneId: string; startX: number; startY: number; startBboxX: number; startBboxY: number }
  | { kind: 'creating-guide'; axis: Axis; guideId: string }
  | { kind: 'creating-cross-guide'; xGuideId: string; yGuideId: string }
  | { kind: 'moving-guide'; guideId: string }
  | { kind: 'moving-image'; imageId: string; sceneId: string; startX: number; startY: number; startImgX: number; startImgY: number };
```

### Persistence

- Guides persist to the canvas document (same lifecycle as scenes and layers).
- Scene-scoped guides serialize as children of their scene.
- Global guides serialize at the document root under `guides: Guide[]`.
- Guide create, move, and delete operations push entries onto the host document's undo/redo stack.
- `RulerState` is session-only — visibility resets to `guidesVisible: true` on document open, origin resets to default.

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

// Screen-space transforms
function worldToScreenX(wx: number, vp: ViewportCtx): number {
  return RULER_SIZE + (wx - vp.panX) * vp.zoom;
}
function worldToScreenY(wy: number, vp: ViewportCtx): number {
  return RULER_SIZE + (wy - vp.panY) * vp.zoom;
}
function screenToWorldX(sx: number, vp: ViewportCtx): number {
  return vp.panX + (sx - RULER_SIZE) / vp.zoom;
}
function screenToWorldY(sy: number, vp: ViewportCtx): number {
  return vp.panY + (sy - RULER_SIZE) / vp.zoom;
}
```

`RULER_SIZE = 24` (constant). All coordinates remain in CSS pixels; high-DPI handled via `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`.

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

- The origin state machine watches `selection.sceneId`. It responds only when `sceneId` changes value.
- Layer selection within the same scene does not change `sceneId` and therefore does not shift the origin.
- When `sceneId` becomes non-null, transition to `selection` and set origin to the scene's `bbox` top-left.
- When `sceneId` becomes null, return to `default` `(0, 0)`.
- Switching directly from scene A to scene B updates the `selection` origin to the new scene's bbox.
- `Cmd/Ctrl + Alt + R` returns the origin to `default` from any state.

---

## 5. Crossfade transition

When `pickStep(newZoom) !== pickStep(oldZoom)`:

```typescript
const CROSSFADE_DURATION_MS = 150;

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

### API

```typescript
function drawGuides(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  guides: Guide[],
  viewport: ViewportCtx,
  activeId: string | null,
  scenes: Scene[],
  pendingDeleteId: string | null,
  creatingIds: Set<string>,   // guides currently being dragged out (before mouseup)
): void
```

`creatingIds` drives the full-solid-line visual during guide creation. A guide in `creatingIds` is always treated as active (regardless of `activeId`) and uses the "creating" render path in `drawSceneGuide`.

### Guide creation visual state

While a guide is in `creatingIds` (being dragged from the ruler or corner):

1. If the guide position is **outside** the scene's bounding span → draw **full solid line** across the entire viewport and return early.
2. If the guide position is **inside** the scene's bounding span → draw solid-within-scene + dashed-outside-scene (same as the at-rest active state).

This produces a clean transition: the guide appears as a full solid line immediately on drag, then the outside portions become dashed once the cursor enters the scene frame.

### Global guides

Draw a solid line across the canvas area:
- Horizontal guide (axis `'y'`): `x: RULER_SIZE → width` at `sy = worldToScreenY(guide.position, vp)`
- Vertical guide (axis `'x'`): `y: RULER_SIZE → height` at `sx = worldToScreenX(guide.position, vp)`

### Scene-scoped guides

Scene-scoped guides store position in **scene-local coordinates**. Convert to world before screen transforms:

```typescript
function guideWorldCoord(guide: Guide, scenes: Scene[]): number {
  const scope = guide.scope;
  if (scope.kind === 'global') return guide.position;
  const scene = scenes.find(s => s.id === scope.sceneId);
  if (!scene) return guide.position;
  return guide.position + (guide.axis === 'x' ? scene.bbox.x : scene.bbox.y);
}
```

At rest, render in two visual segments — solid inside the scene, dashed outside:

```typescript
function drawSceneGuide(ctx, guide, width, height, viewport, scene, isActive, isCreating) {
  const worldPos = guide.position + (guide.axis === 'x' ? scene.bbox.x : scene.bbox.y);

  if (guide.axis === 'x') {
    const sx = Math.round(worldToScreenX(worldPos, viewport)) + 0.5;
    if (sx < RULER_SIZE || sx > width) return;

    // Creating and outside scene span → full solid line
    if (isCreating && (worldPos < scene.bbox.x || worldPos > scene.bbox.x + scene.bbox.width)) {
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(sx, RULER_SIZE); ctx.lineTo(sx, height); ctx.stroke();
      return;
    }

    const sceneTop    = worldToScreenY(scene.bbox.y, viewport);
    const sceneBot    = worldToScreenY(scene.bbox.y + scene.bbox.height, viewport);
    const clampedTop  = Math.max(RULER_SIZE, sceneTop);
    const clampedBot  = Math.min(height, sceneBot);

    // Solid segment within scene
    if (clampedTop < clampedBot) {
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(sx, clampedTop); ctx.lineTo(sx, clampedBot); ctx.stroke();
    }

    // Dashed extensions outside scene (only when active/creating)
    if (isActive) {
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      if (clampedTop > RULER_SIZE) { ctx.moveTo(sx, RULER_SIZE); ctx.lineTo(sx, clampedTop); }
      if (clampedBot < height)     { ctx.moveTo(sx, clampedBot); ctx.lineTo(sx, height); }
      ctx.stroke();
    }
  }
  // (mirror logic for axis 'y')
}
```

### Guide ruler labels

When a guide is active, draw its coordinate value inside the ruler band on top of the ruler ticks:

```typescript
function drawGuideRulerLabels(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  guides: Guide[],
  activeId: string | null,
  viewport: ViewportCtx,
  rulerState: RulerState,
  scenes: Scene[],
): void
```

The label background uses a horizontal or vertical gradient that fades from the ruler background color to transparent, so the label floats cleanly over ticks without a hard box.

---

## 7. Interaction layer

### Hit testing

```typescript
function hitTest(
  sx: number,
  sy: number,
  guides: Guide[],
  viewport: ViewportCtx,
  guidesVisible: boolean,
  scenes: Scene[],
): HitTarget

type HitTarget =
  | { kind: 'corner' }
  | { kind: 'top-ruler' }
  | { kind: 'left-ruler' }
  | { kind: 'guide'; guideId: string }
  | { kind: 'canvas' };
```

- `corner`: `sx < RULER_SIZE && sy < RULER_SIZE`
- `top-ruler`: `sy < RULER_SIZE`
- `left-ruler`: `sx < RULER_SIZE`
- `guide`: guide center within 4px slop of pointer (only when `guidesVisible`)
- `canvas`: fallthrough

### Context menu dispatch

Context menu behavior depends on ruler visibility and which zone was right-clicked:

```typescript
function onContextMenu(e: MouseEvent) {
  const { sx, sy } = deviceToCSS(e);

  if (!rulersVisible) {
    // Rulers hidden: only the 16px edge strips trigger "Show rulers"
    if (sx <= 16 || sy <= 16) {
      showContextMenu(e.clientX, e.clientY, 'main');  // renders "Show rulers" only
    }
    return;
  }

  e.preventDefault();
  const hit = hitTest(sx, sy, guides, viewport, guidesVisible, scenes);
  if (hit.kind === 'left-ruler') {
    showContextMenu(e.clientX, e.clientY, 'left-ruler');
  } else {
    showContextMenu(e.clientX, e.clientY, 'main');
  }
}
```

Context menu item sets:

| `kind` | Rulers visible | Items |
|---|---|---|
| `'main'` | Yes | "Hide rulers" (⌘R) · separator · "Remove all horizontal guides" |
| `'left-ruler'` | Yes | "Hide rulers" (⌘R) · separator · "Remove all vertical guides" |
| `'main'` | No | "Show rulers" (⌘R) |

### Mousedown branches

| Hit | Action |
|---|---|
| `corner` | Create `creating-cross-guide` drag: create one `'x'` guide and one `'y'` guide, both scoped to the active scene |
| `top-ruler` | Create `'y'` guide (horizontal), enter `creating-guide` drag |
| `left-ruler` | Create `'x'` guide (vertical), enter `creating-guide` drag |
| `guide` | Enter `moving-guide` drag |
| `canvas` (on scene body) | Enter `moving-scene` or `panning` drag depending on target |
| `canvas` (on image) | Enter `moving-image` drag |
| `canvas` (empty) | Enter `panning` drag |

### Scope assignment at guide creation

```typescript
function determineScope(selectedScene: Scene | null): GuideScope {
  if (selectedScene) return { kind: 'scene', sceneId: selectedScene.id };
  return { kind: 'global' };
}
```

Scene-scoped guides store position in scene-local coordinates:

```typescript
// Vertical guide (axis 'x'), created from left ruler:
guide.position = screenToWorldX(sx, vp) - scene.bbox.x;
// Horizontal guide (axis 'y'), created from top ruler:
guide.position = screenToWorldY(sy, vp) - scene.bbox.y;
```

Global guides store position in world coordinates directly.

### Cross-guide creation

```typescript
// Corner mousedown
const scope = determineScope(selectedScene);
const wxPos = screenToWorldX(sx, vp);
const wyPos = screenToWorldY(sy, vp);
const gX = createGuide('x', scene ? wxPos - scene.bbox.x : wxPos, scope);
const gY = createGuide('y', scene ? wyPos - scene.bbox.y : wyPos, scope);
guides = [...guides, gX, gY];
drag = { kind: 'creating-cross-guide', xGuideId: gX.id, yGuideId: gY.id };

// Mousemove during creating-cross-guide
const xGuide = guides.find(g => g.id === drag.xGuideId);
const yGuide = guides.find(g => g.id === drag.yGuideId);
// Move xGuide to current cursor X, yGuide to current cursor Y
// (scope narrowing required: const scope = g.scope; if (scope.kind === 'scene') ...)
```

### Drag-to-delete

On mouseup during `moving-guide` or `creating-guide`:

```typescript
const hit = hitTest(mouseX, mouseY, ...);
if ((guide.axis === 'y' && hit.kind === 'top-ruler') ||
    (guide.axis === 'x' && hit.kind === 'left-ruler')) {
  deleteGuide(guide.id);
}
```

During the drag, when the guide crosses back into ruler territory, it enters a **pending delete** visual state: rendered in gray at 30% opacity, clamped to the ruler edge.

---

## 8. Keyboard shortcuts

```typescript
export interface ShortcutHandlers {
  onResetOrigin: () => void;    // Cmd/Ctrl + Alt + R
  onToggleRulers: () => void;   // Cmd/Ctrl + R
}

function handleKeydown(e: KeyboardEvent) {
  const mod = e.metaKey || e.ctrlKey;

  // Cmd/Ctrl + R — toggle rulers (check !altKey first to avoid overlap)
  if (mod && !e.altKey && e.code === 'KeyR') {
    e.preventDefault();
    handlers.onToggleRulers();
    return;
  }

  // Cmd/Ctrl + Alt + R — reset origin
  if (mod && e.altKey && e.code === 'KeyR') {
    e.preventDefault();
    handlers.onResetOrigin();
  }
}
```

Attach to `window`; detach on component unmount.

### Ruler toggle behavior

Toggling rulers updates both the render flag and `rulerState.guidesVisible` together:

```typescript
function toggleRulers() {
  rulersVisible = !rulersVisible;
  rulerState = { ...rulerState, guidesVisible: rulersVisible };
  scheduleRender();
}
```

This ensures the interaction layer (`hitTest`) and renderer are in sync — `hitTest` reads `guidesVisible` to suppress guide hits when rulers/guides are hidden.

---

## 9. Rendering architecture

### Render loop

All mutable state lives in refs. React state is used only for UI elements that need React re-renders (context menu open/close, toggle button labels). The canvas render is driven by an RAF loop with deduplication:

```typescript
let rafPending = false;
function scheduleRender() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    renderFrame();
  });
}
```

### Frame render order (bottom to top)

```
1. Canvas background
   └─ When rulers hidden: fill full viewport
   └─ When rulers visible: fill from (RULER_SIZE, RULER_SIZE)

2. Scene bodies pass (all scenes)
   └─ Body background fill
   └─ Dot grid
   └─ Image layers (drawImage for each ImageLayer in scene order)

3. Scene-scoped guides
   └─ drawGuides(ctx, ..., guides.filter(g => g.scope.kind === 'scene'), ..., creatingIds)

4. Scene frames pass (all scenes)
   └─ Outer fill with evenodd rule (punches body-sized hole; gray header visible, body transparent)
   └─ Scene name label
   └─ Border stroke

5. Global guides
   └─ drawGuides(ctx, ..., guides.filter(g => g.scope.kind === 'global'), ..., creatingIds)

6. Rulers (conditional on rulersVisible)
   └─ drawRulers(ctx, width, height, rulerState, viewport, now, minorTicks, showNumbers)
   └─ drawSceneRulerHighlight (when scene selected)

7. Guide ruler labels (conditional on rulersVisible && activeGuideId !== null)
   └─ drawGuideRulerLabels(ctx, ...)
```

### `creatingIds` set

Built before each guide draw call:

```typescript
const creatingIds = new Set<string>();
if (drag.kind === 'creating-guide') {
  creatingIds.add(drag.guideId);
} else if (drag.kind === 'creating-cross-guide') {
  creatingIds.add(drag.xGuideId);
  creatingIds.add(drag.yGuideId);
}
```

### Scene evenodd fill

The scene frame "header" area (outer padding above the body) uses Canvas2D's evenodd fill rule to punch a hole for the body, allowing guides to show through the body while being covered by the frame chrome:

```typescript
ctx.beginPath();
ctx.roundRect(outerX, outerY, outerW, outerH, radius);  // outer frame path
ctx.rect(bodyX, bodyY, bodyW, bodyH);                    // body hole path
ctx.fillStyle = SCENE_FILL;
ctx.fill('evenodd');
```

### Ruler API

```typescript
function drawRulers(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  rulerState: RulerState,
  viewport: ViewportCtx,
  now: number,
  minorTicks: boolean = true,    // toggle minor tick marks
  showNumbers: boolean = true,   // toggle number labels
): { isAnimating: boolean }
```

Both `minorTicks` and `showNumbers` are threaded through the crossfade tick passes so both the fading-out and fading-in layers honor the same display flags.

### High-DPI handling

```typescript
const dpr = window.devicePixelRatio;
canvas.width  = cssWidth  * dpr;
canvas.height = cssHeight * dpr;
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
// All subsequent draws use CSS pixel coordinates
```

### Crisp lines

Offset 1px lines by 0.5:

```typescript
function crisp(n: number): number { return Math.round(n) + 0.5; }
```

---

## 10. Toggle controls

Two boolean refs are maintained alongside React state for the toggle buttons:

```typescript
const minorTicksRef  = useRef(true);
const showNumbersRef = useRef(true);
const [minorTicks, setMinorTicks]   = useState(true);
const [showNumbers, setShowNumbers] = useState(true);
```

The ref is the authoritative value read during render. The state copy exists only to trigger a React re-render of the button label on click.

---

## 11. Performance budget

- Tick rendering must complete in ≤ 2ms per frame on 1× zoom, default viewport.
- Guide rendering must remain O(n) where n = number of guides; no per-guide allocations in the hot path.
- Crossfade adds one additional tick pass; budget 4ms total during animation.
- 50+ guides on screen should not drop frames during pan or zoom.
- Scene frame evenodd fill adds one `fill('evenodd')` call per scene per frame — acceptable at typical scene counts (< 20).
