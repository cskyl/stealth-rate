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

type ResumeState = Pick<FlowState, "assignment" | "itemIndex" | "lang">;
const STORAGE_KEY = "stealthrate.resume";

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

export function saveResume(state: FlowState): void {
  const resume: ResumeState = {
    assignment: state.assignment,
    itemIndex: state.itemIndex,
    lang: state.lang,
  };
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(resume));
}

export function loadResume(): ResumeState | null {
  const saved = sessionStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return null;
  }
  try {
    return JSON.parse(saved) as ResumeState;
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
}
