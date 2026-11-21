"""Build a local Rockwood boat landing survey from public elevation and summer aerial data."""

import argparse
import json
import struct
from pathlib import Path

import numpy as np
import rasterio
from affine import Affine
from PIL import Image
from pydelatin import Delatin
from rasterio.features import rasterize
from scipy import ndimage as nd
from shapely.geometry import LineString, Polygon
from shapely.ops import unary_union
from skimage.measure import approximate_polygon, find_contours
from skimage.segmentation import watershed

root = Path(__file__).resolve().parents[3]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--cache", type=Path, required=True)
parser.add_argument("--game", type=Path, default=root / "game")
args = parser.parse_args()
source = args.cache
project = args.game
evidence = args.cache
rect = (-388, 1540, -132, 1796)
x0, z0, x1, z1 = rect
width = x1 - x0
page = (project / "atlas-moosehead-survey.js").read_text()
raw = json.JSONDecoder().raw_decode(
    page.split('window.ATLAS_SURVEYS["moosehead"]=')[1]
)[0]
ring = raw["shore"]
start = ring.index([-284, 1585])
end = ring.index([-204, 1713])
image = rasterio.open(source / "naip2018.tif")
bands = image.read()
land = nd.gaussian_filter(bands[3].astype("f4"), 1) > 28
path = max(find_contours(land.astype("f4"), 0.5), key=len)
xy = np.c_[path[:, 1] * 0.5 - 424.25, path[:, 0] * 0.5 + 1511.75]


def waterline(a, b):
    first, last = [np.linalg.norm(xy - q, axis=1).argmin() for q in (a, b)]
    assert first < last
    return np.round(approximate_polygon(xy[first : last + 1], 1.05), 1).tolist()


# False land in the older July NIR band on both occupied floats and white boats
# must not create peninsulas. The 2022 spring 45 cm raster resolves the crib faces.
west = [-207.45, 1581.65]
east = [-179.3, 1593.3]
west_foot = [-245.55, 1669.2]
new = waterline([-279.8, 1587.2], [-265.6, 1677.0]) + [
    [-265.6, 1674.8],
    [-264.36, 1669.20],
    [-255.91, 1672.72],
    [-250.0, 1674.3],
    [-247.65, 1673.0],
    west_foot,
    west,
    east,
    [-201.75, 1648.0],
    [-204.2, 1647.2],
    [-223.4, 1694.1],
    [-228.0, 1705.4],
    [-224.5, 1709.3],
    [-219.3, 1711.5],
    [-213.1, 1717.0],
    [-208.9, 1717.5],
]
ring[start + 1 : end] = new
polygon = Polygon(ring, raw["shoreHoles"])


def wet_mask(left, top, step, n):
    return rasterize(
        [(polygon, 1)],
        out_shape=(n, n),
        transform=Affine(step, 0, left - step * 0.5, 0, step, top - step * 0.5),
        dtype="uint8",
    ).astype(bool)


dem_file = rasterio.open(source / "dem.tif")


def sample(ds, band, x, z):
    col, row = (~ds.transform) * (442772 + x, 5060090 - z)
    return nd.map_coordinates(band, [row - 0.5, col - 0.5], order=1, mode="nearest")


iz, ix = np.mgrid[: width + 1, : width + 1]
x = x0 + ix
z = z0 + iz
dtm = sample(dem_file, dem_file.read(1), x, z)
wet = wet_mask(x0, z0, 1, width + 1)
d = nd.distance_transform_edt(~wet) - nd.distance_transform_edt(wet)
lake = 312.23
waterY = lake + 0.16
terrain = np.where(
    wet,
    np.minimum(dtm, waterY - 0.25 - np.minimum(8, 0.18 * (-d))),
    np.maximum(dtm, waterY + 0.05 + np.minimum(0.54, 0.11 * d)),
)
# The air survey hydroflattens the basin. The chart supplies the water side;
# only its visual bed is continued below the lake, without inventing soundings.
arm = Polygon(
    [
        west_foot,
        west,
        east,
        [-201.75, 1648.0],
        [-204.2, 1647.2],
        [-223.4, 1694.1],
        [-228, 1705.4],
        [-248.0, 1696.0],
        [-249.5, 1680.3],
    ]
)
armMask = rasterize(
    [(arm, 1)],
    out_shape=terrain.shape,
    transform=Affine(1, 0, x0 - 0.5, 0, 1, z0 - 0.5),
    dtype="uint8",
).astype(bool)
# Bare-earth raster interpolation softens vertical faces. Retained fill reaches
# the surveyed deck level and is covered by the modeled timber crib at the face.
cribDistance = nd.distance_transform_edt(armMask)
terrain = np.where(
    armMask,
    np.maximum(terrain, 313.77 + 0.07 * np.minimum(1, cribDistance / 4)),
    terrain,
)
rampA = np.array([-263.9, 1680.0])
axis = np.array([0.384, -0.923])
axis /= np.linalg.norm(axis)
widthR = 9.144
lengthR = 17.374
hTop = 313.76


