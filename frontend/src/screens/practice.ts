import type { PublicItem } from "../backend/types";
import { h } from "../dom";
import { renderMcq, taskById } from "../forms";
import { actionButton, type ScreenContext } from "./context";

export function renderPractice(context: ScreenContext, item: PublicItem): HTMLElement {
  const form = h("form", { id: "practice-form" });
  const task = taskById(context.study.tasks, "mcq");
  form.append(renderMcq(item, task, context.t));
  if (item.practice_feedback) {
    form.append(h("p", { className: "notice" }, item.practice_feedback));
  }
  form.append(actionButton(context.t("next"), "practice-next"));
  return h("div", {}, h("h2", {}, context.t("practice")), form);
}

