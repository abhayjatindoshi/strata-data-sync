import type { Hlc } from './types';

export function createHlc(nodeId: string): Hlc {
  return { timestamp: 0, counter: 0, nodeId };
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
  if (now > local.timestamp && now > remote.timestamp) {
    return { timestamp: now, counter: 0, nodeId: local.nodeId };
  }
  if (local.timestamp === remote.timestamp) {
    return {
      timestamp: local.timestamp,
      counter: Math.max(local.counter, remote.counter) + 1,
      nodeId: local.nodeId,
    };
  }
  if (local.timestamp > remote.timestamp) {
    return { timestamp: local.timestamp, counter: local.counter + 1, nodeId: local.nodeId };
  }
  return { timestamp: remote.timestamp, counter: remote.counter + 1, nodeId: local.nodeId };
}

export function compareHlc(a: Hlc, b: Hlc): -1 | 0 | 1 {
  if (a.timestamp !== b.timestamp) return a.timestamp < b.timestamp ? -1 : 1;
  if (a.counter !== b.counter) return a.counter < b.counter ? -1 : 1;
  if (a.nodeId === b.nodeId) return 0;
  return a.nodeId < b.nodeId ? -1 : 1;
}
