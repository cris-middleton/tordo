/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Brand navy — authority, trust, professionalism
        primary: '#0F2942',
        primaryDark: '#081A2E',
        primaryLight: '#1B4F72',

        // Emerald accent — growth, success, bid won
        accent: '#0EAD69',
        accentDark: '#09895B',
        accentLight: '#E8FBF2',

        // Gold — premium/Pro features
        gold: '#D97706',
        goldLight: '#FEF3C7',

        // Semantic
        text: '#0D1B2A',
        muted: '#64748B',
        subtle: '#94A3B8',
        background: '#F6F7FB',
        surface: '#FFFFFF',
        border: '#E2E6EF',
        borderLight: '#EEF1F7',

        // States
        danger: '#E53E3E',
        dangerLight: '#FFF5F5',
        warning: '#DD6B20',
        warningLight: '#FFFAF0',
        success: '#0EAD69',
        successLight: '#E8FBF2',
      },
      fontFamily: {
        sans: ['var(--font-dm-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-outfit)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(15, 41, 66, 0.08), 0 1px 2px -1px rgba(15, 41, 66, 0.04)',
        'card-md': '0 4px 12px 0 rgba(15, 41, 66, 0.10), 0 2px 4px -2px rgba(15, 41, 66, 0.06)',
        'card-lg': '0 8px 24px 0 rgba(15, 41, 66, 0.12), 0 4px 8px -4px rgba(15, 41, 66, 0.08)',
        sidebar: '2px 0 20px 0 rgba(15, 41, 66, 0.06)',
        'nav-active': 'inset 3px 0 0 #0F2942',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out both',
        'slide-up': 'slideUp 0.4s ease-out both',
        'slide-in-left': 'slideInLeft 0.3s ease-out both',
        'scale-in': 'scaleIn 0.25s ease-out both',
        'pulse-subtle': 'pulseSubtle 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        slideInLeft: {
          from: { opacity: '0', transform: 'translateX(-12px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        pulseSubtle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
      },
    },
  },
  plugins: [],
}
