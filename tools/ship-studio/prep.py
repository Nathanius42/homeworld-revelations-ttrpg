"""Copies Homeworld Remastered source ships into reference/ships for the ship studio.

The HWRM 1.0 source files are licensed game assets: they're copied into the git-ignored
reference/ folder and only ever used locally to render art references.

    D:\\ComfyUI_windows_portable\\python_embeded\\python.exe tools/ship-studio/prep.py [ship ...]
"""
import difflib
import json
import os
import re
import shutil
import sys

from PIL import Image

SOURCE = os.environ.get(
    "HWRM_SOURCE",
    r"D:\Modding Tools\HW2TREKMOD\HWRM\Tools\Homeworld Remastered 1.0 source files",
)
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "reference", "ships"))
MAX_TEXTURE = 2048
MAPS = ("DIFF", "GLOW", "TEAM")

DEFAULT_SHIPS = [
    "kus_mothership", "kus_heavycruiser", "kus_destroyer", "kus_ioncannonfrigate", "kus_assaultfrigate",
    "kus_carrier", "kus_interceptor", "kus_attackbomber", "kus_heavycorvette", "kus_lightcorvette",
    "kus_researchship", "kus_probe", "kus_scout", "kus_resourcecollector",
    "tur_p1mothership", "tur_standardcorvette", "tur_fighter", "tur_ionarrayfrigate",
    "Der_GhostShip", "Der_HeavyCruiser",
]


# Ships to keep exactly as authored instead of auto-orienting. The Kushan and Hiigaran
# motherships fly with their longest axis vertical, like a tower.
ORIENT = {"kus_mothership": "native", "hgn_mothership": "native"}


def material_map(folder, materials, textures):
    """Maps each OBJ material to a texture base name, from the MTL files where they say, else by name."""
    mapping = {}
    for f in os.listdir(folder):
        if not f.lower().endswith(".mtl"):
            continue
        current = None
        for line in open(os.path.join(folder, f), encoding="latin-1"):
            line = line.strip()
            if line.startswith("newmtl "):
                current = line[7:].strip()
            elif current and line.lower().startswith("map_kd "):
                base = re.sub(r"_DIFF\.dds$", "", os.path.basename(line[7:].strip().replace("\\", "/")), flags=re.I)
                if base in textures:
                    mapping[current] = base
    for m in materials:
        if m in mapping:
            continue
        low = m.lower()
        # A texture whose last word (Top, Bot, Junk, Engine...) appears in the material name.
        tail = [t for t in textures if t.split("_")[-1].lower() in low and len(t.split("_")[-1]) > 2]
        if tail:
            mapping[m] = max(tail, key=lambda t: difflib.SequenceMatcher(None, low, t.lower()).ratio())
            continue
        close = difflib.get_close_matches(low, [t.lower() for t in textures], n=1, cutoff=0.3)
        if close:
            mapping[m] = next(t for t in textures if t.lower() == close[0])
    return mapping


def find_ship(name):
    for race in os.listdir(SOURCE):
        path = os.path.join(SOURCE, race, name)
        if os.path.isdir(path):
            return path
    return None


def prep(name):
    src = find_ship(name)
    if not src:
        print("missing", name)
        return None
    dest = os.path.join(OUT, name.lower())
    os.makedirs(dest, exist_ok=True)
    meshes = []
    for f in sorted(os.listdir(src)):
        low = f.lower()
        if low.endswith(".obj") and "glow" not in low:
            shutil.copyfile(os.path.join(src, f), os.path.join(dest, f))
            meshes.append(f)
        elif low.endswith(".mtl"):
            shutil.copyfile(os.path.join(src, f), os.path.join(dest, f))
        elif low.endswith(".dds") and any(low.endswith(f"_{m.lower()}.dds") for m in MAPS):
            out = os.path.join(dest, os.path.splitext(f)[0] + ".png")
            if os.path.exists(out):
                continue
            img = Image.open(os.path.join(src, f))
            if f.upper().endswith("_GLOW.DDS"):
                # Glow maps pack other data into G and B; the brightness is what we want.
                img = img.convert("L").convert("RGB")
            else:
                img = img.convert("RGBA" if f.upper().endswith("_DIFF.DDS") else "RGB")
            if img.width > MAX_TEXTURE:
                img = img.resize((MAX_TEXTURE, int(MAX_TEXTURE * img.height / img.width)), Image.LANCZOS)
            img.save(out, optimize=False)
    # The root mesh goes first; turrets and other parts follow.
    meshes.sort(key=lambda m: (not m.lower().startswith("root"), m))
    materials = sorted({line.split(None, 1)[1].strip() for m in meshes for line in open(os.path.join(dest, m), encoding="latin-1") if line.startswith("usemtl ")})
    textures = sorted({f[: -len("_DIFF.png")] for f in os.listdir(dest) if f.endswith("_DIFF.png")})
    manifest = {
        "id": name.lower(),
        "meshes": meshes,
        "materials": material_map(dest, materials, textures),
        "orient": ORIENT.get(name.lower(), "auto"),
    }
    unmatched = [m for m in materials if m not in manifest["materials"]]
    if unmatched:
        print("  no texture for", unmatched)
    json.dump(manifest, open(os.path.join(dest, "manifest.json"), "w"), indent=2)
    print(name, len(meshes), "meshes")
    return manifest


if __name__ == "__main__":
    ships = sys.argv[1:] or DEFAULT_SHIPS
    index = [m for m in (prep(s) for s in ships) if m]
    existing = os.path.join(OUT, "index.json")
    json.dump(sorted({m["id"] for m in index} | set(json.load(open(existing)) if os.path.exists(existing) else [])), open(existing, "w"), indent=2)
