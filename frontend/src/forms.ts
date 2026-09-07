import type { PublicItem, TaskField, TaskSpec } from "./backend/types";
import { h } from "./dom";

type Translate = (key: string) => string;

function labelFor(value: string, index: number): string {
  return `${String.fromCharCode(65 + index)}. ${value}`;
}

function fieldLabel(field: TaskField, name: string, translate: Translate): string {
  if (field.prompt) {
    return field.prompt;
  }
  if (name === "edited") {
    return translate("edited");
  }
  if (name === "audio_clarity" || name === "visual_readability") return translate(`${name}_title`);
  return translate(name);
}

function renderYesNo(name: string, field: TaskField, translate: Translate): HTMLElement {
  return h(
    "fieldset",
    {},
    h("legend", {}, fieldLabel(field, name, translate)),
    h(
      "label",
      {},
      h("input", { type: "radio", name, value: "yes", required: true }),
      ` ${translate("yes")}`,
    ),
    h(
      "label",
      {},
      h("input", { type: "radio", name, value: "no", required: true }),
      ` ${translate("no")}`,
    ),
  );
}

function renderLikert(name: string, field: TaskField, translate: Translate): HTMLElement {
  const min = field.min ?? 1;
  const max = field.max ?? 5;
  const inputName = name === "confidence" ? "edit_confidence" : name;
  const scaleEnds = field.anchors ?? [];
  const labels = Array.from({ length: max - min + 1 }, (_, offset) => {
    const value = min + offset;
    const label = value === min
      ? (scaleEnds[0] ?? translate(`${name}_${value}`))
      : value === max
        ? (scaleEnds[1] ?? translate(`${name}_${value}`))
        : translate(`${name}_${value}`);
    return h("label", { className: "rating-option" },
      h("input", { type: "radio", name: inputName, value, required: true }),
      h("span", {}, `${value}${label ? ` — ${label}` : ""}`),
    );
  });
  return h(
    "fieldset", {},
    h("legend", {}, fieldLabel(field, name, translate)),
    h("div", { className: "rating-options" }, ...labels),
  );
}

function renderMultiselect(name: string, field: TaskField, translate: Translate): HTMLElement {
  return h(
    "fieldset",
    { "data-conditional-field": name },
    h("legend", {}, fieldLabel(field, name, translate)),
    ...(field.options ?? []).map((option) =>
      h(
        "label",
        {},
        h("input", { type: "checkbox", name, value: option }),
        ` ${translate(option)}`,
      ),
    ),
  );
}

function renderSelect(name: string, field: TaskField, translate: Translate): HTMLElement {
  return h("label", {}, fieldLabel(field, name, translate),
    h("select", { name, required: field.required === true },
      h("option", { value: "", disabled: true, selected: true }, translate("select_one")),
      ...(field.options ?? []).map((option) => h("option", { value: option }, translate(option))),
    ));
}

function renderTextarea(name: string, field: TaskField, translate: Translate): HTMLElement {
  return h("label", {}, fieldLabel(field, name, translate),
    h("textarea", { name, maxLength: field.maxLength ?? 500, rows: 3 }));
}

function matchesWhen(condition: string | undefined, values: FormData): boolean {
  if (!condition) {
    return true;
  }
  const match = condition.match(/^\s*([\w-]+)\s*(==|!=)\s*["']?([^"']+?)["']?\s*$/);
  if (!match) {
    return false;
  }
  const actual = String(values.get(match[1]) ?? "");
  return match[2] === "==" ? actual === match[3].trim() : actual !== match[3].trim();
}

function updateConditionalFields(form: HTMLFormElement, fields: Record<string, TaskField>): void {
  const values = new FormData(form);
  for (const [name, field] of Object.entries(fields)) {
    const container = form.querySelector<HTMLElement>(`[data-conditional-field="${name}"]`);
    if (!container || !field.when) {
      continue;
    }
    const active = matchesWhen(field.when, values);
    container.hidden = !active;
    for (const input of container.querySelectorAll<HTMLInputElement>("input")) {
      input.disabled = !active;
      input.required = false;
    }
  }
}

export function taskById(tasks: TaskSpec[], id: string): TaskSpec {
  return tasks.find((task) => task.id === id) ?? { id };
}

export function renderMcq(
  item: PublicItem,
  task: TaskSpec,
  translate: Translate,
): HTMLFieldSetElement {
  const prompt = item.question || task.prompt_audio || translate("choose");
  const options = item.options.map((option, index) =>
    h(
      "label",
      {},
      h("input", { required: true, type: "radio", name: "choice", value: option }),
      ` ${labelFor(option, index)}`,
    ),
  );
  const confidence = task.confidence ?? [1, 2, 3];
  return h(
    "fieldset",
    {},
    h("legend", {}, prompt),
    h("div", { className: "options" }, ...options),
    h(
      "label",
      {},
      translate("confidence"),
      h(
        "select",
        { name: "mcq_confidence", required: true },
        h("option", { value: "", disabled: true, selected: true }, translate("select_one")),
        ...confidence.map((value) => h("option", { value }, value)),
      ),
    ),
  );
}

export function renderEdit(
  task: TaskSpec,
  translate: Translate,
): HTMLFieldSetElement {
  const fields = task.fields ?? {};
  const children: DomChild[] = [h("legend", {}, translate("edited"))];
  const groups: Record<string, string[]> = {
    detection: ["edited", "noticed"],
    clarity: ["audio_clarity", "visual_readability"],
    context: ["conspicuousness", "naturalness", "confidence", "technical_issue", "comment"],
  };
  const rendered = new Set<string>();
  const renderField = (name: string, field: TaskField): HTMLElement => {
    if (field.type === "yesno") return renderYesNo(name, field, translate);
    if (field.type === "likert") return renderLikert(name, field, translate);
    if (field.type === "multiselect") return renderMultiselect(name, field, translate);
    if (field.type === "select") return renderSelect(name, field, translate);
    return renderTextarea(name, field, translate);
  };
  for (const [name, field] of Object.entries(fields)) {
    if (rendered.has(name)) continue;
    const group = Object.entries(groups).find(([, names]) => names.includes(name))?.[0] ?? "context";
    const names = [...new Set([name, ...groups[group]])]
      .filter((candidate) => fields[candidate] && !rendered.has(candidate));
    children.push(h("section", { className: "rating-group" },
      h("h3", {}, translate(`rating_group_${group}`)),
      ...names.map((candidate) => {
        rendered.add(candidate);
        return renderField(candidate, fields[candidate]);
      }),
    ));
  }
  return h("fieldset", {}, ...children);
}

type DomChild = Node | string | number | null | undefined | false;

export function renderTrialForm(
  item: PublicItem,
  tasks: TaskSpec[],
  translate: Translate,
): HTMLFormElement {
  const form = h("form", { id: "trial-form" });
  const mcq = taskById(tasks, "mcq");
  const edit = taskById(tasks, "edit");
  if (tasks.some((task) => task.id === "mcq")) {
    form.append(renderMcq(item, mcq, translate));
  }
  form.append(renderEdit(edit, translate));
  const fields = edit.fields ?? {};
  const refresh = () => updateConditionalFields(form, fields);
  form.addEventListener("change", refresh);
  refresh();
  const submit = h("button", { type: "submit" }, translate("submit"));
  form.append(submit);
  return form;
}
