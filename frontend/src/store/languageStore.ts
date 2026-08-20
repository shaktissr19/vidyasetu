import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type UiLanguage = 'hi' | 'en';

interface LanguageState {
  lang: UiLanguage;
  setLang: (lang: UiLanguage) => void;
  toggleLang: () => void;
  t: (hi: string, en?: string) => string;
}

type PersistedLanguageState = Pick<LanguageState, 'lang'>;

const useLanguageStore = create<LanguageState>()(
  persist<LanguageState, [], [], PersistedLanguageState>(
    (set, get) => ({
      lang: 'hi',
      setLang: (lang) => set({ lang }),
      toggleLang: () => set((state) => ({ lang: state.lang === 'hi' ? 'en' : 'hi' })),
      t: (hi, en) => {
        const { lang } = get();
        return lang === 'hi' ? hi : (en || hi);
      },
    }),
    {
      name: 'vidyasetu-lang',
      partialize: (state) => ({ lang: state.lang }),
    },
  ),
);

export default useLanguageStore;
