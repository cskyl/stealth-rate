import { h } from "../dom";
import { renderInstructionGuide } from "../instructionContent";
import { actionButton, type ScreenContext } from "./context";

export function renderLanguage(context: ScreenContext): HTMLElement {
  const real = context.study.presentation === "real_stealth";
  const example = [...context.itemMap.values()].find((item) => item.practice);
  const exampleUrl = example
    ? `${context.study.media_base_url}${example.media}`
    : null;
  if (real && context.study.tasks.some((task) => task.fields?.audio_clarity)) {
    const zh = context.state.lang === "zh";
    return h(
      "div",
      { className: "compact-intro" },
      h("p", {}, zh ? "开始前请了解这三点：" : "A quick note before you start:"),
      h("ul", {},
        h("li", {}, zh ? "完整观看每个视频；需要时可以重播。" : "Watch each video all the way through; replay it if needed."),
        h("li", {}, zh ? "按你的第一印象评分，没有标准答案。" : "Rate your first impression; there are no right answers."),
        h("li", {}, zh ? "每题都要明确选择；不确定时按真实感受回答。" : "Choose every rating explicitly and answer honestly when unsure.")),
      h("p", { className: "notice" }, zh
        ? "自愿参加，可随时停止。请勿填写姓名或联系方式；回答先保存在此浏览器，可随时下载备份。"
        : "Participation is voluntary and you may stop at any time. No names or contact details, please. Answers stay in this browser; a backup is available."),
      h("p", {}, zh
        ? "接通云端后，评分会发送给研究负责人；页面会显示是否已同步。"
        : "When connected, ratings are sent to the study owner; the page shows whether they have synced."),
      example && exampleUrl
        ? h("details", { className: "instruction-details" },
          h("summary", {}, zh ? "需要帮助？查看评分说明和示例" : "Need help? View the rating guide and example"),
          h("div", { className: "example-clip" },
            h("h3", {}, context.t("example_clip")),
            h("video", { controls: true, preload: "metadata", playsInline: true,
              src: exampleUrl, "aria-label": context.t("example_clip") }),
            h("p", { className: "media-status", role: "status" }, context.t("media_loading")),
            h("a", { href: exampleUrl, target: "_blank", rel: "noreferrer" }, context.t("open_clip"))),
          renderInstructionGuide(context.t, true,
            context.study.tasks.some((task) => task.fields?.audio_clarity)))
        : h("details", { className: "instruction-details" },
          h("summary", {}, context.t("rating_guide")),
          renderInstructionGuide(context.t, true,
            context.study.tasks.some((task) => task.fields?.audio_clarity))),
      actionButton(zh ? "同意并开始评分" : "Agree & start rating", "start"),
    );
  }
  return h(
    "div",
    {},
    h("h2", {}, context.t("language")),
    h("p", {}, context.study.title),
    h("p", { className: "demo-banner" }, real
      ? (context.state.lang === "zh"
        ? context.study.text.mode_label_zh
        : context.study.text.mode_label_en) || context.t("real_mode_label")
      : context.t("demo_only")),
    example && exampleUrl
      ? h("div", { className: "example-clip" },
        h("h3", {}, context.t("example_clip")),
        real ? h("p", { className: "notice" }, context.state.lang === "zh"
          ? "练习预览，仅用于熟悉播放流程，不计入评分。"
          : "Practice preview — for playback familiarization only; not scored.") : null,
        h("video", { controls: true, preload: "metadata", playsInline: true,
          src: exampleUrl, "aria-label": context.t("example_clip") }),
        h("p", { className: "media-status", role: "status" }, context.t("media_loading")),
        h("a", { href: exampleUrl, target: "_blank", rel: "noreferrer" }, context.t("open_clip")),
      )
      : null,
    h("details", { className: "instruction-details", id: "guide",
      open: new URLSearchParams(window.location.search).get("guide") === "1" },
      h("summary", {}, context.t("rating_guide")),
      renderInstructionGuide(context.t, real,
        context.study.tasks.some((task) => task.fields?.audio_clarity))),
    actionButton(context.t("continue"), "consent"),
  );
}
