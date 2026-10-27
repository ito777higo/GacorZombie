"""Packs the Quaternius CC0 prop models (raw .gltf with embedded base64 buffers) into compact .glb files for the game.

    python3 -I tools/pack_models.py <raw dir> [<out dir>]

For every model listed in KEEP it drops the animations the game never plays, garbage-collects the buffer data
nothing references any more, and writes a binary .glb (no base64, 4-byte aligned) to assets/models/.
Raw files stay outside git; the packed ones are committed. Sources and licence: assets/CREDITS.md."""
import base64
import json
import pathlib
import struct
import sys

# model -> animations to keep. The game's models are all static props now (characters are Spine art), so
# every model is converted without animations; list a model here only if one with clips comes back.
KEEP = {}
# models whose opaque PNG texture is re-encoded as JPEG (a 1024² colour map drops from ~1.4 MB to ~0.2 MB)
JPEG = set()


def load(path):
    if path.suffix == '.glb':
        # binary glTF (e.g. the FBX conversions): JSON chunk + one BIN chunk
        data = path.read_bytes()
        magic, _ver, _len = struct.unpack_from('<III', data, 0)
        if magic != 0x46546C67:
            raise SystemExit(f'{path.name}: not a GLB')
        jlen, _ = struct.unpack_from('<II', data, 12)
        g = json.loads(data[20:20 + jlen].decode('utf-8'))
        off = 20 + jlen
        blen, _ = struct.unpack_from('<II', data, off)
        return g, [data[off + 8:off + 8 + blen]]
    g = json.loads(path.read_text(encoding='utf-8'))
    bufs = []
    for b in g['buffers']:
        uri = b.get('uri', '')
        if not uri.startswith('data:'):
            raise SystemExit(f'{path.name}: external buffer {uri!r} not supported')
        bufs.append(base64.b64decode(uri.split(',', 1)[1]))
    return g, bufs


COMP = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
NCOMP = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def weld(g, bufs):
    """Index the non-indexed primitives (FBX conversions store every triangle's corners apart): vertices whose
    attributes are byte-identical become one, which shrinks those models to about a third."""
    def raw(ai):
        a = g['accessors'][ai]
        v = g['bufferViews'][a['bufferView']]
        size = COMP[a['componentType']] * NCOMP[a['type']]
        stride = v.get('byteStride', size)
        base = v.get('byteOffset', 0) + a.get('byteOffset', 0)
        b = bufs[v.get('buffer', 0)]
        return [bytes(b[base + i * stride: base + i * stride + size]) for i in range(a['count'])], size

    def add(data, target=None):
        bufs.append(bytes(data))
        v = {'buffer': len(bufs) - 1, 'byteOffset': 0, 'byteLength': len(data)}
        if target:
            v['target'] = target
        g['bufferViews'].append(v)
        return len(g['bufferViews']) - 1

    for m in g.get('meshes', []):
        for p in m['primitives']:
            if 'indices' in p or p.get('mode', 4) != 4 or p.get('targets'):
                continue
            names = sorted(p['attributes'])
            cols = {k: raw(p['attributes'][k]) for k in names}
            n = len(cols[names[0]][0])
            seen, order, index = {}, [], []
            for i in range(n):
                key = b''.join(cols[k][0][i] for k in names)
                j = seen.get(key)
                if j is None:
                    j = seen[key] = len(order)
                    order.append(i)
                index.append(j)
            for k in names:
                old = g['accessors'][p['attributes'][k]]
                data = b''.join(cols[k][0][i] for i in order)
                acc = {kk: vv for kk, vv in old.items() if kk not in ('bufferView', 'byteOffset', 'count', 'sparse')}
                acc.update({'bufferView': add(data, 34962), 'count': len(order)})
                g['accessors'].append(acc)
                p['attributes'][k] = len(g['accessors']) - 1
            big = len(order) > 65535
            idata = struct.pack(('<%dI' if big else '<%dH') % len(index), *index)
            g['accessors'].append({'bufferView': add(idata, 34963), 'componentType': 5125 if big else 5123, 'count': len(index), 'type': 'SCALAR'})
            p['indices'] = len(g['accessors']) - 1
    return g, bufs


