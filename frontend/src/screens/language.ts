import { h } from "../dom";
import { actionButton, type ScreenContext } from "./context";

export function renderLanguage(context: ScreenContext): HTMLElement {
  const example = [...context.itemMap.values()].find((item) => item.practice);
  const exampleUrl = example
    ? `${context.study.media_base_url}${example.media}`
    : null;
  return h(
    "div",
    {},
    h("h2", {}, context.t("language")),
    h("p", {}, context.study.title),
    h("p", { className: "demo-banner" }, context.t("demo_only")),
    example && exampleUrl
      ? h("div", { className: "example-clip" },
        h("h3", {}, context.t("example_clip")),
        h("video", { controls: true, preload: "metadata", playsInline: true,
          src: exampleUrl, "aria-label": context.t("example_clip") }),
        h("p", { className: "media-status", role: "status" }, context.t("media_loading")),
        h("a", { href: exampleUrl, target: "_blank", rel: "noreferrer" }, context.t("open_clip")),
      )
      : null,
    actionButton(context.t("continue"), "consent"),
  );
}
