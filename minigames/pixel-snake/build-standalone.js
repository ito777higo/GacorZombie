import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));

// Keep the downloadable game self-contained; run: node build-standalone.js
const read = name => fs.readFileSync(path.join(directory, name), "utf8");
let html = read("index.html");

function replaceOnce(original, replacement) {
  if (html.split(original).length !== 2) throw new Error(`Expected exactly one template marker: ${original}`);
  html = html.replace(original, () => replacement);
}

replaceOnce('<link rel="stylesheet" href="style.css" />', `<style>\n${read("style.css")}\n    </style>`);
replaceOnce('    <script type="module" src="./main.js"></script>\n', "");
replaceOnce('href="./" aria-label=', 'href="#" aria-label=');
const scripts = ["engine.js", "game.js"].map(name => {
  const source = read(name)
    .replace(/^import \{ SnakeGame \} from "\.\/engine\.js";\n/m, "")
    .replace(/^\s*export (?=const |class |function )/gm, "")
    .replace(/<\/script/gi, "<\\/script");
  return `<script>\n${source}\n    </script>`;
}).join("\n    ");
replaceOnce("</body>", `${scripts}\n    <script>mountPixelSnake(document);</script>\n  </body>`);
html = html.replace("<!doctype html>", "<!doctype html>\n<!-- Standalone game. Regenerate with: node build-standalone.js -->");
fs.writeFileSync(path.join(directory, "play.html"), html);
console.log("Built play.html: no external scripts, styles, images, or packages required.");
