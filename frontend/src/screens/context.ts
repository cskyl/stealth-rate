import type { PublicItem, StudyConfig } from "../backend/types";
import type { FlowState, Screen } from "../state";

export type ScreenContext = {
  study: StudyConfig;
  state: FlowState;
  itemMap: Map<string, PublicItem>;
  t: (key: string) => string;
  navigate: (screen: Screen) => void;
};

export function actionButton(
  label: string,
  action: string,
  disabled = false,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.action = action;
  button.disabled = disabled;
  button.textContent = label;
  return button;
}

