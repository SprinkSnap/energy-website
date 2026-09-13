import { IS_STAGING } from "@/lib/site-env";

/** Staging-only auth diagnostics — never log secrets. */
export function authLog(message: string): void {
  if (IS_STAGING) {
    console.log(message);
  }
}
