import { h, textBlock } from "../dom";
import { actionButton, type ScreenContext } from "./context";

export function renderConsent(context: ScreenContext): HTMLElement {
  const consent = context.state.lang === "zh"
    ? context.study.text.consent_zh
    : context.study.text.consent_en;
  const fallback = context.study.presentation === "real_stealth"
    ? context.t("real_agree")
    : context.t("agree");
  return h(
    "div",
    {},
    h("h2", {}, context.study.presentation === "real_stealth"
      ? (context.state.lang === "zh" ? "参与说明与同意" : "Consent to take part")
      : context.t("consent")),
    textBlock("p", consent || fallback),
    actionButton(context.t("continue"), "device"),
  );
}
