import type {
  Assignment,
  BackendAdapter,
  Block,
  EventPayload,
  ResponsePayload,
  StudyConfig,
} from "./types";
import type { Collector, CollectorStatus } from "./collector";

export type PayloadBundle = {
  session: Record<string, unknown>;
  events: EventPayload[];
  responses: ResponsePayload[];
};

type StoredPayload = PayloadBundle & { assignment: Assignment; completedBundle?: string };

export type PayloadAdapterOptions = {
  blockId?: string;
  inviteToken?: string;
  practiceCount?: number;
  participantKey?: string;
  collector?: Collector;
};

export type PayloadAdapter = BackendAdapter & {
  snapshot: () => Promise<string>;
  sync: () => Promise<void>;
  syncStatus: () => { state: string; pending: number; message?: string };
};

function token(): string {
  return `s_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

function inviteParticipantKey(inviteToken: string): string {
  if (!/^[0-9a-f]{32}$/i.test(inviteToken)) throw new Error("Invitation is invalid or incomplete");
  let first = 2166136261;
  let second = 2246822519;
  for (const char of inviteToken.toLowerCase()) {
    first = Math.imul(first ^ char.charCodeAt(0), 16777619) >>> 0;
    second = Math.imul(second ^ char.charCodeAt(0), 3266489917) >>> 0;
  }
  return `invite_${first.toString(16).padStart(8, "0")}${second.toString(16).padStart(8, "0")}`;
}

function stableAssignedItems(items: string[], inviteToken: string, practiceCount = 2): string[] {
  const count = Math.max(0, Math.min(practiceCount, items.length));
  const rated = items.slice(count);
  let seed = Number.parseInt(inviteParticipantKey(inviteToken).slice(7, 15), 16) || 1;
  for (let index = rated.length - 1; index > 0; index -= 1) {
    seed >>>= 0;
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    const swap = (seed >>> 0) % (index + 1);
    [rated[index], rated[swap]] = [rated[swap], rated[index]];
  }
  return [...items.slice(0, count), ...rated];
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

export function createPayloadAdapter(
  config: StudyConfig,
  blocks: Block[],
  itemsPerBlock: number,
  adapterOptions: PayloadAdapterOptions = {},
): PayloadAdapter {
  const events: EventPayload[] = [];
  const responses: ResponsePayload[] = [];
  let session: Record<string, unknown> = {};
  let assignment: Assignment | null = null;
  let completedBundle: string | undefined;
  let completedPersisted = false;
  let participantKey = "";
  let warning: string | null = null;
  const collector = adapterOptions.collector;
  const buildBundle = (): PayloadBundle => ({
    session: { ...session },
    events: [...events],
    responses: [...responses],
  });
  const queueSnapshot = (phase: "partial" | "completed" = "partial"): Promise<string> => {
    if (!collector) return encodeBundle(buildBundle());
    return collector.snapshot(buildBundle(), phase).catch((error) => {
      warning = error instanceof Error ? error.message : String(error);
      return "";
    });
  };
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
    async assign(pidHash, _uaHash, options: PayloadAdapterOptions = adapterOptions) {
      const inviteToken = options.inviteToken;
      participantKey = options.participantKey ??
        (inviteToken ? inviteParticipantKey(inviteToken) : pidHash);
      const old = readStored(config, participantKey);
      if (old) {
        if (options.blockId && old.assignment.block_id !== options.blockId) {
          throw new Error("Stored assignment scope does not match this invitation");
        }
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
      const block = options.blockId
        ? blocks.find((candidate) => candidate.block_id === options.blockId)
        : blocks[sum % blocks.length];
      if (!block) throw new Error("Invitation block is not available");
      const assignedItems = inviteToken
        ? stableAssignedItems(block.items, inviteToken, options.practiceCount ?? 2)
        : block.items.slice(0, Math.max(itemsPerBlock + 5, block.items.length));
      // A new invite in the same browser starts a separate in-memory stream.
      events.length = 0;
      responses.length = 0;
      completedBundle = undefined;
      completedPersisted = false;
      session = {
        schema: "stealthrate.session.v1",
        session_id: token(),
        study_id: config.study_id,
        version: config.version,
        block_id: block.block_id,
        pid_hash: participantKey,
        started_at: new Date().toISOString(),
        status: "started",
        headphone_check: { correct: 0, total: 0 },
      };
      assignment = {
        session_id: String(session.session_id),
        block_id: block.block_id,
        items: assignedItems,
      } satisfies Assignment;
      persist();
      void queueSnapshot("partial");
      return assignment;
    },
    async event(payload) {
      events.push(payload);
      try { persist(); } catch (error) { events.pop(); throw error; }
      void queueSnapshot("partial");
    },
    async response(payload) {
      const duplicate = responses.some(
        (row) => row.session_id === payload.session_id && row.item_id === payload.item_id && row.task === payload.task,
      );
      if (!duplicate) {
        responses.push(payload);
        try { persist(); } catch (error) { responses.pop(); throw error; }
        void queueSnapshot("partial");
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
      // Await only the local gzip write; collector networking is backgrounded
      // inside snapshot() and never delays completion.
      await queueSnapshot("completed");
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
    snapshot: async () => {
      const encoded = await queueSnapshot("partial");
      return encoded || completedBundle || "";
    },
    sync: async () => {
      if (!collector) return;
      await collector.sync(buildBundle());
    },
    syncStatus: () => {
      if (!collector) return { state: "local", pending: 0 };
      const current = collector.syncStatus();
      return {
        state: !current.enabled ? "disabled" : current.syncing ? "syncing" : current.pending ? "pending" : "synced",
        pending: current.pending
          ? Math.max(0, current.currentResponses - current.acknowledgedResponses)
          : 0,
        ...(current.lastError ? { message: current.lastError } : {}),
      };
    },
  };
}
