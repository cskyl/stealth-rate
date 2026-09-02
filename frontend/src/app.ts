import "./styles.css";
import {
  createAppsScriptAdapter,
  createLocalAdapter,
  createPayloadAdapter,
} from "./backend/index";
import type {
  Assignment,
  BackendAdapter,
  Block,
  PublicItem,
  StudyConfig,
} from "./backend/types";
import { h } from "./dom";
import { renderConsent } from "./screens/consent";
import { renderCompletion, renderPayloadControls } from "./screens/completion";
import { renderHeadphone } from "./screens/headphone";
import { renderInstructions } from "./screens/instructions";
import { renderLanguage } from "./screens/language";
import { renderPractice } from "./screens/practice";
import { actionButton, type ScreenContext } from "./screens/context";
import { renderTrial } from "./screens/trial";
import { attachMedia, type MediaController } from "./media";
import { stringsFor, translate, type Lang, type Strings } from "./i18n";
import {
  createInitialState,
  loadResume,
  saveResume,
  type FlowState,
  type Screen,
} from "./state";

const appRoot = document.querySelector<HTMLDivElement>("#app");
if (!appRoot) {
  throw new Error("Missing #app root");
}
const root = appRoot;

const query = new URLSearchParams(location.search);
const state = createInitialState();
let strings: Strings = stringsFor(state.lang);
let study: StudyConfig;
let items: PublicItem[] = [];
let itemMap = new Map<string, PublicItem>();
let blocks: Block[] = [];
let backend: BackendAdapter;
let media: MediaController | null = null;

function t(key: string): string {
  return translate(strings, key);
}

function context(): ScreenContext {
  return { study, state, itemMap, t, navigate };
}

function navigate(screen: Screen): void {
  state.screen = screen;
  renderScreen();
}

function renderHeader(): HTMLElement {
  const select = h(
    "select",
    { id: "language", "aria-label": t("language"), value: state.lang },
    h("option", { value: "en" }, "English"),
    h("option", { value: "zh" }, "中文"),
  );
  select.addEventListener("change", () => {
    state.lang = select.value as Lang;
    strings = stringsFor(state.lang);
    saveResume(state);
    renderScreen();
  });
  return h("header", {}, h("h1", {}, study.title), select);
}

function currentItem(): PublicItem | null {
  const id = state.assignment?.items[state.itemIndex];
  return id ? itemMap.get(id) ?? null : null;
}

function renderDevice(): HTMLElement {
  return h(
    "div",
    {},
    h("h2", {}, t("device")),
    h("p", {}, t("desktop")),
    actionButton(
      t("continue"),
      study.requirements.headphone_check ? "headphones" : "instructions",
    ),
  );
}

function renderRoute(): HTMLElement {
  const ctx = context();
  if (state.screen === "language") return renderLanguage(ctx);
  if (state.screen === "consent") return renderConsent(ctx);
  if (state.screen === "device") return renderDevice();
  if (state.screen === "headphones") return renderHeadphone(ctx);
  if (state.screen === "instructions") return renderInstructions(ctx);
  if (state.screen === "practice") {
    const item = currentItem();
    return item ? renderPractice(ctx, item) : renderCompletion(ctx);
  }
  if (state.screen === "trial") {
    const item = currentItem();
    return item ? renderTrial(ctx, item).content : renderCompletion(ctx);
  }
  return renderCompletion(ctx);
}

function renderScreen(): void {
  media?.dispose();
  media = null;
  if (state.screen === "trial" && !state.trialStarted) {
    state.trialStarted = performance.now();
  }
  const content = renderRoute();
  root.replaceChildren(renderHeader(), h("section", { className: "card" }, content));
  if (state.screen !== "trial") return;
  const video = root.querySelector<HTMLVideoElement>("#clip");
  const item = currentItem();
  const assignment = state.assignment;
  if (!video || !item || !assignment) return;
  media = attachMedia({
    video,
    src: `${study.media_base_url}${item.media}`,
    itemId: item.item_id,
    sessionId: assignment.session_id,
    backend,
    onEnded: () => {
      state.playbackComplete = true;
      renderScreen();
    },
    onReplay: (count) => {
      state.replayCount = count;
    },
  });
}

