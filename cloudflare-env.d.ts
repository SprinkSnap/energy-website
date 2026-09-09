/// <reference types="@cloudflare/workers-types" />

declare global {
  interface CloudflareEnv {
    HOT2000_JOB_QUEUE: DurableObjectNamespace;
  }
}

export {};
