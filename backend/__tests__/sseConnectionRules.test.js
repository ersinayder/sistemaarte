import { describe, expect, it } from 'vitest';

const { criarSseConnectionTracker } = await import('../domain/sseConnectionRules.js');

describe('sseConnectionRules', () => {
  it('limits each user to three simultaneous connections and releases on close', () => {
    const tracker = criarSseConnectionTracker({ maxGlobal: 10, maxPerUser: 3 });

    const first = tracker.tryAcquire(7);
    const second = tracker.tryAcquire(7);
    const third = tracker.tryAcquire(7);
    const fourth = tracker.tryAcquire(7);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(third.ok).toBe(true);
    expect(fourth).toEqual({
      ok: false,
      reason: 'user',
      message: 'Limite de streams por usuario atingido (max 3)',
    });

    first.release();

    expect(tracker.tryAcquire(7).ok).toBe(true);
  });

  it('keeps the existing global connection limit', () => {
    const tracker = criarSseConnectionTracker({ maxGlobal: 2, maxPerUser: 3 });

    expect(tracker.tryAcquire(1).ok).toBe(true);
    expect(tracker.tryAcquire(2).ok).toBe(true);
    expect(tracker.tryAcquire(3)).toEqual({
      ok: false,
      reason: 'global',
      message: 'Limite de streams atingido (max 2)',
    });
  });
});
