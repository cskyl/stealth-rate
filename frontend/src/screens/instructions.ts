import { h, textBlock } from "../dom";
import { actionButton, type ScreenContext } from "./context";

export function renderInstructions(context: ScreenContext): HTMLElement {
  return h(
    "div",
    {},
    h("h2", {}, context.t("instructions")),
    textBlock(
      "p",
      "Watch each clip all the way through, then answer both questions. " +
        "You may replay a clip; playback events are recorded.",
    ),
    actionButton(context.t("continue"), "start"),
  );
}

