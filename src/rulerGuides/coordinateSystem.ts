import type { Axis, RulerState } from './types';

export const RULER_SIZE = 24;

export interface ViewportCtx {
  zoom: number;
  panX: number;
  panY: number;
}

export function activeOrigin(state: RulerState): { x: number; y: number } {
  switch (state.origin.kind) {
    case 'default':
      return { x: 0, y: 0 };
    case 'selection':
      return { x: state.origin.x, y: state.origin.y };
  }
}

export function displayValue(worldCoord: number, axis: Axis, state: RulerState): number {
  const origin = activeOrigin(state);
  return worldCoord - origin[axis];
}

export function worldToScreenX(wx: number, ctx: ViewportCtx): number {
  return RULER_SIZE + (wx - ctx.panX) * ctx.zoom;
}

export function worldToScreenY(wy: number, ctx: ViewportCtx): number {
  return RULER_SIZE + (wy - ctx.panY) * ctx.zoom;
}

export function screenToWorldX(sx: number, ctx: ViewportCtx): number {
  return ctx.panX + (sx - RULER_SIZE) / ctx.zoom;
}

export function screenToWorldY(sy: number, ctx: ViewportCtx): number {
  return ctx.panY + (sy - RULER_SIZE) / ctx.zoom;
}
