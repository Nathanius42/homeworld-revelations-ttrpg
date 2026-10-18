"""Builds scene art around real Homeworld ships.

For each scene in scenes.json:
  1. paint a background plate with SDXL (no ships), or reuse an existing image;
  2. composite ship renders from the ship studio (reference/renders/*.png) onto it;
  3. paint over the composite with SDXL img2img, guided by ControlNet edges (keeps every
     ship's exact silhouette) and IP-Adapter references (the in-engine Homeworld look).

Run with ComfyUI's Python, with ComfyUI running:
    D:\\ComfyUI_windows_portable\\python_embeded\\python.exe tools/art/compose.py [scene ...] [--variants N]
"""
import argparse
import json
import os
import random
import sys
import time

from PIL import Image, ImageEnhance, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import generate as gen  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
RENDERS = os.path.join(ROOT, "reference", "renders")
WORK = os.path.join(ROOT, "reference", "compose")
COMFY_INPUT = os.environ.get("COMFY_INPUT", r"D:\ComfyUI_windows_portable\ComfyUI\input")
CONTROLNET = "controlnet-union-sdxl-promax.safetensors"


def crop_to_alpha(img):
    box = img.getbbox()
    return img.crop(box) if box else img


def composite(scene, plate_path):
    plate = Image.open(plate_path).convert("RGBA").resize((scene["w"], scene["h"]), Image.LANCZOS)
    # Furthest ships first so nearer ones overlap them.
    for ship in sorted(scene["ships"], key=lambda s: s.get("depth", 0), reverse=True):
        img = crop_to_alpha(Image.open(os.path.join(RENDERS, ship["render"] + ".png")).convert("RGBA"))
        if ship.get("flip"):
            img = img.transpose(Image.FLIP_LEFT_RIGHT)
        if "height" in ship:
            # Tall ships (the Mothership flies vertically) are sized by height instead.
            height = int(scene["h"] * ship["height"])
            img = img.resize((max(1, int(img.width * height / img.height)), height), Image.LANCZOS)
        else:
            width = int(scene["w"] * ship["scale"])
            img = img.resize((width, max(1, int(img.height * width / img.width))), Image.LANCZOS)
        if ship.get("rotate"):
            img = img.rotate(ship["rotate"], resample=Image.BICUBIC, expand=True)
        haze = ship.get("haze", 0)
        if haze:
            # Distant ships lose contrast into the background, like the game's depth fog.
            rgb = ImageEnhance.Contrast(img.convert("RGB")).enhance(1 - haze)
            rgb = ImageEnhance.Brightness(rgb).enhance(1 - haze * 0.4)
            img = Image.merge("RGBA", (*rgb.split(), img.split()[3]))
        x = int(scene["w"] * ship["x"] - img.width / 2)
        y = int(scene["h"] * ship["y"] - img.height / 2)
        if ship.get("glow"):
            # A soft engine-side glow so the paint-over has light to work with.
            glow = img.split()[3].filter(ImageFilter.GaussianBlur(18))
            tint = Image.new("RGBA", img.size, tuple(ship["glow"]) + (0,))
            tint.putalpha(glow.point(lambda a: int(a * 0.5)))
            plate.paste(tint, (x, y), tint)
        # paste() with the ship as its own mask copes with ships that hang off the frame edge.
        plate.paste(img, (x, y), img)
    return plate.convert("RGB")


def paint_over(scene, comp_name, prompt, negative, seed, prefix):
    wf = gen.workflow(prompt, negative, scene["w"], scene["h"], seed, prefix, refs=scene.get("refs"), ref_weight=scene.get("refWeight", 0.55))
    wf["60"] = {"class_type": "LoadImage", "inputs": {"image": comp_name}}
    wf["61"] = {"class_type": "VAEEncode", "inputs": {"pixels": ["60", 0], "vae": ["4", 2]}}
    wf["3"]["inputs"]["latent_image"] = ["61", 0]
    wf["3"]["inputs"]["denoise"] = scene.get("denoise", 0.5)
    del wf["5"]
    strength = scene.get("control", 0.6)
    if strength > 0:
        wf["62"] = {"class_type": "ControlNetLoader", "inputs": {"control_net_name": CONTROLNET}}
        wf["63"] = {"class_type": "SetUnionControlNetType", "inputs": {"control_net": ["62", 0], "type": "canny/lineart/anime_lineart/mlsd"}}
        wf["64"] = {"class_type": "Canny", "inputs": {"image": ["60", 0], "low_threshold": 0.15, "high_threshold": 0.4}}
        wf["65"] = {
            "class_type": "ControlNetApplyAdvanced",
            "inputs": {
                "positive": ["6", 0], "negative": ["7", 0], "control_net": ["63", 0], "image": ["64", 0],
                "strength": strength, "start_percent": 0.0, "end_percent": scene.get("controlEnd", 0.7), "vae": ["4", 2],
            },
        }
        wf["3"]["inputs"]["positive"] = ["65", 0]
        wf["3"]["inputs"]["negative"] = ["65", 1]
    return gen.run(wf)


