"""Register Colony's Block to the Keene city footprint and UNH first-return roof.
Rectify a licensed facade photograph by Ymblanter. The slate, brick and sash
are sampled only from the building itself. See game/keene-colony-credits.txt.
"""

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import rasterio
import requests
from PIL import Image
from scipy.ndimage import gaussian_filter

PHOTO = "https://upload.wikimedia.org/wikipedia/commons/e/eb/Colony_Block_Keene.jpg"
PHOTO_HASH = "dd8fb3013911d59e44a76d87d9ec7bfd236aa8aef7a521f54e93027a507a962c"
SURFACE = (
    "https://nhgeodata.unh.edu/image/rest/services/ImageServices/nDSM_NH/ImageServer"
)
ORIGIN = (720171, 4761465)
NORTH = (1944.55, 4370.96)
WALL = np.array([1938 - 1948.9, 4404.6 - 4348.8])
WALL = WALL / np.linalg.norm(WALL)
INLAND = np.array([WALL[1], -WALL[0]])
WIDTH = 63.7 * 0.3048


def get(url, path, params=None):
    if not path.exists():
        r = requests.get(url, params=params, timeout=50)
        r.raise_for_status()
        path.write_bytes(r.content)
    return path


def warp(image, quad, size):
    # Four corners ordered clockwise starting at the top left. Work in 1000-wide
    # image coordinates so the landmark control points can be checked visually.
    src = np.asarray(quad, dtype=float) * image.width / 1000
    dst = np.array(
        [[0, 0], [size[0], 0], [size[0], size[1]], [0, size[1]]], dtype=float
    )
    rows = []
    rhs = []
    for (x, y), (u, v) in zip(dst, src, strict=True):
        rows.extend(
            [[x, y, 1, 0, 0, 0, -u * x, -u * y], [0, 0, 0, x, y, 1, -v * x, -v * y]]
        )
        rhs.extend([u, v])
    co = np.linalg.solve(rows, rhs)
    return image.transform(
        size, Image.Transform.PERSPECTIVE, co, Image.Resampling.BICUBIC
    )


def shop_materials(image, cache):
    """Rectify separate materials to avoid baking cars, people or tree trunks into glass."""
    from PIL import ImageDraw, ImageFont

    atlas = Image.new("RGB", (1024, 1024))
    # Each source rectangle lies upstream of the parked-car roof line in the
    # March 2012 field photo. Duplicate a margin for stable lower mip levels.
    patches = [
        ((323, 838, 394, 883), (0, 0, 512, 128)),        # stepped cream fascia
        ((458, 893, 471, 934), (512, 0, 768, 128)),       # sandstone pier
        ((262, 893, 294, 937), (0, 128, 256, 512)),       # roller shade, first window
        ((406, 893, 440, 940), (256, 128, 512, 512)),     # shade, last north window
        ((542, 893, 565, 934), (512, 128, 768, 512)),     # deep blue central glass
        ((703, 895, 726, 936), (768, 128, 1024, 512)),    # southern display interior
    ]
    for (l, t, r, b), rect in patches:
        size = (rect[2] - rect[0] - 8, rect[3] - rect[1] - 8)
        tile = warp(image, [(l,t),(r,t),(r,b),(l,b)], size)
        pixels = (np.asarray(tile, dtype="float32") / 255) ** .84
        pixels = np.uint8(np.clip(pixels * 1.05, 0, 1) * 255)
        atlas.paste(Image.fromarray(np.pad(pixels, ((4,4),(4,4),(0,0)), mode="edge")), rect[:2])
    # The neighboring canopy is legible in the same field photograph.
    # Keep its left and right edges in the photograph's street registration.
    awning = warp(image, [(41,850),(229,852),(232,893),(37,892)], (760,184))
    reveal = warp(image, [(847,852),(873,852),(873,884),(847,884)], (248,184))
    for tile, at in [(awning,(0,512)), (reveal,(768,512))]:
        pixels = np.asarray(tile, dtype="float32") / 255
        corrected = np.uint8(np.clip(pixels ** .87 * 1.06, 0, 1) * 255)
        atlas.paste(Image.fromarray(np.pad(corrected, ((4,4),(4,4),(0,0)), mode="edge")), at)
    # Reletter the partly tree-obscured bronze sign; panel proportions,
    # name, inset border and stepped corners follow the photograph.
    plaque = Image.new("RGB", (768, 154), (62, 50, 40))
    draw = ImageDraw.Draw(plaque)
    def panel(d):
        return [(d+22,d),(745-d,d),(767-d,d+18),(767-d,135-d),
                (745-d,153-d),(d+22,153-d),(d,135-d),(d,d+18)]
    draw.polygon(panel(0), fill=(59,49,39), outline=(119,101,75), width=4)
    draw.polygon(panel(9), outline=(94,78,54), width=3)
    font_file = get("https://raw.githubusercontent.com/google/fonts/main/ofl/crimsontext/CrimsonText-Regular.ttf", cache / "crimson-regular.ttf")
    assert hashlib.sha256(font_file.read_bytes()).hexdigest() == "48e6c5d5ad1d01599d374ecb817e15890d1feb3b8a3a88e527d44c90389e1f06"
    font = ImageFont.truetype(str(font_file), 54)
    draw.text((385,79), "CENTRAL SQUARE TERRACE", anchor="mm", font=font, fill=(37,31,26), stroke_width=1)
    draw.text((383,77), "CENTRAL SQUARE TERRACE", anchor="mm", font=font, fill=(183,161,113))
    atlas.paste(plaque.resize((248,120),Image.Resampling.LANCZOS),(772,4))
    return atlas


