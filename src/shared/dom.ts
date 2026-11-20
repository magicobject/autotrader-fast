// A small helper for building the extension's own interface without innerHTML.

export type ElementChild = Node | string | number | null | undefined | false;

export interface ElementOptions {
  readonly className?: string;
  readonly text?: string;
  readonly title?: string;
  readonly attributes?: Readonly<Record<string, string>>;
  readonly onClick?: (event: Event) => void;
  readonly onInput?: (event: Event) => void;
}

export function createElement<TagName extends keyof HTMLElementTagNameMap>(
  tagName: TagName,
  options: ElementOptions = {},
  ...children: readonly (ElementChild | readonly ElementChild[])[]
): HTMLElementTagNameMap[TagName] {
  const element = document.createElement(tagName);
  if (options.className !== undefined) element.className = options.className;
  if (options.text !== undefined) element.textContent = options.text;
  if (options.title !== undefined) element.title = options.title;
  for (const [name, value] of Object.entries(options.attributes ?? {})) element.setAttribute(name, value);
  if (options.onClick) element.addEventListener('click', options.onClick);
  if (options.onInput) element.addEventListener('input', options.onInput);
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    element.append(typeof child === 'string' || typeof child === 'number' ? String(child) : child);
  }
  return element;
}
