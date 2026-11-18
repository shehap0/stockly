import { createContext } from 'react'
export type Language = 'ar' | 'en'
export type Theme = 'light' | 'dark'

export type Preferences = {
  language: Language
  theme: Theme
  setLanguage: (language: Language) => void
  setTheme: (theme: Theme) => void
  t: (value: string) => string
}

export const PreferencesContext = createContext<Preferences | null>(null)
