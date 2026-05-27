import React, { useRef, useEffect, useCallback, useState } from 'react';
import { CanvasHeader } from './CanvasHeader';
import { LeftPanel } from './LeftPanel';
import { RightPanel } from './RightPanel';
import { TaskBar } from './TaskBar';
import { ViewControls } from './ViewControls';
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

type CrossGuideDrag = {
  kind: 'creating-cross-guide';
  xGuideId: string;
  yGuideId: string;
};

type ActiveDrag = { kind: 'none' } | PanDrag | SceneDrag | GuideDragState | ImageDrag | CrossGuideDrag;

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
    guidesVisible: false,
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
  const resumeBtnRef        = useRef<HTMLDivElement>(null);
  const closeBtnRef         = useRef<HTMLDivElement>(null);
  const hoveredSceneIdRef   = useRef<string | null>(null);
  const editingSceneIdRef   = useRef<string | null>(null);
  const rulersVisibleRef    = useRef<boolean>(false);

  const taskBarWrapperRef   = useRef<HTMLDivElement>(null);
  const selectedGuideIdRef  = useRef<string | null>(null);
  const guideMouseDownRef   = useRef<{ x: number; y: number } | null>(null);
  const selectedImageIdRef  = useRef<string | null>(null);

  const [ctxMenu, setCtxMenu]         = useState<{ open: boolean; x: number; y: number; kind: 'main' | 'left-ruler' }>({ open: false, x: 0, y: 0, kind: 'main' });
  const [zoomPercent, setZoomPercent] = useState(100);
  const [rulersVisible, setRulersVisible] = useState(false);

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

    // 2. Scene bodies — body fill + dots + images (guides will draw on top of these)
    for (const scene of scenes) {
      const sx = worldToScreenX(scene.bbox.x, vp);
      const sy = worldToScreenY(scene.bbox.y, vp);
      const sw = scene.bbox.width  * zoom;
      const sh = scene.bbox.height * zoom;
      if (sx + sw < RULER_SIZE || sy + sh < RULER_SIZE || sx > cssW || sy > cssH) continue;

      const pad       = 12 * zoom;
      const NAME_FONT = 12;
      const NAME_GAP  = 12;
      const bodyX = sx + pad;
      const bodyY = sy + pad + 4 + NAME_FONT + NAME_GAP;
      const bodyW = sw - 2 * pad;
      const bodyH = sh - pad - 4 - NAME_FONT - NAME_GAP - pad;

      if (bodyW > 20 && bodyH > 20) {
        ctx.beginPath();
        ctx.rect(bodyX, bodyY, bodyW, bodyH);
        ctx.fillStyle = '#000000';
        ctx.fill();

        ctx.save();
        ctx.beginPath();
        ctx.rect(bodyX, bodyY, bodyW, bodyH);
        ctx.clip();
        const dotGap = 20 * zoom;
        if (dotGap >= 4) {
          const offX = (bodyW % dotGap) / 2;
          const offY = (bodyH % dotGap) / 2;
          const iEnd = Math.floor(bodyW / dotGap);
          const jEnd = Math.floor(bodyH / dotGap);
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
            if (img.id === selectedImageIdRef.current) {
              ctx.strokeStyle = '#4570FF';
              ctx.lineWidth = 2;
              ctx.strokeRect(imgSx, imgSy, img.width * zoom, img.height * zoom);
            }
          }
          ctx.restore();
        }
      }
    }

    // 3. Scene-scoped guides — above body/dots, below scene fill/border
    const activeDrag = dragRef.current;
    const activeGuideId =
      (activeDrag.kind === 'creating-guide' || activeDrag.kind === 'moving-guide')
        ? activeDrag.guideId
        : activeDrag.kind === 'creating-cross-guide'
        ? activeDrag.xGuideId
        : hoveredGuideIdRef.current ?? selectedGuideIdRef.current;
    const pendingDeleteGuideId = pendingDeleteRef.current ? activeGuideId : null;
    const creatingIds = new Set<string>();
    if (activeDrag.kind === 'creating-guide') creatingIds.add(activeDrag.guideId);
    if (activeDrag.kind === 'creating-cross-guide') {
      creatingIds.add(activeDrag.xGuideId);
      creatingIds.add(activeDrag.yGuideId);
    }
    if (rulerStateRef.current.guidesVisible) {
      const sceneGuides = guidesRef.current.filter(g => g.scope.kind === 'scene');
      drawGuides(ctx, cssW, cssH, sceneGuides, vp, activeGuideId, scenes, pendingDeleteGuideId, creatingIds);
    }

    // 3b. Scene frames — outer fill (body hole via evenodd) + name + border, above guides
    ctx.lineWidth = 1;
    for (const scene of scenes) {
      const sx = worldToScreenX(scene.bbox.x, vp);
      const sy = worldToScreenY(scene.bbox.y, vp);
      const sw = scene.bbox.width  * zoom;
      const sh = scene.bbox.height * zoom;
      if (sx + sw < RULER_SIZE || sy + sh < RULER_SIZE || sx > cssW || sy > cssH) continue;

      const isSelected  = scene.id === selectedId;
      const isEditing   = scene.id === editingSceneIdRef.current;
      const outerRadius = Math.min(16 * zoom, sw / 2, sh / 2);
      const pad         = 12 * zoom;
      const NAME_FONT   = 12;
      const NAME_GAP    = 12;
      const bodyX = sx + pad;
      const bodyY = sy + pad + 4 + NAME_FONT + NAME_GAP;
      const bodyW = sw - 2 * pad;
      const bodyH = sh - pad - 4 - NAME_FONT - NAME_GAP - pad;

      // Gray fill with body punched out — guides show through the body, header covers them
      ctx.beginPath();
      ctx.roundRect(sx, sy, sw, sh, outerRadius);
      if (bodyW > 20 && bodyH > 20) ctx.rect(bodyX, bodyY, bodyW, bodyH);
      ctx.fillStyle = '#131316';
      ctx.fill('evenodd');

      // Name
      if (sw > 2 * pad + 20 && sh > 2 * pad + NAME_FONT + NAME_GAP + 20) {
        ctx.fillStyle    = (isSelected || isEditing) ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)';
        ctx.font         = `${NAME_FONT}px system-ui, -apple-system, sans-serif`;
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(scene.id, sx + pad, sy + pad + 4);
      }

      // Border stroke
      ctx.beginPath();
      ctx.roundRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1, Math.max(0, outerRadius - 0.5));
      ctx.strokeStyle = (isSelected || isEditing) ? '#ffffff' : 'rgba(255, 255, 255, 0.12)';
      ctx.stroke();
    }

    // 3c. Global guides — on top of all scene layers
    if (rulerStateRef.current.guidesVisible) {
      const globalGuides = guidesRef.current.filter(g => g.scope.kind === 'global');
      drawGuides(ctx, cssW, cssH, globalGuides, vp, activeGuideId, scenes, pendingDeleteGuideId, creatingIds);
    }

    // 4a. Ruler highlight — image selection takes priority over scene selection
    const selectedScene = selectedId ? scenes.find(s => s.id === selectedId) ?? null : null;
    const selectedImage = selectedImageIdRef.current
      ? imageLayersRef.current.find(img => img.id === selectedImageIdRef.current) ?? null
      : null;

    // 4. Rulers — suppress the regular "0" label when a highlight band is active
    // (the highlight's left-edge label shows "0" instead)
    if (rulersVisibleRef.current) {
      const hasHighlight = selectedImage !== null || selectedScene !== null;
      const { isAnimating } = drawRulers(ctx, cssW, cssH, rulerStateRef.current, vp, performance.now(), true, false, hasHighlight, selectedScene);
      if (isAnimating) {
        scheduleRender();
      } else {
        rulerStateRef.current = clearCrossfade(rulerStateRef.current);
      }
    }
    if (rulersVisibleRef.current) {
      if (selectedImage) {
        const parentScene = scenes.find(s => s.id === selectedImage.sceneId);
        if (parentScene) {
          const imgFakeScene = {
            id: selectedImage.id,
            bbox: {
              x: parentScene.bbox.x + selectedImage.x,
              y: parentScene.bbox.y + selectedImage.y,
              width: selectedImage.width,
              height: selectedImage.height,
            },
          };
          drawSceneRulerHighlight(ctx, cssW, cssH, imgFakeScene, vp, rulerStateRef.current);
        }
      } else if (selectedScene) {
        drawSceneRulerHighlight(ctx, cssW, cssH, selectedScene, vp, rulerStateRef.current);
      }
    }

    const editingScene  = editingSceneIdRef.current
      ? scenes.find(s => s.id === editingSceneIdRef.current) ?? null : null;
    const hoveredScene  = hoveredSceneIdRef.current
      ? scenes.find(s => s.id === hoveredSceneIdRef.current) ?? null : null;

    // Gen panel — only in editing state
    const genPanel = genSettingsPanelRef.current;
    if (genPanel) {
      if (editingScene) {
        const psx = worldToScreenX(editingScene.bbox.x, vp);
        const psy = worldToScreenY(editingScene.bbox.y, vp);
        const psw = editingScene.bbox.width * zoom;
        genPanel.style.left    = `${psx + psw + 16}px`;
        genPanel.style.top     = `${psy}px`;
        genPanel.style.display = 'flex';
      } else {
        genPanel.style.display = 'none';
      }
    }

    // Helper: position a 32×32 button 24px inside the top-right corner of a scene,
    // clamped so it never leaves the canvas content area.
    const BTN = 32;
    const PAD = 24;
    function btnPos(scene: typeof scenes[0]) {
      const rx = worldToScreenX(scene.bbox.x + scene.bbox.width, vp);
      const ty = worldToScreenY(scene.bbox.y, vp);
      const lx = worldToScreenX(scene.bbox.x, vp);
      const bx = Math.min(rx - PAD - BTN, cssW - BTN - 4);
      const by = Math.max(ty + PAD,        RULER_SIZE + 4);
      // Also keep within the scene's own horizontal bounds
      const bxClamped = Math.max(bx, lx + PAD);
      return { left: bxClamped, top: by };
    }

    // Resume button — shown when hovering a scene that is NOT in editing mode
    const resumeBtn = resumeBtnRef.current;
    if (resumeBtn) {
      const showResume = hoveredScene && hoveredScene.id !== editingSceneIdRef.current;
      if (showResume) {
        const { left, top } = btnPos(hoveredScene);
        resumeBtn.style.left    = `${left}px`;
        resumeBtn.style.top     = `${top}px`;
        resumeBtn.style.display = 'flex';
      } else {
        resumeBtn.style.display = 'none';
      }
    }

    // Close button — shown when a scene is in editing mode
    const closeBtn = closeBtnRef.current;
    if (closeBtn) {
      if (editingScene) {
        const { left, top } = btnPos(editingScene);
        closeBtn.style.left    = `${left}px`;
        closeBtn.style.top     = `${top}px`;
        closeBtn.style.display = 'flex';
      } else {
        closeBtn.style.display = 'none';
      }
    }

    // TaskBar — only visible when a scene is in editing mode
    const taskBarWrapper = taskBarWrapperRef.current;
    if (taskBarWrapper) {
      taskBarWrapper.style.display = editingSceneIdRef.current ? 'block' : 'none';
    }

    // 4b. Guide ruler labels — suppressed when guide is in delete zone or rulers hidden
    if (rulersVisibleRef.current) {
      const rulerLabelIds = pendingDeleteGuideId
        ? []
        : activeDrag.kind === 'creating-cross-guide'
          ? [activeDrag.xGuideId, activeDrag.yGuideId]
          : activeGuideId ? [activeGuideId] : [];
      drawGuideRulerLabels(ctx, cssW, cssH, guidesRef.current, rulerLabelIds, vp, rulerStateRef.current, scenes, selectedScene);
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
      setZoomPercent(Math.round(newZoom * 100));
      scheduleRender();
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [scheduleRender, setZoomPercent]);

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
        setRulersVisible(rulersVisibleRef.current);
        scheduleRender();
      },
    });
  }, [scheduleRender]);

  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCtxMenu(m => ({ ...m, open: false }));
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedGuideIdRef.current) {
          guidesRef.current = deleteGuide(guidesRef.current, selectedGuideIdRef.current);
          selectedGuideIdRef.current = null;
          scheduleRender();
        }
      }
    };
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  }, [scheduleRender]);

  // ── Scene selection ──────────────────────────────────────────────────────────

  const setSceneSelection = useCallback((sceneId: string | null) => {
    if (sceneId === selectedSceneIdRef.current) return;
    selectedSceneIdRef.current = sceneId;
    rulerStateRef.current = originFromSceneId(rulerStateRef.current, sceneId, scenesRef.current);
    scheduleRender();
  }, [scheduleRender]);

  // ── ViewControls callbacks ───────────────────────────────────────────────────

  const onFitToScreen = useCallback(() => {
    vpRef.current = { zoom: 1, panX: -60, panY: -60 };
    rulerStateRef.current = updateStep(rulerStateRef.current, 1);
    setZoomPercent(100);
    scheduleRender();
  }, [scheduleRender]);

  const onToggleRulersFromControl = useCallback(() => {
    rulersVisibleRef.current = !rulersVisibleRef.current;
    rulerStateRef.current = { ...rulerStateRef.current, guidesVisible: rulersVisibleRef.current };
    setRulersVisible(rulersVisibleRef.current);
    scheduleRender();
  }, [scheduleRender]);


  // ── Context menu ────────────────────────────────────────────────────────────

  const onContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const cx = Math.max(4, Math.min(sx, rect.width  - 218));
    const cy = Math.max(4, Math.min(sy, rect.height -  90));

    if (!rulersVisibleRef.current) {
      // When rulers are hidden, only the 16px edge strip triggers "Show rulers"
      if (sx <= 16 || sy <= 16) {
        setCtxMenu({ open: true, x: cx, y: cy, kind: 'main' });
      }
      return;
    }

    // Rulers visible — check which zone was clicked
    const hit = hitTest(sx, sy, guidesRef.current, vpRef.current, rulerStateRef.current.guidesVisible, scenesRef.current);
    if (hit.kind === 'left-ruler') {
      setCtxMenu({ open: true, x: cx, y: cy, kind: 'left-ruler' });
    } else {
      setCtxMenu({ open: true, x: cx, y: cy, kind: 'main' });
    }
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
      selectedGuideIdRef.current = null;
      selectedImageIdRef.current = null;
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
      selectedGuideIdRef.current = null;
      selectedImageIdRef.current = null;
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
      guideMouseDownRef.current = { x: e.clientX, y: e.clientY };
      selectedImageIdRef.current = null;
      dragRef.current = { kind: 'moving-guide', guideId: hit.guideId, axis: hit.axis };
      e.currentTarget.style.cursor = guideCursor(hit.axis);
      return;
    }

    if (hit.kind === 'canvas') {
      selectedGuideIdRef.current = null;
      const wx = screenToWorldX(sx, vp);
      const wy = screenToWorldY(sy, vp);
      const overImage = findImageAt(wx, wy, imageLayersRef.current, scenes);
      // Images are only interactive when their parent scene is in editing state
      if (overImage && editingSceneIdRef.current === overImage.sceneId) {
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
      selectedImageIdRef.current = null;
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
    if (hit.kind === 'corner') {
      selectedGuideIdRef.current = null;
      selectedImageIdRef.current = null;
      const selId = selectedSceneIdRef.current;
      const scene = selId ? scenes.find(s => s.id === selId) : undefined;
      const scope  = scene ? { kind: 'scene' as const, sceneId: scene.id } : { kind: 'global' as const };
      const wxPos  = guideWorldPos(sx, sy, 'x', vp);
      const wyPos  = guideWorldPos(sx, sy, 'y', vp);
      const gX = createGuide('x', scene ? wxPos - scene.bbox.x : wxPos, scope);
      const gY = createGuide('y', scene ? wyPos - scene.bbox.y : wyPos, scope);
      guidesRef.current = [...guidesRef.current, gX, gY];
      dragRef.current   = { kind: 'creating-cross-guide', xGuideId: gX.id, yGuideId: gY.id };
      e.currentTarget.style.cursor = 'crosshair';
      scheduleRender();
    }
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

    if (drag.kind === 'creating-cross-guide') {
      const wx = guideWorldPos(sx, sy, 'x', vp);
      const wy = guideWorldPos(sx, sy, 'y', vp);
      guidesRef.current = guidesRef.current.map(g => {
        if (g.id === drag.xGuideId) {
          const scope = g.scope;
          const sc = scope.kind === 'scene' ? scenesRef.current.find(s => s.id === scope.sceneId) : undefined;
          return { ...g, position: sc ? wx - sc.bbox.x : wx };
        }
        if (g.id === drag.yGuideId) {
          const scope = g.scope;
          const sc = scope.kind === 'scene' ? scenesRef.current.find(s => s.id === scope.sceneId) : undefined;
          return { ...g, position: sc ? wy - sc.bbox.y : wy };
        }
        return g;
      });
      e.currentTarget.style.cursor = 'crosshair';
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
    } else if (sx < RULER_SIZE && sy < RULER_SIZE) {
      e.currentTarget.style.cursor = 'crosshair';
    } else {
      const wx = screenToWorldX(sx, vp);
      const wy = screenToWorldY(sy, vp);
      const inCanvas = sx >= RULER_SIZE && sy >= RULER_SIZE;
      const imageHit = inCanvas && editingSceneIdRef.current !== null
        ? findImageAt(wx, wy, imageLayersRef.current, scenesRef.current)
        : null;
      const overImage = imageHit !== null && imageHit.sceneId === editingSceneIdRef.current;
      const overSceneObj = !overImage && inCanvas
        ? (scenesRef.current.find(s =>
            wx >= s.bbox.x && wx <= s.bbox.x + s.bbox.width &&
            wy >= s.bbox.y && wy <= s.bbox.y + s.bbox.height,
          ) ?? null)
        : null;

      // Track hovered scene for the resume button overlay
      const newHoveredSceneId = overSceneObj?.id ?? null;
      if (newHoveredSceneId !== hoveredSceneIdRef.current) {
        hoveredSceneIdRef.current = newHoveredSceneId;
        scheduleRender();
      }

      e.currentTarget.style.cursor = (overImage || overSceneObj) ? 'grab' : 'default';
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
        if (drag.guideId === selectedGuideIdRef.current) selectedGuideIdRef.current = null;
        guideMouseDownRef.current = null;
        scheduleRender();
        return;
      }
      // Fallback: drop on source ruler also deletes
      const hit = hitTest(sx, sy, guidesRef.current, vp, rs.guidesVisible, scenesRef.current);
      if (isDropOnSourceRuler(drag.axis, hit)) {
        guidesRef.current = deleteGuide(guidesRef.current, drag.guideId);
        if (drag.guideId === selectedGuideIdRef.current) selectedGuideIdRef.current = null;
        guideMouseDownRef.current = null;
        scheduleRender();
        return;
      }
      // Click (no significant movement) on an existing guide → select it
      if (drag.kind === 'moving-guide') {
        const down = guideMouseDownRef.current;
        guideMouseDownRef.current = null;
        const moved = down ? (Math.abs(e.clientX - down.x) > 3 || Math.abs(e.clientY - down.y) > 3) : true;
        selectedGuideIdRef.current = moved ? null : drag.guideId;
        scheduleRender();
      }
      return;
    }

    if (drag.kind === 'creating-cross-guide') {
      let guides = guidesRef.current;
      if (sx < RULER_SIZE) guides = deleteGuide(guides, drag.xGuideId);
      if (sy < RULER_SIZE) guides = deleteGuide(guides, drag.yGuideId);
      guidesRef.current = guides;
      scheduleRender();
      return;
    }

    if (drag.kind === 'moving-image') {
      const moved =
        Math.abs(e.clientX - drag.startClientX) > 4 ||
        Math.abs(e.clientY - drag.startClientY) > 4;
      selectedImageIdRef.current = moved ? null : drag.imageId;
      scheduleRender();
      return;
    }

    if (drag.kind === 'moving-scene') {
      selectedImageIdRef.current = null;
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

  const onMouseLeave = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    // If a guide drag exits the viewport while in delete zone, commit the deletion
    if ((drag.kind === 'creating-guide' || drag.kind === 'moving-guide') && pendingDeleteRef.current) {
      guidesRef.current = deleteGuide(guidesRef.current, drag.guideId);
    }
    pendingDeleteRef.current  = false;
    dragRef.current           = { kind: 'none' };
    hoveredGuideIdRef.current = null;
    // Don't clear hoveredScene when the mouse moves onto the resume button —
    // otherwise the button hides before the click registers.
    const toResumeBtn = resumeBtnRef.current?.contains(e.relatedTarget as Node);
    if (!toResumeBtn) hoveredSceneIdRef.current = null;
    scheduleRender();
  }, [scheduleRender]);

  // ── UI ───────────────────────────────────────────────────────────────────────

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <CanvasHeader />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'row', overflow: 'hidden' }}>
        <LeftPanel />
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <div ref={taskBarWrapperRef} style={{ display: 'none' }}><TaskBar /></div>
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


        <ViewControls
          zoom={zoomPercent}
          rulersVisible={rulersVisible}
          onFitToScreen={onFitToScreen}
          onToggleRulers={onToggleRulersFromControl}
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
              {ctxMenu.kind === 'left-ruler' ? (
                <>
                  <MenuItem
                    label="Hide rulers"
                    shortcut="⌘R"
                    onClick={() => {
                      rulersVisibleRef.current = false;
                      rulerStateRef.current = { ...rulerStateRef.current, guidesVisible: false };
                      setCtxMenu(m => ({ ...m, open: false }));
                      scheduleRender();
                    }}
                  />
                  <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)', margin: '0 2px' }} />
                  <MenuItem
                    label="Remove all vertical guides"
                    onClick={() => {
                      guidesRef.current = guidesRef.current.filter(g => g.axis !== 'x');
                      setCtxMenu(m => ({ ...m, open: false }));
                      scheduleRender();
                    }}
                  />
                </>
              ) : (
                <>
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

        {/* Resume button — hover over a non-editing scene */}
        <div
          ref={resumeBtnRef}
          style={{
            position: 'absolute',
            width: 32, height: 32,
            display: 'none',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            background: '#E8789A',
            cursor: 'pointer',
            zIndex: 20,
            pointerEvents: 'auto',
          }}
          onMouseLeave={(e) => {
            // Clear hovered scene only when leaving to somewhere other than the canvas
            if (!canvasRef.current?.contains(e.relatedTarget as Node)) {
              hoveredSceneIdRef.current = null;
              scheduleRender();
            }
          }}
          onClick={() => {
            const sceneId = hoveredSceneIdRef.current;
            if (!sceneId) return;
            editingSceneIdRef.current = sceneId;
            setSceneSelection(sceneId);
            scheduleRender();
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.25 3C19.3211 3 21 4.67893 21 6.75V17.25C21 19.3211 19.3211 21 17.25 21H6.75C4.67893 21 3 19.3211 3 17.25V6.75C3 4.67893 4.67893 3 6.75 3H17.25ZM6.75 4.5C5.50736 4.5 4.5 5.50736 4.5 6.75V17.25C4.5 18.4926 5.50736 19.5 6.75 19.5H17.25C18.4926 19.5 19.5 18.4926 19.5 17.25V6.75C19.5 5.50736 18.4926 4.5 17.25 4.5H6.75Z" fill="white"/>
            <path d="M8.25 9.22171C8.25019 7.75956 9.80638 6.72744 11.1338 7.51858L15.7949 10.2959C17.0687 11.0552 17.0687 12.9448 15.7949 13.7041L11.1338 16.4815C9.80638 17.2726 8.25019 16.2405 8.25 14.7783V9.22171ZM9.75 14.7783C9.75017 15.1895 10.1342 15.3317 10.3662 15.1934L15.0264 12.4151C15.3242 12.2375 15.3242 11.7625 15.0264 11.585L10.3662 8.80667C10.1342 8.66837 9.75017 8.81053 9.75 9.22171V14.7783Z" fill="white"/>
          </svg>
        </div>

        {/* Close button — shown when a scene is in editing mode */}
        <div
          ref={closeBtnRef}
          style={{
            position: 'absolute',
            width: 32, height: 32,
            display: 'none',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 20,
            pointerEvents: 'auto',
          }}
          onClick={() => {
            editingSceneIdRef.current = null;
            selectedImageIdRef.current = null;
            scheduleRender();
          }}
        >
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M16 0.5C24.5604 0.5 31.5 7.43959 31.5 16C31.5 24.5604 24.5604 31.5 16 31.5C7.43959 31.5 0.5 24.5604 0.5 16C0.5 7.43959 7.43959 0.5 16 0.5Z" fill="#26262C"/>
            <path d="M16 0.5C24.5604 0.5 31.5 7.43959 31.5 16C31.5 24.5604 24.5604 31.5 16 31.5C7.43959 31.5 0.5 24.5604 0.5 16C0.5 7.43959 7.43959 0.5 16 0.5Z" stroke="#40404A"/>
            <path fillRule="evenodd" clipRule="evenodd" d="M21.1401 9.827C21.1405 9.827 21.1409 9.82735 21.1416 9.82807L22.1718 10.8584C22.1725 10.859 22.1726 10.8593 22.1728 10.8599C22.1729 10.8602 22.1729 10.8606 22.1728 10.8609C22.1728 10.8615 22.1725 10.8618 22.1718 10.8625L17.0343 16L22.1718 21.1375C22.1725 21.1382 22.1726 21.1386 22.1728 21.1391C22.1729 21.1395 22.1729 21.14 22.1728 21.1404C22.1728 21.1407 22.1725 21.1411 22.1718 21.1418L21.1414 22.172C21.1409 22.1727 21.1405 22.1729 21.1401 22.1731C21.1397 22.1732 21.1393 22.1732 21.1389 22.1731C21.1384 22.1731 21.138 22.1727 21.1373 22.172L15.9998 17.0345L10.8623 22.172C10.8616 22.1727 10.8612 22.1729 10.8607 22.1731C10.8603 22.1732 10.8598 22.1732 10.8594 22.1731C10.8591 22.1731 10.8587 22.1727 10.858 22.172L9.82782 21.1416C9.82711 21.1411 9.82693 21.1407 9.82675 21.1404C9.82663 21.14 9.82663 21.1395 9.82675 21.1391C9.82675 21.1386 9.82711 21.1382 9.82782 21.1375L14.9653 16L9.82782 10.8625C9.82711 10.8618 9.82693 10.8615 9.82675 10.8609C9.82663 10.8605 9.82663 10.8601 9.82675 10.8597C9.82675 10.8593 9.82711 10.859 9.82782 10.8582L10.8582 9.82807C10.8587 9.82735 10.8591 9.82718 10.8594 9.827C10.8598 9.82687 10.8603 9.82687 10.8607 9.827C10.8612 9.827 10.8616 9.82735 10.8623 9.82807L15.9998 14.9656L21.1373 9.82807C21.138 9.82735 21.1384 9.82718 21.1389 9.827C21.1393 9.82687 21.1397 9.82687 21.1401 9.827Z" fill="white"/>
          </svg>
        </div>

        </div>
        <RightPanel />
      </div>
    </div>
  );
}
