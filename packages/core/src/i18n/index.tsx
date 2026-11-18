import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Lang = "tr" | "en";

/** A piece of text in both languages. Every user-facing string goes through this. */
export interface L {
  tr: string;
  en: string;
}

interface LangContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (text: L) => string;
}

const LangContext = createContext<LangContextValue | null>(null);

const STORAGE_KEY = "lets-explain:lang";

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "tr" || saved === "en") return saved;
  } catch {
    /* storage unavailable */
  }
  return navigator.language?.toLowerCase().startsWith("tr") ? "tr" : "en";
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const value = useMemo(() => ({ lang, setLang, t: (text: L) => text[lang] }), [lang, setLang]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used inside LangProvider");
  return ctx;
}

/** Shorthand for writing bilingual text inline: l("Merhaba", "Hello"). */
export const l = (tr: string, en: string): L => ({ tr, en });
