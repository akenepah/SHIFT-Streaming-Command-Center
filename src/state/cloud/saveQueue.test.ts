import { describe, expect, it, vi } from 'vitest';
import { withPendingSave } from './saveQueue';

describe('cloud save queue', () => {
  it('an empty flush during team switching does not block a later edit', async () => {
    const lock = { current: null as Promise<void> | null };
    const save = vi.fn(async () => {});
    await withPendingSave(lock, () => false, save);
    expect(lock.current).toBeNull();
    expect(save).not.toHaveBeenCalled();
    await withPendingSave(lock, () => true, save);
    expect(save).toHaveBeenCalledOnce();
    expect(lock.current).toBeNull();
  });
  it('serializes concurrent callers and clears busy state after the actual write', async () => {
    const lock = { current: null as Promise<void> | null };
    let finish!: () => void;
    let pending = true;
    const write = vi.fn(async () => { await new Promise<void>(r => { finish = r; }); pending = false; });
    const first = withPendingSave(lock, () => pending, write);
    const second = withPendingSave(lock, () => pending, write);
    await Promise.resolve();
    expect(lock.current).not.toBeNull();
    expect(write).toHaveBeenCalledOnce();
    finish(); await Promise.all([first, second]);
    expect(lock.current).toBeNull();
  });
  it('drains new work queued while a previous account write is settling', async () => {
    const lock = { current: null as Promise<void> | null };
    let finish!: () => void;
    const old = withPendingSave(lock, () => true, () => new Promise<void>(r => { finish = r; }));
    const next = vi.fn(async () => {});
    const queued = withPendingSave(lock, () => true, next);
    await Promise.resolve();
    expect(next).not.toHaveBeenCalled();
    finish(); await Promise.all([old, queued]);
    expect(next).toHaveBeenCalledOnce();
    expect(lock.current).toBeNull();
  });
  it('releases the queue even when work rejects synchronously', async () => {
    const lock = { current: null as Promise<void> | null };
    await expect(withPendingSave(lock, () => true, () => { throw new Error('offline'); })).rejects.toThrow('offline');
    expect(lock.current).toBeNull();
    const next = vi.fn(async () => {});
    await withPendingSave(lock, () => true, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
