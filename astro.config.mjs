import vue from '@astrojs/vue'
import { defineConfig } from 'astro/config'

export default defineConfig({
  srcDir: './src/',
  root: './',
  server: {
    host: true,
    port: 60001,
    allowedHosts: true
  },
  integrations: [vue()],
  vite: {
    resolve: {
      alias: {
        '@': '/src'
      }
    }
  }
})
