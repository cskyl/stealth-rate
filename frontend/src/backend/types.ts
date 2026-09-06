export type PublicItem = {
  item_id: string;
  media: string;
  duration_s: number;
  role: "audio" | "visual";
  question: string;
  options: string[];
  practice: boolean;
  practice_feedback: string | null;
};

export type StudyConfig = {
  study_id: string;
  version: string;
  title: string;
  presentation?: "synthetic_demo" | "real_stealth";
  languages: string[];
  backend: {
    mode: "payload" | "apps_script" | "local";
    apps_script_url: string;
  };
  media_base_url: string;
  requirements: {
    desktop_only: boolean;
    headphone_check: boolean;
    full_playback_before_answer: boolean;
  };
  items_per_rater: number;
  headphone_trials: number;
  headphone_minimum: number;
  design: { items_per_rater: number };
  tasks: TaskSpec[];
  text: {
    consent_md: string;
    instructions_md: string;
    debrief_md: string;
    consent_en?: string;
    consent_zh?: string;
    mode_label_en?: string;
    mode_label_zh?: string;
  };
};

export type TaskField = {
  type: "yesno" | "likert" | "multiselect";
  prompt?: string;
  min?: number;
  max?: number;
  options?: string[];
  anchors?: string[];
  when?: string;
};

export type TaskSpec = {
  id: string;
  prompt_audio?: string;
  prompt_visual?: string;
  confidence?: number[];
  fields?: Record<string, TaskField>;
};

export type Block = {
  block_id: string;
  items: string[];
};
export type Assignment = {
  session_id: string;
  block_id: string;
  items: string[];
  existing?: boolean;
};
export type EventPayload = {
  session_id: string;
  ts?: string;
  type: string;
  item_id?: string;
  payload?: Record<string, unknown>;
};
export type ResponsePayload = {
  session_id: string;
  item_id: string;
  task: "mcq" | "edit" | "pair";
  answers: Record<string, unknown>;
  rt_ms: number;
  replay_count: number;
  submitted_at?: string;
};

export type PayloadRestore = {
  assignment: Assignment;
  session: Record<string, unknown>;
  events: EventPayload[];
  responses: ResponsePayload[];
  completedBundle?: string;
};

export interface BackendAdapter {
  assign(pidHash: string, uaHash: string): Promise<Assignment>;
  event(payload: EventPayload): Promise<void>;
  response(payload: ResponsePayload): Promise<void>;
  complete(sessionId: string, blockId: string): Promise<{ completion_code: string; bundle?: string }>;
  restore?(sessionId?: string): Promise<PayloadRestore | null>;
  getCompletedBundle?(sessionId: string): Promise<string | null>;
  storageWarning?(): string | null;
}
