"""Build the local 0.5-m material field for Sand Beach in Acadia National Park.

The NPS shell sample and mapped dune, sand and wetland occupy one lossless atlas.
The reduced night sky uses the same game panorama as the other Acadia shaders.
"""

import argparse
import hashlib
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import numpy as np
from PIL import Image, ImageDraw
from pypdf import PdfReader
import rasterio
from scipy.ndimage import (
    binary_closing,
    binary_propagation,
    gaussian_filter,
    map_coordinates,
)

SOURCES = {
    "acadia-sand-landscape.pdf": (
        "https://irma.nps.gov/DataStore/FileSource/Get/2319481?filename=ACAD_Sand+Beach_CLI+Update+Park+Report_2026.pdf",
        "762c2766f1827a6e78ad6c32dae8aa410f8f40e54be61e844f0f64a629ea61c0",
    ),
    "acadia-sand-source.jpg": (
        "https://www.nps.gov/articles/000/images/Sand-Image.jpeg",
        "6e0977b7d1c4bd176ef4631240e58b9b4978f0d8a356bbf3957ec1c1dac58b33",
    ),
}
BBOX = "564971,4908618,565496,4909108"


def service(server, path, **parameters):
    base = f"https://{server}.nationalmap.gov/arcgis/rest/services/{path}/ImageServer/exportImage"
    return (
        base
        + "?"
        + urlencode(
            dict(
                bbox=BBOX,
                bboxSR=32619,
                imageSR=32619,
                size=parameters.pop("size"),
                f="image",
                interpolation="RSP_BilinearInterpolation",
                **parameters,
            )
        )
    )


SOURCES["acadia-beach-dunes.jpg"] = (
    service(
        "imagery",
        "USGSNAIPImagery",
        size="2100,1960",
        format="jpg",
        bandIds="0,1,2",
        compressionQuality=96,
    ),
    "c6d0343d80de79dd0ee121574a206ecc78382e7a66b8e9cb52018326d0bda43c",
)
SOURCES["acadia-beach-dunes.tif"] = (
    service(
        "elevation",
        "3DEPElevation",
        size="525,490",
        format="tiff",
        pixelType="F32",
        renderingRule='{"rasterFunction":"None"}',
    ),
    "de05e7d672d4d6e272bb2508777111c3d20350b6ef10a7bfb4bd16cd3703da9d",
)


def fetch_sources(cache):
    cache.mkdir(parents=True, exist_ok=True)
    for filename, (url, digest) in SOURCES.items():
        path = cache / filename
        if not path.exists():
            request = Request(
                url,
                headers={
                    "User-Agent": "Aerie scenery build (National Map and NPS public imagery)"
                },
            )
            with urlopen(request, timeout=90) as stream:
                path.write_bytes(stream.read())
        if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            raise RuntimeError(
                f"Source changed: {filename}. Compare it with the credited acquisition before rebaking."
            )


