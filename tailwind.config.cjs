/* ============================================================
 * Tailwind CSS 正式建構設定
 * ------------------------------------------------------------
 * 正式環境禁止使用 cdn.tailwindcss.com（Play CDN JIT，官方明文
 * 不得用於生產環境）。改以 Tailwind CLI 預先建構靜態 CSS：
 *
 *   npx tailwindcss@3.4.17 -c tailwind.config.cjs \
 *       -i assets/css/tailwind.src.css \
 *       -o assets/css/tailwind.min.css --minify
 *
 * content 掃描所有前端頁面與腳本中字面出現的 utility class；
 * 新增頁面／JS 檔後需重新執行上述指令。
 * ============================================================ */

module.exports = {
  content: [
    './*.html',
    './*.js',
    './video/**/*.{html,js}',
    './tool/**/*.html'
  ],
  theme: {
    extend: {}
  },
  plugins: []
};
