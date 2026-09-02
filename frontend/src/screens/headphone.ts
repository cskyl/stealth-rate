import { h } from "../dom";
import { actionButton, type ScreenContext } from "./context";

export function renderHeadphone(context: ScreenContext): HTMLElement {
  const state = context.state;
  if (state.headphoneTrial >= context.study.headphone_trials) {
    return h(
      "div",
      {},
      h("h2", {}, context.t("headphones")),
      h("p", {}, "We could not verify the headphone check. Please retry."),
      actionButton(context.t("continue"), "headphones"),
    );
  }
  return h(
    "div",
    {},
    h("h2", {}, context.t("headphones")),
    h("p", {}, `Trial ${state.headphoneTrial + 1} / ${context.study.headphone_trials}`),
    h("p", {}, "Play the tone, then choose which side you heard it on."),
    actionButton("Play tone", "play-tone"),
    actionButton(context.t("hear_left"), "headphone-left"),
    actionButton(context.t("hear_right"), "headphone-right"),
  );
}
