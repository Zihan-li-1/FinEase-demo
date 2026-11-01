export type Theme = "dark" | "light";
export const THEME_STORAGE_KEY = "finease.theme";
export const themeBootstrap = `(()=>{let t="dark";try{const v=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(v==="light"||v==="dark")t=v;}catch{}document.documentElement.dataset.theme=t;})()`;

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function selectTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* Session-only preference if storage is unavailable. */ }
}

export function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) {
      document.documentElement.dataset.theme = event.newValue === "light" ? "light" : "dark";
    }
  };
  window.addEventListener("storage", onStorage);
  return () => { observer.disconnect(); window.removeEventListener("storage", onStorage); };
}
