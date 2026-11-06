import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Backend yalnızca 127.0.0.1:5127'yi dinler; dev server da sadece yerelde açılır.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:5127' },
  },
})
