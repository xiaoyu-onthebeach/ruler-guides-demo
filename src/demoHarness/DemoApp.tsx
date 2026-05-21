import React, { useRef, useEffect, useCallback, useState } from 'react';
import { drawRulers, drawSceneRulerHighlight } from '../rulerGuides/rulerRenderer';
import { drawGuides, drawGuideRulerLabels } from '../rulerGuides/guideRenderer';
import { RULER_SIZE, screenToWorldX, screenToWorldY, worldToScreenX, worldToScreenY } from '../rulerGuides/coordinateSystem';
import { originFromSceneId, resetOrigin } from '../rulerGuides/originSystem';
import { attachShortcuts } from '../rulerGuides/keyboardShortcuts';
import { updateStep, clearCrossfade } from '../rulerGuides/crossfade';
import { createGuide, deleteGuide } from '../rulerGuides/guideStore';
import {
  hitTest,
  findGuideAt,
  guideWorldPos,
  isDropOnSourceRuler,
  guideCursor,
  type GuideDragState,
} from '../rulerGuides/interactionLayer';
import type { RulerState, Scene, Guide, Axis } from '../rulerGuides/types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Viewport { zoom: number; panX: number; panY: number; }

type PanDrag = {
  kind: 'pan';
  startClientX: number; startClientY: number;
  startPanX: number; startPanY: number;
  startZoom: number;
};

type SceneDrag = {
  kind: 'moving-scene';
  sceneId: string;
  startClientX: number; startClientY: number;
  startBBoxX: number; startBBoxY: number;
  startZoom: number;
};

type ImageDrag = {
  kind: 'moving-image';
  imageId: string;
  startClientX: number; startClientY: number;
  startX: number; startY: number;
  startZoom: number;
};

type ActiveDrag = { kind: 'none' } | PanDrag | SceneDrag | GuideDragState | ImageDrag;

interface ImageLayer {
  id: string;
  sceneId: string;
  x: number;       // scene-local world px (from scene.bbox.x)
  y: number;       // scene-local world px (from scene.bbox.y)
  width: number;   // world-space px
  height: number;  // world-space px
  bitmap: ImageBitmap;
}

function makeId(): string { return Math.random().toString(36).slice(2, 9); }

function findImageAt(wx: number, wy: number, images: ImageLayer[], scenes: Scene[]): ImageLayer | null {
  for (let i = images.length - 1; i >= 0; i--) {
    const img = images[i];
    const scene = scenes.find(s => s.id === img.sceneId);
    if (!scene) continue;
    if (wx >= scene.bbox.x + img.x && wx <= scene.bbox.x + img.x + img.width &&
        wy >= scene.bbox.y + img.y && wy <= scene.bbox.y + img.y + img.height) return img;
  }
  return null;
}

// ── Context menu item ─────────────────────────────────────────────────────────

