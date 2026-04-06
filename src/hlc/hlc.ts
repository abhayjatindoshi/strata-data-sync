import type { Hlc } from './types';

export function createHlc(nodeId: string): Hlc {
  return { timestamp: 0, counter: 0, nodeId };
}

export function tick(local: Hlc, remote?: Hlc): Hlc {
  const now = Date.now();
  const r = remote ?? { timestamp: 0, counter: 0, nodeId: '' };
  if (now > local.timestamp && now > r.timestamp) {
    return { timestamp: now, counter: 0, nodeId: local.nodeId };
  }
  if (local.timestamp === r.timestamp) {
    return {
      timestamp: local.timestamp,
      counter: Math.max(local.counter, r.counter) + 1,
      nodeId: local.nodeId,
    };
  }
  if (local.timestamp > r.timestamp) {
    return { timestamp: local.timestamp, counter: local.counter + 1, nodeId: local.nodeId };
  }
  return { timestamp: r.timestamp, counter: r.counter + 1, nodeId: local.nodeId };
}

export function compareHlc(a: Hlc, b: Hlc): -1 | 0 | 1 {
  if (a.timestamp !== b.timestamp) return a.timestamp < b.timestamp ? -1 : 1;
  if (a.counter !== b.counter) return a.counter < b.counter ? -1 : 1;
  if (a.nodeId === b.nodeId) return 0;
  return a.nodeId < b.nodeId ? -1 : 1;
}
