export type Hlc = {
  readonly timestamp: number;
  readonly counter: number;
  readonly nodeId: string;
};

export function createHlc(nodeId: string): Hlc {
  return {
    timestamp: Date.now(),
    counter: 0,
    nodeId,
  };
}

export function tickLocal(hlc: Hlc): Hlc {
  const now = Date.now();
  const timestamp = Math.max(now, hlc.timestamp);
  const counter = timestamp === hlc.timestamp ? hlc.counter + 1 : 0;
  return { timestamp, counter, nodeId: hlc.nodeId };
}

export function tickRemote(local: Hlc, remote: Hlc): Hlc {
  const now = Date.now();
  const maxTimestamp = Math.max(now, local.timestamp, remote.timestamp);

  let counter: number;
  if (maxTimestamp === local.timestamp && maxTimestamp === remote.timestamp) {
    counter = Math.max(local.counter, remote.counter) + 1;
  } else if (maxTimestamp === local.timestamp) {
    counter = local.counter + 1;
  } else if (maxTimestamp === remote.timestamp) {
    counter = remote.counter + 1;
  } else {
    counter = 0;
  }

  return { timestamp: maxTimestamp, counter, nodeId: local.nodeId };
}

export function compareHlc(a: Hlc, b: Hlc): -1 | 0 | 1 {
  if (a.timestamp !== b.timestamp) {
    return a.timestamp < b.timestamp ? -1 : 1;
  }
  if (a.counter !== b.counter) {
    return a.counter < b.counter ? -1 : 1;
  }
  if (a.nodeId < b.nodeId) return -1;
  if (a.nodeId > b.nodeId) return 1;
  return 0;
}
