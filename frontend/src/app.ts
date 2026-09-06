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
import { attachMedia, type MediaController, type MediaStatus } from "./media";
import { stringsFor, translate, type Lang, type Strings } from "./i18n";
import {
  createInitialState,
  configureResumeScope,
  getOrCreateParticipantKey,
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
let participantKey = "";
let startInFlight = false;
let submitInFlight = false;
let completionInFlight = false;
let headphoneOrder: Array<"left" | "right"> = [];
const draftByItem = new Map<string, Record<string, string[]>>();

function t(key: string): string {
  return translate(strings, key);
}

function persistResume(): void {
  const result = saveResume(state);
  if (!result.ok) throw new Error(result.error ?? "Could not save progress");
}

function context(): ScreenContext {
  return { study, state, itemMap, t, navigate };
}

function navigate(screen: Screen): void {
  state.screen = screen;
  renderScreen();
}

function captureDraft(): void {
  if (state.screen !== "trial" || !state.assignment) return;
  const form = root.querySelector<HTMLFormElement>("#trial-form");
  const itemId = state.assignment.items[state.itemIndex];
  if (!form || !itemId) return;
  const draft: Record<string, string[]> = {};
  for (const [key, value] of new FormData(form).entries()) {
    const values = draft[key] ?? [];
    values.push(String(value));
    draft[key] = values;
  }
  if (Object.keys(draft).length > 0) draftByItem.set(itemId, draft);
}

function restoreDraft(): void {
  if (state.screen !== "trial" || !state.assignment) return;
  const form = root.querySelector<HTMLFormElement>("#trial-form");
  const itemId = state.assignment.items[state.itemIndex];
  const draft = itemId ? draftByItem.get(itemId) : undefined;
  if (!form || !draft) return;
  for (const [name, values] of Object.entries(draft)) {
    for (const input of form.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
      `[name="${CSS.escape(name)}"]`,
    )) {
      if (input instanceof HTMLInputElement && (input.type === "radio" || input.type === "checkbox")) {
        input.checked = values.includes(input.value);
      } else if (input instanceof HTMLSelectElement) {
        input.value = values[0] ?? "";
      }
    }
  }
}

function updatePlaybackUI(status: MediaStatus, detail?: string): void {
  const statusBox = root.querySelector<HTMLElement>("#media-status");
  if (statusBox) {
    statusBox.classList.toggle("error", status === "error");
    const labels: Record<MediaStatus, string> = {
      loading: t("media_loading"),
      ready: t("playback_required"),
      playing: t("media_playing"),
      complete: t("playback_complete"),
      error: `${t("media_error")}${detail ? `: ${detail}` : ""}`,
    };
    statusBox.textContent = labels[status];
  }
  const form = root.querySelector<HTMLFormElement>("#trial-form");
  if (form) {
    form.hidden = !state.playbackComplete;
    for (const input of form.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select")) {
      input.disabled = !state.playbackComplete;
    }
  }
  const practiceNext = root.querySelector<HTMLButtonElement>("button[data-action=practice-next]");
  if (practiceNext) practiceNext.disabled = !state.playbackComplete;
}

function attachPreviewFailureHandlers(): void {
  for (const video of root.querySelectorAll<HTMLVideoElement>(".example-clip video")) {
    video.addEventListener("error", () => {
      const status = video.parentElement?.querySelector<HTMLElement>(".media-status");
      if (status) {
        status.classList.add("error");
        status.textContent = `${t("media_error")}: ${t("open_clip")}`;
      }
    });
    video.addEventListener("loadeddata", () => {
      const status = video.parentElement?.querySelector<HTMLElement>(".media-status");
      if (status) status.textContent = t("media_ready");
    });
  }
}

function renderHeader(): HTMLElement {
  const select = h(
    "select",
    { id: "language", "aria-label": t("language"), value: state.lang },
    h("option", { value: "en" }, "English"),
    h("option", { value: "zh" }, "中文"),
  );
  select.addEventListener("change", () => {
    captureDraft();
    state.lang = select.value as Lang;
    strings = stringsFor(state.lang);
    persistResume();
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
  captureDraft();
  media?.dispose();
  media = null;
  if (state.screen === "trial" && !state.trialStarted) {
    state.trialStarted = performance.now();
  }
  const content = renderRoute();
  root.replaceChildren(renderHeader(), h("section", { className: "card" }, content));
  attachPreviewFailureHandlers();
  if (state.screen !== "trial" && state.screen !== "practice") return;
  const video = root.querySelector<HTMLVideoElement>("#clip");
  const item = currentItem();
  const assignment = state.assignment;
  if (!video || !item) return;
  if (state.screen === "trial" && !assignment) return;
  media = attachMedia({
    video,
    src: `${study.media_base_url}${item.media}`,
    itemId: item.item_id,
    sessionId: assignment?.session_id ?? "demo",
    backend,
    onEnded: (verified) => {
      if (verified) state.playbackComplete = true;
      updatePlaybackUI(verified ? "complete" : "ready");
    },
    onReplay: (count) => {
      state.replayCount = count;
    },
    onStatus: updatePlaybackUI,
  });
  restoreDraft();
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
      const activeChannel = side === "left" ? 0 : 1;
      data[index] = channel === activeChannel
        ? fadeIn * fadeOut * Math.sin(2 * Math.PI * 440 * index / audio.sampleRate)
        : 0;
    }
  }
  const source = audio.createBufferSource();
  source.buffer = buffer;
  source.connect(audio.destination);
  source.start();
  source.addEventListener("ended", () => void audio.close());
}