def texture(cache, game):
    source = get(PHOTO, cache / "colony-modern.jpg")
    assert hashlib.sha256(source.read_bytes()).hexdigest() == PHOTO_HASH
    image = Image.open(source).convert("RGB")
    # Upper walls end at the historic, continuous sill below the three brick
    # floors. Cars, pavement, storefronts and the lower section of a street tree
    # are outside this projection. The detached shop level is modeled separately.
    facade = warp(
        image,
        [(239.9, 447.2), (839.6, 485.9), (842.7, 836.7), (233.5, 827.0)],
        (1456, 848),
    )
    # The canopy of a modern street tree crosses some of the southern bays.
    # Replace only slender near-black branches with surrounding local color.
    from scipy.ndimage import distance_transform_edt, grey_closing

    rgb = np.asarray(facade)
    g = np.asarray(facade.convert("L"))
    floor = grey_closing(g, size=(7, 7))
    dark = (floor.astype(float) - g > 13) & (
        np.arange(rgb.shape[1])[None, :] > rgb.shape[1] * 0.50
    )
    dark &= g < 63
    ix = distance_transform_edt(dark, return_distances=False, return_indices=True)
    clean = rgb.copy()
    clean[dark] = rgb[ix[0], ix[1]][dark]
    # The original overcast exposure gives the source an even diffuse response.
    # Lift the black level slightly while leaving brick bonds and the name tablet.
    fac = np.clip((clean.astype("f4") / 255.0) ** 0.88 * 1.06, 0, 1)
    facade = Image.fromarray(np.uint8(fac * 255.0))
    # Three roof fronts carry different slate and distinct dormer groups.
    # Straighten each section independently, from its top bar to its eaves.
    mansards = [
        [(251.3, 268.7), (420.8, 289.3), (449.1, 436.9), (230.7, 414.0)],
        [(429.4, 351.5), (681.2, 380.9), (673.5, 459.2), (449.0, 437.2)],
        [(698.3, 341.4), (810.0, 354.4), (838.3, 476.5), (681.0, 461.0)],
    ]
    roof_parts = [warp(image, q, (512, 300)) for q in mansards]
    # The north pavilion's clear slate patch retains the blue-green and red fish-
    # scale pattern. The center's smaller plain slates come from that bay itself.
    slate = warp(image, [(264, 296), (387, 311), (391, 340), (263, 325)], (512, 160))
    plain = warp(image, [(461, 362), (545, 371), (546, 386), (463, 378)], (512, 120))
    roof = Image.new("RGB", (1536, 336))
    roof.paste(roof_parts[0], (0, 0))
    roof.paste(roof_parts[1], (512, 0))
    roof.paste(roof_parts[2], (1024, 0))
    roof.paste(slate.resize((768, 36)), (0, 300))
    roof.paste(plain.resize((768, 36)), (768, 300))
    roof = Image.fromarray(
        np.uint8(
            np.clip((np.asarray(roof, dtype="f4") / 255) ** 0.94 * 1.04, 0, 1) * 255
        )
    )
    # Reproject the unobstructed slate under the modeled dormer silhouettes.
    # Individual hoods then stand clear in front of these roof planes without
    # an extra photographed dormer remaining behind each three-dimensional hood.
    panels = []
    for idx in range(3):
        tile = slate if idx != 1 else plain
        tw = 224 if idx != 1 else 190
        th = 70 if idx != 1 else 46
        tile = tile.resize((tw, th), Image.Resampling.LANCZOS)
        panel = Image.new("RGB", (512, 300))
        raw = np.array(roof_parts[idx])
        for row, y in enumerate(range(-th, 300, th)):
            start = -tw + int((row % 2) * tw * 0.35)
            for col, x in enumerate(range(start, 512, tw)):
                a = (
                    tile
                    if (row + col) % 2 == 0
                    else tile.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
                )
                panel.paste(a, (x, y))
        fill = np.asarray(panel).astype(float)
        yy, xx = np.mgrid[:300, :512]
        edge = np.minimum(xx, 511 - xx)
        cover = np.clip((yy - 6) / 18.0, 0, 1) * np.clip((edge - 3) / 12.0, 0, 1)
        repaired = np.asarray(raw) * (1 - cover[:, :, None]) + fill * cover[:, :, None]
        repaired *= 0.94 + 0.06 * (1 - yy / 300.0)[:, :, None]
        panels.append(Image.fromarray(np.uint8(np.clip(repaired, 0, 255))))
    field = Image.new("RGB", (1536, 300))
    for idx, a in enumerate(panels):
        field.paste(a, (idx * 512, 0))
    # Only the two adjoining upper fronts are repeated across their own wings.
    # Both source strips stop above the tenant signs and the ground-floor shops.
    north = warp(image, [(24, 430), (220, 445), (221, 829), (24, 823)], (512, 512))
    south = warp(image, [(866, 557), (991, 563), (991, 846), (864, 841)], (384, 512))
    # The south edge is photographed through one leafless street tree. Its
    # right-hand sash and lintels remain clear. Repeat that real bay and its
    # masonry pier along its own wing, excluding the branches across the wall.
    southern = np.asarray(south).astype("float32")
    bay = np.concatenate((southern[:, 268:384], southern[:, 254:266]), axis=1)
    upper = np.median(southern[:124], axis=1, keepdims=True)
    bay[:124] = upper + 0.23 * np.clip(bay[:124] - upper, -11, 11)
    repaired = np.tile(bay, (1, 3, 1))
    south = Image.fromarray(np.uint8(np.clip(repaired, 0, 255)))

    def diffuse(strip):
        return Image.fromarray(
            np.uint8(np.clip((np.asarray(strip) / 255.0) ** 0.87 * 1.06, 0, 1) * 255)
        )

    north, south = diffuse(north), diffuse(south)
    neighbors = Image.new("RGB", (896, 512))
    neighbors.paste(north, (0, 0))
    neighbors.paste(south, (512, 0))
    # Bake stone lintel and sash relief but do not emboss window reflections.
    lum = np.asarray(facade.convert("L"), dtype="f4") / 255
    high = lum - gaussian_filter(lum, 5)
    gy, gx = np.gradient(gaussian_filter(high, 0.9))
    n = np.stack((-gx * 2.4, gy * 2.4, np.ones_like(gx)), axis=2)
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    normal = Image.fromarray(np.uint8((n * 0.5 + 0.5) * 255))
    for im, name, quality in [
        (facade, "wall", 93),
        (shop_materials(image, cache), "shops", 94),
        (neighbors, "neighbors", 91),
        (roof, "mansards", 93),
        (field, "slate", 91),
        (normal, "relief", 87),
    ]:
        xmp = b'<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:cc="http://creativecommons.org/ns#" dc:creator="Ymblanter; Aerie adaptation" dc:source="https://commons.wikimedia.org/wiki/File:Colony_Block_Keene.jpg" cc:license="https://creativecommons.org/licenses/by-sa/3.0/"/></rdf:RDF></x:xmpmeta>'
        im.save(game / f"keene-colony-{name}.webp", quality=quality, method=6, xmp=xmp)


