"use client";

import { useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { currentTheme, selectTheme, subscribeTheme, type Theme } from "@/lib/theme";

const subscribeMounted = () => () => {};
export function ThemeMenu() {
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, () => "dark" as Theme);
  const mounted = useSyncExternalStore(subscribeMounted, () => true, () => false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = () => { panel.current?.hidePopover(); trigger.current?.focus(); };
  return <>
    <button ref={trigger} type="button" className="icon-button theme-trigger" popoverTarget="finease-theme-menu"
      aria-label={`主题：${theme === "dark" ? "深色" : "浅色"}`} aria-haspopup="menu"
      title="主题：深色 / 浅色"
      onClick={() => {
        const rect = trigger.current?.getBoundingClientRect();
        if (rect && panel.current) {
          panel.current.style.top = `${rect.bottom + 6}px`;
          panel.current.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
        }
      }}>
      <span className="theme-dark-label">深色</span><span className="theme-light-label">浅色</span>
    </button>
    {mounted && createPortal(<div ref={panel} id="finease-theme-menu" className="theme-menu" popover="auto" role="menu" aria-label="主题"
      onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); close(); }
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
          const index = items.indexOf(document.activeElement as HTMLButtonElement);
          items[event.key === "Home" ? 0 : event.key === "End" ? 1 : (index + (event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length]?.focus();
        }
      }}>
      {(["dark", "light"] as const).map(value => <button key={value} type="button" role="menuitemradio" aria-checked={theme === value}
        className="secondary-button" onClick={() => { selectTheme(value); close(); }}>
        主题：{value === "dark" ? "深色" : "浅色"}{theme === value ? " ✓" : ""}
      </button>)}
    </div>, document.body)}
  </>;
}
