import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // Inject APP_SECRET at build time — baked into the JS bundle, not in source
    // On Render: set VITE_APP_SECRET env var = same value as APP_SECRET
    __APP_SECRET__: JSON.stringify(process.env.VITE_APP_SECRET || ''),
  },
})