def bake(src, game, output):
    left, top, right, bottom = 320, -1340, 845, -850
    nx, ny = 1050, 980
    row, col = np.mgrid[0:ny, 0:nx]
    x = left + (col + 0.5) / 2
    z = top + (row + 0.5) / 2
    I = (
        np.asarray(
            Image.open(src / "acadia-beach-dunes.jpg")
            .convert("RGB")
            .resize((nx, ny), Image.Resampling.LANCZOS),
            dtype="f4",
        )
        / 255.0
    )
    r, g, b = I[:, :, 0], I[:, :, 1], I[:, :, 2]
    L = 0.26 * r + 0.57 * g + 0.17 * b

    def polygon(pts):
        im = Image.new("L", (nx, ny))
        ImageDraw.Draw(im).polygon(
            [((a - left) * 2, (b - top) * 2) for a, b in pts], fill=255
        )
        return np.asarray(im).astype(float) / 255

    beach = polygon(
        [
            (372, -950),
            (379, -965),
            (397, -987),
            (415, -1004),
            (439, -1015),
            (461, -1019),
            (489, -1020),
            (534, -1017),
            (565, -1017),
            (598, -1022),
            (613, -1032),
            (628, -1038),
            (650, -1032),
            (671, -1020),
            (692, -1004),
            (703, -987),
            (714, -969),
            (716, -930),
            (707, -910),
            (670, -921),
            (548, -933),
            (446, -925),
            (398, -911),
            (372, -925),
        ]
    )
    grassy = [
        (427, -1025),
        (442, -1036),
        (460, -1049),
        (459, -1073),
        (469, -1110),
        (481, -1143),
        (498, -1145),
        (520, -1130),
        (547, -1113),
        (565, -1101),
        (572, -1070),
        (584, -1049),
        (606, -1043),
        (612, -1034),
        (596, -1025),
        (567, -1018),
        (536, -1019),
        (499, -1019),
        (471, -1018),
        (445, -1019),
    ]
    dune = polygon(grassy)
    # Study the registered coarse image to exclude actual tree crowns and sand.
    herb = np.clip((L - 0.30) / 0.17, 0, 1) * np.clip((0.85 - L) / 0.10, 0, 1)
    herb *= np.clip((r + 0.023 - b) / 0.08, 0, 1)
    dune *= gaussian_filter(herb, 1)
    dune = gaussian_filter(dune, 0.7)
    with rasterio.open(src / "acadia-beach-dunes.tif") as dem:
        y = map_coordinates(
            dem.read(1), [(z - top) - 0.5, (x - left) - 0.5], order=1, mode="nearest"
        )
    sand = beach * (1 - dune) * np.clip((L - 0.25) / 0.27, 0, 1)
    sand *= 1 - np.clip((g - 0.5 * (r + b) - 0.035) / 0.06, 0, 1)
    # The aerial includes water when taken at a different tide. Continue cream
    # shell sediment across the surveyed intertidal floor, then apply wetness in game.
    intertidal = (y < 2.0) & (x > 383) & (x < 713) & (z > -994)
    sand = np.maximum(sand, beach * intertidal)
    wetBounds = polygon(
        [
            (380, -1265),
            (397, -1275),
            (458, -1254),
            (512, -1226),
            (542, -1195),
            (578, -1154),
            (598, -1108),
            (632, -1064),
            (655, -1041),
            (690, -1014),
            (714, -989),
            (711, -965),
            (686, -971),
            (655, -999),
            (632, -1013),
            (598, -1032),
            (568, -1045),
            (558, -1074),
            (545, -1099),
            (500, -1117),
            (457, -1127),
            (419, -1138),
            (387, -1187),
        ]
    )
    # The lagoon is tannic, brown-purple in the ortho. Connected color/height
    # discrimination resolves its shore, spits and vegetation without painting a polygon.
    color = (
        ((r - g > 0.033) & (b - g > -0.145)) | ((b - g > 0.075) & (r > g - 0.015))
    ) & (L < 0.79)
    inside = (wetBounds > 0.5) & color & (y < 2.40)
    seeds = np.zeros_like(inside)
    seeds[
        int((-1190 - top) * 2) : int((-1187 - top) * 2),
        int((435 - left) * 2) : int((438 - left) * 2),
    ] = True
    wet = binary_propagation(seeds & inside, mask=binary_closing(inside, iterations=2))
    wet = gaussian_filter(wet.astype("f4"), 0.68)
    # Higher intertidal reaches are wet sand after the sill closes, not standing water.
    moist = (
        np.clip((r - g - 0.015) / 0.14, 0, 1)
        * wetBounds
        * np.clip((0.74 - L) / 0.26, 0, 1)
    )
    coverage = np.maximum(sand, moist * (z > -1060))
    exposure = 0.42 + 0.50 * np.clip((L - 0.20) / 0.75, 0, 1)
    exposure = np.where(
        intertidal, np.minimum(0.8, 0.43 + 0.37 * np.clip(y, 0, 2) / 2), exposure
    )
    active = (coverage + dune + wet) > 0.004
    # The far forest is already photographed in the main atlas. It contributes no
    # local material here, so pack constant neutral data outside the mapped site.
    alpha = np.where(
        active, np.rint(np.clip(0.16 + 0.82 * exposure, 0, 1) * 63.0) / 63.0, 1.0
    )
    # The aerial separates the pale dry cusps, darker damp strand and long
    # runnels much more sharply than the decimated terrain triangles. Restore
    # their photographed reflectance at 0.5 m. Keep photographed open water
    # and white breakers off the dry surface if the two tides differ.
    coarse = gaussian_filter(L, 2.1)
    damp_pattern = np.clip((coarse - 0.65) / 0.325, 0.0, 1.0)
    soil_height = np.clip((y - 0.3) / 2.0, 0.0, 1.0)
    mapped_dry = 0.63 * damp_pattern + 0.37 * soil_height
    local = np.clip((L - gaussian_filter(L, 12)) * 3.8, -0.27, 0.23)
    where_lake = (g - r > 0.019) & (g - b > 0.008) & (y < 1.5)
    mapped_dry = np.where(where_lake, soil_height, mapped_dry)
    local = np.where(where_lake, 0.0, local)
    sand_value = np.clip(0.11 + 0.75 * mapped_dry + local, 0.0, 1.0)
    alpha = np.where(coverage > 0.12, np.rint(95.0 * sand_value) / 95.0, alpha)
    vals = np.uint8(
        np.clip(np.stack((coverage, dune, wet, alpha), axis=-1), 0, 1) * 255 + 0.5
    )
    out = Image.new("RGBA", (nx, ny + 84 + 260), (0, 0, 0, 255))
    out.paste(Image.fromarray(vals), (0, 0))
    photo = Image.open(src / "acadia-sand-source.jpg").convert("RGB")
    pw, ph = photo.size
    shell = photo.crop(
        (round(0.518 * pw), round(0.010 * ph), round(0.985 * pw), round(0.196 * ph))
    )
    shell = shell.resize((104, 42), Image.Resampling.LANCZOS)
    tile = Image.new("RGB", (208, 84))
    tile.paste(shell, (0, 0))
    tile.paste(shell.transpose(Image.Transpose.FLIP_LEFT_RIGHT), (104, 0))
    tile.paste(
        tile.crop((0, 0, 208, 42)).transpose(Image.Transpose.FLIP_TOP_BOTTOM), (0, 42)
    )
    for n in range(0, nx, 208):
        out.paste(tile, (n, ny))
    # A reduced copy of this same world's full star panorama serves as the
    # unresolved, rough sky reflection. Packing it beside the shell sample avoids
    # allocating an additional GPU texture unit for every Acadia terrain tile.
    sky = (
        Image.open(game / "acadia-night-sky.webp")
        .convert("RGB")
        .resize((512, 256), Image.Resampling.LANCZOS)
    )
    out.paste(sky, (1, ny + 86))
    out.paste(sky.crop((511, 0, 512, 256)), (0, ny + 86))
    out.paste(sky.crop((0, 0, 1, 256)), (513, ny + 86))
    # The daylight foreground of OCLP figure 46 shows shell sand at flying
    # scale. Rectify an unoccupied patch near the camera and separate its
    # centimetre- and metre-scale relief from the photograph's illumination.
    fig = (
        PdfReader(src / "acadia-sand-landscape.pdf")
        .pages[88]
        .images[1]
        .image.convert("L")
    )
    sw, sh = fig.size
    quad = [
        (x * sw / 800, y * sh / 531)
        for x, y in [(56, 393), (4, 519), (422, 519), (337, 393)]
    ]
    ground = fig.transform(
        (256, 128),
        Image.Transform.QUAD,
        tuple(v for pt in quad for v in pt),
        Image.Resampling.BICUBIC,
    )
    mono = np.asarray(ground, dtype=np.float32) / 255.0
    grain = np.clip(0.50 + (mono - gaussian_filter(mono, 11.0)) * 3.1, 0.07, 0.93)
    pattern = Image.fromarray(np.uint8(np.rint(grain * 255))).convert("RGB")
    wrapped = Image.new("RGB", (512, 256))
    wrapped.paste(pattern, (0, 0))
    wrapped.paste(pattern.transpose(Image.Transpose.FLIP_LEFT_RIGHT), (256, 0))
    wrapped.paste(
        wrapped.crop((0, 0, 512, 128)).transpose(Image.Transpose.FLIP_TOP_BOTTOM),
        (0, 128),
    )
    out.paste(wrapped, (528, ny + 86))
    out.save(output / "acadia-sand-beach.webp", lossless=True, method=6, exact=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", required=True, type=Path)
    parser.add_argument(
        "--game", type=Path, default=Path(__file__).resolve().parents[3] / "game"
    )
    parser.add_argument(
        "--output", type=Path, help="Output directory; defaults to the game directory."
    )
    args = parser.parse_args()
    fetch_sources(args.cache)
    output = args.output or args.game
    output.mkdir(parents=True, exist_ok=True)
    bake(args.cache, args.game, output)
