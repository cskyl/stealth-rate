import type {
  Assignment,
  BackendAdapter,
  Block,
  EventPayload,
  ResponsePayload,
  StudyConfig,
} from "./types";

export type PayloadBundle = {
  session: Record<string, unknown>;
  events: EventPayload[];
  responses: ResponsePayload[];
};

function token(): string {
  return `s_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

export async function encodeBundle(bundle: PayloadBundle): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(bundle));
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
  const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = "";
  compressed.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return btoa(binary);
}

export function createPayloadAdapter(config: StudyConfig, blocks: Block[], itemsPerBlock: number): BackendAdapter {
  const events: EventPayload[] = [];
  const responses: ResponsePayload[] = [];
  let session: Record<string, unknown> = {};
  return {
    async assign(pidHash) {
      const sum = [...pidHash].reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const block = blocks[sum % blocks.length];
      session = {
        schema: "stealthrate.session.v1",
        session_id: token(),
        study_id: config.study_id,
        version: config.version,
        block_id: block.block_id,
        pid_hash: pidHash,
        started_at: new Date().toISOString(),
        status: "started",
        headphone_check: { correct: 0, total: 0 },
      };
      return {
        session_id: String(session.session_id),
        block_id: block.block_id,
        items: block.items.slice(0, Math.max(itemsPerBlock + 5, block.items.length)),
      } satisfies Assignment;
    },
    async event(payload) {
      events.push(payload);
    },
    async response(payload) {
      const duplicate = responses.some(
        (row) => row.item_id === payload.item_id && row.task === payload.task,
      );
      if (!duplicate) responses.push(payload);
    },
    async complete(sessionId, blockId) {
      session = {
        ...session,
        session_id: sessionId,
        block_id: blockId,
        status: "completed",
        finished_at: new Date().toISOString(),
      };
      const bundle = await encodeBundle({ session, events, responses });
      return { completion_code: "PAYLOAD", bundle };
    },
  };
}
