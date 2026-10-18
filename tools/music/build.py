"""Builds the mood playlist from Nathan's Homeworld soundtracks (story #628).

Copies the tracks tagged below from the soundtrack folder into the private folder and writes
the playlist the app reads:
    reference/music/<mood>/<album> - <track>.mp3
    reference/music/<set>/<mood>/...  for a mission's own music set, such as "kharak"
    reference/music/playlist.json   {"moods": {"combat": [{"file", "title", "album"}, ...], ...},
                                     "sets": {"kharak": {"combat": [...], ...}}}

The music is licensed and stays on this PC (git-ignored reference/). Only this mapping of track
names to moods is committed. Edit MOODS to retag; re-running replaces the copies.

    python tools/music/build.py ["C:\\Users\\njmol\\OneDrive\\Music\\Paul Ruskay"]
"""
import json
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "reference", "music")
DEFAULT_SOURCE = os.path.join(os.path.expanduser("~"), "OneDrive", "Music", "Paul Ruskay")

HW = "Homeworld Soundtrack"
HWR = "Homeworld Remastered Original Soundtrack"
HW2 = "Homeworld 2 Remastered Original Soundtrack"
HW3 = "Homeworld 3 Original Soundtrack"
DOK = "Homeworld-  Deserts of Kharak Original Soundtrack"

# mood -> (album, track title as it appears in the file name, without the track number)
MOODS: dict[str, list[tuple[str, str]]] = {
    "lobby": [(HW3, "Revelations"), (DOK, "Front End Menu"), (HW2, "Opening")],
    "briefing": [(HWR, "The Guidestone"), (HWR, "The Beginning"), (HW2, "The Signal"), (HW3, "Secret Briefing"), (HW3, "Speech from Intel"), (DOK, "Message from Khagaan")],
    "exploring": [
        (HW, "Kharak System"), (HW, "Diamond Shoals"), (HW, "Garden View"), (HWR, "Entering the Outer Rim"),
        (HW3, "Stellar Drifts"), (HW3, "Whispers in the Nebula"), (HW3, "Kesura Minor Ambient 01"), (HW3, "Kesura Minor Ambient 02"),
        (HW3, "Naraka Gate Ambient"), (HW3, "The Desolate Expanse"), (DOK, "Bonus Track - The Desert"),
    ],
    "mystery": [
        (HW2, "Progenitor Derelict"), (HW2, "Derelicts"), (HW2, "The Progenitors"), (HW, "Ship Graveyard"), (HW, "The Karos Graveyard"),
        (HW3, "Ghosts of the Progenitors"), (HW3, "Forgotten Relics"), (HWR, "The Sea of Lost Souls"), (HW2, "Trinity Ambience-Unreleased"),
    ],
    "tension": [
        (HWR, "Heavy Radiation"), (HWR, "One Step Too Close"), (HWR, "Hyperspace Inhibitors"), (HW3, "Imminent Threat"),
        (HW3, "The Calm Before the Storm"), (HW2, "Vaygr Approach"), (HW3, "Through Enemy Lines"), (DOK, "Escape Into the Storm"), (DOK, "Cutoff In the Storm"),
    ],
    "combat": [
        (HW, "Vaygr Battle Theme"), (HWR, "Swamers Attack"), (HWR, "The Bentusi Under Attack"), (HW2, "Counterattack"),
        (HW2, "Transports Under Attack"), (HW2, "Assault on Chimera"), (HW3, "The Pirates Attack"), (HW3, "Battle in the Ice"),
        (HW3, "Titanship Combat"), (DOK, "Battle at The Boneyard"),
    ],
    "victory": [(HW, "Hiigara System"), (HW2, "Sajuuk-khar"), (HW3, "A New Dawn"), (HWR, "Into the Heart of the Galaxy"), (HW2, "Rescue Mounted")],
    "loss": [(HWR, "Return to Kharak"), (HWR, "No One Returns"), (HW2, "Sacrifice"), (HW3, "Mission Failed"), (HW3, "The Lament"), (DOK, "Our Planet is Dying")],
}

