const terminalStatuses = new Set(['completed', 'failed', 'no-answer', 'busy', 'cancelled']);

export function createLifecycle() {
  let status = 'initiating';

  return {
    get status() {
      return status;
    },
    transition(next) {
      if (terminalStatuses.has(status)) return false;
      status = next;
      return true;
    },
    isTerminal() {
      return terminalStatuses.has(status);
    }
  };
}

export { terminalStatuses };
