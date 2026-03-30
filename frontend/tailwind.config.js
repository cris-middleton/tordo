/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: 'rgb(var(--color-primary) / <alpha-value>)',
        primaryDark: 'rgb(var(--color-primary-dark) / <alpha-value>)',
        primaryLight: 'rgb(var(--color-primary-light) / <alpha-value>)',
        accent: 'rgb(var(--color-accent) / <alpha-value>)',
        accentDark: 'rgb(var(--color-accent-dark) / <alpha-value>)',
        accentLight: 'rgb(var(--color-accent-light) / <alpha-value>)',
        gold: 'rgb(var(--color-gold) / <alpha-value>)',
        goldLight: 'rgb(var(--color-gold-light) / <alpha-value>)',
        text: 'rgb(var(--color-text) / <alpha-value>)',
        muted: 'rgb(var(--color-muted) / <alpha-value>)',
        subtle: 'rgb(var(--color-subtle) / <alpha-value>)',
        background: 'rgb(var(--color-background) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        'surface-elevated': 'rgb(var(--color-surface-elevated) / <alpha-value>)',
        border: 'rgb(var(--color-border) / <alpha-value>)',
        borderLight: 'rgb(var(--color-border-light) / <alpha-value>)',
        info: 'rgb(var(--color-info) / <alpha-value>)',
        infoLight: 'rgb(var(--color-info-light) / <alpha-value>)',
        danger: 'rgb(var(--color-danger) / <alpha-value>)',
        dangerLight: 'rgb(var(--color-danger-light) / <alpha-value>)',
        warning: 'rgb(var(--color-warning) / <alpha-value>)',
        warningLight: 'rgb(var(--color-warning-light) / <alpha-value>)',
        success: 'rgb(var(--color-success) / <alpha-value>)',
        successLight: 'rgb(var(--color-success-light) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['var(--font-dm-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-outfit)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        'card-md': 'var(--shadow-card-md)',
        'card-lg': 'var(--shadow-card-lg)',
        sidebar: 'var(--shadow-sidebar)',
        'nav-active': 'inset 3px 0 0 rgb(var(--color-primary))',
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
