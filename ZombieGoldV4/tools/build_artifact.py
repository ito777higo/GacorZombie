"""Builds the page for publishing as a Claude Artifact: index.html without the document skeleton (the publisher
wraps the page in its own <head>/<body>). Every other file goes up unchanged at the same relative path.

    python3 tools/build_artifact.py            -> dist/index.html (the living link)
    python3 tools/build_artifact.py v0.1       -> dist/v0.1/index.html, titled with the version (a frozen link)

Artifacts do not serve .glb, so every model also goes up as JSON ({"glb": base64}) at the same path with a
.json extension, and the page tells src/view/assets.js to read those (globalThis.__GF_MODEL_FMT = 'json').
Prints the page path, then the `files` map {published path: source path} for the publish call."""
import base64
import json
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from manifest import ROOT, runtime_files  # noqa: E402

ver = sys.argv[1] if len(sys.argv) > 1 else ''
html = (ROOT / 'index.html').read_text(encoding='utf-8')
head = re.search(r'<head>(.*?)</head>', html, re.S).group(1)
body = re.search(r'<body>(.*?)</body>', html, re.S).group(1)
head = re.sub(r'\s*<meta (charset|name="viewport")[^>]*>', '', head)
if ver:
    head = re.sub(r'<title>(.*?)</title>', lambda m: f'<title>{m.group(1)} {ver}</title>', head, count=1)
main = '<script type="module" src="src/main.js"></script>'
assert body.count(main) == 1
body = body.replace(main, "<script>globalThis.__GF_MODEL_FMT = 'json';</script>\n" + main)
out = ROOT / 'dist' / (ver or '') / 'index.html'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(head.strip() + '\n' + body.strip() + '\n', encoding='utf-8')

files = {}
jdir = ROOT / 'dist' / 'models-json'
jdir.mkdir(parents=True, exist_ok=True)
for f in runtime_files():
    if f == 'index.html':
        continue
    if f.endswith('.glb'):
        p = ROOT / f
        j = jdir / (p.stem + '.json')
        j.write_text(json.dumps({'glb': base64.b64encode(p.read_bytes()).decode()}), encoding='utf-8')
        files[f[:-4] + '.json'] = str(j)
    else:
        files[f] = str(ROOT / f)
size = sum(pathlib.Path(p).stat().st_size for p in files.values())
print(out, f'· {len(files)} files · {size / 1048576:.1f} MB')
print(json.dumps(files, ensure_ascii=False, indent=1))
