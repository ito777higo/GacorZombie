"""Lists the files the game needs at runtime: the page, styles, src/**/*.js, the vendored three.js add-ons, the
Spine runtime, the props (.glb), images, audio, and only the Spine skeletons src/content/ names.
Shared by build_artifact.py and build_release.py.
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
ASSET_KEY = re.compile(r"'((?:batch\d|boss|hero|turret)/[A-Za-z0-9_]+)'")


def used_skeletons():
    keys = set()
    for f in (ROOT / 'src' / 'content').glob('*.js'):
        keys.update(ASSET_KEY.findall(f.read_text(encoding='utf-8')))
    return sorted(keys)


def skeleton_files(key):
    d = ROOT / 'assets' / 'spine' / key
    name = key.split('/')[-1]
    pages = [l.strip() for l in (d / f'{name}.atlas.txt').read_text(encoding='utf-8').splitlines() if re.search(r'\.(png|jpg)$', l.strip(), re.I)]
    return [str((d / f).relative_to(ROOT)) for f in (f'{name}.json', f'{name}.atlas.txt', *pages)]


def rel(paths):
    return [str(p.relative_to(ROOT)) for p in paths]


def runtime_files():
    files = ['index.html', 'styles.css', 'vendor/spine-3.6/spine-webgl.js', 'vendor/spine-3.6/LICENSE']
    files += rel(sorted((ROOT / 'src').rglob('*.js')))
    files += rel(sorted((ROOT / 'vendor' / 'jsm').glob('*.js')))
    for directory in ('three-0.160.0', 'fonts'):
        files += rel(sorted(p for p in (ROOT / 'vendor' / directory).rglob('*') if p.is_file()))
    for d in ('fx', 'ui', 'audio'):
        files += rel(sorted(p for p in (ROOT / 'assets' / d).iterdir() if p.suffix in ('.png', '.svg', '.mp4', '.mp3', '.m4a', '.txt') and (d != 'audio' or p.name in ('bgm_lightless_dawn_demo.mp3','MUSIC_LICENSE.txt'))))
    files += rel(sorted((ROOT / 'assets' / 'models').glob('*.glb')))
    for k in used_skeletons():
        files += skeleton_files(k)
    missing = [f for f in files if not (ROOT / f).exists()]
    if missing:
        raise SystemExit(f'missing files: {missing}')
    return files
