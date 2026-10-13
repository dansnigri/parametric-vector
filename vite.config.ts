import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset URLs let the static build run from any host or sub-path.
  base: './',
  plugins: [react()],
})
