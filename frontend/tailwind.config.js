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
        primary: '#007BFF',
        primaryDark: '#0056b3',
        accent: '#00BCD4',
        text: '#333333',
        muted: '#6B7280',
        background: '#F5F7FA',
        surface: '#FFFFFF',
        border: '#E5E7EB',
      },
    },
  },
  plugins: [],
}

