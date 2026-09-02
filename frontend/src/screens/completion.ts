import { h, textBlock } from "../dom";
import { actionButton, type ScreenContext } from "./context";

export function renderCompletion(context: ScreenContext): HTMLElement {
  return h(
    "div",
    {},
    h("h2", {}, context.t("complete")),
    textBlock("p", "Thank you. Your responses are ready for the study owner."),
    h("div", { id: "completion" }),
  );
}

export function renderPayloadControls(
  box: HTMLElement,
  bundle: string,
  translate: (key: string) => string,
  url: string,
): void {
  const link = document.createElement("a");
  link.href = url;
  link.download = "stealthrate-responses.json.gz";
  link.textContent = translate("download");
  link.className = "download-link";
  const textarea = document.createElement("textarea");
  textarea.id = "payload-code";
  textarea.readOnly = true;
  textarea.rows = 3;
  textarea.style.width = "100%";
  textarea.value = bundle;
  box.dataset.url = url;
  box.replaceChildren(link, textarea, actionButton(translate("copy"), "copy"));
}
