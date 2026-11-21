"""Extract rock only from Fig. 19, NPS GR Inventory (NPS/Greg Stock).

The photograph's 19.05 mm penny occupies approximately 37 pixels. The
0.173×0.189 m mirrored tile contains the granitoid host—no coin or enclave.
"""

from pathlib import Path
import argparse, hashlib, json
import numpy as np
import pypdfium2 as pdf
from urllib.request import urlopen
from PIL import Image, ImageFilter

URL = "https://irma.nps.gov/DataStore/FileSource/Get/2188442?filename=yose_gri_rpt_view.pdf"


def main():
    p = argparse.ArgumentParser()
    p.add_argument("cache", type=Path)
    cache = p.parse_args().cache
    local = cache / "yosemite-gri.pdf"
    if not local.exists():
        with urlopen(URL, timeout=75) as response:
            local.write_bytes(response.read())
    doc = pdf.PdfDocument(local)
    page = doc[33]
    assert "enclave of diorite" in page.get_textpage().get_text_range()
    sample = next(page.get_objects(filter=[3])).get_bitmap().to_pil().convert("RGB")
    assert sample.size == (681, 462)
    tile = np.array(sample.crop((6, 99, 174, 283)), dtype="f") / 255
    light = tile @ np.array([0.26, 0.60, 0.14])
    target = np.median(light)
    tile *= np.clip(
        target
        / np.maximum(
            (
                np.asarray(
                    Image.fromarray(np.uint8(light * 255)).filter(
                        ImageFilter.GaussianBlur(24)
                    ),
                    dtype="f",
                )
                / 255
            ),
            0.2,
        ),
        0.82,
        1.18,
    )[:, :, None]
    # Mirrored joins retain mineral boundaries with no edge steps. The game
    # blends this physical grain into MIPs before it becomes subpixel.
    tile = np.concatenate([tile, tile[:, ::-1]], axis=1)
    tile = np.concatenate([tile, tile[::-1]], axis=0)
    tile = np.pad(tile, ((4, 4), (4, 4), (0, 0)), mode="wrap")
    image = Image.fromarray(np.uint8(np.clip(tile, 0, 1) * 255 + 0.5))
    image.save(cache / "el-capitan-mineral.png")
    (cache / "granite-mineral-source.json").write_text(
        json.dumps(
            dict(
                report=URL,
                reportSHA256=hashlib.sha256(local.read_bytes()).hexdigest(),
                credits="NPS/Greg Stock. Yosemite National Park Geologic Resources Inventory Report, figure 19 (2012).",
                page=34,
                physicalTileMeters=[0.173, 0.189],
            ),
            indent=2,
        )
        + "\n"
    )


if __name__ == "__main__":
    main()
