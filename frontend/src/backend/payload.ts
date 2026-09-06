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

type StoredPayload = PayloadBundle & { assignment: Assignment; completedBundle?: string };

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

function storageKey(config: StudyConfig, participantKey: string): string {
  return ["stealthrate.payload.v2", config.study_id, config.version, participantKey]
    .map(encodeURIComponent).join(":");
}

function readStored(config: StudyConfig, participantKey: string): StoredPayload | null {
  const raw = localStorage.getItem(storageKey(config, participantKey));
  if (!raw) return null;
  let value: StoredPayload;
  try { value = JSON.parse(raw) as StoredPayload; } catch (error) {
    throw new Error(`Stored payload is corrupt and was not overwritten: ${String(error)}`);
  }
  if (!value.session || !value.assignment ||
      value.session.study_id !== config.study_id || value.session.version !== config.version) {
    throw new Error("Stored payload scope is invalid and was not overwritten");
  }
  return value;
}

export function createPayloadAdapter(config: StudyConfig, blocks: Block[], itemsPerBlock: number): BackendAdapter {
  const events: EventPayload[] = [];
  const responses: ResponsePayload[] = [];
  let session: Record<string, unknown> = {};
  let assignment: Assignment | null = null;
  let completedBundle: string | undefined;
  let completedPersisted = false;
  let participantKey = "";
  let warning: string | null = null;
  const persist = (): void => {
    if (!participantKey || !assignment) return;
    try {
      const stored = { session, assignment, events, responses, completedBundle } satisfies StoredPayload;
      localStorage.setItem(storageKey(config, participantKey), JSON.stringify(stored));
      warning = null;
    } catch (error) {
      warning = `Payload storage unavailable: ${String(error)}`;
      throw new Error(warning);
    }
  };
  return {
    async assign(pidHash) {
      participantKey = pidHash;
      const old = readStored(config, participantKey);
      if (old) {
        session = old.session;
        assignment = old.assignment;
        events.length = 0;
        responses.length = 0;
        events.push(...old.events);
        responses.push(...old.responses);
        completedBundle = old.completedBundle;
        completedPersisted = Boolean(old.completedBundle);
        return { ...assignment, existing: true };
      }
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
      assignment = {
        session_id: String(session.session_id),
        block_id: block.block_id,
        items: block.items.slice(0, Math.max(itemsPerBlock + 5, block.items.length)),
      } satisfies Assignment;
      persist();
      return assignment;
    },
    async event(payload) {
      events.push(payload);
      try { persist(); } catch (error) { events.pop(); throw error; }
    },
    async response(payload) {
      const duplicate = responses.some(
        (row) => row.session_id === payload.session_id && row.item_id === payload.item_id && row.task === payload.task,
      );
      if (!duplicate) {
        responses.push(payload);
        try { persist(); } catch (error) { responses.pop(); throw error; }
      }
    },
    async complete(sessionId, blockId) {
      if (completedPersisted && completedBundle && String(session.session_id) === sessionId) {
        return { completion_code: "PAYLOAD", bundle: completedBundle };
      }
      const previousSession = session;
      const previousBundle = completedBundle;
      session = {
        ...session,
        session_id: sessionId,
        block_id: blockId,
        status: "completed",
        finished_at: new Date().toISOString(),
      };
      const bundle = await encodeBundle({ session, events, responses });
      completedBundle = bundle;
      try { persist(); } catch (error) {
        session = previousSession;
        completedBundle = previousBundle;
        completedPersisted = false;
        throw error;
      }
      completedPersisted = true;
      return { completion_code: "PAYLOAD", bundle };
    },
    async restore(sessionId) {
      if (!assignment || (sessionId && assignment.session_id !== sessionId)) return null;
      return { assignment, session, events: [...events], responses: [...responses], completedBundle };
    },
    async getCompletedBundle(sessionId) {
      return assignment?.session_id === sessionId ? completedBundle ?? null : null;
    },
    storageWarning() {
      return warning;
    },
  };
}