def ramp_coords(x, z):
    dx = x - rampA[0]
    dz = z - rampA[1]
    return dx * axis[0] + dz * axis[1], -dx * axis[1] + dz * axis[0]


u, v = ramp_coords(x, z)
ramp = (np.abs(v) <= widthR / 2 + 0.55) & (u >= -0.55) & (u <= lengthR + 0.55)
terrain[ramp] = hTop - u[ramp] * 0.14 - 0.038
# Register the classified-return canopy to the same local metre grid.
point = np.load(source / "rockwood-ept.npz")
top = point["top"]
ground = point["floor"]
floor = (
    ground[
        tuple(
            nd.distance_transform_edt(
                ground == -32768, return_distances=False, return_indices=True
            )
        )
    ]
    * 0.05
)
hag = np.where(
    top != -32768, np.maximum(0, top * 0.05 - nd.gaussian_filter(floor, 1)), 0
)
hag = hag[z0 - 1492 : z1 - 1492 + 1, x0 + 465 : x1 + 465 + 1]
nir = sample(image, bands[3].astype("f4"), x, z)
red = sample(image, bands[0].astype("f4"), x, z)
ndvi = (nir - red) / (nir + red + 0.001)
hasTree = (ndvi > 0.15) & (~wet)
crown = nd.gaussian_filter(np.where(hasTree, nd.maximum_filter(hag, 3), 0), 0.85)
cover = (crown > 3) & (nd.maximum_filter(hasTree, 3))
# Parking and public pier reserve: remove parked/reflecting bright objects as trees.
parking = np.array(
    [
        [-322, 1610],
        [-314, 1602],
        [-287, 1602],
        [-276, 1619],
        [-277, 1680],
        [-266, 1682],
        [-259, 1719],
        [-260, 1735],
        [-272, 1744],
        [-321, 1747],
    ]
)
public = (
    Polygon(parking)
    .union(arm)
    .union(
        Polygon([[-264, 1666], [-240, 1650], [-239, 1680], [-255, 1698], [-270, 1698]])
    )
    .buffer(11)
)
publicMask = rasterize(
    [(public, 1)],
    out_shape=terrain.shape,
    transform=Affine(1, 0, x0 - 0.5, 0, 1, z0 - 0.5),
    dtype="u1",
).astype(bool)
peaks = cover & publicMask & (crown == nd.maximum_filter(crown, 7)) & (crown > 4.9)
marks, ct = nd.label(peaks)
labs = watershed(-crown, marks, mask=cover & publicMask)
trees = []
for lab, p in enumerate(
    nd.maximum_position(crown, marks, index=np.arange(1, ct + 1)), 1
):
    j, i = p
    area = (labs == lab).sum()
    height = crown[j, i]
    if area < 7:
        continue
    size = float(np.clip(2 * np.sqrt(area / np.pi), 2.5, 12.5))
    # Broad/conifer assignment is inferred from crown color and compactness.
    rgb = [
        float(
            sample(
                image, k.astype("f4"), x[j : j + 1, i : i + 1], z[j : j + 1, i : i + 1]
            )[0, 0]
        )
        for k in bands[:3]
    ]
    pine = int(
        (height > 10 and size / height < 0.57 and rgb[0] < 98)
        or (rgb[0] < 75 and rgb[1] < 95)
    )
    trees.append(
        [int(i + x0), int(j + z0), round(float(height), 1), round(size, 1), pine]
    )
