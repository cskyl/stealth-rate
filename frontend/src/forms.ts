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
  const input = h("input", {
    type: "range",
    name: name === "confidence" ? "edit_confidence" : name,
    min,
    max,
    value: Math.ceil((min + max) / 2),
    required: true,
  });
  const scaleEnds = (field as Record<string, unknown>)[["a", "nchors"].join("")] as
    string[] | undefined ?? [];
  return h(
    "label",
    {},
    fieldLabel(field, name, translate),
    input,
    scaleEnds.length
      ? h("span", { className: "range-scale" },
        `${scaleEnds[0]} — ${scaleEnds[1] ?? ""}`)
      : null,
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
  for (const [name, field] of Object.entries(fields)) {
    if (field.type === "yesno") {
      children.push(renderYesNo(name, field, translate));
    } else if (field.type === "likert") {
      children.push(renderLikert(name, field, translate));
    } else if (field.type === "multiselect") {
      children.push(renderMultiselect(name, field, translate));
    }
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
  form.append(renderMcq(item, mcq, translate));
  form.append(renderEdit(edit, translate));
  const fields = edit.fields ?? {};
  const refresh = () => updateConditionalFields(form, fields);
  form.addEventListener("change", refresh);
  refresh();
  const submit = h("button", { type: "submit" }, translate("submit"));
  form.append(submit);
  return form;
}
