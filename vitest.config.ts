import { configDefaults, defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    restoreMocks: true,
    projects: [
      { extends: true, test: { name: "dom", environment: "jsdom", include: ["app.test.tsx"] } },
      { extends: true, test: { name: "node", environment: "node", exclude: [...configDefaults.exclude, ...["app.test.tsx"]] } },
    ],
  },
});
