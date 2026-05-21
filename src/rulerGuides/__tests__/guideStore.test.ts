import { describe, it, expect } from 'vitest';
import { createGuide, moveGuide, deleteGuide } from '../guideStore';
import type { Guide } from '../types';

const GLOBAL = { kind: 'global' } as const;

describe('createGuide', () => {
  it('creates a guide with the given axis, position, and scope', () => {
    const g = createGuide('x', 100, GLOBAL);
    expect(g.axis).toBe('x');
    expect(g.position).toBe(100);
    expect(g.scope).toEqual(GLOBAL);
  });

  it('assigns unique IDs', () => {
    const ids = new Set(Array.from({ length: 10 }, () => createGuide('y', 0, GLOBAL).id));
    expect(ids.size).toBe(10);
  });
});

describe('moveGuide', () => {
  it('updates the position of the matching guide', () => {
    const guides: Guide[] = [createGuide('x', 100, GLOBAL), createGuide('y', 200, GLOBAL)];
    const updated = moveGuide(guides, guides[0].id, 350);
    expect(updated[0].position).toBe(350);
    expect(updated[1].position).toBe(200); // unchanged
  });

  it('returns a new array (immutable)', () => {
    const guides: Guide[] = [createGuide('x', 100, GLOBAL)];
    const updated = moveGuide(guides, guides[0].id, 200);
    expect(updated).not.toBe(guides);
  });

  it('is a no-op for unknown IDs', () => {
    const guides: Guide[] = [createGuide('x', 100, GLOBAL)];
    const updated = moveGuide(guides, 'nonexistent', 200);
    expect(updated[0].position).toBe(100);
  });
});

describe('deleteGuide', () => {
  it('removes the guide with the matching ID', () => {
    const guides: Guide[] = [createGuide('x', 100, GLOBAL), createGuide('y', 200, GLOBAL)];
    const updated = deleteGuide(guides, guides[0].id);
    expect(updated).toHaveLength(1);
    expect(updated[0].axis).toBe('y');
  });

  it('returns a new array (immutable)', () => {
    const guides: Guide[] = [createGuide('x', 100, GLOBAL)];
    const updated = deleteGuide(guides, guides[0].id);
    expect(updated).not.toBe(guides);
  });

  it('is a no-op for unknown IDs', () => {
    const guides: Guide[] = [createGuide('x', 100, GLOBAL)];
    const updated = deleteGuide(guides, 'nonexistent');
    expect(updated).toHaveLength(1);
  });
});
