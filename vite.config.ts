import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    target: "chrome120",
    rollupOptions: {
      input: {
        main: `${root}index.html`,
        history: `${root}history.html`,
      },
    },
  },
});
