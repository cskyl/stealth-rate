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
  const assigned = state.assignment?.items ?? [];
  const simple = context.study.presentation === "real_stealth" &&
    context.study.tasks.some((task) => task.fields?.audio_clarity);
  const formalItems = assigned.filter((id) => !context.itemMap.get(id)?.practice);
  const formalIndex = simple ? Math.max(0, formalItems.indexOf(item.item_id)) : state.itemIndex;
  const total = (simple ? formalItems.length : assigned.length) || 1;
  const progress = Math.round(((formalIndex + 1) / Math.max(1, total)) * 100);
  const mediaUrl = `${context.study.media_base_url}${item.media}`;
  const video = h("video", { id: "clip", playsInline: true, "aria-label": "Study clip" });
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
    h("p", {}, simple
      ? (context.state.lang === "zh" ? `视频 ${formalIndex + 1} / ${total}` : `Video ${formalIndex + 1} / ${total}`)
      : `Clip ${state.itemIndex + 1} / ${total}`),
    video,
    h("div", { className: "media-status notice", id: "media-status", role: "status" },
      state.playbackComplete ? context.t("playback_complete") : context.t("playback_required")),
    h("p", {},
      h("a", {
        className: "media-open",
        href: mediaUrl,
        target: "_blank",
        rel: "noreferrer",
      }, context.t("open_clip")),
      " ",
      actionButton(context.t("play"), "play"),
      actionButton(context.t("replay"), "replay")),
    form,
  );
  return { content, video, form };
}
