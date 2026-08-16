import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useLanguageStore = create(
  persist(
    (set, get) => ({
      lang: 'hi',  // 'hi' | 'en'

      setLang: (lang) => set({ lang }),

      toggleLang: () => set(state => ({ lang: state.lang === 'hi' ? 'en' : 'hi' })),

      /**
       * t(hi, en) — returns the string for the current language.
       * Usage: t('नमस्ते', 'Hello')
       */
      t: (hi, en) => {
        const { lang } = get();
        return lang === 'hi' ? hi : (en || hi);
      },
    }),
    {
      name: 'vidyasetu-lang',
      partialize: (state) => ({ lang: state.lang }),
    }
  )
);

export default useLanguageStore;
