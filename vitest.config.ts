import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@dnd/calculation-trace": fileURLToPath(
        new URL("./packages/calculation-trace/src/index.ts", import.meta.url),
      ),
      "@dnd/character-model": fileURLToPath(
        new URL("./packages/character-model/src/index.ts", import.meta.url),
      ),
      "@dnd/content-schema": fileURLToPath(
        new URL("./packages/content-schema/src/index.ts", import.meta.url),
      ),
      "@dnd/rules-api": fileURLToPath(
        new URL("./packages/rules-api/src/index.ts", import.meta.url),
      ),
      "@dnd/rules-core": fileURLToPath(
        new URL("./packages/rules-core/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    coverage: {
      reporter: ["text", "html"],
    },
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
  },
});
