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
        // Obsidian — sole brand accent for interactive/success elements
        primary: '#00C896',
        primaryDark: '#009B77',
        primaryLight: '#33DBA8',

        // Alias — same as primary in Obsidian theme
        accent: '#00C896',
        accentDark: '#009B77',
        accentLight: '#061915', // dark green tint for backgrounds

        // Gold — premium/Pro features
        gold: '#F59E0B',
        goldLight: '#1C1505', // dark amber tint

        // Semantic — Obsidian dark palette
        text: '#E2E8F0',        // slate-200
        muted: '#94A3B8',       // slate-400
        subtle: '#4B5563',      // gray-600
        background: '#0A0C10',  // deep dark
        surface: '#0F1117',     // card surface
        border: '#1A1F2C',      // subtle border
        borderLight: '#1F2537', // slightly lighter border

        // State colors — calibrated for dark backgrounds
        danger: '#F85149',
        dangerLight: '#1A0505',
        warning: '#F97316',
        warningLight: '#1C0E05',
        success: '#00C896',
        successLight: '#061915',
      },
      fontFamily: {
        sans: ['var(--font-dm-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-outfit)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 4px 0 rgba(0, 0, 0, 0.4), 0 1px 2px -1px rgba(0, 0, 0, 0.3)',
        'card-md': '0 4px 16px 0 rgba(0, 0, 0, 0.5), 0 2px 6px -2px rgba(0, 0, 0, 0.3)',
        'card-lg': '0 8px 28px 0 rgba(0, 0, 0, 0.6), 0 4px 10px -4px rgba(0, 0, 0, 0.4)',
        sidebar: '2px 0 24px 0 rgba(0, 0, 0, 0.5)',
        'nav-active': 'inset 3px 0 0 #00C896',
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
