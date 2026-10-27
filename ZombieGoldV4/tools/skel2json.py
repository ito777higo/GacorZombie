"""Convert a Spine 3.6 binary skeleton (.skel / .skel.bytes) to Spine 3.6 JSON.

The web runtime we vendor (spine-ts 3.6) only reads JSON, while the hero and turret
were exported as binary. This is a straight port of SkeletonBinary.java from the
spine-runtimes 3.6 branch; it writes the same fields the 3.6 JSON exporter would.

    python3 tools/skel2json.py in.skel.bytes out.json
"""
import json
import struct
import sys

TRANSFORM = ['normal', 'onlyTranslation', 'noRotationOrReflection', 'noScale', 'noScaleOrReflection']
BLEND = ['normal', 'additive', 'multiply', 'screen']
ATTACHMENT = ['region', 'boundingbox', 'mesh', 'linkedmesh', 'path', 'point', 'clipping']
POSITION = ['fixed', 'percent']
SPACING = ['length', 'fixed', 'percent']
ROTATE = ['tangent', 'chain', 'chainScale']
BONE_TIMELINES = ['rotate', 'translate', 'scale', 'shear']
SLOT_TIMELINES = ['attachment', 'color', 'twoColor']
PATH_TIMELINES = ['position', 'spacing', 'mix']


class Reader:
    def __init__(self, data):
        self.d = data
        self.p = 0

    def byte(self):
        v = self.d[self.p]
        self.p += 1
        return v

    def sbyte(self):
        v = self.byte()
        return v - 256 if v > 127 else v

    def bool(self):
        return self.byte() != 0

    def short(self):
        v = struct.unpack_from('>h', self.d, self.p)[0]
        self.p += 2
        return v

    def int32(self):
        v = struct.unpack_from('>i', self.d, self.p)[0]
        self.p += 4
        return v

    def float(self):
        v = struct.unpack_from('>f', self.d, self.p)[0]
        self.p += 4
        return round(v, 4)

    def varint(self, optimize_positive=True):
        b = self.byte()
        result = b & 0x7F
        if b & 0x80:
            b = self.byte()
            result |= (b & 0x7F) << 7
            if b & 0x80:
                b = self.byte()
                result |= (b & 0x7F) << 14
                if b & 0x80:
                    b = self.byte()
                    result |= (b & 0x7F) << 21
                    if b & 0x80:
                        b = self.byte()
                        result |= b << 28
        result &= 0xFFFFFFFF
        if not optimize_positive:
            result = (result >> 1) ^ -(result & 1)
        elif result > 0x7FFFFFFF:
            result -= 1 << 32
        return result

    def string(self):
        n = self.varint()
        if n == 0:
            return None
        if n == 1:
            return ''
        raw = self.d[self.p:self.p + n - 1]
        self.p += n - 1
        return raw.decode('utf-8')


def rgba(v):
    return '%08x' % (v & 0xFFFFFFFF)


def rgb(v):
    return '%06x' % (v & 0xFFFFFF)


def read_curve(r, frame):
    kind = r.byte()
    if kind == 1:
        frame['curve'] = 'stepped'
    elif kind == 2:
        frame['curve'] = [r.float(), r.float(), r.float(), r.float()]


def read_vertices(r, count):
    """Returns (json_vertices, weighted)."""
    if not r.bool():
        return [r.float() for _ in range(count * 2)], False
    out = []
    for _ in range(count):
        n = r.varint()
        out.append(n)
        for _ in range(n):
            out += [r.varint(), r.float(), r.float(), r.float()]
    return out, True


def read_shorts(r):
    return [r.short() for _ in range(r.varint())]


