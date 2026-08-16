/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        saffron: {
          50:  '#FFF3E8',
          100: '#FFE0C4',
          200: '#FFC49A',
          400: '#FF9A3C',
          500: '#FF6B00',
          600: '#E05E00',
          700: '#B84D00',
        },
        forest: {
          50:  '#E8F5E9',
          100: '#C8E6C9',
          400: '#1DB510',
          500: '#138808',
          600: '#0F6B06',
          700: '#0A4D04',
        },
        navy: {
          50:  '#E8EAF0',
          100: '#C5CAD9',
          400: '#4A5888',
          500: '#1A2F5E',
          600: '#0D1B3E',
          700: '#080F24',
        },
        gold: '#F5C518',
        slate: '#5A6278',
      },
      fontFamily: {
        display: ['"Baloo 2"', 'cursive'],
        body:    ['"Noto Sans"', 'sans-serif'],
        devanagari: ['"Noto Sans Devanagari"', 'sans-serif'],
      },
      borderRadius: {
        'xl':  '14px',
        '2xl': '20px',
        '3xl': '28px',
      },
      boxShadow: {
        'card':  '0 4px 24px rgba(13,27,62,0.08)',
        'lg':    '0 12px 48px rgba(13,27,62,0.14)',
        'glow':  '0 0 0 3px rgba(255,107,0,0.25)',
      },
      animation: {
        'fade-up':    'fadeUp 0.4s ease forwards',
        'fade-in':    'fadeIn 0.3s ease forwards',
        'slide-in':   'slideIn 0.35s ease forwards',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'xp-fill':    'xpFill 1s ease forwards',
      },
      keyframes: {
        fadeUp:     { from: { opacity: 0, transform: 'translateY(16px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        fadeIn:     { from: { opacity: 0 }, to: { opacity: 1 } },
        slideIn:    { from: { transform: 'translateX(-16px)', opacity: 0 }, to: { transform: 'translateX(0)', opacity: 1 } },
        pulseSoft:  { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.6 } },
        xpFill:     { from: { width: '0%' }, to: { width: 'var(--xp-width)' } },
      },
    },
  },
  plugins: [],
};
