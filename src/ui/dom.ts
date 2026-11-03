export function requireEl<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Falta el elemento #${id} en la página`);
  return el as T;
}

export function setValue(key: string, text: string): void {
  const el = document.querySelector<HTMLElement>(`[data-key="${key}"]`);
  if (el) el.textContent = text;
}
