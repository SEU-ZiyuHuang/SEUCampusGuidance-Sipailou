// 按 IP 的滑动窗口频控。
//
// 注意边界：serverless 下每个实例有独立内存，所以这只能挡住单实例上的无脑循环，
// 不是严格的全局配额。真要控成本得上 KV（会引入依赖），留到 M1 决策。

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;
const MAX_TRACKED_IPS = 5000;

const buckets = new Map();

export function checkRateLimit(key, { windowMs = WINDOW_MS, max = MAX_REQUESTS } = {}) {
  const now = Date.now();
  const identity = key || "unknown";
  const hits = (buckets.get(identity) || []).filter((at) => now - at < windowMs);
  if (hits.length >= max) {
    buckets.set(identity, hits);
    return false;
  }
  hits.push(now);
  buckets.set(identity, hits);

  // 简单的容量保护，避免 Map 无限增长。
  if (buckets.size > MAX_TRACKED_IPS) {
    for (const [tracked, times] of buckets) {
      if (!times.length || now - times.at(-1) > windowMs) buckets.delete(tracked);
      if (buckets.size <= MAX_TRACKED_IPS) break;
    }
  }
  return true;
}

export function clientIp(headers) {
  const forwarded = headers["x-forwarded-for"] || headers.get?.("x-forwarded-for");
  if (forwarded) return String(forwarded).split(",")[0].trim();
  const real = headers["x-real-ip"] || headers.get?.("x-real-ip");
  return real ? String(real).trim() : "unknown";
}
