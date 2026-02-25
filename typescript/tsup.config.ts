import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    splitting: false,
    clean: true,
    shims: true,
    external: ["typescript"],
  },
  {
    entry: { cli: "src/cli.ts" },
    format: ["esm"],
    splitting: false,
    shims: true,
    external: ["typescript"],
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
]);
