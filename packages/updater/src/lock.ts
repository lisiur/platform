// In-process single-slot mutex. Only one update runs at a time. The lock lives
// only as long as the daemon process; a daemon crash clears it (the marker file
// in state.ts is what detects an interrupted run on the next boot).

let busy = false;

export function tryAcquire(): boolean {
  if (busy) return false;
  busy = true;
  return true;
}

export function release(): void {
  busy = false;
}

export function isBusy(): boolean {
  return busy;
}
