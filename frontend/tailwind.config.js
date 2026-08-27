/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        surface: '#0b0f14',
        panel: '#121821',
        panel2: '#161f2a',
        border: '#1f2833',
        accent: '#22c55e',
        accent2: '#34d399',
        violet: '#8b5cf6',
        danger: '#ef4444',
        muted: '#7d8998',
      },
      maxWidth: {
        mobile: '480px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.4), 0 8px 24px -12px rgba(0,0,0,0.55)',
        glow: '0 0 0 1px rgba(34,197,94,0.25), 0 8px 30px -10px rgba(34,197,94,0.35)',
      },
      backgroundImage: {
        'hero-gradient': 'radial-gradient(120% 140% at 0% 0%, rgba(34,197,94,0.22) 0%, rgba(18,24,33,0) 55%), linear-gradient(160deg, #16321f 0%, #121821 42%)',
        'sheen': 'linear-gradient(120deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 40%)',
      },
    },
  },
  plugins: [],
};
