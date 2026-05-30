/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts,scss}'],
  theme: {
    extend: {
      colors: {
        // Marieta dark palette — see docs/08-style.md
        'bg-base': '#060D09',
        'bg-gradient': '#102A1A',

        // Text tier (opacity-based on white)
        'text-primary': '#FFFFFF',
        'text-secondary': 'rgba(255,255,255,0.68)',
        'text-tertiary': 'rgba(255,255,255,0.38)',
        'text-muted': 'rgba(255,255,255,0.20)',
        'text-faint': 'rgba(255,255,255,0.14)',

        // Semantic colors
        sage: {
          DEFAULT: 'rgba(93,202,165,0.75)',
          light: 'rgba(93,202,165,0.85)',
          muted: 'rgba(93,202,165,0.40)',
        },
        amber: {
          DEFAULT: 'rgba(176,122,58,0.85)',
          light: 'rgba(176,122,58,0.90)',
          muted: 'rgba(176,122,58,0.50)',
        },
        gold: {
          DEFAULT: 'rgba(201,168,76,0.78)',
          light: 'rgba(201,168,76,0.85)',
          muted: 'rgba(201,168,76,0.07)',
        },

        // Surfaces (opacity-lift on white)
        surface: {
          DEFAULT: 'rgba(255,255,255,0.03)',
          hover: 'rgba(255,255,255,0.04)',
          active: 'rgba(255,255,255,0.055)',
        },

        // Nutrient status
        'nutrient-ok': 'rgba(93,202,165,0.65)',
        'nutrient-warn': 'rgba(176,122,58,0.80)',
        'nutrient-neutral': 'rgba(255,255,255,0.16)',
      },
      fontFamily: {
        sans: [
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
        serif: ['Georgia', 'Cambria', '"Times New Roman"', 'Times', 'serif'],
      },
      fontSize: {
        'nav': ['9px', { letterSpacing: '0.10em' }],
        'section-label': ['8px', { letterSpacing: '0.12em' }],
        'day-name': ['8px', { letterSpacing: '0.14em' }],
        'meal-name': ['12px', { lineHeight: '1.4' }],
        'dish-title': ['15px', { lineHeight: '1.3' }],
        'metric-value': ['30px', { lineHeight: '1.1' }],
        'metric-label': ['8px', { lineHeight: '1.4' }],
        'nutrient-value': ['13px', { lineHeight: '1.3' }],
        'status-line': ['10px', { letterSpacing: '0.04em', lineHeight: '1.6' }],
      },
      spacing: {
        'top-bar': '32px 36px 0',
        'content': '32px 36px 40px',
        'day-collapsed': '14px 18px',
        'day-expanded': '0 18px 18px',
        card: '20px 22px',
        metric: '18px 20px',
      },
      gap: {
        sections: '26px',
        'day-rows': '6px',
        'detail-meals': '14px',
        nutrients: '18px',
        bars: '13px',
      },
      borderRadius: {
        container: '16px',
      },
    },
  },
  plugins: [],
};