def roof_heights(cache):
    left, top, right, bottom = 1910, 4325, 1981, 4412
    box = (ORIGIN[0] + left, ORIGIN[1] - bottom, ORIGIN[0] + right, ORIGIN[1] - top)
    params = {
        "bbox": ",".join(map(str, box)),
        "bboxSR": 32618,
        "imageSR": 32618,
        "size": "142,174",
        "format": "tiff",
        "pixelType": "F32",
        "interpolation": "RSP_BilinearInterpolation",
        "f": "image",
        "renderingRule": '{"rasterFunction":"None"}',
    }
    source = get(SURFACE + "/exportImage", cache / "height.tif", params)
    with rasterio.open(source) as ds:
        a = ds.read(1)
        tr = ds.transform

        def sample(u, d):
            x, z = np.array(NORTH) + WALL * u + INLAND * d
            ux, uz = ~tr * (ORIGIN[0] + x, ORIGIN[1] - z)
            return float(
                a[
                    max(0, min(a.shape[0] - 1, int(uz))),
                    max(0, min(a.shape[1] - 1, int(ux))),
                ]
            )

        # A local roof grid resolves the town-facing mansards separately. Keep the
        # later east annex with the appropriate height at the rear of the parcel.
        u = [0, 2.9, 6.25, 9.72, 13.4, 16.5, WIDTH]
        depth = [3.4, 6.1, 10.5, 14.8, 18.3, 22.5, 27.7]
        table = [
            [
                round(
                    float(
                        np.median(
                            [
                                sample(np.clip(i + di, 0.65, WIDTH - 0.65), j + dj)
                                for di, dj in [
                                    (0, 0),
                                    (-0.45, 0),
                                    (0.45, 0),
                                    (0, -0.45),
                                    (0, 0.45),
                                ]
                            ]
                        )
                    ),
                    2,
                )
                for i in u
            ]
            for j in depth
        ]
        flank_heights = []
        for left, right in [(-20.0, -2.0), (21.0, 31.0)]:
            values = [
                sample(i, d)
                for i in np.linspace(left, right, 15)
                for d in (3.5, 5.5, 7.5)
            ]
            flank_heights.append(round(float(np.median(values)), 2))
    return {
        "flankHeights": flank_heights,
        "width": round(WIDTH, 4),
        "origin": NORTH,
        "tangent": np.round(WALL, 7).tolist(),
        "u": u,
        "depth": depth,
        "rows": table,
    }


def main():
    pa = argparse.ArgumentParser(description=__doc__)
    pa.add_argument("--cache", type=Path, required=True)
    pa.add_argument("--game", type=Path, required=True)
    args = pa.parse_args()
    args.game.mkdir(parents=True, exist_ok=True)
    args.cache.mkdir(parents=True, exist_ok=True)
    texture(args.cache, args.game)
    profile = roof_heights(args.cache)
    (args.game / "keene-colony-survey.js").write_text(
        "// Roof returns from NH GRANIT nDSM; source and coordinate register in keene-colony-credits.txt.\nwindow.keeneColonySurvey="
        + json.dumps(profile, separators=(",", ":"))
        + ";\n"
    )


if __name__ == "__main__":
    main()
