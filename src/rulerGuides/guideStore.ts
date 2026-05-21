import type { Guide, Axis, GuideScope } from './types';

let _counter = 0;

export function createGuide(axis: Axis, position: number, scope: GuideScope): Guide {
  return { id: `guide-${++_counter}`, axis, position, scope };
}

export function moveGuide(guides: Guide[], id: string, position: number): Guide[] {
  return guides.map(g => g.id === id ? { ...g, position } : g);
}

export function deleteGuide(guides: Guide[], id: string): Guide[] {
  return guides.filter(g => g.id !== id);
}
