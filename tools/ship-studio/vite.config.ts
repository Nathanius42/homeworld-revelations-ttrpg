import { defineConfig } from "vite";
import { resolve } from "node:path";

// Ships come from the git-ignored reference/ships cache made by prep.py.
export default defineConfig({
  publicDir: resolve(import.meta.dirname, "../../reference/ships"),
  server: { port: 5180, strictPort: true },
});