# Music sets a mission can ask for with "music" in its definition. Their tracks come first for each
# mood and the general moods fill any gap. "kharak" is Deserts of Kharak's score for missions on the
# desert world, including the cues written for the Khar-Toba itself. Tracks with speech are left out.
SETS: dict[str, dict[str, list[tuple[str, str]]]] = {
    "kharak": {
        "lobby": [(DOK, "Front End Menu"), (DOK, "Bonus Track - The Dune Sea")],
        "briefing": [(DOK, "Arrival at the Khar Toba Site"), (DOK, "Epsilon Base"), (DOK, "Our Planet is Dying")],
        "exploring": [
            (DOK, "Khar Toba Site Ambient"), (DOK, "Bonus Track - Kharak Ambient"), (DOK, "Bonus Track - Enter the Desert Ambient"),
            (DOK, "Bonus Track - The Desert"), (DOK, "Bonus Track - The Canyon Ambient"), (DOK, "Bonus Track - Whispering Gallery Ambient"),
        ],
        "mystery": [
            (DOK, "Rachel Enters the Khar Toba"), (DOK, "The First City of Kharak"), (DOK, "Tombs of the Ancients"), (DOK, "Tomb of Sand"),
            (DOK, "Bonus Track - Buried in the Sand"), (DOK, "Bonus Track - History of the Kalash"), (DOK, "The Taiidan Wreck"),
        ],
        "tension": [
            (DOK, "The Gaalsi Arrive"), (DOK, "Gaalsi on Advance"), (DOK, "Hunted"), (DOK, "Bonus Track - Shadows in the Sand"),
            (DOK, "Bonus Track - The Gaalsi Remain a Threat"), (DOK, "Escape from the Wreck"),
        ],
        "combat": [
            (DOK, "Defend the Khar Toba"), (DOK, "Assault on the Gaalsi Base"), (DOK, "The Gaalsi Fleet Engaged"),
            (DOK, "Battle at The Boneyard"), (DOK, "Gaalsi Carrier Attacks"),
        ],
        "victory": [(DOK, "A New Beginning"), (DOK, "Let There Be Peace on Kharak Once Again"), (DOK, "Victory- Gaalsi Cruiser Destroyed")],
        "loss": [(DOK, "Jacob's Sacrifice"), (DOK, "I Will Pray for your Souls"), (DOK, "The Fate of Carrier Nabal")],
    },
    # Homeworld 2's score for missions in the Vaygr war, such as the dreadnought arc.
    "hiigara": {
        "lobby": [(HW2, "Opening"), (HW2, "The Pride of Hiigara")],
        "briefing": [(HW2, "The Signal"), (HW2, "The Rendezvous"), (HW2, "Captain Soban"), (HW2, "Transports En Route")],
        "exploring": [(HW2, "Into the Dust"), (HW2, "Outskirts of Gehenna"), (HW2, "Derelicts"), (HW2, "Journey To The Relic's Core")],
        "mystery": [
            (HW2, "Progenitor Derelict"), (HW2, "The Progenitors"), (HW2, "Dreadnought Berth"), (HW2, "The Guardian"),
            (HW2, "Sajuuk's Identity"), (HW2, "The Megalith-Unreleased"), (HW2, "Trinity Ambience-Unreleased"), (HW2, "The Eye of Aaran-Unreleased"),
        ],
        "tension": [(HW2, "Vaygr Approach"), (HW2, "Vaygr Bombers Approaching"), (HW2, "Inhibitors"), (HW2, "Movers Emerge"), (HW2, "Hiigara Under Siege")],
        "combat": [
            (HW2, "Vaygr Invasion"), (HW2, "Counterattack"), (HW2, "Transports Under Attack"), (HW2, "Assault on Chimera"),
            (HW2, "The Movers Attack"), (HW2, "Keepers of Sajuuk"), (HW2, "Battle For Sajuuk (remixed)"),
        ],
        "victory": [(HW2, "Sajuuk-khar"), (HW2, "Rescue Mounted"), (HW2, "The Age of S'Jet"), (HW2, "The House of S'jet-Unreleased")],
        "loss": [(HW2, "Sacrifice"), (HW2, "Soban Captured"), (HW2, "The Bentsui Foresaw this")],
    },
}

SHORT = {HW: "Homeworld", HWR: "Homeworld Remastered", HW2: "Homeworld 2 Remastered", HW3: "Homeworld 3", DOK: "Deserts of Kharak"}


def find(source: str, album: str, title: str) -> str | None:
    folder = os.path.join(source, album)
    if not os.path.isdir(folder):
        return None
    want = title.lower()
    for f in sorted(os.listdir(folder)):
        stem, ext = os.path.splitext(f)
        if ext.lower() in (".mp3", ".m4a", ".ogg", ".flac") and re.sub(r"^\d+\s+", "", stem).lower() == want:
            return os.path.join(folder, f)
    return None


def copy_moods(source: str, moods: dict[str, list[tuple[str, str]]], prefix: str, missing: list[str]) -> dict[str, list[dict]]:
    """Copies each mood's tracks into OUT/<prefix><mood>/ and returns their playlist entries."""
    playlist: dict[str, list[dict]] = {}
    for mood, tracks in moods.items():
        folder = f"{prefix}{mood}"
        shutil.rmtree(os.path.join(OUT, folder), ignore_errors=True)
        os.makedirs(os.path.join(OUT, folder), exist_ok=True)
        for album, title in tracks:
            src = find(source, album, title)
            if not src:
                missing.append(f"{album}: {title}")
                continue
            name = f"{SHORT[album]} - {title}{os.path.splitext(src)[1].lower()}"
            name = re.sub(r'[<>:"/\\|?*]', "", name)
            shutil.copyfile(src, os.path.join(OUT, folder, name))
            playlist.setdefault(mood, []).append({"file": f"{folder}/{name}", "title": title, "album": SHORT[album]})
    return playlist


def main() -> None:
    source = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SOURCE
    missing: list[str] = []
    moods = copy_moods(source, MOODS, "", missing)
    sets = {name: copy_moods(source, set_moods, f"{name}/", missing) for name, set_moods in SETS.items()}
    with open(os.path.join(OUT, "playlist.json"), "w", encoding="utf-8") as fh:
        json.dump({"moods": moods, "sets": sets}, fh, indent=2)
    total = sum(len(v) for v in moods.values())
    print(f"{total} tracks in {len(moods)} moods -> {OUT}")
    for name, set_moods in sets.items():
        print(f"  set {name}: {sum(len(v) for v in set_moods.values())} tracks in {len(set_moods)} moods")
    for m in missing:
        print("  not found:", m)


if __name__ == "__main__":
    main()
