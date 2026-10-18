"""Generates the app's art with a local ComfyUI (SDXL + IP-Adapter) and writes WebP files to apps/web/public/art.

Images can name reference pictures (\"refs\" in prompts.json) that IP-Adapter uses to match the look of
Homeworld's real ships and characters. References are local-only copies of licensed art.

Run with ComfyUI's own Python so Pillow is available:
    D:\\ComfyUI_windows_portable\\python_embeded\\python.exe tools/art/generate.py [--only key ...] [--variants N] [--seed S]

Variants are written as <key>.v<n>.webp next to the chosen <key>.webp; pick a favourite with --pick key=n.
"""
import argparse
import json
import os
import random
import sys
import time
import urllib.error
import urllib.request

from PIL import Image

HOST = os.environ.get("COMFY_HOST", "http://127.0.0.1:8188")
COMFY_OUTPUT = os.environ.get("COMFY_OUTPUT", r"D:\ComfyUI_windows_portable\ComfyUI\output")
HERE = os.path.dirname(os.path.abspath(__file__))
ART_DIR = os.path.normpath(os.path.join(HERE, "..", "..", "apps", "web", "public", "art"))
CHECKPOINT = os.environ.get("COMFY_CHECKPOINT", "sd_xl_base_1.0_0.9vae.safetensors")
IPADAPTER = "ip-adapter-plus_sdxl_vit-h.safetensors"
CLIP_VISION = "CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors"
# Reference art lives in ComfyUI's input folder (copied from reference/art-refs, never committed).
REF_DIR = "hwr-refs"


def workflow(prompt, negative, w, h, seed, prefix, refs=None, ref_weight=0.7, ref_end=1.0):
    wf = base_workflow(prompt, negative, w, h, seed, prefix)
    if not refs:
        return wf
    # IP-Adapter Plus steers the image towards the reference art (ship shapes, palette, character style).
    wf["10"] = {"class_type": "IPAdapterModelLoader", "inputs": {"ipadapter_file": IPADAPTER}}
    wf["11"] = {"class_type": "CLIPVisionLoader", "inputs": {"clip_name": CLIP_VISION}}
    batch = None
    for i, ref in enumerate(refs):
        name, _, crop = ref.partition(":")
        wf[f"3{i}"] = {"class_type": "LoadImage", "inputs": {"image": f"{REF_DIR}/{name}.png"}}
        wf[f"4{i}"] = {
            "class_type": "PrepImageForClipVision",
            "inputs": {"image": [f"3{i}", 0], "interpolation": "LANCZOS", "crop_position": crop or "center", "sharpening": 0.0},
        }
        if batch is None:
            batch = [f"4{i}", 0]
        else:
            wf[f"5{i}"] = {"class_type": "ImageBatch", "inputs": {"image1": batch, "image2": [f"4{i}", 0]}}
            batch = [f"5{i}", 0]
    wf["20"] = {
        "class_type": "IPAdapterAdvanced",
        "inputs": {
            "model": ["4", 0], "ipadapter": ["10", 0], "image": batch, "clip_vision": ["11", 0],
            "weight": ref_weight, "weight_type": "linear", "combine_embeds": "average",
            "start_at": 0.0, "end_at": ref_end, "embeds_scaling": "V only",
        },
    }
    wf["3"]["inputs"]["model"] = ["20", 0]
    return wf


def base_workflow(prompt, negative, w, h, seed, prefix):
    return {
        "4": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": CHECKPOINT}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["4", 1]}},
        "7": {"class_type": "CLIPTextEncode", "inputs": {"text": negative, "clip": ["4", 1]}},
        "5": {"class_type": "EmptyLatentImage", "inputs": {"width": w, "height": h, "batch_size": 1}},
        "3": {
            "class_type": "KSampler",
            "inputs": {
                "seed": seed, "steps": 30, "cfg": 6.5, "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": 1.0,
                "model": ["4", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0],
            },
        },
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0], "vae": ["4", 2]}},
        "9": {"class_type": "SaveImage", "inputs": {"filename_prefix": prefix, "images": ["8", 0]}},
    }


