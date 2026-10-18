"""Converts Homeworld Remastered sound effects for the app's story events (story #629).

The game's .fda files are AIFF-C compressed with Relic's own codec, which ffmpeg can't read;
vgmstream decodes them. This script picks the sounds listed in EVENTS from the unpacked game
files, decodes them with vgmstream-cli, compresses them to Ogg Opus with ffmpeg, and writes:
    reference/sfx/<event>/<n>.ogg
    reference/sfx/sfx.json   {"events": {"comms": ["comms/1.ogg"], ...}}

The sounds are licensed game assets and stay in the private folder; only this mapping is committed.

    python tools/sfx/build.py [--source "D:\\Modding Tools\\Source Files\\Homeworld RM\\sound\\sfx"]
                              [--vgmstream path\\to\\vgmstream-cli.exe] [--ffmpeg path\\to\\ffmpeg.exe]
"""
import argparse
import glob
import json
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "reference", "sfx")
DEFAULT_SOURCE = r"D:\Modding Tools\Source Files\Homeworld RM\sound\sfx"
DEFAULT_VGMSTREAM = os.path.join(ROOT, "reference", "tools", "vgmstream", "vgmstream-cli.exe")

# event -> sound files under the source folder (globs; several files give variety). The game ships
# some pairs as one identical file pitched differently by its .lua (momentum good and bad, the
# hyperspace pings, the two Fleet Intelligence pings), so each event here uses a different file.
EVENTS: dict[str, list[str]] = {
    "comms": ["ui/sensorsmanager/contactfound.fda"],
    "objective": ["ui/sensorsmanager/fintelobjectiveping.fda"],
    "combat": ["ui/sensorsmanager/combatdetectedping.fda"],
    "success": ["ui/sensorsmanager/unitbuildcomplete.fda"],
    "threat": ["ui/sensorsmanager/battlemomentumbad.fda"],
    "jumpOut": ["etg/special/special_abilities_hyperspace_out.fda"],
    "jumpIn": ["etg/special/special_abilities_hyperspace_in.fda"],
    "explosion": ["etg/explosion/medium/etg_explode_medium_firey/*.fda"],
    "hullHit": ["etg/damage/sparks/etg_damage_sparks_heavy/*.fda", "etg/damage/exploding_creaks/*.fda"],
    "weapon": ["etg/weapon/corvette/fire/weapon_corvette_pulasar_cannon_beam.fda"],
    "click": ["ui/game_space/uie_commandclick.fda"],
}
MAX_VARIANTS = 3


def find_tool(given: str | None, fallback: str, name: str) -> str:
    for candidate in (given, fallback, shutil.which(name)):
        if candidate and os.path.exists(candidate):
            return candidate
    sys.exit(f"Can't find {name}. Pass --{name.split('-')[0]} with its path.")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", default=DEFAULT_SOURCE)
    ap.add_argument("--vgmstream")
    ap.add_argument("--ffmpeg")
    args = ap.parse_args()
    vgm = find_tool(args.vgmstream, DEFAULT_VGMSTREAM, "vgmstream-cli")
    ffmpeg = find_tool(args.ffmpeg, r"C:\ffmpeg\bin\ffmpeg.exe", "ffmpeg")

    shutil.rmtree(OUT, ignore_errors=True)
    os.makedirs(OUT)
    manifest: dict[str, list[str]] = {}
    with tempfile.TemporaryDirectory() as tmp:
        for event, patterns in EVENTS.items():
            files = [f for p in patterns for f in sorted(glob.glob(os.path.join(args.source, p)))][:MAX_VARIANTS]
            if not files:
                print(f"  {event}: no source files found")
                continue
            os.makedirs(os.path.join(OUT, event), exist_ok=True)
            for i, src in enumerate(files, start=1):
                wav = os.path.join(tmp, f"{event}{i}.wav")
                subprocess.run([vgm, "-o", wav, src], check=True, capture_output=True)
                ogg = os.path.join(OUT, event, f"{i}.ogg")
                subprocess.run([ffmpeg, "-y", "-v", "error", "-i", wav, "-c:a", "libopus", "-b:a", "96k", ogg], check=True)
                manifest.setdefault(event, []).append(f"{event}/{i}.ogg")
            print(f"  {event}: {len(files)} sound(s)")
    with open(os.path.join(OUT, "sfx.json"), "w", encoding="utf-8") as fh:
        json.dump({"events": manifest}, fh, indent=2)
    print(f"{sum(len(v) for v in manifest.values())} sounds -> {OUT}")


if __name__ == "__main__":
    main()
