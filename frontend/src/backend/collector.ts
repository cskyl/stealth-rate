import type { EventPayload, ResponsePayload } from "./types";

export type CollectorBundle = {
  session: Record<string, unknown>;
  events: EventPayload[];
  responses: ResponsePayload[];
};

export type CollectorStatus = {
  enabled?: boolean;
  pending: boolean;
  syncing: boolean;
  acknowledgedResponses: number;
  currentResponses: number;
  lastError?: string;
  lastSnapshot?: "partial" | "completed";
};

export type CollectorOptions = {
  url?: string;
  studyId: string;
  version: string;
  inviteToken: string;
  participantKey: string;
  storage?: Storage;
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

export type Collector = {
  snapshot: (bundle: CollectorBundle, phase?: "partial" | "completed") => Promise<string>;
  sync: (bundle: CollectorBundle) => Promise<void>;
  syncStatus: () => CollectorStatus;
};

type WireBundle = { session: CollectorBundle["session"]; events: EventPayload[]; responses: ResponsePayload[] };

function snapshotKey(options: CollectorOptions, phase: "partial" | "completed"): string {
  return ["stealthrate.snapshot.v1", options.studyId, options.version, options.participantKey, phase]
    .map(encodeURIComponent).join(":");
}

async function gzipBase64(bundle: CollectorBundle): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(bundle));
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
  const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = "";
  compressed.forEach((value) => { binary += String.fromCharCode(value); });
  return btoa(binary);
}

function cloneBundle(bundle: CollectorBundle): WireBundle {
  return {
    session: { ...bundle.session },
    events: bundle.events.map((event) => ({ ...event, payload: event.payload ? { ...event.payload } : undefined })),
    responses: bundle.responses.map((response) => ({ ...response, answers: { ...response.answers } })),
  };
}

export function createCollector(options: CollectorOptions): Collector {
  const storage = options.storage ?? globalThis.localStorage;
  const fetcher = options.fetcher ?? fetch;
  const status: CollectorStatus = {
    enabled: Boolean(options.url),
    pending: Boolean(options.url),
    syncing: false,
    acknowledgedResponses: 0,
    currentResponses: 0,
  };
  let syncChain: Promise<void> = Promise.resolve();
  let requestVersion = 0;
  let snapshotChain: Promise<string> = Promise.resolve("");

  const sync = async (bundle: CollectorBundle): Promise<void> => {
    const current = cloneBundle(bundle);
    const version = ++requestVersion;
    status.currentResponses = Math.max(status.currentResponses, current.responses.length);
    if (!options.url) {
      status.pending = false;
      status.lastError = undefined;
      status.acknowledgedResponses = 0;
      return;
    }
    status.pending = true;
    const work = syncChain.then(async () => {
      status.syncing = true;
      try {
        const controller = new AbortController();
        const timer = globalThis.setTimeout(() => controller.abort(), options.timeoutMs ?? 10000);
        let response: Response;
        try {
          response = await fetcher(options.url as string, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({
              op: "sync",
              study_id: options.studyId,
              version: options.version,
              invite_token: options.inviteToken,
              bundle: current,
            }),
            signal: controller.signal,
          });
        } finally {
          globalThis.clearTimeout(timer);
        }
        if (!response.ok) throw new Error(`collector HTTP ${response.status}`);
        const result = await response.json() as Record<string, unknown>;
        const acknowledged = Number(result.ack_response_count);
        if (result.ok !== true || !Number.isFinite(acknowledged) || acknowledged < current.responses.length) {
          throw new Error("collector acknowledgement is incomplete");
        }
        status.acknowledgedResponses = Math.max(status.acknowledgedResponses, acknowledged);
        if (version === requestVersion && acknowledged >= status.currentResponses) {
          status.pending = false;
          status.lastError = undefined;
        } else {
          status.pending = true;
        }
      } catch (error) {
        status.pending = true;
        status.lastError = error instanceof Error ? error.message : String(error);
        throw error;
      } finally {
        status.syncing = false;
      }
    });
    syncChain = work.catch(() => undefined);
    await work;
  };

  const snapshot = async (bundle: CollectorBundle, phase: "partial" | "completed" = "partial"): Promise<string> => {
    const work = snapshotChain.then(async () => {
      const current = cloneBundle(bundle);
      status.currentResponses = Math.max(status.currentResponses, current.responses.length);
      const encoded = await gzipBase64(current);
      // This write is deliberately completed before any collector request begins.
      storage.setItem(snapshotKey(options, phase), encoded);
      status.lastSnapshot = phase;
      if (options.url) {
        // Never make a rating advance wait for a remote collector. Local storage
        // is already durable; a later sync() call retries the pending bundle.
        void sync(current).catch(() => undefined);
      }
      return encoded;
    });
    snapshotChain = work.catch(() => "");
    return work;
  };

  return { snapshot, sync, syncStatus: () => ({ ...status }) };
}
