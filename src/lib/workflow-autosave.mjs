export function createDebouncedAutosave(save, onState = () => {}, delayMs = 900) {
  let timer;
  let pending;
  let running;
  let disposed = false;

  async function flush() {
    clearTimeout(timer);
    timer = undefined;
    if (running) return running;
    if (disposed || pending === undefined) return true;
    running = (async () => {
      while (!disposed && pending !== undefined) {
        const snapshot = pending;
        pending = undefined;
        onState('Saving...', snapshot);
        try {
          await save(snapshot);
          if (pending === undefined) onState('Saved', snapshot);
        } catch (error) {
          pending = undefined;
          onState('Save failed', snapshot, error);
          return false;
        }
      }
      return true;
    })();
    try { return await running; }
    finally { running = undefined; }
  }

  function schedule(snapshot) {
    if (disposed) return;
    pending = structuredClone(snapshot);
    onState('Unsaved changes', pending);
    clearTimeout(timer);
    timer = setTimeout(() => { void flush(); }, delayMs);
  }

  function cancel() {
    clearTimeout(timer);
    timer = undefined;
    pending = undefined;
  }

  function dispose() {
    cancel();
    disposed = true;
  }

  return { schedule, flush, cancel, dispose };
}
