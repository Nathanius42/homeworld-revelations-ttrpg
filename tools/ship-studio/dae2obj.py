"""Converts a Homeworld Remastered (HW2-era) Collada ship into OBJ meshes the ship studio can load.

Homeworld 1 ships in the HWRM 1.0 source files come as OBJ; Homeworld 2 ships come as Collada
(.DAE). This keeps only the detailed level (LOD 0) meshes, MULT[...]_LOD[0], skipping collision,
joints, engine glows and navigation lights, bakes each node's transform into its vertices, and
names each material after its diffuse texture (minus _DIFF) so prep.py can match the textures.

    python tools/ship-studio/dae2obj.py <ship.DAE> <out folder>
"""
import math
import os
import re
import sys
import xml.etree.ElementTree as ET

NS = {"c": "http://www.collada.org/2005/11/COLLADASchema"}
MESH = re.compile(r"^MULT\[.+\]_LOD\[0\]$")


def floats(text):
    return [float(v) for v in text.split()]


def matmul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def identity():
    return [[1.0 if i == j else 0.0 for j in range(4)] for i in range(4)]


def node_matrix(node):
    """The node's local transform, from its translate/rotate/scale/matrix children in order."""
    m = identity()
    for child in node:
        tag = child.tag.split("}")[1]
        v = floats(child.text or "")
        if tag == "translate":
            t = identity()
            t[0][3], t[1][3], t[2][3] = v
            m = matmul(m, t)
        elif tag == "rotate":
            x, y, z, deg = v
            a = math.radians(deg)
            c, s = math.cos(a), math.sin(a)
            n = math.sqrt(x * x + y * y + z * z) or 1.0
            x, y, z = x / n, y / n, z / n
            r = [
                [c + x * x * (1 - c), x * y * (1 - c) - z * s, x * z * (1 - c) + y * s, 0],
                [y * x * (1 - c) + z * s, c + y * y * (1 - c), y * z * (1 - c) - x * s, 0],
                [z * x * (1 - c) - y * s, z * y * (1 - c) + x * s, c + z * z * (1 - c), 0],
                [0, 0, 0, 1],
            ]
            m = matmul(m, r)
        elif tag == "scale":
            s = identity()
            s[0][0], s[1][1], s[2][2] = v
            m = matmul(m, s)
        elif tag == "matrix":
            m = matmul(m, [v[i * 4 : i * 4 + 4] for i in range(4)])
    return m


def apply(m, p, w=1.0):
    return [m[i][0] * p[0] + m[i][1] * p[1] + m[i][2] * p[2] + m[i][3] * w for i in range(3)]


def texture_names(root):
    """Material id -> diffuse texture file stem, such as Hgn_Destroyer_Turret."""
    images = {}
    for img in root.iterfind(".//c:library_images/c:image", NS):
        init = img.find("c:init_from", NS)
        if init is not None and init.text:
            images[img.get("id")] = os.path.splitext(os.path.basename(init.text.strip()))[0]
    effects = {}
    for fx in root.iterfind(".//c:library_effects/c:effect", NS):
        tex = fx.find(".//c:diffuse/c:texture", NS)
        if tex is not None:
            effects[fx.get("id")] = images.get(tex.get("texture"), tex.get("texture"))
    names = {}
    for mat in root.iterfind(".//c:library_materials/c:material", NS):
        inst = mat.find("c:instance_effect", NS)
        stem = effects.get((inst.get("url") or "").lstrip("#")) if inst is not None else None
        if stem:
            names[mat.get("id")] = re.sub(r"_DIFF$", "", stem, flags=re.I)
    return names