def plate_for(scene, spec, seed):
    os.makedirs(WORK, exist_ok=True)
    plate = scene["plate"]
    if plate.get("image"):
        return os.path.join(ROOT, plate["image"])
    path = os.path.join(WORK, f"{scene['key'].replace('/', '_')}.plate.png")
    if os.path.exists(path) and not plate.get("fresh"):
        return path
    negative = spec["negative"] + ", spaceship, starship, vehicle"
    if plate.get("space"):
        # SDXL turns "rings" and "debris" into landscapes unless told not to.
        negative += ", " + spec["spaceNegative"]
    # Wide canvases push SDXL towards landscapes with a horizon, so space plates are painted
    # square and a band is cropped from the middle.
    w, h = (1024, 1024) if plate.get("space") else (scene["w"], scene["h"])
    files = gen.run(gen.workflow(f"{plate['prompt']}, {spec['plateStyle']}", negative, w, h, seed, "hwr/plate", refs=plate.get("refs"), ref_weight=plate.get("refWeight", 0.45)))
    if not files:
        sys.exit(f"plate failed for {scene['key']}")
    img = Image.open(files[0]).convert("RGB")
    if plate.get("space"):
        img = img.resize((scene["w"], scene["w"]), Image.LANCZOS)
        top = int((scene["w"] - scene["h"]) * plate.get("band", 0.4))
        img = img.crop((0, top, scene["w"], top + scene["h"]))
    img.save(path)
    return path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("scenes", nargs="*")
    parser.add_argument("--variants", type=int, default=2)
    parser.add_argument("--seed", type=int)
    parser.add_argument("--spec", default=os.path.join(HERE, "scenes.json"), help="scene file (private missions keep their own)")
    parser.add_argument("--out", default=None, help="where the images go (default apps/web/public/art)")
    args = parser.parse_args()
    if args.out:
        gen.ART_DIR = os.path.abspath(args.out)
    spec = json.load(open(args.spec, encoding="utf-8"))
    if not gen.wait_server():
        sys.exit("ComfyUI is not reachable")
    os.makedirs(os.path.join(COMFY_INPUT, "hwr-comp"), exist_ok=True)
    for scene in spec["scenes"]:
        if args.scenes and scene["key"] not in args.scenes:
            continue
        started = time.time()
        seed = args.seed or random.randint(1, 2**48)
        comp = composite(scene, plate_for(scene, spec, seed))
        name = scene["key"].replace("/", "_") + ".png"
        comp.save(os.path.join(WORK, name.replace(".png", ".comp.png")))
        comp.save(os.path.join(COMFY_INPUT, "hwr-comp", name))
        prompt = f"{scene['prompt']}, {spec['style']}"
        # Space scenes stay in space: the paint-over mustn't grow a planet surface under the ships either.
        negative = spec["negative"] + (", " + spec["spaceNegative"] if scene.get("plate", {}).get("space") else "")
        for v in range(1, args.variants + 1):
            files = paint_over(scene, f"hwr-comp/{name}", prompt, negative, seed + v, "hwr/" + scene["key"].replace("/", "_"))
            if not files:
                print("FAILED", scene["key"], flush=True)
                continue
            out = os.path.join(gen.ART_DIR, f"{scene['key']}.v{v}.webp")
            gen.save_webp(files[0], out, False)
            print(f"{scene['key']} v{v} -> {os.path.relpath(out, gen.ART_DIR)} ({time.time() - started:.0f}s)", flush=True)


if __name__ == "__main__":
    main()
