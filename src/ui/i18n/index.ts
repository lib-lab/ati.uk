import { en, type MessageKey } from './en';

type Params = Record<string, string | number>;

/** Translate a key; unknown keys (e.g. from stored events) fall back to the key itself. */
export function t(key: MessageKey | string, params: Params = {}): string {
  const template: string = (en as Record<string, string>)[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}

export type { MessageKey };
