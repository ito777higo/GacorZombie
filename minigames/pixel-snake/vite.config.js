import { defineConfig } from "vite";
import { readFileSync } from "node:fs";

export default defineConfig({
  base: "./",
  plugins: [{
    name: "standalone-download",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "play.html",
        source: readFileSync(new URL("./play.html", import.meta.url), "utf8"),
      });
    },
  }],
});
