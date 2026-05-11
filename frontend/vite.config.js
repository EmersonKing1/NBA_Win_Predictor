import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/games': 'http://localhost:8080',
      '/game': 'http://localhost:8080',
      '/probability': 'http://localhost:8080',
      '/recent-games': 'http://localhost:8080',
      '/health': 'http://localhost:8080',
    }
  }
})
