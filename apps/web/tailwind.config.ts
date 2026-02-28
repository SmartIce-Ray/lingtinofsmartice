// Tailwind CSS Configuration
// v1.1 - Added shimmer animation for AI button

import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // H-3 宣纸素墨配色 — 暖灰底 + 靛蓝主色
        gray: {
          50: '#F6F4EE',
          100: '#EEECE4',
          200: '#E4E1D8',
          300: '#DAD6CA',
          400: '#B8B3A5',
          500: '#8E887A',
          600: '#6B665A',
          700: '#47453B',
          800: '#2A2923',
          900: '#17160E',
          950: '#0E0D09',
        },
        primary: {
          50: '#EDEDF4',
          100: '#DBDCEA',
          200: '#C3C5D9',
          300: '#A5A8C4',
          400: '#7E82A6',
          500: '#5C6088',
          600: '#3A3F62',
          700: '#2E3250',
          800: '#232640',
          900: '#1A1D32',
          950: '#121425',
        },
        // 语义色 — 赤陶红（danger 衍生）
        red: {
          50: '#F8F0ED',
          100: '#F0DED8',
          200: '#E4C5BA',
          300: '#D4A594',
          400: '#C08570',
          500: '#9E5440',
          600: '#874838',
          700: '#6E3A2D',
          800: '#552D23',
          900: '#3D2019',
        },
        // 语义色 — 松绿（success 衍生）
        green: {
          50: '#EFF4F0',
          100: '#DCE8DE',
          200: '#C4D8C8',
          300: '#A4C1AB',
          400: '#7EA889',
          500: '#4C7A56',
          600: '#416A4A',
          700: '#355640',
          800: '#2A4233',
          900: '#1F3027',
        },
        // 语义色 — 土黄（warning 衍生）
        yellow: {
          50: '#F7F3E8',
          100: '#EDE5CE',
          200: '#E0D3B0',
          300: '#CFBB88',
          400: '#B9A065',
          500: '#A18D50',
          600: '#8E7A42',
          700: '#63552E',
          800: '#4C4124',
          900: '#362F1A',
        },
        // amber 与 yellow 同值（~8 处引用）
        amber: {
          50: '#F7F3E8',
          100: '#EDE5CE',
          200: '#E0D3B0',
          300: '#CFBB88',
          400: '#B9A065',
          500: '#A18D50',
          600: '#8E7A42',
          700: '#63552E',
          800: '#4C4124',
          900: '#362F1A',
        },
        // 语义色 — 暖橙（陶土橙）
        orange: {
          50: '#F6F0E8',
          100: '#EEDDD0',
          200: '#E2C5B0',
          300: '#D2A885',
          400: '#BF8C5E',
          500: '#A67345',
          600: '#8D623B',
          700: '#714E30',
          800: '#573C25',
          900: '#3E2B1B',
        },
        // 语义色 — 藤紫（柔和灰紫）
        purple: {
          50: '#F2F0F5',
          100: '#E5E1EB',
          200: '#D2CCD9',
          300: '#B8B0C4',
          400: '#9A8FAD',
          500: '#7D7193',
          600: '#695F7D',
          700: '#544C65',
          800: '#403A4D',
          900: '#2D2936',
        },
        // 语义色 — 苍青（柔和蓝绿）
        teal: {
          50: '#EDF2F1',
          100: '#DBE5E2',
          200: '#C1D4CF',
          300: '#9DBDB5',
          400: '#79A69C',
          500: '#558D82',
          600: '#49796F',
          700: '#3B625A',
          800: '#2E4B45',
          900: '#213632',
        },
        success: '#4C7A56',
        warning: '#8E7A42',
        danger: '#9E5440',
      },
      animation: {
        shimmer: 'shimmer 2s linear infinite',
      },
      keyframes: {
        shimmer: {
          from: { backgroundPosition: '0 0' },
          to: { backgroundPosition: '-200% 0' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
