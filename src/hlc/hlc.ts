import type { Hlc } from './types.js';

export function createHlc(nodeId: string): Hlc {
  return { timestamp: Date.now(), counter: 0, nodeId };
}

export function tickLocal(hlc: Hlc): Hlc {
  const now = Date.now();
  if (now > hlc.timestamp) {
    return { timestamp: now, counter: 0, nodeId: hlc.nodeId };
  }
  return { timestamp: hlc.timestamp, counter: hlc.counter + 1, nodeId: hlc.nodeId };
}

export function tickRemote(local: Hlc, remote: Hlc): Hlc {
  const now = Date.now();
  const maxTs = Math.max(now, local.timestamp, remote.timestamp);

  let counter: number;
  if (maxTs === local.timestamp && maxTs === remote.timestamp) {
    counter = Math.max(local.counter, remote.counter) + 1;
  } else if (maxTs === local.timestamp) {
    counter = local.counter + 1;
  } else if (maxTs === remote.timestamp) {
    counter = remote.counter + 1;
  } else {
    counter = 0;
  }

  return { timestamp: maxTs, counter, nodeId: local.nodeId };
}

export function compareHlc(a: Hlc, b: Hlc): number {
  if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
  if (a.counter !== b.counter) return a.counter - b.counter;
  if (a.nodeId < b.nodeId) return -1;
  if (a.nodeId > b.nodeId) return 1;
  return 0;
}
