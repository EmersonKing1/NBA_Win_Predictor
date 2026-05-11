import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const BACKEND = process.env.VITE_BACKEND_URL || 'http://localhost:8080'

export default defineConfig({
  plugins: [react()],
  base: '/NBA_Win_Predictor/',
  server: {
    proxy: {
      '/games':        BACKEND,
      '/game':         BACKEND,
      '/probability':  BACKEND,
      '/recent-games': BACKEND,
      '/health':       BACKEND,
    }
  }
})
