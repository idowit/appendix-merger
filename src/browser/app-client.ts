import type { InterfaceLanguage } from "../i18n";

const LANGUAGE_KEY = "interface-language";

export function loadInterfaceLanguage(): InterfaceLanguage {
  return localStorage.getItem(LANGUAGE_KEY) === "en" ? "en" : "he";
}

export function saveInterfaceLanguage(language: InterfaceLanguage): void {
  localStorage.setItem(LANGUAGE_KEY, language);
}

export function downloadBytes(bytes: Uint8Array, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export async function endSession(): Promise<void> {
  await fetch("/auth/logout", { method: "POST" }).catch(() => undefined);
  window.location.assign("/login");
}