def pack(g, bufs, keep):
    if keep is not None:
        seen = set()     # FBX exports can repeat a clip under the same name: keep the first
        g['animations'] = [a for a in g.get('animations', []) if a.get('name') in keep and not (a['name'] in seen or seen.add(a['name']))]
        missing = set(keep) - {a['name'] for a in g['animations']}
        if missing:
            raise SystemExit(f'missing animations {sorted(missing)}')
    if not g.get('animations'):
        g.pop('animations', None)

    # every accessor still referenced
    used_acc = set()
    for m in g.get('meshes', []):
        for p in m['primitives']:
            used_acc.update(p['attributes'].values())
            if 'indices' in p:
                used_acc.add(p['indices'])
            for t in p.get('targets', []):
                used_acc.update(t.values())
    for s in g.get('skins', []):
        if 'inverseBindMatrices' in s:
            used_acc.add(s['inverseBindMatrices'])
    for a in g.get('animations', []):
        for s in a['samplers']:
            used_acc.update((s['input'], s['output']))
    acc_order = sorted(used_acc)
    acc_map = {old: new for new, old in enumerate(acc_order)}

    used_bv = {g['accessors'][i]['bufferView'] for i in acc_order if 'bufferView' in g['accessors'][i]}
    used_bv |= {im['bufferView'] for im in g.get('images', []) if 'bufferView' in im}
    bv_order = sorted(used_bv)
    bv_map = {old: new for new, old in enumerate(bv_order)}

    # one new buffer holding only the views still in use, each 4-byte aligned
    blob = bytearray()
    views = []
    for old in bv_order:
        v = dict(g['bufferViews'][old])
        src = bufs[v.get('buffer', 0)]
        off = v.get('byteOffset', 0)
        data = src[off:off + v['byteLength']]
        while len(blob) % 4:
            blob.append(0)
        v['buffer'] = 0
        v['byteOffset'] = len(blob)
        blob += data
        views.append(v)
    while len(blob) % 4:
        blob.append(0)

    accs = []
    for old in acc_order:
        a = dict(g['accessors'][old])
        if 'bufferView' in a:
            a['bufferView'] = bv_map[a['bufferView']]
        if 'sparse' in a:
            raise SystemExit('sparse accessors not supported')
        accs.append(a)
    g['accessors'] = accs
    g['bufferViews'] = views
    g['buffers'] = [{'byteLength': len(blob)}]

    for m in g.get('meshes', []):
        for p in m['primitives']:
            p['attributes'] = {k: acc_map[v] for k, v in p['attributes'].items()}
            if 'indices' in p:
                p['indices'] = acc_map[p['indices']]
            if 'targets' in p:
                p['targets'] = [{k: acc_map[v] for k, v in t.items()} for t in p['targets']]
    for s in g.get('skins', []):
        if 'inverseBindMatrices' in s:
            s['inverseBindMatrices'] = acc_map[s['inverseBindMatrices']]
    for a in g.get('animations', []):
        for s in a['samplers']:
            s['input'] = acc_map[s['input']]
            s['output'] = acc_map[s['output']]
    for im in g.get('images', []):
        if 'bufferView' in im:
            im['bufferView'] = bv_map[im['bufferView']]
    g.setdefault('asset', {})['generator'] = 'GateFish pack_models.py (from Quaternius CC0 glTF)'
    return g, bytes(blob)


def glb(g, blob):
    js = json.dumps(g, separators=(',', ':')).encode('utf-8')
    js += b' ' * ((4 - len(js) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(blob)
    return (struct.pack('<III', 0x46546C67, 2, total) + struct.pack('<II', len(js), 0x4E4F534A) + js
            + struct.pack('<II', len(blob), 0x004E4942) + blob)


def jpegify(g, bufs):
    """Re-encode embedded PNG images as JPEG with macOS sips; the new bytes go into an extra buffer."""
    import subprocess, tempfile
    for im in g.get('images', []):
        if im.get('mimeType') != 'image/png' or 'bufferView' not in im:
            continue
        v = g['bufferViews'][im['bufferView']]
        data = bufs[v.get('buffer', 0)][v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
        with tempfile.TemporaryDirectory() as d:
            src, dst = pathlib.Path(d) / 'a.png', pathlib.Path(d) / 'a.jpg'
            src.write_bytes(data)
            subprocess.run(['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '82', str(src), '--out', str(dst)], check=True, capture_output=True)
            jpg = dst.read_bytes()
        bufs.append(jpg)
        g['bufferViews'].append({'buffer': len(bufs) - 1, 'byteOffset': 0, 'byteLength': len(jpg)})
        im['bufferView'] = len(g['bufferViews']) - 1
        im['mimeType'] = 'image/jpeg'
    return g, bufs


def main():
    raw = pathlib.Path(sys.argv[1])
    out = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else pathlib.Path(__file__).resolve().parent.parent / 'assets' / 'models'
    out.mkdir(parents=True, exist_ok=True)
    total = 0
    for p in sorted([*raw.glob('*.gltf'), *raw.glob('*.glb')]):
        g, bufs = load(p)
        g, bufs = weld(g, bufs)
        if p.stem in JPEG:
            g, bufs = jpegify(g, list(bufs))
        g, blob = pack(g, bufs, KEEP.get(p.stem))
        data = glb(g, blob)
        (out / (p.stem + '.glb')).write_bytes(data)
        total += len(data)
        anims = [a['name'] for a in g.get('animations', [])]
        print(f'{p.stem:28s} {p.stat().st_size // 1024:6d} KB -> {len(data) // 1024:5d} KB  {", ".join(anims)}')
    print(f'total {total // 1024} KB')


if __name__ == '__main__':
    main()
