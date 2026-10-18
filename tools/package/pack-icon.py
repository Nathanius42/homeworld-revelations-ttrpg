"""Joins the rendered icon-<size>.png files (make-icon.mjs) into launcher/hwr.ico and copies the
256-pixel one to the web client as the app windows' icon. Needs Pillow (ComfyUI's Python has it):

    D:\\ComfyUI_windows_portable\\python_embeded\\python.exe tools/package/pack-icon.py
"""
import os
import shutil

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
LAUNCHER = os.path.join(HERE, "launcher")
SIZES = [16, 24, 32, 48, 64, 128, 256]

images = [Image.open(os.path.join(LAUNCHER, f"icon-{s}.png")).convert("RGBA") for s in SIZES]
# Pillow writes one entry per size, taking each from the image of that size.
images[-1].save(os.path.join(LAUNCHER, "hwr.ico"), format="ICO", sizes=[(s, s) for s in SIZES], append_images=images[:-1])
shutil.copyfile(os.path.join(LAUNCHER, "icon-256.png"), os.path.join(HERE, "..", "..", "apps", "web", "public", "icon-256.png"))
for s in SIZES:
    os.remove(os.path.join(LAUNCHER, f"icon-{s}.png"))
print("wrote", os.path.join(LAUNCHER, "hwr.ico"))
