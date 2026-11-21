"""Rebuild Oeschinensee's western hotels, skiff materials, and low-stage rowing shore.

The photographs transformed into the facade and skiff atlas are CC BY-SA 4.0.
The lens-corrected surface samples and atlas share that licence. See
game/credits.txt for authors, direct source pages, and alterations.
SWISSIMAGE imagery, swissBUILDINGS3D, and swissALTI3D are © swisstopo.
"""

import argparse
import base64
import json
from pathlib import Path
from urllib.parse import urlencode
from xml.etree import ElementTree
import zipfile

import numpy as np
from PIL import Image, ImageDraw
import rasterio
from scipy.interpolate import RegularGridInterpolator
from scipy.ndimage import distance_transform_edt, gaussian_filter
from shapely.geometry import Polygon
from shapely.ops import unary_union
from skimage.feature import peak_local_max

DATUM = 1574.9
BUILDING_TILE = "swissbuildings3d_3_0_2021_1248-31"
BUILDINGS = {
    "hotel": "ID_453800F5-C6C9-45F4-B4C6-DCE1769C667A",
    "arva": "ID_06F20114-1C14-45D9-A5AB-4BC719F86B0C",
    "orangeAnnex": "ID_8963187D-E851-4E06-98EE-EDDA7A9BE582",
    "arvaShed": "ID_7747EEE3-F74F-4FDA-B45A-1EDCB2A47BE2",
    "westShed": "ID_75BBE478-1076-44E6-92E5-BEC8AE4D8A21",
}


def fetch(cache, name, url):
    import requests

    f = cache / name
    if not f.exists():
        r = requests.get(
            url,
            headers={
                "User-Agent": "Aerie field scenery study (https://github.com/TheComplianceAide/Aerie; Swiss terrain and photo attributions)"
            },
            timeout=70,
        )
        r.raise_for_status()
        f.write_bytes(r.content)
    return f


def orth(cache, name, b, size, year=None):
    args = dict(
        SERVICE="WMS",
        REQUEST="GetMap",
        VERSION="1.1.1",
        LAYERS="ch.swisstopo.swissimage",
        STYLES="",
        SRS="EPSG:2056",
        BBOX=",".join(map(str, b)),
        WIDTH=size[0],
        HEIGHT=size[1],
        FORMAT="image/jpeg",
    )
    if year:
        args.update(LAYERS="ch.swisstopo.swissimage-product", TIME=year)
    return Image.open(
        fetch(cache, name, "https://wms.geo.admin.ch/?" + urlencode(args))
    ).convert("RGB")


def buildings(cache):
    name = BUILDING_TILE + "_2056_5728.citygml.zip"
    url = (
        "https://data.geo.admin.ch/ch.swisstopo.swissbuildings3d_3_0/"
        + BUILDING_TILE
        + "/"
        + name
    )
    with zipfile.ZipFile(fetch(cache, name, url)) as f:
        root = ElementTree.fromstring(f.read(f.namelist()[0]))
    result = {}
    for key, ident in BUILDINGS.items():
        part = next(
            b for b in root.findall(".//{*}Building") if ident in b.attrib.values()
        )
        shell = {}
        for s in ["Roof", "Ground", "Wall"]:
            data = []
            for elem in part.findall(
                ".//{*}"
                + s
                + "Surface/{*}lod2MultiSurface/{*}MultiSurface/{*}surfaceMember/{*}Polygon/{*}exterior/{*}LinearRing/{*}posList"
            ):
                q = np.fromstring(elem.text, sep=" ").reshape(-1, 3)[:-1]
                vertices = np.round(
                    np.stack(
                        (q[:, 0] - 2622000, q[:, 2] - DATUM, 1150000 - q[:, 1]), axis=1
                    ),
                    3,
                )
                if len(vertices) != 3:
                    raise ValueError("Unexpected nontriangular source surface")
                data.append(vertices.tolist())
            shell[s.lower()] = data
        result[key] = shell
    return result


