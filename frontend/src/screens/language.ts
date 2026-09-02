import { h } from "../dom";
import { actionButton, type ScreenContext } from "./context";

export function renderLanguage(context: ScreenContext): HTMLElement {
  return h(
    "div",
    {},
    h("h2", {}, context.t("language")),
    h("p", {}, context.study.title),
    actionButton(context.t("continue"), "consent"),
  );
}