# Use only federal USDA RGB for terrain color. Replace the photographed boats,
# cars and dark cast shadows on artificial surfaces with locally sampled pavement.
pixels = 512
pr = np.arange(pixels) + 0.5
px, pz = np.meshgrid(x0 + pr * width / pixels, z0 + pr * width / pixels)
rgb = np.stack([sample(image, band.astype("f4"), px, pz) for band in bands[:3]], axis=2)
# Public ground traced from the 2022 state ortho and colored from USDA summer
# samples. Dark cars, docked boats and canopy shadows cannot become permanent
# surface pigment under their independent live geometry and lighting.
lane = lambda pts, w: LineString(pts).buffer(
    w / 2, cap_style="round", join_style="round"
)
westLot = Polygon(
    [
        [-321.3, 1618],
        [-314.8, 1609],
        [-311.4, 1608],
        [-305.9, 1615],
        [-303.7, 1625],
        [-305.7, 1664],
        [-306.2, 1690],
        [-307.0, 1717],
        [-309.5, 1724],
        [-318.1, 1730],
        [-322.8, 1725],
    ]
)
access = lane([[-350, 1741], [-323, 1738], [-317, 1736], [-317.2, 1719]], 6.8)
drive = lane(
    [
        [-318, 1725],
        [-318.3, 1694],
        [-318.1, 1650],
        [-318.6, 1621],
        [-316, 1612],
        [-310, 1605.7],
        [-304, 1603.6],
        [-299, 1604.7],
        [-295.3, 1609],
        [-293.5, 1617],
        [-294.0, 1649],
        [-295.3, 1695],
        [-296.2, 1725],
        [-294.0, 1732.8],
        [-286.4, 1736.5],
        [-278, 1736.6],
        [-272.5, 1735.2],
        [-267.0, 1730.1],
        [-265.4, 1722.7],
        [-265.2, 1703.7],
        [-263.8, 1690],
        [-261.4, 1681.2],
    ],
    5.7,
)
visitorRow = Polygon(
    [[-292.5, 1625], [-284.5, 1625], [-283.7, 1677], [-287.4, 1687], [-293.0, 1690]]
)
armRoad = lane(
    [
        [-261.7, 1731.8],
        [-248.2, 1718.6],
        [-240.5, 1706.4],
        [-230.9, 1695.7],
        [-224.7, 1686.1],
        [-186.5, 1596.1],
    ],
    3.5,
)
armTurn = Polygon(
    [
        [-250.0, 1678.1],
        [-247, 1677.6],
        [-243.8, 1670.9],
        [-234.0, 1674.7],
        [-238.8, 1688.3],
        [-246.6, 1691.1],
        [-253.4, 1689.6],
        [-262.5, 1695.2],
        [-261.8, 1685.3],
    ]
)
crest = Polygon(
    [
        [-207.1, 1582.2],
        [-179.8, 1593.3],
        [-184.1, 1604.8],
        [-197.9, 1604.0],
        [-207.9, 1599.1],
        [-212.4, 1595.6],
    ]
)
westWalk = lane([[-245.4, 1668.5], [-207.2, 1582.3]], 0.9)
surfaces = [
    unary_union([westLot, drive, access, armRoad, armTurn]).buffer(0.07),
    unary_union([visitorRow, crest, westWalk]),
]
palette = np.empty((pixels, pixels, 4), dtype="u1")
palette[:, :, :3] = np.uint8(rgb)
palette[:, :, 3] = 255
placement = Affine(width / pixels, 0, x0, 0, width / pixels, z0)
rng = np.random.default_rng(212)
# A central grass strip runs the length of the pier between its gravel ends and
# vehicle lane. Detrend the crown and car shadows recorded by the aerial camera;
# live tree geometry casts its own in the game's late-day sunlight.
lawn = Polygon(
    [
        [-246.6, 1672.8],
        [-207.7, 1583.1],
        [-201.2, 1587.5],
        [-192.4, 1599.0],
        [-227.4, 1684.9],
        [-236.4, 1678.5],
        [-241.6, 1670.5],
    ]
)
medianLawn = Polygon(
    [
        [-306.9, 1621.1],
        [-311.3, 1608.4],
        [-305, 1607.1],
        [-299.3, 1610.7],
        [-296.5, 1617.5],
        [-299.0, 1724],
        [-305.2, 1730],
        [-310.4, 1728.8],
        [-306.6, 1719.3],
    ]
)
grass = rasterize(
    [(lawn, 1), (medianLawn, 1)],
    out_shape=(pixels, pixels),
    transform=placement,
    dtype="u1",
)
gCover = nd.gaussian_filter(grass.astype("f4"), 1.6)
fieldNoise = (
    nd.gaussian_filter(rng.normal(0, 1, (pixels, pixels)), 4) * 42
    + nd.gaussian_filter(rng.normal(0, 1, (pixels, pixels)), 0.55) * 3
)
luminance = np.mean(rgb, axis=2)
fieldNoise += np.clip(luminance - nd.gaussian_filter(luminance, 8), -20, 20) * 0.28
grassColor = np.array([108, 119, 79]) + fieldNoise[:, :, None]
palette[:, :, :3] = np.uint8(
    np.clip(
        palette[:, :, :3] * (1 - gCover[:, :, None]) + grassColor * gCover[:, :, None],
        0,
        255,
    )
)
palette[:, :, 3] = np.uint8(np.minimum(palette[:, :, 3], 255 * (1 - gCover)))
for geom, tint in zip(surfaces, [[112, 113, 108], [151, 148, 134]]):
    covered = rasterize(
        [(geom, 1)], out_shape=(pixels, pixels), transform=placement, dtype="u1"
    )
    coverage = nd.gaussian_filter(covered.astype("f4"), 0.57)
    noise = nd.gaussian_filter(
        rng.normal(0, 1, (pixels, pixels)), 1.8
    ) * 8 + rng.normal(0, 1.6, (pixels, pixels))
    finish = np.array(tint) + noise[:, :, None]
    palette[:, :, :3] = np.uint8(
        np.clip(
            palette[:, :, :3] * (1 - coverage[:, :, None])
            + finish * coverage[:, :, None],
            0,
            255,
        )
    )
    palette[:, :, 3] = np.uint8(np.minimum(palette[:, :, 3], 255 * (1 - coverage)))
