import type { PublicItem } from "../backend/types";
import { h } from "../dom";
import { renderMcq, taskById } from "../forms";
import { actionButton, type ScreenContext } from "./context";

export function renderPractice(context: ScreenContext, item: PublicItem): HTMLElement {
  const mediaUrl = `${context.study.media_base_url}${item.media}`;
  const form = h("form", { id: "practice-form" });
  const task = taskById(context.study.tasks, "mcq");
  form.append(renderMcq(item, task, context.t));
  if (item.practice_feedback) {
    form.append(h("p", { className: "notice" }, item.practice_feedback));
  }
  form.append(actionButton(context.t("next"), "practice-next", !context.state.playbackComplete));
  return h(
    "div",
    {},
    h("h2", {}, context.t("practice")),
    h("p", { className: "demo-banner" }, context.t("demo_only")),
    h("video", { id: "clip", playsInline: true, "aria-label": context.t("practice_clip") }),
    h("div", { className: "media-status notice", id: "media-status", role: "status" },
      context.state.playbackComplete ? context.t("playback_complete") : context.t("media_loading")),
    h("p", {},
      h("a", {
        className: "media-open",
        href: mediaUrl,
        target: "_blank",
        rel: "noreferrer",
      }, context.t("open_clip")),
      " ",
      actionButton(context.t("play"), "play"),
      actionButton(context.t("replay"), "replay"),
    ),
    form,
  );
}
