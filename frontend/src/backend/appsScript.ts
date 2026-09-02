import type { Assignment, BackendAdapter, EventPayload, ResponsePayload, StudyConfig } from "./types";

async function call(
  url: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`backend HTTP ${response.status}`);
  const result = await response.json() as Record<string, unknown>;
  if (result.ok === false) throw new Error(String(result.error ?? "backend error"));
  return result;
}

export function createAppsScriptAdapter(config: StudyConfig): BackendAdapter {
  const url = config.backend.apps_script_url;
  return {
    async assign(pidHash, uaHash) {
      return await call(url, {
        op: "assign",
        study: config.study_id,
        pid_hash: pidHash,
        ua_hash: uaHash,
      }) as unknown as Assignment;
    },
    async event(payload: EventPayload) {
      await call(url, { op: "event", study: config.study_id, ...payload });
    },
    async response(payload: ResponsePayload) {
      await call(url, { op: "response", study: config.study_id, ...payload });
    },
    async complete(sessionId, blockId) {
      return await call(url, {
        op: "complete",
        study: config.study_id,
        session_id: sessionId,
        block_id: blockId,
      }) as { completion_code: string };
    },
  };
}