def post(path, obj):
    req = urllib.request.Request(HOST + path, data=json.dumps(obj).encode(), headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())


def wait_server(timeout=600):
    start = time.time()
    while time.time() - start < timeout:
        try:
            urllib.request.urlopen(HOST + "/system_stats", timeout=3)
            return True
        except Exception:
            time.sleep(3)
    return False


def run(wf, timeout=900):
    try:
        prompt_id = post("/prompt", {"prompt": wf})["prompt_id"]
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, e.read().decode()[:1500], flush=True)
        return None
    start = time.time()
    while time.time() - start < timeout:
        history = json.loads(urllib.request.urlopen(f"{HOST}/history/{prompt_id}", timeout=10).read())
        entry = history.get(prompt_id)
        if entry:
            if entry.get("status", {}).get("status_str") == "error":
                print("ERROR", json.dumps(entry["status"].get("messages", []))[:1500], flush=True)
                return None
            images = entry.get("outputs", {}).get("9", {}).get("images", [])
            if images:
                return [os.path.join(COMFY_OUTPUT, i.get("subfolder", ""), i["filename"]) for i in images]
        time.sleep(1.5)
    return None


def save_webp(src, dest, portrait):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    img = Image.open(src).convert("RGB")
    if portrait:
        img = img.resize((640, int(640 * img.height / img.width)), Image.LANCZOS)
    img.save(dest, "WEBP", quality=86, method=6)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", nargs="*", help="keys to generate (default all)")
    parser.add_argument("--variants", type=int, default=1)
    parser.add_argument("--seed", type=int, default=None)
    parser.add_argument("--pick", nargs="*", default=[], help="key=n: copy variant n to the main file")
    parser.add_argument("--skip-existing", action="store_true")
    parser.add_argument("--spec", default=os.path.join(HERE, "prompts.json"), help="prompt file (private missions keep their own)")
    parser.add_argument("--out", default=None, help="where the images go (default apps/web/public/art)")
    args = parser.parse_args()

    global ART_DIR
    if args.out:
        ART_DIR = os.path.abspath(args.out)
    spec = json.load(open(args.spec, encoding="utf-8"))

    for pick in args.pick:
        key, n = pick.split("=")
        src = os.path.join(ART_DIR, f"{key}.v{n}.webp")
        os.replace(src, os.path.join(ART_DIR, f"{key}.webp"))
        print("picked", key, n)
    if args.pick:
        return

    if not wait_server():
        sys.exit("ComfyUI is not reachable at " + HOST)
    images = [i for i in spec["images"] if not args.only or i["key"] in args.only]
    for item in images:
        dest = os.path.join(ART_DIR, item["key"] + ".webp")
        if args.skip_existing and os.path.exists(dest):
            continue
        # An image can bring its own style (a night scene can't share the "warm desert light" of the rest)
        # and extra negatives (e.g. "sunset" for that night scene).
        style = item.get("style") or (spec["portraitStyle"] if item.get("portrait") else spec["style"])
        prompt = f"{item['prompt']}, {style}"
        negative = ", ".join(filter(None, [spec["negative"], item.get("negativeExtra")]))
        for v in range(1, args.variants + 1):
            seed = args.seed if args.seed is not None else random.randint(1, 2**48)
            started = time.time()
            wf = workflow(
                prompt, negative, item["w"], item["h"], seed, "hwr/" + item["key"].replace("/", "_"),
                refs=item.get("refs"), ref_weight=item.get("refWeight", spec.get("refWeight", 0.7)), ref_end=item.get("refEnd", 1.0),
            )
            files = run(wf)
            if not files:
                print("FAILED", item["key"], flush=True)
                continue
            out = dest if args.variants == 1 else os.path.join(ART_DIR, f"{item['key']}.v{v}.webp")
            save_webp(files[0], out, item.get("portrait", False))
            print(f"{item['key']} v{v} seed {seed} -> {os.path.relpath(out, ART_DIR)} ({time.time() - started:.0f}s)", flush=True)


if __name__ == "__main__":
    main()