def read_geometry(geom):
    """Triangles of a geometry: per primitive, its material symbol and (position, normal, uv) per corner."""
    mesh = geom.find("c:mesh", NS)
    sources = {s.get("id"): floats(s.find("c:float_array", NS).text or "") for s in mesh.iterfind("c:source", NS)}
    strides = {s.get("id"): int(s.find(".//c:accessor", NS).get("stride")) for s in mesh.iterfind("c:source", NS)}
    vertices = {}
    for v in mesh.iterfind("c:vertices", NS):
        for inp in v.iterfind("c:input", NS):
            if inp.get("semantic") == "POSITION":
                vertices[v.get("id")] = inp.get("source").lstrip("#")
    out = []
    for prim in list(mesh.iterfind("c:triangles", NS)) + list(mesh.iterfind("c:polylist", NS)):
        inputs = prim.findall("c:input", NS)
        width = max(int(i.get("offset")) for i in inputs) + 1
        idx = [int(v) for v in (prim.find("c:p", NS).text or "").split()]
        counts = [int(v) for v in prim.find("c:vcount", NS).text.split()] if prim.find("c:vcount", NS) is not None else None

        def corner(n):
            pos = nor = uv = None
            for inp in inputs:
                sem, off = inp.get("semantic"), int(inp.get("offset"))
                src = inp.get("source").lstrip("#")
                if sem == "VERTEX":
                    src = vertices[src]
                    sem = "POSITION"
                if sem == "TEXCOORD" and inp.get("set", "0") not in ("0", None) and uv is not None:
                    continue
                k = idx[n * width + off]
                st = strides[src]
                vals = sources[src][k * st : k * st + st]
                if sem == "POSITION":
                    pos = vals[:3]
                elif sem == "NORMAL":
                    nor = vals[:3]
                elif sem == "TEXCOORD" and uv is None:
                    uv = vals[:2]
            return pos, nor, uv

        tris = []
        n = 0
        for count in counts or [3] * (len(idx) // width // 3):
            poly = [corner(n + i) for i in range(count)]
            for i in range(1, count - 1):
                tris.append((poly[0], poly[i], poly[i + 1]))
            n += count
        out.append((prim.get("material"), tris))
    return out


def convert(dae, out_dir):
    root = ET.parse(dae).getroot()
    textures = texture_names(root)
    geometries = {g.get("id"): g for g in root.iterfind(".//c:library_geometries/c:geometry", NS)}
    os.makedirs(out_dir, exist_ok=True)
    written = []

    def walk(node, parent):
        world = matmul(parent, node_matrix(node))
        name = node.get("name") or ""
        if MESH.match(name):
            for inst in node.iterfind("c:instance_geometry", NS):
                geom = geometries.get(inst.get("url").lstrip("#"))
                if geom is None:
                    continue
                binding = {b.get("symbol"): b.get("target").lstrip("#") for b in inst.iterfind(".//c:instance_material", NS)}
                written.append(write_obj(out_dir, name, read_geometry(geom), binding, textures, world))
        for child in node.iterfind("c:node", NS):
            walk(child, world)

    for scene in root.iterfind(".//c:library_visual_scenes/c:visual_scene", NS):
        for node in scene.iterfind("c:node", NS):
            walk(node, identity())
    return [w for w in written if w]


def write_obj(out_dir, name, prims, binding, textures, world):
    # Normals transform without the translation (the rotations here are rigid).
    stem = re.sub(r"[^A-Za-z0-9_]+", "_", re.sub(r"^MULT\[(.+)\]_LOD\[0\]$", r"\1", name)).strip("_")
    file = ("Root" if stem.lower() in ("root", "root_mesh") else stem) + ".obj"
    lines, vcount = [f"# {name}"], 0
    for symbol, tris in prims:
        if not tris:
            continue
        material = textures.get(binding.get(symbol, symbol), binding.get(symbol, symbol) or "default")
        lines.append(f"usemtl {material}")
        for tri in tris:
            for pos, nor, uv in tri:
                p = apply(world, pos)
                lines.append(f"v {p[0]:.5f} {p[1]:.5f} {p[2]:.5f}")
                uvx, uvy = uv if uv else (0.0, 0.0)
                lines.append(f"vt {uvx:.6f} {uvy:.6f}")
                n = apply(world, nor, 0.0) if nor else [0.0, 0.0, 1.0]
                lines.append(f"vn {n[0]:.5f} {n[1]:.5f} {n[2]:.5f}")
            a, b, c = vcount + 1, vcount + 2, vcount + 3
            lines.append(f"f {a}/{a}/{a} {b}/{b}/{b} {c}/{c}/{c}")
            vcount += 3
    if vcount == 0:
        return None
    with open(os.path.join(out_dir, file), "w", encoding="latin-1") as f:
        f.write("\n".join(lines) + "\n")
    return file


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    for f in convert(sys.argv[1], sys.argv[2]):
        print(f)
