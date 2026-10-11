import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // bind 0.0.0.0 so you can open it from your phone on the same wifi
    // Local dev only. In production CloudFront routes /api/* to the ALB instead.
    proxy: { '/api': 'http://localhost:3000', '/health': 'http://localhost:3000' },
  },
})