PHOTOS = {
    "hotel": (
        "Oeschilover",
        "Berghotel Oeschinensee erbaut 1892.jpg",
        "https://upload.wikimedia.org/wikipedia/commons/1/10/Berghotel_Oeschinensee_erbaut_1892.jpg",
        "61888645",
    ),
    "arva": (
        "Hp.Baumeler",
        "Berghaus am oeschinensee.jpg",
        "https://upload.wikimedia.org/wikipedia/commons/7/72/Berghaus_am_oeschinensee.jpg",
        "60724717",
    ),
    "boats": (
        "Gdmolena",
        "Boats on the shoreline of Lake Oeschinen.jpg",
        "https://upload.wikimedia.org/wikipedia/commons/9/97/Boats_on_the_shoreline_of_Lake_Oeschinen.jpg",
        "120320903",
    ),
}


def sources(cache):
    out = {}
    for key, (_, _, url, thumbid) in PHOTOS.items():
        f = fetch(cache, "full-" + thumbid + ".jpg", url)
        out[key] = Image.open(f).convert("RGB")
    return out


def quad(im, points, left=256, high=256, neutral=1):
    s = im.width / 960
    # A four-corner projective fit rectifies the measured photographed wall,
    # so horizontal timber courses and the two-axis sash no longer converge.
    box = np.array([[0, 0], [left - 1, 0], [left - 1, high - 1], [0, high - 1]], float)
    src = np.asarray(points, float) * s
    A = []
    b = []
    for (x, y), (u, v) in zip(box, src):
        A.extend(
            [[x, y, 1, 0, 0, 0, -u * x, -u * y], [0, 0, 0, x, y, 1, -v * x, -v * y]]
        )
        b.extend((u, v))
    coeff = np.linalg.solve(A, b)
    r = im.transform(
        (left, high), Image.Transform.PERSPECTIVE, coeff, Image.Resampling.BICUBIC
    )
    c = np.array(r, dtype="f4") / 255
    # Undo the strongest late-day warmth/excess blue shade in the source.
    balance = (
        np.array([0.94, 1.01, 1.11]) if neutral >= 1 else np.array([1.035, 1.0, 0.96])
    )
    c = np.clip(0.019 + neutral * np.clip(c * balance, 0, 1) ** 0.96, 0, 1)
    return Image.fromarray(np.uint8(c * 255 + 0.5))


