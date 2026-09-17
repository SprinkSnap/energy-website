import { rmSync, existsSync } from "node:fs";
import { join } from "node:path";

const targets = [".next", ".next-profiles"];

for (const dir of targets) {
  const path = join(process.cwd(), dir);
  if (!existsSync(path)) continue;
  rmSync(path, { recursive: true, force: true });
  console.log(`clean-next-cache: removed ${dir}`);
}
