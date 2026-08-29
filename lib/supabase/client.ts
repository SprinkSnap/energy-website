"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseAnonKey, getSupabaseUrl, isSupabaseConfigured } from "@/lib/supabase/config";

let client: ReturnType<typeof createBrowserClient> | null = null;

export function createSupabaseBrowserClient() {
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    client = createBrowserClient(getSupabaseUrl(), getSupabaseAnonKey());
  }
  return client;
}