function MenuItem({ label, shortcut, onClick }: { label: string; shortcut?: string; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseDown={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '9px 10px', borderRadius: '6px', cursor: 'default',
        background: hovered ? 'rgba(255,255,255,0.06)' : 'transparent',
        color: '#ffffff', fontSize: '13px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <span>{label}</span>
      {shortcut && <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '12px' }}>{shortcut}</span>}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DemoApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const vpRef         = useRef<Viewport>({ zoom: 1, panX: -60, panY: -60 });
  const rulerStateRef = useRef<RulerState>({
    origin: { kind: 'default' },
    guidesVisible: true,
    currentStep: 100,
    previousStep: null,
    crossfadeStartedAt: null,
  });
  const scenesRef          = useRef<Scene[]>([
    { id: 'scene-1', bbox: { x: 0,   y: 0,   width: 400, height: 400 } },
    { id: 'scene-2', bbox: { x: 500, y: 100, width: 400, height: 400 } },
  ]);
  const guidesRef           = useRef<Guide[]>([]);
  const imageLayersRef      = useRef<ImageLayer[]>([]);
  const hoveredGuideIdRef   = useRef<string | null>(null);
  const selectedSceneIdRef  = useRef<string | null>(null);
  const dragRef             = useRef<ActiveDrag>({ kind: 'none' });
  const pendingDeleteRef    = useRef<boolean>(false);
  const rafRef              = useRef<number | null>(null);
  const genSettingsPanelRef = useRef<HTMLDivElement>(null);
  const rulersVisibleRef    = useRef<boolean>(true);

  const [ctxMenu, setCtxMenu] = useState<{ open: boolean; x: number; y: number }>({ open: false, x: 0, y: 0 });

  // ── Render ──────────────────────────────────────────────────────────────────

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr  = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;

    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width  = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const { zoom, panX, panY } = vpRef.current;
    const vp = { zoom, panX, panY };
    const selectedId = selectedSceneIdRef.current;
    const scenes = scenesRef.current;

    // 1. Canvas background
    ctx.fillStyle = '#040406';
    if (rulersVisibleRef.current) {
      ctx.fillRect(RULER_SIZE, RULER_SIZE, cssW - RULER_SIZE, cssH - RULER_SIZE);
    } else {
      ctx.fillRect(0, 0, cssW, cssH);
    }

    // 2. Scenes
    for (const scene of scenes) {
      const sx = worldToScreenX(scene.bbox.x, vp);
      const sy = worldToScreenY(scene.bbox.y, vp);
      const sw = scene.bbox.width  * zoom;
      const sh = scene.bbox.height * zoom;
      if (sx + sw < RULER_SIZE || sy + sh < RULER_SIZE || sx > cssW || sy > cssH) continue;

      const isSelected = scene.id === selectedId;
      const outerRadius = Math.min(16 * zoom, sw / 2, sh / 2);

      // ── Outer container (name header area) ──────────────────────────────────
      ctx.beginPath();
      ctx.roundRect(sx, sy, sw, sh, outerRadius);
      ctx.fillStyle = '#131316';
      ctx.fill();

      const pad =  12* zoom;            // 24 world-px padding (scales with zoom)
      const NAME_FONT = 12;             // fixed screen-px font size
      const NAME_GAP  = 12;            // fixed screen-px gap between name and body

      // Scene name inside the header area
      if (sw > 2 * pad + 20 && sh > 2 * pad + NAME_FONT + NAME_GAP + 20) {
        ctx.fillStyle    = isSelected ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)';
        ctx.font         = `${NAME_FONT}px system-ui, -apple-system, sans-serif`;
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(scene.id, sx + pad, sy + pad + 4);
      }

      // ── Inner body rectangle ─────────────────────────────────────────────────
      const bodyX = sx + pad;
      const bodyY = sy + pad + 4 + NAME_FONT + NAME_GAP;
      const bodyW = sw - 2 * pad;
      const bodyH = sh - pad - 4 - NAME_FONT - NAME_GAP - pad;
      const bodyRadius = 0;

      if (bodyW > 20 && bodyH > 20) {
        // Body background
        ctx.beginPath();
        ctx.roundRect(bodyX, bodyY, bodyW, bodyH, bodyRadius);
        ctx.fillStyle = '#000000';
        ctx.fill();

        // Centered dot grid inside body
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(bodyX, bodyY, bodyW, bodyH, bodyRadius);
        ctx.clip();
        const dotGap = 20 * zoom;
        if (dotGap >= 4) {
          const offX  = (bodyW % dotGap) / 2;
          const offY  = (bodyH % dotGap) / 2;
          const iEnd  = Math.floor(bodyW / dotGap);
          const jEnd  = Math.floor(bodyH / dotGap);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
          ctx.beginPath();
          for (let i = 0; i <= iEnd; i++) {
            for (let j = 0; j <= jEnd; j++) {
              const dx = bodyX + offX + i * dotGap;
              const dy = bodyY + offY + j * dotGap;
              ctx.moveTo(dx + 1.5, dy);
              ctx.arc(dx, dy, 1.5, 0, Math.PI * 2);
            }
          }
          ctx.fill();
        }
        ctx.restore();

        // Images — drawn on top of dots, clipped to body rect
        const sceneImages = imageLayersRef.current.filter(img => img.sceneId === scene.id);
        if (sceneImages.length > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(bodyX, bodyY, bodyW, bodyH);
          ctx.clip();
          for (const img of sceneImages) {
            const imgSx = worldToScreenX(scene.bbox.x + img.x, vp);
            const imgSy = worldToScreenY(scene.bbox.y + img.y, vp);
            ctx.drawImage(img.bitmap, imgSx, imgSy, img.width * zoom, img.height * zoom);
          }
          ctx.restore();
        }
      }

      // ── Outer border (drawn last, on top) ────────────────────────────────────
      ctx.beginPath();
      ctx.roundRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1, Math.max(0, outerRadius - 0.5));
      ctx.strokeStyle = isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // 3. Guides (behind rulers)
    const activeDrag = dragRef.current;
    const activeGuideId =
      (activeDrag.kind === 'creating-guide' || activeDrag.kind === 'moving-guide')
        ? activeDrag.guideId
        : hoveredGuideIdRef.current;
    const pendingDeleteGuideId = pendingDeleteRef.current ? activeGuideId : null;
    if (rulerStateRef.current.guidesVisible) {
      drawGuides(ctx, cssW, cssH, guidesRef.current, vp, activeGuideId, scenes, pendingDeleteGuideId);
    }

    // 4. Rulers
    if (rulersVisibleRef.current) {
      const { isAnimating } = drawRulers(ctx, cssW, cssH, rulerStateRef.current, vp, performance.now());
      if (isAnimating) {
        scheduleRender();
      } else {
        rulerStateRef.current = clearCrossfade(rulerStateRef.current);
      }
    }

    // 4a. Scene ruler highlight + generation panel position
    const selectedScene = selectedId ? scenes.find(s => s.id === selectedId) ?? null : null;
    if (selectedScene && rulersVisibleRef.current) {
      drawSceneRulerHighlight(ctx, cssW, cssH, selectedScene, vp, rulerStateRef.current);
    }
    const genPanel = genSettingsPanelRef.current;
    if (genPanel) {
      if (selectedScene) {
        const psx = worldToScreenX(selectedScene.bbox.x, vp);
        const psy = worldToScreenY(selectedScene.bbox.y, vp);
        const psw = selectedScene.bbox.width * zoom;
        genPanel.style.left    = `${psx + psw + 16}px`;
        genPanel.style.top     = `${psy}px`;
        genPanel.style.display = 'flex';
      } else {
        genPanel.style.display = 'none';
      }
    }

    // 4b. Guide ruler labels — suppressed when guide is in delete zone or rulers hidden
    if (rulersVisibleRef.current) {
      drawGuideRulerLabels(ctx, cssW, cssH, guidesRef.current, pendingDeleteGuideId ? null : activeGuideId, vp, rulerStateRef.current, scenes);
    }

  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const scheduleRender = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      render();
    });
  }, [render]);

  // ── Resize ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    const obs = new ResizeObserver(() => scheduleRender());
    if (canvasRef.current) obs.observe(canvasRef.current);
    scheduleRender();
    return () => obs.disconnect();
  }, [scheduleRender]);

  // ── Wheel → zoom (anchored to cursor) ────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const { zoom, panX, panY } = vpRef.current;
      const wx = screenToWorldX(cx, { zoom, panX, panY });
      const wy = screenToWorldY(cy, { zoom, panX, panY });
      const factor  = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const newZoom = Math.min(10, Math.max(0.1, zoom * factor));
      vpRef.current = {
        zoom: newZoom,
        panX: wx - (cx - RULER_SIZE) / newZoom,
        panY: wy - (cy - RULER_SIZE) / newZoom,
      };
      rulerStateRef.current = updateStep(rulerStateRef.current, newZoom);
      scheduleRender();
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [scheduleRender]);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────

  useEffect(() => {
    return attachShortcuts({
      onResetOrigin: () => {
        selectedSceneIdRef.current  = null;
        rulerStateRef.current       = resetOrigin(rulerStateRef.current);
        scheduleRender();
      },
      onToggleRulers: () => {
        rulersVisibleRef.current = !rulersVisibleRef.current;
        rulerStateRef.current = { ...rulerStateRef.current, guidesVisible: rulersVisibleRef.current };
        scheduleRender();
      },
    });
  }, [scheduleRender]);

  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCtxMenu(m => ({ ...m, open: false }));
    };
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  }, []);

  // ── Scene selection ──────────────────────────────────────────────────────────

  const setSceneSelection = useCallback((sceneId: string | null) => {
    if (sceneId === selectedSceneIdRef.current) return;
    selectedSceneIdRef.current = sceneId;
    rulerStateRef.current = originFromSceneId(rulerStateRef.current, sceneId, scenesRef.current);
    scheduleRender();
  }, [scheduleRender]);

  // ── Context menu ────────────────────────────────────────────────────────────

  const onContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(e.clientX - rect.left, rect.width  - 218);
    const y = Math.min(e.clientY - rect.top,  rect.height -  88);
    setCtxMenu({ open: true, x: Math.max(4, x), y: Math.max(4, y) });
  }, []);

  // ── Drag-and-drop images ─────────────────────────────────────────────────────

  const onDragOver = useCallback((e: React.DragEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDrop = useCallback((e: React.DragEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const vp = vpRef.current;
    const wx = screenToWorldX(sx, vp);
    const wy = screenToWorldY(sy, vp);
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    for (const file of files) {
      createImageBitmap(file).then(bitmap => {
        const scene = scenesRef.current.find(s =>
          wx >= s.bbox.x && wx <= s.bbox.x + s.bbox.width &&
          wy >= s.bbox.y && wy <= s.bbox.y + s.bbox.height,
        );
        if (!scene) { bitmap.close(); return; }
        // Fit image into the scene body area (approx: pad=12 world each side, header=40 world)
        const bodyW = scene.bbox.width - 24;
        const bodyH = scene.bbox.height - 52;
        const scale = Math.min(1, bodyW / bitmap.width, bodyH / bitmap.height);
        const imgW = bitmap.width * scale;
        const imgH = bitmap.height * scale;
        imageLayersRef.current = [...imageLayersRef.current, {
          id: makeId(),
          sceneId: scene.id,
          x: 12 + (bodyW - imgW) / 2,
          y: 40 + (bodyH - imgH) / 2,
          width: imgW,
          height: imgH,
          bitmap,
        }];
        scheduleRender();
      });
    }
  }, [scheduleRender]);

  // ── Mouse events ─────────────────────────────────────────────────────────────

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const vp = vpRef.current;
    const rs = rulerStateRef.current;
    const scenes = scenesRef.current;

    const hit = hitTest(sx, sy, guidesRef.current, vp, rs.guidesVisible, scenes);

    if (hit.kind === 'top-ruler') {
      const axis: Axis = 'y';
      const worldPos = guideWorldPos(sx, sy, axis, vp);
      const selId    = selectedSceneIdRef.current;
      const scene    = selId ? scenes.find(s => s.id === selId) : undefined;
      const scope    = scene ? { kind: 'scene' as const, sceneId: scene.id } : { kind: 'global' as const };
      const pos      = scene ? worldPos - scene.bbox.y : worldPos;
      const g        = createGuide(axis, pos, scope);
      guidesRef.current = [...guidesRef.current, g];
      dragRef.current   = { kind: 'creating-guide', guideId: g.id, axis };
      e.currentTarget.style.cursor = guideCursor(axis);
      scheduleRender();
      return;
    }

    if (hit.kind === 'left-ruler') {
      const axis: Axis = 'x';
      const worldPos = guideWorldPos(sx, sy, axis, vp);
      const selId    = selectedSceneIdRef.current;
      const scene    = selId ? scenes.find(s => s.id === selId) : undefined;
      const scope    = scene ? { kind: 'scene' as const, sceneId: scene.id } : { kind: 'global' as const };
      const pos      = scene ? worldPos - scene.bbox.x : worldPos;
      const g        = createGuide(axis, pos, scope);
      guidesRef.current = [...guidesRef.current, g];
      dragRef.current   = { kind: 'creating-guide', guideId: g.id, axis };
      e.currentTarget.style.cursor = guideCursor(axis);
      scheduleRender();
      return;
    }

    if (hit.kind === 'guide') {
      dragRef.current = { kind: 'moving-guide', guideId: hit.guideId, axis: hit.axis };
      e.currentTarget.style.cursor = guideCursor(hit.axis);
      return;
    }

    if (hit.kind === 'canvas') {
      const wx = screenToWorldX(sx, vp);
      const wy = screenToWorldY(sy, vp);
      const overImage = findImageAt(wx, wy, imageLayersRef.current, scenes);
      if (overImage) {
        dragRef.current = {
          kind: 'moving-image',
          imageId: overImage.id,
          startClientX: e.clientX, startClientY: e.clientY,
          startX: overImage.x, startY: overImage.y,
          startZoom: vp.zoom,
        };
        e.currentTarget.style.cursor = 'grabbing';
        return;
      }
      const overScene = scenes.find(s =>
        wx >= s.bbox.x && wx <= s.bbox.x + s.bbox.width &&
        wy >= s.bbox.y && wy <= s.bbox.y + s.bbox.height,
      );
      if (overScene) {
        dragRef.current = {
          kind: 'moving-scene',
          sceneId: overScene.id,
          startClientX: e.clientX, startClientY: e.clientY,
          startBBoxX: overScene.bbox.x, startBBoxY: overScene.bbox.y,
          startZoom: vp.zoom,
        };
      } else {
        dragRef.current = {
          kind: 'pan',
          startClientX: e.clientX, startClientY: e.clientY,
          startPanX: vp.panX, startPanY: vp.panY,
          startZoom: vp.zoom,
        };
      }
      e.currentTarget.style.cursor = 'grabbing';
    }
    // corner: no drag action
  }, [scheduleRender]);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const vp = vpRef.current;
    const drag = dragRef.current;

    // Update cursor world pos in HUD
    if (sx > RULER_SIZE && sy > RULER_SIZE) {
      const wx = screenToWorldX(sx, vp);
      const wy = screenToWorldY(sy, vp);
      const el = document.getElementById('hud-cursor');
      if (el) el.textContent = vp.zoom >= 4
        ? `(${wx.toFixed(1)}, ${wy.toFixed(1)})`
        : `(${Math.round(wx)}, ${Math.round(wy)})`;
    }

    if (drag.kind === 'creating-guide' || drag.kind === 'moving-guide') {
      const worldPos = guideWorldPos(sx, sy, drag.axis, vp);
      const cw = canvasRef.current?.clientWidth  ?? 0;
      const ch = canvasRef.current?.clientHeight ?? 0;

      // Delete zone: guide screen position has left the canvas viewport
      const inDeleteZone = drag.axis === 'x'
        ? sx < RULER_SIZE || sx > cw
        : sy < RULER_SIZE || sy > ch;
      if (inDeleteZone !== pendingDeleteRef.current) {
        pendingDeleteRef.current = inDeleteZone;
        e.currentTarget.style.cursor = inDeleteZone ? 'not-allowed' : guideCursor(drag.axis);
      }

      // Scene-to-global promotion: if dragged outside the scene's bounds, switch scope
      const dragged = guidesRef.current.find(g => g.id === drag.guideId);
      const dscope  = dragged?.scope;
      let pos = worldPos;
      const scopeOverride: Partial<Pick<Guide, 'scope'>> = {};

      if (dscope && dscope.kind === 'scene') {
        const scene = scenesRef.current.find(s => s.id === dscope.sceneId);
        if (scene) {
          const sceneMin  = drag.axis === 'x' ? scene.bbox.x : scene.bbox.y;
          const sceneMax  = sceneMin + (drag.axis === 'x' ? scene.bbox.width : scene.bbox.height);
          const isOutside = worldPos < sceneMin || worldPos > sceneMax;
          if (drag.kind === 'moving-guide' && !inDeleteZone && isOutside) {
            // Already-placed guide dragged outside scene bounds → promote to global
            scopeOverride.scope = { kind: 'global' };
            // pos stays as worldPos
          } else {
            // Initial creation drag, inside scene, or in delete zone → keep scene-local
            pos = worldPos - sceneMin;
          }
        }
      }

      guidesRef.current = guidesRef.current.map(g =>
        g.id === drag.guideId ? { ...g, position: pos, ...scopeOverride } : g,
      );
      scheduleRender();
      return;
    }

    if (drag.kind === 'moving-image') {
      const dx = (e.clientX - drag.startClientX) / drag.startZoom;
      const dy = (e.clientY - drag.startClientY) / drag.startZoom;
      imageLayersRef.current = imageLayersRef.current.map(img =>
        img.id === drag.imageId ? { ...img, x: drag.startX + dx, y: drag.startY + dy } : img,
      );
      scheduleRender();
      return;
    }

    if (drag.kind === 'moving-scene') {
      const dx = (e.clientX - drag.startClientX) / drag.startZoom;
      const dy = (e.clientY - drag.startClientY) / drag.startZoom;
      const newScenes = scenesRef.current.map(s =>
        s.id === drag.sceneId
          ? { ...s, bbox: { ...s.bbox, x: drag.startBBoxX + dx, y: drag.startBBoxY + dy } }
          : s,
      );
      scenesRef.current = newScenes;
      // Keep origin in sync when moving the selected scene
      if (drag.sceneId === selectedSceneIdRef.current) {
        rulerStateRef.current = originFromSceneId(rulerStateRef.current, drag.sceneId, newScenes);
      }
      scheduleRender();
      return;
    }

    if (drag.kind === 'pan') {
      const d  = drag;
      const dx = (e.clientX - d.startClientX) / d.startZoom;
      const dy = (e.clientY - d.startClientY) / d.startZoom;
      vpRef.current = { zoom: d.startZoom, panX: d.startPanX - dx, panY: d.startPanY - dy };
      scheduleRender();
      return;
    }

    // Idle: update hover state + cursor
    const guide = sx >= RULER_SIZE && sy >= RULER_SIZE
      ? findGuideAt(sx, sy, guidesRef.current, vp, scenesRef.current)
      : null;
    const newHoveredId = guide?.id ?? null;
    if (newHoveredId !== hoveredGuideIdRef.current) {
      hoveredGuideIdRef.current = newHoveredId;
      scheduleRender();
    }

    if (guide) {
      e.currentTarget.style.cursor = guideCursor(guide.axis);
    } else {
      const wx = screenToWorldX(sx, vp);
      const wy = screenToWorldY(sy, vp);
      const inCanvas = sx >= RULER_SIZE && sy >= RULER_SIZE;
      const overImage = inCanvas && findImageAt(wx, wy, imageLayersRef.current, scenesRef.current) !== null;
      const overScene = !overImage && inCanvas && scenesRef.current.some(s =>
        wx >= s.bbox.x && wx <= s.bbox.x + s.bbox.width &&
        wy >= s.bbox.y && wy <= s.bbox.y + s.bbox.height,
      );
      e.currentTarget.style.cursor = (overImage || overScene) ? 'grab' : 'default';
    }
  }, [scheduleRender]);

  const onMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const vp = vpRef.current;
    const rs = rulerStateRef.current;
    const drag = dragRef.current;
    dragRef.current = { kind: 'none' };
    e.currentTarget.style.cursor = 'default';

    if (drag.kind === 'creating-guide' || drag.kind === 'moving-guide') {
      const shouldDelete = pendingDeleteRef.current;
      pendingDeleteRef.current = false;
      if (shouldDelete) {
        guidesRef.current = deleteGuide(guidesRef.current, drag.guideId);
        scheduleRender();
        return;
      }
      // Fallback: drop on source ruler also deletes
      const hit = hitTest(sx, sy, guidesRef.current, vp, rs.guidesVisible, scenesRef.current);
      if (isDropOnSourceRuler(drag.axis, hit)) {
        guidesRef.current = deleteGuide(guidesRef.current, drag.guideId);
        scheduleRender();
      }
      return;
    }

    if (drag.kind === 'moving-scene') {
      const moved =
        Math.abs(e.clientX - drag.startClientX) > 4 ||
        Math.abs(e.clientY - drag.startClientY) > 4;
      if (!moved) setSceneSelection(drag.sceneId);
      else scheduleRender();
      return;
    }

    if (drag.kind === 'pan') {
      const moved =
        Math.abs(e.clientX - drag.startClientX) > 4 ||
        Math.abs(e.clientY - drag.startClientY) > 4;
      if (!moved && sx >= RULER_SIZE && sy >= RULER_SIZE) {
        const wx = screenToWorldX(sx, vp);
        const wy = screenToWorldY(sy, vp);
        const hit = scenesRef.current.find(s =>
          wx >= s.bbox.x && wx <= s.bbox.x + s.bbox.width &&
          wy >= s.bbox.y && wy <= s.bbox.y + s.bbox.height,
        );
        setSceneSelection(hit?.id ?? null);
      }
    }
  }, [scheduleRender, setSceneSelection]);

  const onMouseLeave = useCallback(() => {
    const drag = dragRef.current;
    // If a guide drag exits the viewport while in delete zone, commit the deletion
    if ((drag.kind === 'creating-guide' || drag.kind === 'moving-guide') && pendingDeleteRef.current) {
      guidesRef.current = deleteGuide(guidesRef.current, drag.guideId);
    }
    pendingDeleteRef.current  = false;
    dragRef.current           = { kind: 'none' };
    hoveredGuideIdRef.current = null;
    scheduleRender();
  }, [scheduleRender]);

  // ── UI ───────────────────────────────────────────────────────────────────────

  return (
    <div style={{ height: '100vh', position: 'relative', overflow: 'hidden' }}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%', display: 'block', cursor: 'default' }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseLeave}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onContextMenu={onContextMenu}
        />

        {/* Context menu */}
        {ctxMenu.open && (
          <>
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 99 }}
              onMouseDown={() => setCtxMenu(m => ({ ...m, open: false }))}
            />
            <div
              style={{
                position: 'absolute',
                left: ctxMenu.x,
                top: ctxMenu.y,
                width: '210px',
                display: 'flex',
                flexDirection: 'column',
                padding: '4px',
                background: 'rgba(38, 38, 44, 0.88)',
                border: '1px solid #40404A',
                boxShadow: '0px 4px 32px 4px rgba(0, 0, 0, 0.24)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                borderRadius: '8px',
                zIndex: 100,
                userSelect: 'none',
              }}
              onMouseDown={e => e.stopPropagation()}
            >
              <MenuItem
                label={rulersVisibleRef.current ? 'Hide rulers' : 'Show rulers'}
                shortcut="⌘R"
                onClick={() => {
                  rulersVisibleRef.current = !rulersVisibleRef.current;
                  rulerStateRef.current = { ...rulerStateRef.current, guidesVisible: rulersVisibleRef.current };
                  setCtxMenu(m => ({ ...m, open: false }));
                  scheduleRender();
                }}
              />
              {rulersVisibleRef.current && (
                <>
                  <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)', margin: '0 2px' }} />
                  <MenuItem
                    label="Remove all horizontal guides"
                    onClick={() => {
                      guidesRef.current = guidesRef.current.filter(g => g.axis !== 'y');
                      setCtxMenu(m => ({ ...m, open: false }));
                      scheduleRender();
                    }}
                  />
                </>
              )}
            </div>
          </>
        )}

        {/* Generation settings panel — positioned via DOM in render loop */}
        <div
          ref={genSettingsPanelRef}
          style={{
            position: 'absolute',
            width: '240px',
            display: 'none',
            flexDirection: 'column',
            background: 'rgba(38, 38, 44, 0.88)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            borderRadius: '16px',
            boxShadow: '0px 4px 32px 4px rgba(0, 0, 0, 0.24)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            color: '#ffffff',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            userSelect: 'none',
            zIndex: 10,
            pointerEvents: 'auto',
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          }}>
            <span style={{ fontSize: '13px', fontWeight: 500, color: 'rgba(255,255,255,0.9)' }}>
              Generation setting
            </span>
            <button
              onClick={() => setSceneSelection(null)}
              style={{
                background: 'none', border: 'none',
                color: 'rgba(255,255,255,0.4)', cursor: 'pointer',
                fontSize: '18px', padding: 0, lineHeight: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '22px', height: '22px',
              }}
            >×</button>
          </div>

          {/* Content area */}
          <div style={{ flex: 1, minHeight: '200px' }} />

          {/* Footer */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            padding: '12px 16px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            gap: '8px',
          }}>
            {/* Counter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
              {(['−', '4', '+'] as const).map((label, i) =>
                i === 1
                  ? <span key={label} style={{ fontSize: '14px', minWidth: '16px', textAlign: 'center' }}>{label}</span>
                  : <button key={label} style={{
                      width: '28px', height: '28px', borderRadius: '50%',
                      border: '1px solid rgba(255,255,255,0.2)',
                      background: 'none', color: '#ffffff', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '14px',
                    }}>{label}</button>
              )}
            </div>
            <button style={{
              padding: '6px 14px', borderRadius: '20px',
              border: 'none', background: '#4d8fff',
              color: '#ffffff', cursor: 'pointer',
              fontSize: '12px', fontWeight: 500,
            }}>Generate</button>
          </div>
        </div>
    </div>
  );
}
