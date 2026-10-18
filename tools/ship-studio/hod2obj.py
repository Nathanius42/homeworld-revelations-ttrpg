"""Converts a compiled Homeworld Remastered ship (.hod) into OBJ meshes and PNG textures for the ship studio.

Many Homeworld 2 ships (the Vaygr, the Pride of Hiigara, the Dreadnought, the Keepers) ship in the
HWRM 1.0 source files only as compiled .hod. A .hod is an IFF file:
  FORM HVMD   STAT (materials), LMIP (DXT textures), MULT (meshes per level of detail), GOBG (surface detail)
  FORM DTRM   HIER (the joint hierarchy each mesh hangs from)
This keeps the detailed level (LOD 0) of every mesh and its surface detail, places each mesh at its
joint, writes the diffuse, glow and team textures as PNG, and names each material after its diffuse
texture (minus _DIFF) so prep.py can match them.

    python tools/ship-studio/hod2obj.py <ship.hod> <out folder>
"""
import io
import math
import os
import re
import struct
import sys

from PIL import Image

# Vertex fields by mask bit, in the order they're stored, with their sizes in bytes.
FIELDS = [(0x1, "pos", 16), (0x2, "normal", 16), (0x4, "colour", 4), (0x8, "uv", 8), (0x10, "uv1", 8), (0x2000, "tangent", 12), (0x4000, "binormal", 12)]
KNOWN_MASK = sum(bit for bit, _, _ in FIELDS)
TRIANGLE_LIST = 0x202
MAPS = ("DIFF", "GLOW", "TEAM")


def chunks(data, start, end):
    """IFF chunks between start and end: (tag, form type or None, payload start, payload end)."""
    off = start
    while off + 8 <= end:
        tag = data[off : off + 4]
        size = struct.unpack_from(">I", data, off + 4)[0]
        if tag in (b"FORM", b"NRML"):
            yield tag, data[off + 8 : off + 12], off + 12, off + 8 + size
        else:
            yield tag, None, off + 8, off + 8 + size
        off += 8 + size


def string(data, off):
    n = struct.unpack_from("<i", data, off)[0]
    return data[off + 4 : off + 4 + n].decode("latin-1"), off + 4 + n


def textures(data, lmips):
    """Each LMIP as (stem, image or None): the first mip of a DXT texture."""
    out = []
    for _, _, start, end in lmips:
        path, off = string(data, start)
        stem = re.split(r"[\\/]", path)[-1]
        fourcc = data[off : off + 4]
        mips, width, height = struct.unpack_from("<iii", data, off + 4)
        body = data[off + 16 : end]
        out.append((stem, dds_image(fourcc, width, height, body) if stem.upper().endswith(tuple("_" + m for m in MAPS)) else None))
    return out