function playTone(side: "left" | "right"): void {
  const AudioContextConstructor = window.AudioContext;
  if (!AudioContextConstructor) return;
  const audio = new AudioContextConstructor();
  const buffer = audio.createBuffer(2, audio.sampleRate * 0.45, audio.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < data.length; index += 1) {
      const fadeIn = Math.min(1, index / 400);
      const fadeOut = Math.min(1, (data.length - index) / 3000);
      const phase = channel === (side === "left" ? 0 : 1) ? 1 : -1;
      data[index] = phase * fadeIn * fadeOut *
        Math.sin(2 * Math.PI * 440 * index / audio.sampleRate);
    }
  }
  const source = audio.createBufferSource();
  source.buffer = buffer;
  source.connect(audio.destination);
  source.start();
  source.addEventListener("ended", () => void audio.close());
}

function answerHeadphone(side: "left" | "right"): void {
  const expected = state.headphoneTrial % 2 === 0 ? "left" : "right";
  if (side === expected) state.headphoneCorrect += 1;
  state.headphoneTrial += 1;
  if (state.headphoneTrial >= study.headphone_trials) {
    if (state.headphoneCorrect < study.headphone_minimum) {
      renderScreen();
    } else {
      navigate("instructions");
    }
  } else {
    renderScreen();
  }
}

async function startStudy(): Promise<void> {
  state.assignment = await backend.assign(pidHash(), uaHash());
  state.itemIndex = 0;
  saveResume(state);
  state.screen = currentItem()?.practice ? "practice" : "trial";
  renderScreen();
}

function pidHash(): string {
  const raw = query.get("PROLIFIC_PID") ?? query.get("SESSION_ID") ?? "local-demo";
  const value = Array.from(raw).reduce(
    (sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0,
    7,
  );
  return `p_${value.toString(16)}`;
}

function uaHash(): string {
  return `u_${navigator.userAgent.length.toString(16)}`;
}

function advancePractice(): void {
  state.itemIndex += 1;
  state.screen = currentItem()?.practice ? "practice" : "trial";
  saveResume(state);
  renderScreen();
}

async function submitTrial(): Promise<void> {
  const form = root.querySelector<HTMLFormElement>("#trial-form");
  const assignment = state.assignment;
  if (!form || !assignment || !form.reportValidity()) return;
  const data = new FormData(form);
  const id = assignment.items[state.itemIndex];
  const common = {
    session_id: assignment.session_id,
    item_id: id,
    rt_ms: Math.round(performance.now() - state.trialStarted),
    replay_count: state.replayCount,
  };
  await backend.response({
    ...common,
    task: "mcq",
    answers: {
      choice: data.get("choice"),
      confidence: Number(data.get("mcq_confidence")),
    },
  });
  await backend.response({
    ...common,
    task: "edit",
    answers: {
      edited: data.get("edited"),
      noticed: data.getAll("noticed"),
      conspicuousness: Number(data.get("conspicuousness")),
      naturalness: Number(data.get("naturalness")),
      confidence: Number(data.get("edit_confidence")),
    },
  });
  state.itemIndex += 1;
  state.playbackComplete = false;
  state.replayCount = 0;
  state.trialStarted = performance.now();
  saveResume(state);
  if (state.itemIndex >= assignment.items.length) {
    state.screen = "complete";
    renderScreen();
    const result = await backend.complete(assignment.session_id, assignment.block_id);
    const box = root.querySelector<HTMLElement>("#completion");
    if (box && result.bundle) {
      renderPayloadControls(box, result.bundle, t,
        `data:application/gzip;base64,${result.bundle}`);
    } else if (box) {
      box.replaceChildren(h("p", {}, `Completion code: ${result.completion_code}`));
    }
  } else {
    state.screen = currentItem()?.practice ? "practice" : "trial";
    renderScreen();
  }
}

function handleAction(action: string): void {
  if (action === "consent" || action === "device" || action === "instructions") {
    navigate(action);
  } else if (action === "headphones") {
    state.headphoneTrial = 0;
    state.headphoneCorrect = 0;
    navigate("headphones");
  } else if (action === "play-tone") {
    playTone(state.headphoneTrial % 2 === 0 ? "left" : "right");
  } else if (action === "headphone-left" || action === "headphone-right") {
    answerHeadphone(action.endsWith("left") ? "left" : "right");
  } else if (action === "start") {
    void startStudy();
  } else if (action === "practice-next") {
    advancePractice();
  } else if (action === "play") {
    void media?.play();
  } else if (action === "replay") {
    void media?.replay();
  } else if (action === "download") {
    root.querySelector<HTMLAnchorElement>(".download-link")?.click();
  } else if (action === "copy") {
    void navigator.clipboard?.writeText(
      root.querySelector<HTMLTextAreaElement>("#payload-code")?.value ?? "",
    );
  }
}

function installEvents(): void {
  root.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "button[data-action]",
    );
    if (target) handleAction(target.dataset.action ?? "");
  });
  root.addEventListener("submit", (event) => {
    if ((event.target as HTMLFormElement).id === "trial-form") {
      event.preventDefault();
      void submitTrial();
    }
  });
}

