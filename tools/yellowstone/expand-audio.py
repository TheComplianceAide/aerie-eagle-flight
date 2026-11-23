"""Build the additional Yellowstone field recordings from credited NPS takes."""

import argparse
from concurrent.futures import ThreadPoolExecutor
import html
import json
from pathlib import Path
import re
import subprocess
from urllib.request import urlopen


NPS = "https://www.nps.gov/yell/learn/photosmultimedia/"
# Each entry identifies a separate original take. The edit limits the duration
# for browser decoding and removes sub-bass from the spatial point sources.
TAKES = {
    "anemone-birds": ("killdeer", "AnemoneKilldeer", 1, 35),
    "cliff-eruption": ("cliffgeyser", "yell-CliffGeyser.", 1, 38),
    "cliff-small-vent": ("cliffgeyser", "SmallVentNearCliffside", 1, 42),
    "faithful-close": ("oldfaithful", "OldFaithful20150322T13ms", 0, 56),
    "faithful-distant": ("oldfaithful", "OldFaithful11162014", 0, 56),
    "bison-grunt": ("bison", "2005918Bison", 0, 14),
    "bison-rut": ("bison", "BisonRut-JenniferJerrett", 0, 14),
    "bison-graze": ("bisoneating", "BisonEating150313", 1, 14),
    "elk-bugle": ("elk", "ElkBugle2.", 0, 13),
    "elk-calf": ("elk", "ElkCalf20051116", 0, 13),
    "wetland-birds": ("birdchorus", "SORAVIRAWISN", 1, 30),
    "bluebird": ("mountainbluebird", "YELLMOBL", 0, 15),
    "sparrow": ("savannahsparrow", "YELLSavannahSparrow", 0, 14),
    "meadowlark": ("westernmeadowlark", "YELLWEME", 0, 14),
    "blackbird": ("redwingedblackbird", "YELLredwingedblackbird", 0, 14),
    "snipe": ("wilsonssnip", "yell-Snipe", 0, 16),
    "grouse": ("ruffedgrouse", "yell-RuffedGrouse", 0, 14),
    "red-squirrel": ("redsquirrel", "redsquirrel2004320", 0, 14),
    "uinta-squirrel": ("uintagroundsquirrel", "Uintagroundsquirrel", 0, 14),
    "vireo": ("warblingvireo", "WarblingVireoMammoth", 0, 16),
    "crane": ("sandhillcrane", "YELLFLBCSACR", 0, 14),
    "frog-pair": ("chorusfrogs", "BorealfrogSACRWISN", 0, 20),
    "frog-chorus": ("chorusfrogs", "yell-ChorusFrogs", 0, 23),
    "goose": ("canadagoose", "", 0, 15),
    "robin": ("americanrobins", "", 0, 15),
    "yellowthroat": ("commonyellowthroat", "", 0, 15),
    "solitaire": ("townsendssolitaire", "", 0, 15),
}


def fetch(url):
    with urlopen(url, timeout=35) as response:
        return response.read()


def build(item, cache, assets, ffmpeg):
    name, (page_name, marker, start, duration) = item
    page = f"{NPS}sounds-{page_name}.htm"
    urls = re.findall(r"https://[^\s\"'<>]+?\.mp3", html.unescape(fetch(page).decode()))
    recording = next(url for url in urls if marker in url)
    original = cache / recording.rsplit("/", 1)[-1]
    if not original.exists():
        original.write_bytes(fetch(recording))
    dest = assets / f"{name}.m4a"
    subprocess.run([
        ffmpeg, "-hide_banner", "-nostdin", "-v", "error", "-y",
        "-ss", str(start), "-i", str(original), "-map", "0:a:0", "-t", str(duration),
        "-af", "highpass=f=48", "-ac", "2", "-ar", "44100", "-c:a", "aac",
        "-b:a", "96k", "-movflags", "+faststart", str(dest),
    ], check=True)
    print(f"{name}: {dest.stat().st_size:,} bytes", flush=True)
    return name, {"page": page, "recording": recording}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("assets", type=Path)
    parser.add_argument("cache", type=Path)
    parser.add_argument("--ffmpeg", default="ffmpeg")
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    args.assets.mkdir(parents=True, exist_ok=True)
    manifest_file = args.assets / "recordings.json"
    manifest = json.loads(manifest_file.read_text()) if manifest_file.exists() else {}
    with ThreadPoolExecutor(max_workers=6) as pool:
        jobs = {pool.submit(build, take, args.cache, args.assets, args.ffmpeg): take[0] for take in TAKES.items()}
        for job in jobs:
            name, credit = job.result()
            manifest[name] = credit
    manifest_file.write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
