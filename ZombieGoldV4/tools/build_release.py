"""Packs the web build into one zip with index.html at the root, for any static server (no build step, no
network except the three.js CDN and Google Fonts). Dev-only folders (tests/, tools/, docs/) and the skeletons no
role uses stay out.

    python3 tools/build_release.py <version>      -> releases/zombie-gold-web-v<version>.zip
"""
import pathlib
import sys
import zipfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from manifest import ROOT, runtime_files  # noqa: E402

version = sys.argv[1] if len(sys.argv) > 1 else '0.1'
out = ROOT / 'releases' / f'zombie-gold-web-v{version}.zip'
out.parent.mkdir(exist_ok=True)
files = runtime_files()
if (ROOT / '试玩说明.txt').exists():
    files.append('试玩说明.txt')
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for f in files:
        z.write(ROOT / f, f)
print(f'{out.relative_to(ROOT)}  {len(files)} files  {out.stat().st_size / 1048576:.1f} MB')