def atlas(cache, game):
    src = sources(cache)
    h, a, b = src["hotel"], src["arva"], src["boats"]
    tiles = [
        (h, [(225, 219), (308, 260), (289, 348), (204, 315)], 1.00),  # twin glazing
        (h, [(192, 184), (235, 202), (209, 312), (147, 288)], 0.94),  # honey shutter
        (h, [(116, 115), (187, 155), (150, 205), (79, 165)], 1.05),  # warm log grain
        (h, [(77, 335), (400, 453), (392, 471), (70, 365)], 0.94),  # striped awning
        (
            a,
            [(53, 243), (124, 258), (124, 502), (49, 515)],
            1.07,
        ),  # sage slatted shutter
        (a, [(1, 28), (147, 65), (142, 222), (1, 182)], 1.04),  # carved story band
        (
            a,
            [(230, 534), (406, 513), (405, 593), (223, 632)],
            1.04,
        ),  # carved balcony rail
        (h, [(65, 463), (106, 471), (92, 495), (49, 484)], 1.00),  # pale wall finish
        (h, [(119, 519), (258, 535), (238, 636), (85, 637)], 1.09),  # restaurant glass
        (h, [(201, 324), (259, 346), (255, 360), (202, 340)], 1.02),  # geranium box
        (b, [(670, 522), (749, 524), (718, 562), (651, 567)], 0.97),  # boat interior
        (b, [(730, 578), (786, 566), (786, 577), (730, 587)], 1.09),  # wet skiff side
        (a, [(165, 191), (175, 191), (173, 466), (162, 468)], 1.03),  # stained post
        (b, [(648, 543), (710, 543), (728, 546), (666, 547)], 1.01),  # timber seat
        (a, [(817, 513), (875, 501), (902, 523), (836, 539)], 0.94),  # stone pavers
        (h, [(681, 499), (705, 490), (716, 514), (694, 523)], 0.96),  # roof shingles
    ]
    out = Image.new("RGB", (1024, 1024))
    for i, (im, points, lum) in enumerate(tiles):
        out.paste(quad(im, points, 256, 256, lum), ((i % 4) * 256, (i // 4) * 256))
    xmp = (
        b'<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
        b'<rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:cc="http://creativecommons.org/ns#" '
        b'dc:title="Oeschinensee hotel facades and skiff materials" '
        b'dc:rights="Oeschilover, Hp.Baumeler, Gdmolena; original photographs cropped, rectified, balanced and collected by Aerie." '
        b'cc:license="https://creativecommons.org/licenses/by-sa/4.0/">'
        b"<dc:source><rdf:Bag><rdf:li>https://commons.wikimedia.org/wiki/File:Berghotel_Oeschinensee_erbaut_1892.jpg</rdf:li>"
        b"<rdf:li>https://commons.wikimedia.org/wiki/File:Berghaus_am_oeschinensee.jpg</rdf:li>"
        b"<rdf:li>https://commons.wikimedia.org/wiki/File:Boats_on_the_shoreline_of_Lake_Oeschinen.jpg</rdf:li></rdf:Bag></dc:source>"
        b"</rdf:Description></rdf:RDF></x:xmpmeta>"
    )
    out.save(game / "oeschinen-landing-surfaces.webp", quality=91, method=6, xmp=xmp)


def registered(cache, game):
    # Use the national 10 cm XY registration on all roofs. The courtyard
    # reference identifies one semi-permanent canopy and separate round parasols.
    im = orth(
        cache, "west-hotel-fine.jpg", (2621070, 1149550, 2621240, 1149720), (1700, 1700)
    )
    im.crop((150, 490, 1500, 1280)).save(
        game / "oeschinen-landing-roofs.webp", quality=93, method=6
    )


TERRAIN_TILE = "swissalti3d_2025_2621-1149"


def collect(cache, game):
    bld = buildings(cache)
    # Retain the federal source vertices exactly in cm and index the triangular
    # wall/roof shells so repeated ridge nodes cost one number triple.
    structures = []
    for key, b in bld.items():
        verts = []
        vindex = {}

        def vertex(q):
            a = tuple(int(round(v * 100)) for v in q)
            if a not in vindex:
                vindex[a] = len(verts)
                verts.extend([a])
            return vindex[a]

        roof = [[vertex(q) for q in tri] for tri in b["roof"]]
        walls = [[vertex(q) for q in tri] for tri in b["wall"]]
        polys = [Polygon([(q[0], q[2]) for q in tri]) for tri in b["roof"]]
        plan = unary_union([q for q in polys if q.area > 0]).simplify(0.25)
        if plan.geom_type == "MultiPolygon":
            plans = list(plan.geoms)
        else:
            plans = [plan]
        structures.append(
            dict(
                name=key,
                vertices=verts,
                roof=roof,
                walls=walls,
                plan=[
                    np.round(poly.exterior.coords[:-1], 2).tolist() for poly in plans
                ],
            )
        )
    im = orth(
        cache, "west-hotel-fine.jpg", (2621070, 1149550, 2621240, 1149720), (1700, 1700)
    )
    src = np.array(im, dtype="f4")
    r, g, b = src.transpose(2, 0, 1)
    # Full-resolution SWISSIMAGE detects many umbrellas missed by integer-pixel
    # aerial segmentation where neighboring canopies meet.
    X, Z = np.meshgrid(
        np.arange(im.width) * 0.1 - 930, np.arange(im.height) * 0.1 + 280
    )
    areas = {
        "hotel": (r > 160)
        & (g > 145)
        & (r - b > 21)
        & (g - b > 13)
        & (X > -896)
        & (X < -839)
        & (Z > 372)
        & (Z < 421),
        "arva": (r > 138)
        & (r - g > 31)
        & (r - b > 25)
        & (X > -812)
        & (X < -778)
        & (Z > 359)
        & (Z < 381),
    }
    areas["hotel"] &= ~((X > -853) & (X < -841) & (Z > 379.4) & (Z < 392.7))
    areas["hotel"] &= (Z > 402) | ((X > -854) & (Z > 372))
    areas["arva"] &= ~((X < -800) & (Z < 364))
    par = []
    for name, mask in areas.items():
        d = distance_transform_edt(mask)
        for cy, cx in peak_local_max(
            gaussian_filter(d, 2), min_distance=10, threshold_abs=5.6
        ):
            rr = d[cy, cx]
            x = -930 + (cx + 0.5) * 0.1
            z = 280 + (cy + 0.5) * 0.1
            if rr > 22 or (name == "arva" and (x > -787 and z < 369 or z < 361)):
                continue
            radius = round(np.clip(rr * 0.109, 0.91, 1.72), 2)
            par.append(
                [
                    round(x, 2),
                    round(z, 2),
                    radius,
                    "red" if name == "arva" else "yellow",
                ]
            )
    for cx, cy in [(252, 820), (315, 811), (533, 620), (517, 652)]:
        par.append([round(-930 + cx / 6, 2), round(280 + cy / 6, 2), 1.50, "blue"])
    # The archived 2000/2004 sheet resolves a string of small boats on an exposed
    # gravel fan, 95–125 m from the contemporary higher-water berth. Fasten the
    # movable fleet at this cove's modelled 1574.9 m margin. Preserve a measured
    # minimum berth spacing after projecting independent bows onto the new stage.
    url = (
        "https://data.geo.admin.ch/ch.swisstopo.swissalti3d/"
        + TERRAIN_TILE
        + "/"
        + TERRAIN_TILE
        + "_2_2056_5728.tif"
    )
    with rasterio.open(fetch(cache, TERRAIN_TILE + "_2_2056_5728.tif", url)) as ds:
        field = ds.read(1) - 1574.9
        rr = np.arange(field.shape[0]) * 2 + (1150000 - ds.transform.f) + 1
        cc = np.arange(field.shape[1]) * 2 + ds.transform.c - 2622000 + 1
        dtm = RegularGridInterpolator(
            (rr, cc), field, bounds_error=False, fill_value=None
        )
        # At this flat water return, the DTM resolves the exposed bank but does not
        # measure bottom depths. Continue the observed gravel fan under the stage
        # using the same conservative slope as the adjacent survey.
        gz, gx = np.mgrid[246:378:2, -768:-606:2]
        sampled = dtm(np.stack((gz, gx), axis=-1))
        wet_grid = sampled < 0.125
        shallow = np.where(
            wet_grid,
            -0.12 - np.minimum(distance_transform_edt(wet_grid) * 0.24, 3.90),
            sampled,
        )
        shore_strip = np.rint(100 * gaussian_filter(shallow, 0.28)).astype("<i2")
        edge_grid = dict(
            x=-768,
            z=246,
            step=2,
            cols=shore_strip.shape[1],
            rows=shore_strip.shape[0],
            cm=base64.b64encode(shore_strip.tobytes()).decode("ascii"),
        )
        boats = []
        for i, x in enumerate(
            [
                -697.0,
                -694.75,
                -692.50,
                -690.23,
                -687.96,
                -685.62,
                -683.20,
                -680.90,
                -678.50,
                -675.9,
                -672.8,
            ]
        ):
            zband = np.arange(304, 350, 0.1)
            profile = dtm(np.column_stack((zband, np.full(len(zband), x))))
            wet = np.flatnonzero(profile < 0.16)
            if not len(wet):
                raise ValueError("Documented cove off low-stage shoreline")
            shore = float(zband[wet[0]])
            direction = 0.12 + 0.13 * np.sin(i * 1.81)
            if i in [1, 5, 9]:
                direction = -0.19 + 0.06 * np.sin(i)
            boats.append(
                [
                    round(x, 2),
                    round(shore + 1.9 * np.cos(direction) + 0.65, 2),
                    round(direction, 3),
                ]
            )
    # Photograph only the contemporary settlement and the matching low-stage gravel.
    # The actual building and umbrella pixels are replaced by genuine surfaces beneath
    # these objects, avoiding a second flat silhouette cast in the aerial's noonday light.
    polygons = [poly for b in structures for poly in b["plan"]]
    groundMask = Image.new("L", im.size, 0)
    m = ImageDraw.Draw(groundMask)
    mappt = lambda x, z: ((x + 930) * 10, (z - 280) * 10)
    for poly in polygons:
        m.polygon([mappt(x, z) for x, z in poly], fill=255)
    for x, z, rad, col in par:
        u, v = mappt(x, z)
        m.ellipse(
            (
                u - (rad + 0.30) * 10,
                v - (rad + 0.30) * 10,
                u + (rad + 0.30) * 10,
                v + (rad + 0.30) * 10,
            ),
            fill=255,
        )
    # A true concrete standing terrace borders the hotels. Remove its sun umbrellas,
    # vehicles and roof pixels before projecting actual paved surfaces onto the ground.
    footprints = [
        [
            (-896, 400),
            (-891, 393),
            (-849, 385),
            (-841, 377),
            (-839, 381),
            (-848, 402),
            (-853, 411),
            (-874, 412),
            (-894, 411),
        ],
        [(-813, 367), (-799, 355), (-787, 355), (-779, 365), (-795, 383), (-805, 378)],
    ]
    for poly in [[(-853, 378), (-841, 381), (-844, 394), (-853, 392)]]:
        m.polygon([mappt(x, z) for x, z in poly], fill=255)
    mask = np.array(groundMask) > 0
    ix = distance_transform_edt(mask, return_distances=False, return_indices=True)
    base = np.array(im, dtype="f4")
    clean = gaussian_filter(base[tuple(ix)], (1.35, 1.35, 0))
    weight = gaussian_filter(mask.astype("f4"), 1.50)[:, :, None]
    clipped = Image.fromarray(np.uint8(np.clip(base + (clean - base) * weight, 0, 255)))
    apron = clipped.crop((100, 404, 1599, 1500)).resize(
        (1200, 877), Image.Resampling.LANCZOS
    )
    # Lacustrine floodplain from the low-stage historic Swiss imagery. Keep
    # the slate and shingle measurements; repair old boat pixels under new mesh.
    low = orth(
        cache,
        "low-overview.jpg",
        (2621080, 1149530, 2621410, 1149725),
        (1320, 780),
        "2004",
    )
    C = np.array(low, dtype="f4")
    lx = np.arange(1320) / 4 - 920
    lz = np.arange(780) / 4 + 275
    X, Z = np.meshgrid(lx, lz)
    boatZone = ((X + 686) / 20) ** 2 + ((Z - 334) / 17) ** 2 < 1.0
    # The modern surface is locally 10–20 m landward of this photographic edge;
    # the game's own water covers the temporary boat line at normal low stage.
    tone = np.median(C[(X > -718) & (X < -703) & (Z > 323) & (Z < 334)], axis=0)
    mix = gaussian_filter(boatZone.astype("f4"), 4)[:, :, None]
    C = C + (np.clip(0.69 * C + 0.31 * tone, 0, 255) - C) * mix
    flood = Image.fromarray(np.uint8(C)).resize((1200, 702), Image.Resampling.LANCZOS)
    site = Image.new("RGB", (1200, 1579))
    site.paste(apron, (0, 0))
    site.paste(flood, (0, 877))
    site.save(game / "oeschinen-rowing-shore.webp", quality=91, method=6)
    info = dict(
        buildings=structures,
        umbrellas=par,
        boats=boats,
        footprints=footprints,
        shore=edge_grid,
    )
    (game / "swiss-landing-data.js").write_text(
        "// © Federal Office of Topography swisstopo. Roof/wall coordinates in local centimetres. See game/credits.txt.\nwindow.oeschinenLandingSurvey="
        + json.dumps(info, separators=(",", ":"))
        + ";\n"
    )
    print(
        "Buildings",
        [(o["name"], len(o["roof"]), len(o["walls"])) for o in structures],
        "parasols",
        len(par),
        "boats",
        boats,
    )


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--cache", type=Path, required=True)
    p.add_argument("--game", type=Path, required=True)
    v = p.parse_args()
    v.game.mkdir(exist_ok=True, parents=True)
    v.cache.mkdir(exist_ok=True, parents=True)
    atlas(v.cache, v.game)
    registered(v.cache, v.game)
    collect(v.cache, v.game)
