// SSE 帧格式与响应头。

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  // no-transform 与 X-Accel-Buffering 缺一不可：少了它们，中间的 nginx／CDN 会把
  // 整条流缓冲到结束才一次性吐出，用户看到的就是「转很久然后瞬间刷屏」。
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

export const HEARTBEAT_MS = 15_000;

/** data 一律 JSON 序列化——答案里的换行如果裸写进 data 会破坏 SSE 的帧结构。 */
export function formatSse({ event, data }) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function errorEvent(code, message, retryable = true) {
  return { event: "error", data: { code, message, retryable } };
}
