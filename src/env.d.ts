/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    runtime?: {
      env?: import('@/interfaces/cloudflare').CloudflareEnv
      ctx?: import('@/interfaces/cloudflare').CloudflareExecutionContext
    }
  }
}

declare module 'cloudflare:workers' {
  export const env: import('@/interfaces/cloudflare').CloudflareEnv
}
