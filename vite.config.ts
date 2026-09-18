import {defineConfig} from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// Served from a subpath of the main site; change this to match where it is deployed
export default defineConfig({
  base: './',
  plugins: [vue(), tailwindcss()],
})
