import en from "./i18n/en.json";
import zh from "./i18n/zh.json";

export type Lang = "en" | "zh";
export type Strings = Record<string, string>;

const catalogs: Record<Lang, Strings> = { en, zh };

export function stringsFor(lang: Lang): Strings {
  return catalogs[lang];
}

export function translate(strings: Strings, key: string): string {
  return strings[key] ?? key;
}

