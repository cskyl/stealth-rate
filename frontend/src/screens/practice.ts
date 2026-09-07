import type { PublicItem } from "../backend/types";
import { h } from "../dom";
import { renderMcq, renderTrialForm, taskById } from "../forms";
import { actionButton, type ScreenContext } from "./context";

export function renderPractice(context: ScreenContext, item: PublicItem): HTMLElement {
  const mediaUrl = `${context.study.media_base_url}${item.media}`;
  let activeForm: HTMLFormElement;
  const hasMcq = context.study.tasks.some((task) => task.id === "mcq");
  const isV2 = context.study.tasks.some((task) => task.fields?.audio_clarity);
  if (isV2) {
    activeForm = renderTrialForm(item, context.study.tasks, context.t);
    activeForm.id = "practice-form";
  } else if (hasMcq) {
    activeForm = h("form", { id: "practice-form" });
    activeForm.append(renderMcq(item, taskById(context.study.tasks, "mcq"), context.t));
  } else {
    activeForm = h("form", { id: "practice-form" });
  }
  if (isV2) {
    activeForm.querySelector("button[type=submit]")?.remove();
    activeForm.hidden = !context.state.playbackComplete;
    for (const input of activeForm.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >("input, select, textarea")) input.disabled = !context.state.playbackComplete;
  }
  const feedback = hasMcq
    ? context.t("practice_feedback")
      .replace("and use the scales honestly", "and answer the confidence question honestly")
      .replace("再继续。", "再继续；练习不包含明显程度或自然程度评分。")
    : context.state.lang === "zh"
      ? "练习用于熟悉播放流程。请完整观看片段并按说明继续；不显示答案，也不要求回答内容。"
      : "Practice is for the playback procedure. Watch the full clip and continue " +
        "as instructed; no answer is shown or requested.";
  activeForm.append(h("p", { className: "notice" }, isV2
    ? (context.state.lang === "zh" ? "请练习填写这张评分表。练习回答不会保存到正式结果。"
      : "Practice using the rating form. These practice answers are not collected.")
    : feedback));
  const next = actionButton(context.t("next"), "practice-next", !context.state.playbackComplete);
  next.addEventListener("click", (event) => {
    if (isV2 && !activeForm.reportValidity()) { event.preventDefault(); event.stopPropagation(); }
  });
  activeForm.append(next);
  return h(
    "div",
    {},
    h("h2", {}, context.t("practice")),
    h("p", { className: "demo-banner" }, context.study.presentation === "real_stealth"
      ? (context.state.lang === "zh"
        ? context.study.text.mode_label_zh
        : context.study.text.mode_label_en) || context.t("real_mode_label")
      : context.t("demo_only")),
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
    activeForm,
  );
}
