// DeepSeek 客户端。接口是 OpenAI 兼容的，所以 base URL 和模型名都走环境变量，
// 需要时可以整体切到别的供应商而不动上层逻辑。

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-flash";

export function isConfigured() {
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

function config() {
  const apiKey = process.env.DEEPSEEK_API_KEY || "";
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not configured");
  return {
    apiKey,
    baseUrl: (process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ""),
    model: process.env.DEEPSEEK_MODEL || DEFAULT_MODEL,
    timeoutMs: Number(process.env.DEEPSEEK_TIMEOUT_MS || 35_000),
  };
}

function mergeSignals(signal, timeoutMs) {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!signal) return timeout;
  return AbortSignal.any ? AbortSignal.any([signal, timeout]) : timeout;
}

async function request(body, signal) {
  const { apiKey, baseUrl, model, timeoutMs } = config();
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    signal: mergeSignals(signal, timeoutMs),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, ...body }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const error = new Error(`DeepSeek API ${response.status}: ${detail.slice(0, 300)}`);
    error.status = response.status;
    throw error;
  }
  return response;
}

/** 非流式补全。决策轮用它——工具调用一次性拿全，没有分片拼装的不确定性。 */
export async function complete({ messages, tools, toolChoice, maxTokens, temperature, signal }) {
  const body = { messages, stream: false };
  if (tools?.length) {
    body.tools = tools;
    body.tool_choice = toolChoice || "auto";
  }
  if (maxTokens) body.max_tokens = maxTokens;
  if (temperature !== undefined) body.temperature = temperature;
  const response = await request(body, signal);
  return response.json();
}

/** 通用 OpenAI SSE 解析：逐帧 yield 已解析的 JSON chunk。 */
export async function* parseSseStream(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let cut;
    while ((cut = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      for (const line of frame.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") return;
        try {
          yield JSON.parse(payload);
        } catch {
          // 半包或心跳，跳过
        }
      }
    }
  }
}

/** 流式补全，yield 文本增量。生成轮用它，且不传 tools。 */
export async function* streamText({ messages, maxTokens, temperature, signal }) {
  const body = { messages, stream: true };
  if (maxTokens) body.max_tokens = maxTokens;
  if (temperature !== undefined) body.temperature = temperature;
  const response = await request(body, signal);
  if (!response.body) throw new Error("DeepSeek 流式响应没有 body");
  for await (const chunk of parseSseStream(response)) {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (delta) yield delta;
  }
}

/**
 * OpenAI 兼容的 tool_calls 增量拼装器。
 *
 * 目前用不到：DeepSeek 官方文档列出的 streaming delta 字段只有 content / reasoning_content /
 * role / logprobs，没有 tool_calls 分片，也没承诺流式下会返回工具调用。所以决策轮走非流式。
 * 这个拼装器留给将来验证全流式（AGENT_STREAM_TOOLS=1），别删。
 */
export function createToolCallAccumulator() {
  const byIndex = new Map();
  return {
    push(deltaToolCalls) {
      for (const part of deltaToolCalls || []) {
        const index = part.index ?? 0;
        if (!byIndex.has(index)) {
          byIndex.set(index, { id: "", type: "function", function: { name: "", arguments: "" } });
        }
        const accumulated = byIndex.get(index);
        if (part.id) accumulated.id = part.id;
        if (part.type) accumulated.type = part.type;
        if (part.function?.name) accumulated.function.name += part.function.name;
        if (part.function?.arguments) accumulated.function.arguments += part.function.arguments;
      }
    },
    finish() {
      return [...byIndex.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, value]) => value)
        .filter((value) => value.function.name)
        .map((value, index) => ({ ...value, id: value.id || `call_${index}_${value.function.name}` }));
    },
  };
}
