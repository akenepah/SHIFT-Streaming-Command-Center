/** Serialize cloud writes without leaving a completed/no-op promise in the busy slot. */
export async function withPendingSave(lock: { current: Promise<void> | null }, hasPending: () => boolean, work: () => Promise<void>): Promise<void> {
  while (lock.current) {
    const existing = lock.current;
    try { await existing; }
    finally { if (lock.current === existing) lock.current = null; }
  }
  if (!hasPending()) return;
  // Start on a microtask so even synchronous completion/failure happens AFTER assigning the lock.
  const running = Promise.resolve().then(work);
  lock.current = running;
  try { await running; }
  finally { if (lock.current === running) lock.current = null; }
}
