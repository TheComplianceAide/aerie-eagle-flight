"""Pack surveyed ablation colour and genuine ice surface texture into the local slope map."""

from argparse import ArgumentParser
from pathlib import Path
import json
import numpy as np
from scipy.ndimage import gaussian_filter, map_coordinates
from PIL import Image
import rasterio, requests
from rasterio.transform import from_origin
from rasterio.warp import reproject, Resampling

parser = ArgumentParser()
parser.add_argument("cache", type=Path)
parser.add_argument("game", type=Path)
a = parser.parse_args()
q = a.cache
stac = "https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/S2A_8VNK_20240808_0_L2A"
rec = requests.get(stac, timeout=25)
rec.raise_for_status()
catalog = rec.json()
bounds = (-1200, -4800, 2800, -400)
origin = (526511, 6477009)
size = 1120
raw = {}
inputlog = []
step = 10
shape = (440, 400)
aff = from_origin(origin[0] + bounds[0], origin[1] - bounds[1], step, step)
for channel in ["blue", "green", "red", "nir"]:
    item = catalog["assets"][channel]
    info = item["raster:bands"][0]
    url = item["href"]
    dst = np.zeros(shape, "f")
    cached = q / (channel + "-surface-radiance.npy")
    if cached.exists():
        dst = np.load(cached)
    else:
        with rasterio.Env(
            GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_MAX_RETRY="3"
        ):
            with rasterio.open("/vsicurl/" + url) as ds:
                reproject(
                    rasterio.band(ds, 1),
                    dst,
                    src_transform=ds.transform,
                    src_crs=ds.crs,
                    dst_crs="EPSG:32608",
                    dst_transform=aff,
                    resampling=Resampling.bilinear,
                    src_nodata=0,
                    dst_nodata=0,
                )
        np.save(cached, dst)
    raw[channel] = np.maximum(0.002, dst * info["scale"] + info.get("offset", 0))
    inputlog.append(
        {
            "band": channel,
            "source": url,
            "scale": info["scale"],
            "offset": info.get("offset", 0),
        }
    )
y = 0.22 * raw["red"] + 0.58 * raw["green"] + 0.20 * raw["blue"]
blue = np.maximum(0.013, raw["blue"])
ratio = raw["red"] / blue
nirRatio = raw["nir"] / blue
# Different observation dates make a per-pixel inversion of shadows unstable.
# Correct only broad exposure using the July–October lidar's smoothed slope and
# the actual satellite acquisition solar angle, then measure the mineral tint.
height = np.load(q / "tongue-survey.npz")["elev"]
valid = np.isfinite(height)
from scipy.ndimage import distance_transform_edt

field = height[
    tuple(distance_transform_edt(~valid, return_distances=False, return_indices=True))
]
jj, ii = np.indices(shape, dtype="f")
X = -1200 + (ii + 0.5) * 10
Z = -4800 + (jj + 0.5) * 10
surface = map_coordinates(
    field, ((Z + 5000) / 5, (X + 1200) / 5), order=1, mode="nearest"
)
dz, dx = np.gradient(gaussian_filter(surface, 2.2), 10)
az = np.deg2rad(catalog["properties"]["view:sun_azimuth"])
el = np.deg2rad(catalog["properties"]["view:sun_elevation"])
slope = (
    -dx * np.sin(az) * np.cos(el) + np.sin(el) + dz * np.cos(az) * np.cos(el)
) / np.sqrt(1 + dx * dx + dz * dz)
y *= np.clip(
    (0.62 + 0.38 * np.sin(el)) / (0.62 + 0.38 * np.maximum(0.04, slope)), 0.85, 1.18
)


def ramp(lo, hi, v):
    t = np.clip((v - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)


level = np.clip((y / 0.49) ** 0.58, 0.19, 1)
debris = np.clip(
    0.66 * ramp(0.72, 1.02, ratio) + 0.34 * ramp(0.44, 0.78, nirRatio), 0, 1
)
data = np.empty((size, size, 4), np.uint8)
for k, m in enumerate([level, debris]):
    data[:, :, k] = np.asarray(
        Image.fromarray(np.rint(m * 255).astype("u1")).resize(
            (size, size), Image.Resampling.BILINEAR
        )
    )
rgb = np.asarray(Image.open(q / "suicide-114-180.png").convert("RGB"), dtype="f") / 255
lum = rgb @ np.array([0.23, 0.57, 0.20], dtype="f")
smooth = gaussian_filter(lum, 20)
# Only material finer than ~1 m is reused. Registered lidar shapes all large
# crevasses and the same-site satellite band assigns the broad dark moraine.
fine = np.clip(0.52 + 2.5 * (lum - smooth), 0, 1)
oxide = np.clip(
    0.48
    + 5.3
    * (
        (rgb[:, :, 0] - rgb[:, :, 2]) - gaussian_filter(rgb[:, :, 0] - rgb[:, :, 2], 33)
    ),
    0,
    1,
)
# Mirror both dimensions at the specimen bounds for a continuous 102.4 m repeat.
for k, m in enumerate((fine, oxide), 2):
    data[:, :, k] = np.asarray(
        Image.fromarray(np.rint((0.07 + 0.87 * m) * 255).astype("u1")).resize(
            (size, size), Image.Resampling.LANCZOS
        )
    )
p = a.game / "alaska-surveyed-crevasses.webp"
slopes = Image.open(p)
atlas = Image.new("RGBA", (3360, 1120))
atlas.paste(slopes.crop((0, 0, 2240, 1120)), (0, 0))
atlas.paste(Image.fromarray(data), (2240, 0))
atlas.save(p, quality=94, method=6, exact=True)
(q / "ice-optics.json").write_text(
    json.dumps(
        dict(
            stac=stac,
            utc=catalog["properties"]["datetime"],
            solarAzimuthDeg=catalog["properties"]["view:sun_azimuth"],
            solarElevationDeg=catalog["properties"]["view:sun_elevation"],
            bands=inputlog,
            specimenUpperLeftUTM8N=[528619.2, 6480179.6],
            nativeSizeM=51.2,
            specimenDate="2018-07-17",
            acquisitionSource="https://doi.org/10.18739/A2GT5FG0B",
        ),
        indent=2,
    )
    + "\n"
)
print("bytes", p.stat().st_size)
