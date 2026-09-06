import type { Assignment } from "./backend/types";

export type Screen =
  | "language"
  | "consent"
  | "device"
  | "headphones"
  | "instructions"
  | "practice"
  | "trial"
  | "complete";

export type FlowState = {
  screen: Screen;
  lang: "en" | "zh";
  assignment: Assignment | null;
  itemIndex: number;
  trialStarted: number;
  replayCount: number;
  playbackComplete: boolean;
  headphoneCorrect: number;
  headphoneTrial: number;
};

export type ResumeScope = {
  studyId: string;
  version: string;
  participantKey: string;
};

export type ResumeState = Pick<FlowState, "assignment" | "itemIndex" | "lang"> & {
  warning?: string;
};

const LEGACY_STORAGE_KEY = "stealthrate.resume";
let resumeScope: ResumeScope | null = null;
let storageWarning = "";

export function configureResumeScope(scope: ResumeScope): void {
  resumeScope = { ...scope };
}

export function getStorageWarning(): string {
  return storageWarning;
}

export function getOrCreateParticipantKey(studyId: string, version: string): string {
  const key = `stealthrate.participant.v1:${encodeURIComponent(studyId)}:${encodeURIComponent(version)}`;
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const generated = `anon_${crypto.randomUUID()}`;
    localStorage.setItem(key, generated);
    return generated;
  } catch (error) {
    storageWarning = `Participant identity storage unavailable: ${String(error)}`;
    throw new Error(storageWarning);
  }
}

function storageKey(scope = resumeScope): string | null {
  if (!scope?.studyId || !scope.version || !scope.participantKey) return null;
  return ["stealthrate.resume.v2", scope.studyId, scope.version, scope.participantKey]
    .map(encodeURIComponent).join(":");
}

export function createInitialState(): FlowState {
  return {
    screen: "language",
    lang: "en",
    assignment: null,
    itemIndex: 0,
    trialStarted: 0,
    replayCount: 0,
    playbackComplete: false,
    headphoneCorrect: 0,
    headphoneTrial: 0,
  };
}

export function saveResume(state: FlowState): { ok: boolean; error?: string } {
  const resume: ResumeState = {
    assignment: state.assignment,
    itemIndex: state.itemIndex,
    lang: state.lang,
  };
  const key = storageKey();
  if (!key) {
    storageWarning = "Resume storage is not scoped; restart required before continuing.";
    return { ok: false, error: storageWarning };
  }
  try {
    localStorage.setItem(key, JSON.stringify(resume));
    storageWarning = "";
    return { ok: true };
  } catch (error) {
    storageWarning = `Resume storage unavailable: ${String(error)}`;
    return { ok: false, error: storageWarning };
  }
}

export function loadResume(scope?: ResumeScope): ResumeState | null {
  if (scope) configureResumeScope(scope);
  const key = storageKey();
  if (!key) return null;
  try {
    const saved = localStorage.getItem(key);
    if (saved) return JSON.parse(saved) as ResumeState;
    // Never migrate an old unscoped record into a different study/version.
    if (localStorage.getItem(LEGACY_STORAGE_KEY) || sessionStorage.getItem(LEGACY_STORAGE_KEY)) {
      storageWarning = "An older unscoped session was found; it was not resumed. Please restart.";
      return { assignment: null, itemIndex: 0, lang: "en", warning: storageWarning };
    }
  } catch (error) {
    storageWarning = `Resume storage unavailable: ${String(error)}`;
    return { assignment: null, itemIndex: 0, lang: "en", warning: storageWarning };
  }
  return null;
}
