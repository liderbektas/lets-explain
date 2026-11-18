/**
 * Kafka's default key partitioner, ported from org.apache.kafka.common.utils.Utils.
 * A record with a key goes to partition toPositive(murmur2(utf8(key))) % numPartitions,
 * so the same key always lands in the same partition while the partition count is unchanged.
 */
export function murmur2(data: Uint8Array): number {
  const length = data.length;
  const seed = 0x9747b28c;
  const m = 0x5bd1e995;
  const r = 24;

  let h = (seed ^ length) | 0;
  const length4 = length >>> 2;

  for (let i = 0; i < length4; i++) {
    const i4 = i * 4;
    let k =
      (data[i4]! & 0xff) |
      ((data[i4 + 1]! & 0xff) << 8) |
      ((data[i4 + 2]! & 0xff) << 16) |
      ((data[i4 + 3]! & 0xff) << 24);
    k = Math.imul(k, m);
    k ^= k >>> r;
    k = Math.imul(k, m);
    h = Math.imul(h, m);
    h ^= k;
  }

  // Java's switch falls through 3 → 2 → 1.
  const tail = length & ~3;
  const rest = length % 4;
  if (rest === 3) h ^= (data[tail + 2]! & 0xff) << 16;
  if (rest >= 2) h ^= (data[tail + 1]! & 0xff) << 8;
  if (rest >= 1) {
    h ^= data[tail]! & 0xff;
    h = Math.imul(h, m);
  }

  h ^= h >>> 13;
  h = Math.imul(h, m);
  h ^= h >>> 15;
  return h | 0;
}

const encoder = new TextEncoder();

export function partitionForKey(key: string, numPartitions: number): number {
  return (murmur2(encoder.encode(key)) & 0x7fffffff) % numPartitions;
}
