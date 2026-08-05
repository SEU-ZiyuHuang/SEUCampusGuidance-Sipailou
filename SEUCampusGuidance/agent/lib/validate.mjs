// /api/chat 的入参校验。本地服务器和 Vercel Function 共用，避免两边规则漂移。

import { isCampusSlug } from "./campus.mjs";

export const MAX_MESSAGE_CHARS = 500;

/** 返回 { ok:true, value } 或 { ok:false, status, error }。 */
export function validateChatInput(input) {
  if (typeof input !== "object" || input === null) {
    return { ok: false, status: 400, error: "invalid body" };
  }
  const message = String(input.message || "").trim();
  if (!message) return { ok: false, status: 400, error: "message is required" };
  if (message.length > MAX_MESSAGE_CHARS) {
    return { ok: false, status: 400, error: `message too long (max ${MAX_MESSAGE_CHARS})` };
  }
  const campus = isCampusSlug(input.campus) ? input.campus : null;
  const history = Array.isArray(input.history) ? input.history : [];
  return { ok: true, value: { message, campus, history } };
}
