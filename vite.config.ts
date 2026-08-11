import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: {},
  lint: { options: { typeAware: true, typeCheck: true } },
  test: {
    include: ["apps/**/*.test.ts", "packages/**/*.test.ts"],
  },
  run: {
    cache: true,
  },
});