# Strip the vessel and its shadow from the underlying floating contact area.
# The water itself does not acquire any land or static pixels here.
photo = Image.fromarray(palette)
groundPolys = []
for g in surfaces:
    for shape in g.geoms if g.geom_type == "MultiPolygon" else [g]:
        groundPolys.append(
            np.round(np.asarray(shape.simplify(0.45).exterior.coords)[:-1], 2).tolist()
        )

# 1m field and 1m error-limited triangles, identical domain for flight contact and render.
quant = np.round((terrain - 296) / 0.01).astype("<i2")


def horizon(dx, dz):
    grade = np.zeros_like(terrain)
    for m in [3, 6, 12, 24, 48, 90]:
        grade = np.maximum(
            grade,
            (
                terrain[
                    np.clip(iz + round(dz * m), 0, width),
                    np.clip(ix + round(dx * m), 0, width),
                ]
                - terrain
            )
            / m,
        )
    return np.arctan(grade)


sky = 1 - np.mean(
    [np.sin(horizon(np.cos(a), np.sin(a))) ** 2 for a in np.arange(8) * np.pi / 4],
    axis=0,
)
direct = horizon(np.cos(np.deg2rad(-84)), np.sin(np.deg2rad(-84))) / 1.539
field = np.uint8(
    np.clip(
        np.stack(
            [sky, direct, np.clip((ndvi + 0.04) * 1.7, 0, 1), np.ones_like(sky)], 2
        )
        * 255,
        0,
        255,
    )
)
sections = []
for j in range(0, width, 64):
    for i in range(0, width, 64):
        tile = terrain[j : j + 65, i : i + 65].astype("f4")
        mesh = Delatin(tile, max_error=0.075)
        ii = mesh.vertices[:, 0].astype(int) + i
        jj = 64 - mesh.vertices[:, 1].astype(int) + j
        xyz = np.c_[ii, jj, quant[jj, ii]].astype("<u2")
        tri = np.asarray(mesh.triangles).astype("<u2")
        a, b, c = xyz[tri[0], :2].astype(float)
        if np.linalg.det(np.stack([b - a, c - a])) > 0:
            tri = tri[:, ::-1].copy()
        sections.append((xyz, field[jj, ii], tri))
out = project / "landform-rockwood.bin"
with out.open("wb") as f:
    f.write(
        struct.pack(
            "<4sHH4iHHffI",
            b"ARF1",
            1,
            1,
            *rect,
            width + 1,
            width + 1,
            296,
            0.01,
            len(sections),
        )
    )
    f.write(quant.tobytes())
    for xyz, sh, tri in sections:
        f.write(struct.pack("<II", len(xyz), len(tri)))
        f.write(xyz.tobytes())
        f.write(sh.tobytes())
        f.write(tri.tobytes())
photo.save(project / "landform-rockwood-aerial.webp", quality=90, method=5)
data = {
    "pavement": groundPolys,
    "start": [-284, 1585],
    "end": [-204, 1713],
    "shore": new,
    "public": np.round(np.array(public.simplify(0.6).exterior.coords)[:-1], 1).tolist(),
    "trees": trees,
    "pier": [west_foot, west, east, [-201.75, 1648.0]],
    "ramp": {
        "top": rampA.tolist(),
        "y": hTop,
        "axis": np.round(axis, 5).tolist(),
        "width": widthR,
        "length": lengthR,
        "grade": 0.14,
    },
}
(evidence / "survey.json").write_text(json.dumps(data, indent=2))
(project / "moosehead-rockwood-data.js").write_text(
    "// Rockwood, surveyed east/south metres. Altitudes are NAVD88 metres.\nwindow.rockwoodLandingData="
    + json.dumps(data, separators=(",", ":"))
    + ";\n"
)
(evidence / "survey-stats.json").write_text(
    json.dumps(
        {
            "bounds": rect,
            "cells": terrain.size,
            "vertices": sum(len(k[0]) for k in sections),
            "triangles": sum(len(k[2]) for k in sections),
            "waterCells": int(wet.sum()),
            "observedCrowns": len(trees),
            "USGSWaterDatum": lake,
            "NAIP2018Features": len(new),
            "dockDeckHeightM": 313.84,
            "ramp": data["ramp"],
            "bytes": out.stat().st_size,
        },
        indent=2,
    )
)
print(evidence / "survey-stats.json", len(trees), out.stat().st_size)
