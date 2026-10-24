"use strict";

const fs = require("node:fs");
const path = require("node:path");

// Keep the downloadable game self-contained; run: node build-standalone.js
const read = name => fs.readFileSync(path.join(__dirname, name), "utf8");
let html = read("index.html");

function replaceOnce(original, replacement) {
  if (html.split(original).length !== 2) throw new Error(`Expected exactly one template marker: ${original}`);
  html = html.replace(original, () => replacement);
}

replaceOnce('<link rel="stylesheet" href="style.css" />', `<style>\n${read("style.css")}\n    </style>`);
replaceOnce('    <script src="engine.js" defer></script>\n', "");
replaceOnce('    <script src="game.js" defer></script>\n', "");
replaceOnce('href="./" aria-label=', 'href="#" aria-label=');
const scripts = ["engine.js", "game.js"].map(name => {
  const source = read(name).replace(/<\/script/gi, "<\\/script");
  return `<script>\n${source}\n    </script>`;
}).join("\n    ");
replaceOnce("</body>", `${scripts}\n  </body>`);
html = html.replace("<!doctype html>", "<!doctype html>\n<!-- Standalone game. Regenerate with: node build-standalone.js -->");
fs.writeFileSync(path.join(__dirname, "play.html"), html);
console.log("Built play.html: no external scripts, styles, images, or packages required.");
