/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    runtime?: {
      env?: import('@/interfaces/cloudflare').CloudflareEnv
    }
  }
}

declare module 'cloudflare:workers' {
  export const env: import('@/interfaces/cloudflare').CloudflareEnv
}
