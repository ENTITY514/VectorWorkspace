// src/shared/lib/i18n/I18nContext.tsx

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Language, Translations } from "./types";
import { ru } from "./dictionaries/ru";
import { kk } from "./dictionaries/kk";
import { en } from "./dictionaries/en";

const dictionaries: Record<Language, Translations> = {
  ru,
  kk,
  en,
};

const STORAGE_KEY = "app_language";

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Language;
      return saved && dictionaries[saved] ? saved : "ru";
    } catch {
      return "ru";
    }
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value = {
    language,
    setLanguage,
    t: dictionaries[language] || ru,
  };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useTranslation = () => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useTranslation must be used within a LanguageProvider");
  }
  return context;
};
