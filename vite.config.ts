import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: './', // GitHub Pages 部署用相对路径
  logLevel: 'warn', // 减少终端日志（隐藏 HMR 更新等 info 日志，仅显示警告/错误）
  plugins: [vue()],
  server: {
    host: true, // 监听所有网络接口，允许局域网访问
    port: 5173,
    open: true,
    allowedHosts: true, // 允许通过隧道域名（loca.lt 等）访问
  },
})