def dds_image(fourcc, width, height, body):
    """Decodes the top mip of DXT data by wrapping it in a minimal DDS header for Pillow."""
    if fourcc not in (b"DXT1", b"DXT3", b"DXT5"):
        return None
    block = 8 if fourcc == b"DXT1" else 16
    top = max(1, (width + 3) // 4) * max(1, (height + 3) // 4) * block
    header = struct.pack("<4sIIIIIII", b"DDS ", 124, 0x1 | 0x2 | 0x4 | 0x1000 | 0x80000, height, width, top, 0, 1) + b"\0" * 44
    header += struct.pack("<II4sIIIII", 32, 0x4, fourcc, 0, 0, 0, 0, 0) + struct.pack("<IIIII", 0x1000, 0, 0, 0, 0)
    try:
        return Image.open(io.BytesIO(header + body[:top])).copy()
    except Exception:
        return None


def materials(data, stats, texture_list):
    """STAT index -> diffuse texture stem (without _DIFF)."""
    out = []
    for _, _, start, end in stats:
        off = start + 4  # version
        name, off = string(data, off)
        diffuse = None
        if off < end:
            _shader, off = string(data, off)
            count = struct.unpack_from("<i", data, off)[0] if off + 4 <= end else 0
            off += 4
            for _ in range(count):
                _kind, length = struct.unpack_from("<ii", data, off)
                value = data[off + 8 : off + 8 + length]
                pname, off = string(data, off + 8 + length)
                if pname == "$diffuse" and length == 4:
                    idx = struct.unpack("<i", value)[0]
                    if 0 <= idx < len(texture_list):
                        diffuse = texture_list[idx][0]
        out.append(re.sub(r"_DIFF$", "", diffuse, flags=re.I) if diffuse else name)
    return out


def joints(data, hier, pose=None):
    """Joint name -> world matrix, from HIER. `pose` adds a rotation (radians, x y z) to named joints."""
    _, _, start, end = hier
    count = struct.unpack_from("<i", data, start)[0]
    off, local, parent = start + 4, {}, {}
    for _ in range(count):
        name, off = string(data, off)
        par, off = string(data, off)
        pos = struct.unpack_from("<3f", data, off)
        rot = struct.unpack_from("<3f", data, off + 12)
        scale = struct.unpack_from("<3f", data, off + 24)
        off += 36 + 12 + 3
        extra = (pose or {}).get(name)
        if extra:
            rot = tuple(r + e for r, e in zip(rot, extra))
        local[name] = compose(pos, rot, scale)
        parent[name] = par
    world = {}

    def resolve(name, depth=0):
        if name in world:
            return world[name]
        m = local.get(name, identity())
        p = parent.get(name)
        if p and p in local and depth < 64:
            m = matmul(resolve(p, depth + 1), m)
        world[name] = m
        return m

    for name in local:
        resolve(name)
    return world


def identity():
    return [[1.0 if i == j else 0.0 for j in range(4)] for i in range(4)]


def matmul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def compose(pos, rot, scale):
    """Translate, then rotate about Z, Y and X (as the Remastered Collada exports do), then scale."""
    m = identity()
    m[0][3], m[1][3], m[2][3] = pos
    for axis, angle in ((2, rot[2]), (1, rot[1]), (0, rot[0])):
        c, s = math.cos(angle), math.sin(angle)
        r = identity()
        i, j = [(1, 2), (2, 0), (0, 1)][axis]
        r[i][i], r[i][j], r[j][i], r[j][j] = c, -s, s, c
        m = matmul(m, r)
    s = identity()
    s[0][0], s[1][1], s[2][2] = scale
    return matmul(m, s)


def apply(m, p, w=1.0):
    return [m[i][0] * p[0] + m[i][1] * p[1] + m[i][2] * p[2] + m[i][3] * w for i in range(3)]


def read_bmsh(data, start):
    """A BMSH's parts: (material index, vertices [(pos, normal, uv)], triangle index triples)."""
    off = start + 4  # version
    _lod, parts = struct.unpack_from("<ii", data, off)
    off += 8
    out = []
    for _ in range(parts):
        mat, mask, count = struct.unpack_from("<iii", data, off)
        off += 12
        if mask & ~KNOWN_MASK:
            raise ValueError(f"unknown vertex fields {mask & ~KNOWN_MASK:#x}")
        layout, stride = [], 0
        for bit, name, size in FIELDS:
            if mask & bit:
                layout.append((name, stride))
                stride += size
        at = dict(layout)
        verts = []
        for v in range(count):
            base = off + v * stride
            pos = struct.unpack_from("<3f", data, base + at["pos"])
            nor = struct.unpack_from("<3f", data, base + at["normal"]) if "normal" in at else (0.0, 0.0, 1.0)
            uv = struct.unpack_from("<2f", data, base + at["uv"]) if "uv" in at else (0.0, 0.0)
            verts.append((pos, nor, uv))
        off += stride * count
        groups = struct.unpack_from("<H", data, off)[0]
        off += 2
        tris = []
        for _ in range(groups):
            kind, n = struct.unpack_from("<II", data, off)
            idx = struct.unpack_from(f"<{n}H", data, off + 8)
            off += 8 + 2 * n
            if kind == TRIANGLE_LIST:
                tris += [idx[i : i + 3] for i in range(0, n - 2, 3)]
        out.append((mat, verts, tris))
    return out


def lod0_meshes(data, start, end, header):
    """The LOD 0 BMSH in a MULT or GOBG chunk, after its header."""
    off = start + 4
    name, off = string(data, off)
    parent = "Root"
    if header == "MULT":
        parent, off = string(data, off)
        off += 4  # level-of-detail count
    else:
        off = start
        while off < end and data[off : off + 4] not in (b"NRML", b"FORM"):
            off += 1
    for tag, kind, s, e in chunks(data, off, end):
        if kind == b"BMSH" and struct.unpack_from("<i", data, s + 4)[0] == 0:
            return name, parent, read_bmsh(data, s)
    return name, parent, []


def convert(hod, out_dir, pose=None):
    data = open(hod, "rb").read()
    top = list(chunks(data, 0, len(data)))
    hvmd = next(c for c in top if c[1] == b"HVMD")
    kids = list(chunks(data, hvmd[2], hvmd[3]))
    texture_list = textures(data, [c for c in kids if c[0] == b"LMIP"])
    mats = materials(data, [c for c in kids if c[1] == b"STAT"], texture_list)
    dtrm = next((c for c in top if c[1] == b"DTRM"), None)
    hier = next((c for c in chunks(data, dtrm[2], dtrm[3]) if c[0] == b"HIER"), None) if dtrm else None
    world = joints(data, hier, pose) if hier else {}
    os.makedirs(out_dir, exist_ok=True)
    for stem, img in texture_list:
        if img is None:
            continue
        # A Homeworld 2 glow map packs other data into red and blue; green is the glow itself.
        if stem.upper().endswith("_GLOW"):
            img = img.getchannel("G").convert("RGB")
        img.save(os.path.join(out_dir, stem + ".png"))
    written = {}
    for c in kids:
        if c[1] not in (b"MULT", b"GOBG"):
            continue
        name, parent, parts = lod0_meshes(data, c[2], c[3], c[1].decode())
        if not parts:
            continue
        file = "Root.obj" if c[1] == b"GOBG" or name.lower() in ("root_mesh", "root") else re.sub(r"[^A-Za-z0-9_]+", "_", name) + ".obj"
        m = world.get(parent, identity())
        lines = written.setdefault(file, [f"# {os.path.basename(hod)}"])
        base = sum(1 for line in lines if line.startswith("v "))
        for mat, verts, tris in parts:
            lines.append(f"usemtl {mats[mat] if 0 <= mat < len(mats) else 'default'}")
            for pos, nor, uv in verts:
                p = apply(m, pos)
                n = apply(m, nor, 0.0)
                lines.append(f"v {p[0]:.5f} {p[1]:.5f} {p[2]:.5f}")
                # DirectX textures start at the top left; OBJ at the bottom left.
                lines.append(f"vt {uv[0]:.6f} {1 - uv[1]:.6f}")
                lines.append(f"vn {n[0]:.5f} {n[1]:.5f} {n[2]:.5f}")
            for a, b, c2 in tris:
                lines.append(f"f {base + a + 1}/{base + a + 1}/{base + a + 1} {base + b + 1}/{base + b + 1}/{base + b + 1} {base + c2 + 1}/{base + c2 + 1}/{base + c2 + 1}")
            base += len(verts)
    for file, lines in written.items():
        with open(os.path.join(out_dir, file), "w", encoding="latin-1") as f:
            f.write("\n".join(lines) + "\n")
    return sorted(written)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    for f in convert(sys.argv[1], sys.argv[2]):
        print(f)
