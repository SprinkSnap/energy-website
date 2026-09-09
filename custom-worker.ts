// @ts-expect-error OpenNext generates .open-next/worker.js at build time
import { default as handler } from "./.open-next/worker.js";
export { Hot2000JobQueue } from "./workers/hot2000-job-queue";

export default {
  fetch: handler.fetch,
} satisfies ExportedHandler<CloudflareEnv>;
