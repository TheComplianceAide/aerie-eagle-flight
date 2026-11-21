"""Extract the credited NPS cover image from its 2022 report."""

from argparse import ArgumentParser
from pathlib import Path
import tempfile
from PIL import Image
import pypdfium2 as pdf

if __name__ == "__main__":
    p = ArgumentParser()
    p.add_argument("cache", type=Path)
    cache = p.parse_args().cache
    obj = next(
        o
        for o in pdf.PdfDocument(str(cache / "plaikni-nps-2022.pdf"))[0].get_objects()
        if o.type == pdf.raw.FPDF_PAGEOBJ_IMAGE and o.get_px_size() == (539, 480)
    )
    with tempfile.TemporaryDirectory() as folder:
        obj.extract(str(Path(folder) / "cover"))
        raw = Image.open(next(Path(folder).glob("cover.*")))
        # The PDF places this JPEG with a 180-degree page transformation.
        raw.transpose(Image.Transpose.ROTATE_180).convert("RGB").save(
            cache / "plaikni-field.png"
        )