function answerHeadphone(side: "left" | "right"): void {
  const expected = headphoneOrder[state.headphoneTrial] ??
    (state.headphoneTrial % 2 === 0 ? "left" : "right");
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
  if (startInFlight || state.assignment) return;
  startInFlight = true;
  try {
    state.assignment = await backend.assign(pidHash(), uaHash());
    state.itemIndex = 0;
    state.playbackComplete = false;
    state.replayCount = 0;
    persistResume();
    state.screen = currentItem()?.practice ? "practice" : "trial";
    renderScreen();
  } catch (error) {
    const button = root.querySelector<HTMLButtonElement>("button[data-action=start]");
    if (button) button.disabled = false;
    const message = error instanceof Error ? error.message : String(error);
    root.querySelector<HTMLElement>(".card")?.prepend(
      h("p", { className: "error", role: "alert" }, `${t("error")}: ${message}`),
    );
  } finally {
    startInFlight = false;
  }
}

function pidHash(): string {
  if (participantKey) return participantKey;
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
  if (!state.playbackComplete) return;
  state.itemIndex += 1;
  state.playbackComplete = false;
  state.replayCount = 0;
  state.screen = currentItem()?.practice ? "practice" : "trial";
  persistResume();
  renderScreen();
}

async function submitTrial(): Promise<void> {
  const form = root.querySelector<HTMLFormElement>("#trial-form");
  const assignment = state.assignment;
  if (submitInFlight || !state.playbackComplete || !form || !assignment || !form.reportValidity()) return;
  submitInFlight = true;
  const submit = form.querySelector<HTMLButtonElement>("button[type=submit]");
  if (submit) submit.disabled = true;
  const data = new FormData(form);
  const id = assignment.items[state.itemIndex];
  const common = {
    session_id: assignment.session_id,
    item_id: id,
    rt_ms: Math.round(performance.now() - state.trialStarted),
    replay_count: state.replayCount,
  };
  try {
    if (study.tasks.some((task) => task.id === "mcq")) {
      await backend.response({
        ...common,
        task: "mcq",
        answers: {
          choice: data.get("choice"),
          confidence: Number(data.get("mcq_confidence")),
        },
      });
    }
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
    draftByItem.delete(assignment.items[state.itemIndex]);
    state.itemIndex += 1;
    state.playbackComplete = false;
    state.replayCount = 0;
    state.trialStarted = performance.now();
    persistResume();
    if (state.itemIndex >= assignment.items.length) {
      state.screen = "complete";
      renderScreen();
      await completeSession();
    } else {
      state.screen = currentItem()?.practice ? "practice" : "trial";
      renderScreen();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (submit) submit.disabled = false;
    const box = root.querySelector<HTMLElement>("#completion") ?? form;
    box.prepend(h("p", { className: "error", role: "alert" }, `${t("error")}: ${message}`));
  } finally {
    submitInFlight = false;
  }
}

async function completeSession(): Promise<void> {
  const assignment = state.assignment;
  if (!assignment || completionInFlight) return;
  completionInFlight = true;
  const box = root.querySelector<HTMLElement>("#completion");
  if (box) box.replaceChildren(h("p", {}, t("completion_loading")));
  try {
    const result = await backend.complete(assignment.session_id, assignment.block_id);
    const currentBox = root.querySelector<HTMLElement>("#completion");
    if (currentBox && result.bundle) {
      renderPayloadControls(currentBox, result.bundle, t,
        `data:application/gzip;base64,${result.bundle}`);
    } else if (currentBox) {
      currentBox.replaceChildren(h("p", {}, `Completion code: ${result.completion_code}`));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const currentBox = root.querySelector<HTMLElement>("#completion");
    if (currentBox) {
      currentBox.replaceChildren(
        h("p", { className: "error", role: "alert" }, `${t("error")}: ${message}`),
        actionButton(t("retry_completion"), "retry-completion"),
      );
    }
  } finally {
    completionInFlight = false;
  }
}

function handleAction(action: string): void {
  if (action === "consent" || action === "device" || action === "instructions") {
    navigate(action);
  } else if (action === "headphones") {
    state.headphoneTrial = 0;
    state.headphoneCorrect = 0;
    headphoneOrder = Array.from({ length: study.headphone_trials }, (_, index) =>
      index % 2 === 0 ? "left" : "right");
    if (query.get("test") !== "1") {
      for (let index = headphoneOrder.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(Math.random() * (index + 1));
        [headphoneOrder[index], headphoneOrder[swap]] = [headphoneOrder[swap], headphoneOrder[index]];
      }
    }
    navigate("headphones");
  } else if (action === "play-tone") {
    playTone(headphoneOrder[state.headphoneTrial] ??
      (state.headphoneTrial % 2 === 0 ? "left" : "right"));
  } else if (action === "headphone-left" || action === "headphone-right") {
    answerHeadphone(action.endsWith("left") ? "left" : "right");
  } else if (action === "start") {
    const button = root.querySelector<HTMLButtonElement>("button[data-action=start]");
    if (button) button.disabled = true;
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
  } else if (action === "retry-completion") {
    void completeSession();
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
      if (edited && (!study.tasks.some((task) => task.id === "mcq") || choice)) {
        if (choice) choice.checked = true;
        edited.checked = true;
        for (const [name, value] of [["edit_confidence", "1"], ["conspicuousness", "3"], ["naturalness", "3"]]) {
          const input = form.querySelector<HTMLInputElement>(`input[name=${name}][value='${value}']`);
          if (input) input.checked = true;
        }
        const mcqConfidence = form.querySelector<HTMLSelectElement>("select[name=mcq_confidence]");
        if (mcqConfidence) mcqConfidence.value = "1";
        form.requestSubmit();
      }
    },
    setAssignmentItems: (ids: string[]) => {
      if (state.assignment) {
        state.assignment = { ...state.assignment, items: ids } as Assignment;
        persistResume();
      }
    },
    completePlayback: () => media?.completeForTest(),
    getState: () => ({ ...state }),
  };
}

declare global {
  interface Window {
    __STEALTHRATE_TEST__?: {
      answerHeadphone: (side: "left" | "right") => void;
      answerTrial: () => void;
      setAssignmentItems: (ids: string[]) => void;
      completePlayback: () => void;
      getState: () => FlowState;
    };
  }
}

async function init(): Promise<void> {
  try {
    const slug = query.get("study") ?? "human_real_stealth_v1";
    const [studyData, itemData, blockData] = await Promise.all([
      fetch(`./studies/${slug}/study.json`).then((response) => response.json()),
      fetch(`./studies/${slug}/items.json`).then((response) => response.json()),
      fetch(`./studies/${slug}/blocks.json`).then((response) => response.json()),
    ]);
    study = studyData as StudyConfig;
    participantKey = getOrCreateParticipantKey(study.study_id, study.version);
    configureResumeScope({
      studyId: study.study_id,
      version: study.version,
      participantKey,
    });
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
      const restored = await backend.assign(participantKey, uaHash());
      state.assignment = restored.session_id === saved.assignment.session_id
        ? restored
        : saved.assignment;
      state.itemIndex = saved.itemIndex;
      state.lang = saved.lang;
      strings = stringsFor(state.lang);
      state.screen = state.itemIndex >= state.assignment.items.length
        ? "complete"
        : currentItem()?.practice ? "practice" : "trial";
    }
    installEvents();
    // Test hooks require explicit opt-in and a loopback origin; never expose a
    // playback bypass from a public Pages URL.
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
    if (query.get("test") === "1" && loopback) installTestHook();
    renderScreen();
    if (saved?.warning) {
      root.querySelector<HTMLElement>(".card")?.prepend(
        h("p", { className: "error", role: "alert" }, saved.warning),
      );
    }
    if (state.screen === "complete" && backend.getCompletedBundle && state.assignment) {
      const bundle = await backend.getCompletedBundle(state.assignment.session_id);
      const box = root.querySelector<HTMLElement>("#completion");
      if (bundle && box) {
        renderPayloadControls(box, bundle, t, `data:application/gzip;base64,${bundle}`);
      }
    }
  } catch (error) {
    root.replaceChildren(h("p", { className: "error" },
      `${t("error")}: ${String(error)}`));
  }
}

export async function startApp(): Promise<void> {
  await init();
}
