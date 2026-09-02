import type { Assignment, BackendAdapter, EventPayload, ResponsePayload, StudyConfig } from "./types";

async function call(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch("./api", {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`local backend HTTP ${response.status}`);
  const result = await response.json() as Record<string, unknown>;
  if (result.ok === false) throw new Error(String(result.error ?? "local backend error"));
  return result;
}

export function createLocalAdapter(config: StudyConfig): BackendAdapter {
  return {
    async assign(pidHash, uaHash) {
      return await call({
        op: "assign",
        study: config.study_id,
        pid_hash: pidHash,
        ua_hash: uaHash,
      }) as unknown as Assignment;
    },
    async event(payload: EventPayload) {
      await call({ op: "event", study: config.study_id, ...payload });
    },
    async response(payload: ResponsePayload) {
      await call({ op: "response", study: config.study_id, ...payload });
    },
    async complete(sessionId, blockId) {
      return await call({
        op: "complete",
        study: config.study_id,
        session_id: sessionId,
        block_id: blockId,
      }) as { completion_code: string };
    },
  };
}
