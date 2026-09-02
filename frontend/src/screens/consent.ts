import { h, textBlock } from "../dom";
import { actionButton, type ScreenContext } from "./context";

export function renderConsent(context: ScreenContext): HTMLElement {
  return h(
    "div",
    {},
    h("h2", {}, context.t("consent")),
    textBlock("p", context.t("agree")),
    actionButton(context.t("continue"), "device"),
  );
}

