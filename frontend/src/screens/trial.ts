import type { PublicItem } from "../backend/types";
import { h } from "../dom";
import { renderTrialForm } from "../forms";
import { actionButton, type ScreenContext } from "./context";

export type TrialView = {
  content: HTMLElement;
  video: HTMLVideoElement;
  form: HTMLFormElement;
};

export function renderTrial(context: ScreenContext, item: PublicItem): TrialView {
  const state = context.state;
  const total = state.assignment?.items.length ?? 1;
  const progress = Math.round((state.itemIndex / Math.max(1, total - 1)) * 100);
  const video = h("video", { id: "clip", playsInline: true });
  const form = renderTrialForm(item, context.study.tasks, context.t);
  form.hidden = !state.playbackComplete;
  for (const input of form.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
    "input, select",
  )) {
    input.disabled = !state.playbackComplete;
  }
  const content = h(
    "div",
    {},
    h("div", { className: "progress", "aria-label": "Progress" },
      h("div", { style: { width: `${progress}%` } })),
    h("p", {}, `Clip ${state.itemIndex + 1} / ${total}`),
    video,
    h("div", { className: "notice", id: "playback-note" },
      "Please play the clip completely before answering."),
    h("p", {}, actionButton(context.t("play"), "play"),
      actionButton(context.t("replay"), "replay")),
    form,
  );
  return { content, video, form };
}

