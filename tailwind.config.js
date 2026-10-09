/** @type {import('tailwindcss').Config} */
export default {
  content: [
    // 所有頁面 HTML（含根目錄與 video/、landing/、functions/）
    './*.html',
    './video/*.html',
    './landing/*.html',
    // 所有應用程式 JS（根目錄 + js/ 子目錄，排除 vendor/）
    './*.js',
    './js/**/*.js',
    '!./js/vendor/**/*.js',
  ],
  // Tailwind v4 主題（沿用 system.html 中已定義的品牌色）
  theme: {
    extend: {
      colors: {
        // 品牌主色：D9782B（橙啡）、B48F79（深啡）
        brand: {
          50: '#fdf5ed',
          100: '#fae8d3',
          200: '#f4d1a6',
          300: '#edb271',
          400: '#e28a3f',
          500: '#D9782B',
          600: '#c06121',
          700: '#a04d1d',
          800: '#82401d',
          900: '#6a361b',
          950: '#38190c',
        },
      },
    },
  },
  plugins: [],
}
