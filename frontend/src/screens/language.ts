import { h } from "../dom";
import { renderInstructionGuide } from "../instructionContent";
import { actionButton, type ScreenContext } from "./context";

export function renderLanguage(context: ScreenContext): HTMLElement {
  const real = context.study.presentation === "real_stealth";
  const example = [...context.itemMap.values()].find((item) => item.practice);
  const exampleUrl = example
    ? `${context.study.media_base_url}${example.media}`
    : null;
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
      renderInstructionGuide(context.t, real)),
    actionButton(context.t("continue"), "consent"),
  );
}