def convert(data):
    r = Reader(data)
    sk = {}
    out = {'skeleton': sk}
    h = r.string()
    if h:
        sk['hash'] = h
    sk['spine'] = r.string()
    sk['width'] = r.float()
    sk['height'] = r.float()
    nonessential = r.bool()
    if nonessential:
        sk['fps'] = r.float()
        sk['images'] = r.string() or ''

    bones = []
    for i in range(r.varint()):
        b = {'name': r.string()}
        if i:
            b['parent'] = bones[r.varint()]['name']
        b['rotation'] = r.float()
        b['x'] = r.float()
        b['y'] = r.float()
        b['scaleX'] = r.float()
        b['scaleY'] = r.float()
        b['shearX'] = r.float()
        b['shearY'] = r.float()
        b['length'] = r.float()
        b['transform'] = TRANSFORM[r.varint()]
        if nonessential:
            b['color'] = rgba(r.int32())
        bones.append(b)
    out['bones'] = bones

    slots = []
    for _ in range(r.varint()):
        s = {'name': r.string(), 'bone': bones[r.varint()]['name'], 'color': rgba(r.int32())}
        dark = r.int32()
        if dark != -1:
            s['dark'] = rgb(dark)
        att = r.string()
        if att is not None:
            s['attachment'] = att
        s['blend'] = BLEND[r.varint()]
        slots.append(s)
    out['slots'] = slots

    ik = []
    for _ in range(r.varint()):
        c = {'name': r.string(), 'order': r.varint()}
        c['bones'] = [bones[r.varint()]['name'] for _ in range(r.varint())]
        c['target'] = bones[r.varint()]['name']
        c['mix'] = r.float()
        c['bendPositive'] = r.sbyte() == 1
        ik.append(c)
    if ik:
        out['ik'] = ik

    transform = []
    for _ in range(r.varint()):
        c = {'name': r.string(), 'order': r.varint()}
        c['bones'] = [bones[r.varint()]['name'] for _ in range(r.varint())]
        c['target'] = bones[r.varint()]['name']
        c['local'] = r.bool()
        c['relative'] = r.bool()
        for k in ('rotation', 'x', 'y', 'scaleX', 'scaleY', 'shearY', 'rotateMix', 'translateMix', 'scaleMix', 'shearMix'):
            c[k] = r.float()
        transform.append(c)
    if transform:
        out['transform'] = transform

    paths = []
    for _ in range(r.varint()):
        c = {'name': r.string(), 'order': r.varint()}
        c['bones'] = [bones[r.varint()]['name'] for _ in range(r.varint())]
        c['target'] = slots[r.varint()]['name']
        c['positionMode'] = POSITION[r.varint()]
        c['spacingMode'] = SPACING[r.varint()]
        c['rotateMode'] = ROTATE[r.varint()]
        for k in ('rotation', 'position', 'spacing', 'rotateMix', 'translateMix'):
            c[k] = r.float()
        paths.append(c)
    if paths:
        out['path'] = paths

    # Attachments keep their vertex counts so deform timelines can be decoded later.
    vertex_info = {}

    def read_attachment(skin_name, slot_index, key):
        name = r.string() or key
        kind = ATTACHMENT[r.sbyte()]
        a = {}
        if name != key:
            a['name'] = name
        if kind != 'region':
            a['type'] = kind
        if kind == 'region':
            path = r.string()
            if path is not None and path != name:
                a['path'] = path
            for k in ('rotation', 'x', 'y', 'scaleX', 'scaleY', 'width', 'height'):
                a[k] = r.float()
            a['color'] = rgba(r.int32())
        elif kind == 'boundingbox':
            n = r.varint()
            a['vertexCount'] = n
            a['vertices'], weighted = read_vertices(r, n)
            if nonessential:
                a['color'] = rgba(r.int32())
        elif kind == 'mesh':
            path = r.string()
            if path is not None and path != name:
                a['path'] = path
            a['color'] = rgba(r.int32())
            n = r.varint()
            a['uvs'] = [r.float() for _ in range(n * 2)]
            a['triangles'] = read_shorts(r)
            a['vertices'], weighted = read_vertices(r, n)
            a['hull'] = r.varint()
            if nonessential:
                a['edges'] = read_shorts(r)
                a['width'] = r.float()
                a['height'] = r.float()
            vertex_info[(skin_name, slot_index, key)] = (n, weighted, a['vertices'])
        elif kind == 'linkedmesh':
            path = r.string()
            if path is not None and path != name:
                a['path'] = path
            a['color'] = rgba(r.int32())
            skin = r.string()
            if skin is not None:
                a['skin'] = skin
            a['parent'] = r.string()
            a['deform'] = r.bool()
            if nonessential:
                a['width'] = r.float()
                a['height'] = r.float()
            vertex_info[(skin_name, slot_index, key)] = ('linked', skin or 'default', a['parent'])
        elif kind == 'path':
            a['closed'] = r.bool()
            a['constantSpeed'] = r.bool()
            n = r.varint()
            a['vertexCount'] = n
            a['vertices'], weighted = read_vertices(r, n)
            a['lengths'] = [r.float() for _ in range(n // 3)]
            if nonessential:
                a['color'] = rgba(r.int32())
            vertex_info[(skin_name, slot_index, key)] = (n, weighted, a['vertices'])
        elif kind == 'point':
            a['rotation'] = r.float()
            a['x'] = r.float()
            a['y'] = r.float()
            if nonessential:
                a['color'] = rgba(r.int32())
        elif kind == 'clipping':
            a['end'] = slots[r.varint()]['name']
            n = r.varint()
            a['vertexCount'] = n
            a['vertices'], weighted = read_vertices(r, n)
            if nonessential:
                a['color'] = rgba(r.int32())
            vertex_info[(skin_name, slot_index, key)] = (n, weighted, a['vertices'])
        return a

    def read_skin(name):
        count = r.varint()
        if count == 0:
            return None
        skin = {}
        for _ in range(count):
            slot_index = r.varint()
            atts = {}
            for _ in range(r.varint()):
                key = r.string()
                atts[key] = read_attachment(name, slot_index, key)
            skin[slots[slot_index]['name']] = atts
        return skin

    skins = {}
    skin_names = []
    default = read_skin('default')
    if default is not None:
        skins['default'] = default
        skin_names.append('default')
    for _ in range(r.varint()):
        name = r.string()
        skins[name] = read_skin(name) or {}
        skin_names.append(name)
    out['skins'] = skins

    events = {}
    event_names = []
    for _ in range(r.varint()):
        name = r.string()
        e = {'int': r.varint(False), 'float': r.float()}
        s = r.string()
        if s is not None:
            e['string'] = s
        events[name] = e
        event_names.append(name)
    if events:
        out['events'] = events

    def vertex_shape(skin_name, slot_index, key):
        info = vertex_info.get((skin_name, slot_index, key))
        if info and info[0] == 'linked':
            info = vertex_info.get((info[1], slot_index, info[2]))
        return info

    animations = {}
    for _ in range(r.varint()):
        name = r.string()
        anim = {}
        # slots
        st = {}
        for _ in range(r.varint()):
            slot = slots[r.varint()]['name']
            tl = {}
            for _ in range(r.varint()):
                kind = SLOT_TIMELINES[r.sbyte()]
                frames = []
                n = r.varint()
                for i in range(n):
                    if kind == 'attachment':
                        frames.append({'time': r.float(), 'name': r.string()})
                        continue
                    f = {'time': r.float()}
                    if kind == 'color':
                        f['color'] = rgba(r.int32())
                    else:
                        f['light'] = rgba(r.int32())
                        f['dark'] = rgb(r.int32())
                    if i < n - 1:
                        read_curve(r, f)
                    frames.append(f)
                tl[kind] = frames
            st[slot] = tl
        if st:
            anim['slots'] = st
        # bones
        bt = {}
        for _ in range(r.varint()):
            bone = bones[r.varint()]['name']
            tl = {}
            for _ in range(r.varint()):
                kind = BONE_TIMELINES[r.sbyte()]
                frames = []
                n = r.varint()
                for i in range(n):
                    f = {'time': r.float()}
                    if kind == 'rotate':
                        f['angle'] = r.float()
                    else:
                        f['x'] = r.float()
                        f['y'] = r.float()
                    if i < n - 1:
                        read_curve(r, f)
                    frames.append(f)
                tl[kind] = frames
            bt[bone] = tl
        if bt:
            anim['bones'] = bt
        # ik
        it = {}
        for _ in range(r.varint()):
            c = ik[r.varint()]['name']
            frames = []
            n = r.varint()
            for i in range(n):
                f = {'time': r.float(), 'mix': r.float(), 'bendPositive': r.sbyte() == 1}
                if i < n - 1:
                    read_curve(r, f)
                frames.append(f)
            it[c] = frames
        if it:
            anim['ik'] = it
        # transform
        tt = {}
        for _ in range(r.varint()):
            c = transform[r.varint()]['name']
            frames = []
            n = r.varint()
            for i in range(n):
                f = {'time': r.float(), 'rotateMix': r.float(), 'translateMix': r.float(), 'scaleMix': r.float(), 'shearMix': r.float()}
                if i < n - 1:
                    read_curve(r, f)
                frames.append(f)
            tt[c] = frames
        if tt:
            anim['transform'] = tt
        # paths
        pt = {}
        for _ in range(r.varint()):
            c = paths[r.varint()]
            tl = {}
            for _ in range(r.varint()):
                kind = PATH_TIMELINES[r.sbyte()]
                frames = []
                n = r.varint()
                for i in range(n):
                    f = {'time': r.float()}
                    if kind == 'mix':
                        f['rotateMix'] = r.float()
                        f['translateMix'] = r.float()
                    else:
                        f[kind] = r.float()
                    if i < n - 1:
                        read_curve(r, f)
                    frames.append(f)
                tl[kind] = frames
            pt[c['name']] = tl
        if pt:
            anim['paths'] = pt
        # deform: binary stores the same offsets the JSON does (deltas for unweighted meshes)
        dt = {}
        for _ in range(r.varint()):
            skin_name = skin_names[r.varint()]
            per_slot = {}
            for _ in range(r.varint()):
                slot_index = r.varint()
                per_att = {}
                for _ in range(r.varint()):
                    key = r.string()
                    frames = []
                    n = r.varint()
                    for i in range(n):
                        f = {'time': r.float()}
                        end = r.varint()
                        if end:
                            start = r.varint()
                            if start:
                                f['offset'] = start
                            f['vertices'] = [r.float() for _ in range(end)]
                        if i < n - 1:
                            read_curve(r, f)
                        frames.append(f)
                    per_att[key] = frames
                per_slot[slots[slot_index]['name']] = per_att
            dt[skin_name] = per_slot
        if dt:
            anim['deform'] = dt
        # draw order
        n = r.varint()
        if n:
            frames = []
            for _ in range(n):
                f = {'time': r.float()}
                offsets = []
                for _ in range(r.varint()):
                    offsets.append({'slot': slots[r.varint()]['name'], 'offset': r.varint()})
                if offsets:
                    f['offsets'] = offsets
                frames.append(f)
            anim['drawOrder'] = frames
        # events
        n = r.varint()
        if n:
            frames = []
            for _ in range(n):
                f = {'time': r.float()}
                ev = event_names[r.varint()]
                f['name'] = ev
                f['int'] = r.varint(False)
                f['float'] = r.float()
                if r.bool():
                    f['string'] = r.string()
                frames.append(f)
            anim['events'] = frames
        animations[name] = anim
    out['animations'] = animations
    if r.p != len(data):
        raise ValueError(f'{len(data) - r.p} bytes left unread')
    return out


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    with open(sys.argv[1], 'rb') as f:
        data = convert(f.read())
    with open(sys.argv[2], 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    print(f"{sys.argv[2]}: {len(data['bones'])} bones, {len(data['slots'])} slots, animations {list(data['animations'])}")


if __name__ == '__main__':
    main()
