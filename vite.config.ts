import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // 相对 base：产物可同时部署在域名根（自定义域名）与 GitHub Pages 项目子路径
  // （https://<user>.github.io/<repo>/）。dataLoader.ts 已用 import.meta.env.BASE_URL
  // 拼接数据路径，改这里即可整体生效，无需改动业务代码。
  base: './',
  server: {
    port: 5173,
    host: true
  }
})