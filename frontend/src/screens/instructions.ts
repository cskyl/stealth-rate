import { h } from "../dom";
import { renderInstructionGuide } from "../instructionContent";
import { actionButton, type ScreenContext } from "./context";

export function renderInstructions(context: ScreenContext): HTMLElement {
  const real = context.study.presentation === "real_stealth";
  const example = [...context.itemMap.values()].find((item) => item.practice);
  const exampleUrl = example
    ? `${context.study.media_base_url}${example.media}`
    : null;
  return h(
    "div",
    {},
    h("h2", {}, context.t("instructions")),
    renderInstructionGuide(context.t, real),
    h("p", { className: "demo-banner" }, real
      ? (context.state.lang === "zh"
        ? context.study.text.mode_label_zh
        : context.study.text.mode_label_en) || context.t("real_mode_label")
      : context.t("demo_only")),
    !real && example && exampleUrl
      ? h("div", { className: "example-clip" },
        h("h3", {}, context.t("example_clip")),
        h("video", { controls: true, preload: "metadata", playsInline: true,
          src: exampleUrl, "aria-label": context.t("example_clip") }),
        h("p", { className: "media-status", role: "status" }, context.t("media_loading")),
        h("a", { href: exampleUrl, target: "_blank", rel: "noreferrer" }, context.t("open_clip")),
      )
      : null,
    actionButton(context.t("continue"), "start"),
  );
}