function installTestHook(): void {
  window.__STEALTHRATE_TEST__ = {
    answerHeadphone,
    answerTrial: () => {
      const form = root.querySelector<HTMLFormElement>("#trial-form");
      if (!form) return;
      const choice = form.querySelector<HTMLInputElement>("input[name=choice]");
      const edited = form.querySelector<HTMLInputElement>("input[name=edited][value=no]");
      if (choice && edited) {
        choice.checked = true;
        edited.checked = true;
        form.requestSubmit();
      }
    },
    setAssignmentItems: (ids: string[]) => {
      if (state.assignment) {
        state.assignment = { ...state.assignment, items: ids } as Assignment;
        saveResume(state);
      }
    },
    getState: () => ({ ...state }),
  };
}

declare global {
  interface Window {
    __STEALTHRATE_TEST__?: {
      answerHeadphone: (side: "left" | "right") => void;
      answerTrial: () => void;
      setAssignmentItems: (ids: string[]) => void;
      getState: () => FlowState;
    };
  }
}

async function init(): Promise<void> {
  try {
    const slug = query.get("study") ?? "sample_synthetic_v0";
    const [studyData, itemData, blockData] = await Promise.all([
      fetch(`./studies/${slug}/study.json`).then((response) => response.json()),
      fetch(`./studies/${slug}/items.json`).then((response) => response.json()),
      fetch(`./studies/${slug}/blocks.json`).then((response) => response.json()),
    ]);
    study = studyData as StudyConfig;
    items = itemData.items as PublicItem[];
    itemMap = new Map(items.map((item) => [item.item_id, item]));
    blocks = blockData.blocks as Block[];
    backend = study.backend.mode === "local"
      ? createLocalAdapter(study)
      : study.backend.mode === "apps_script"
        ? createAppsScriptAdapter(study)
        : createPayloadAdapter(study, blocks, study.items_per_rater);
    const saved = loadResume();
    if (saved?.assignment) {
      state.assignment = saved.assignment;
      state.itemIndex = saved.itemIndex;
      state.lang = saved.lang;
      strings = stringsFor(state.lang);
      state.screen = currentItem()?.practice ? "practice" : "trial";
    }
    installEvents();
    installTestHook();
    renderScreen();
  } catch (error) {
    root.replaceChildren(h("p", { className: "error" },
      `${t("error")}: ${String(error)}`));
  }
}

export async function startApp(): Promise<void> {
  await init();
}
