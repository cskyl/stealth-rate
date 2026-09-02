export type DomChild = Node | string | number | null | undefined | false;

export type DomAttributes = Record<string, unknown>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: DomAttributes = {},
  ...children: DomChild[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === null || value === undefined || value === false) {
      continue;
    }
    if (name === "className") {
      element.className = String(value);
    } else if (name === "dataset" && typeof value === "object") {
      Object.assign(element.dataset, value);
    } else if (name === "style" && typeof value === "object") {
      Object.assign(element.style, value);
    } else if (name in element && name !== "list") {
      (element as unknown as Record<string, unknown>)[name] = value === true
        ? true
        : value;
    } else {
      element.setAttribute(name, value === true ? "" : String(value));
    }
  }
  for (const child of children) {
    if (child instanceof Node) {
      element.append(child);
    } else if (child !== null && child !== undefined && child !== false) {
      element.append(document.createTextNode(String(child)));
    }
  }
  return element;
}

export function textBlock(tag: "p" | "div", value: string): HTMLElement {
  return h(tag, {}, value);
}

