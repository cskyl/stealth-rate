import type { Assignment, Block } from "./backend/types";

const INVITE_RE = /^[0-9a-f]{32}$/i;

export type Invitation = {
  participantKey: string;
  blockId: string;
  inviteToken: string;
};

export type AssignmentOptions = {
  blockId?: string;
  inviteToken?: string;
  practiceCount?: number;
};

/** Parse a bearer invitation without ever placing the token in an error string. */
export function parseInvitation(blocks: Block[]): Invitation;
export function parseInvitation(hash: string, blocks: Block[]): Invitation;
export function parseInvitation(hashOrBlocks: string | Block[], maybeBlocks?: Block[]): Invitation {
  const hash = typeof hashOrBlocks === "string"
    ? hashOrBlocks
    : (globalThis.location?.hash ?? "");
  const blocks = typeof hashOrBlocks === "string" ? maybeBlocks ?? [] : hashOrBlocks;
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(raw);
  const inviteToken = params.get("invite") ?? "";
  const blockId = params.get("block") ?? "";
  if (!INVITE_RE.test(inviteToken)) {
    throw new Error("Invitation is invalid or incomplete");
  }
  if (!blocks.some((block) => block.block_id === blockId)) {
    throw new Error("Invitation block is not available");
  }
  const canonicalToken = inviteToken.toLowerCase();
  return {
    inviteToken: canonicalToken,
    blockId,
    participantKey: `invite_${stableDigest(canonicalToken)}`,
  };
}

/** A non-secret stable scope key suitable for browser storage and exported pid_hash. */
export function participantKeyForInvite(inviteToken: string): string {
  if (!INVITE_RE.test(inviteToken)) throw new Error("Invitation is invalid or incomplete");
  return `invite_${stableDigest(inviteToken.toLowerCase())}`;
}

function stableDigest(value: string): string {
  let hash = 2166136261;
  let second = 2246822519;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
    second ^= char.charCodeAt(0);
    second = Math.imul(second, 3266489917) >>> 0;
  }
  return `${hash.toString(16).padStart(8, "0")}${second.toString(16).padStart(8, "0")}`;
}

function seedFor(value: string): number {
  const digest = stableDigest(value);
  // Keep the seed in the exact unsigned 32-bit domain used by the xorshift.
  return Number.parseInt(digest.slice(0, 8), 16) || 1;
}

function nextRandom(seed: number): number {
  let value = seed >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return value >>> 0;
}

/** Shuffle rated items reproducibly while keeping the first practice items fixed. */
export function stableAssignedItems(
  items: string[],
  inviteToken: string,
  practiceCount = 2,
): string[] {
  if (!INVITE_RE.test(inviteToken)) throw new Error("Invitation is invalid or incomplete");
  const count = Math.max(0, Math.min(practiceCount, items.length));
  const practice = items.slice(0, count);
  const rated = items.slice(count);
  let seed = seedFor(inviteToken);
  for (let index = rated.length - 1; index > 0; index -= 1) {
    seed = nextRandom(seed);
    const swap = seed % (index + 1);
    [rated[index], rated[swap]] = [rated[swap], rated[index]];
  }
  return [...practice, ...rated];
}

export function assignmentForInvitation(
  block: Block,
  inviteToken: string,
  options: Pick<AssignmentOptions, "practiceCount"> = {},
): Pick<Assignment, "block_id" | "items"> {
  return {
    block_id: block.block_id,
    items: stableAssignedItems(block.items, inviteToken, options.practiceCount ?? 2),
  };
}
