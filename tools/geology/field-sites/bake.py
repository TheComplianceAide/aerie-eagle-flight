"""Rebuild the Otter Cliff material, Hamnøy terrain, and Oeschinensee gravel shore.

See README.md for source attribution, dependencies, and archived input hashes.
"""
import argparse
import hashlib
import struct
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

import numpy as np
import rasterio
from PIL import Image
from pydelatin import Delatin
from pyproj import Transformer
from scipy.ndimage import distance_transform_edt, gaussian_filter, map_coordinates

HERE = Path(__file__).resolve().parent
GAME = HERE.parents[2] / "game"
OTTER_PHOTO = "https://d9-wret.s3.us-west-2.amazonaws.com/assets/palladium/production/s3fs-public/DSC00509-1.jpg"
SWISS_DEM = ("https://data.geo.admin.ch/ch.swisstopo.swissalti3d/swissalti3d_2025_2621-1149/"
             "swissalti3d_2025_2621-1149_2_2056_5728.tif")
SWISS_PHOTO = "https://wms.geo.admin.ch/?" + urlencode(dict(
    SERVICE="WMS", REQUEST="GetMap", VERSION="1.1.1", LAYERS="ch.swisstopo.swissimage",
    STYLES="", SRS="EPSG:2056", BBOX="2621180,1149352,2621652,1149696", WIDTH=1416,
    HEIGHT=1032, FORMAT="image/jpeg"))
HAMNOY_DEM = "https://wcs.geonorge.no/skwms1/wcs.hoyde-dtm-nhm-25833?" + urlencode(dict(
    SERVICE="WCS", VERSION="1.0.0", REQUEST="GetCoverage", COVERAGE="nhm_dtm_topo_25833",
    CRS="EPSG:25833", BBOX="421341,7537626,422391,7538666", WIDTH=525, HEIGHT=520, FORMAT="GeoTIFF"))


def fetch(cache, name, url):
    path = cache / name
    if not path.exists():
        with urlopen(url, timeout=90) as response:
            contents = response.read()
        path.write_bytes(contents)
    print(f"Input {path.name}, SHA-256 {hashlib.sha256(path.read_bytes()).hexdigest()}")
    return path


def sample(image, row, column):
    return map_coordinates(image, [row, column], order=1, mode="nearest")


def otter(cache, output):
    image = Image.open(fetch(cache, "otter-granite.jpg", OTTER_PHOTO)).convert("RGB")
    # Rectify the exposed part of the jointed wall between the treeline and the pool.
    points = [(0.342, 0.551), (0.248, 0.836), (0.958, 0.852), (0.978, 0.547)]
    quad = tuple(v * n for p in points for v, n in zip(p, image.size))
    patch = image.transform((1060, 780), Image.Transform.QUAD, quad, Image.Resampling.BICUBIC)
    source = np.asarray(patch, dtype="f4") / 255
    luminance = source @ np.array([0.24, 0.59, 0.17])
    illumination = gaussian_filter(luminance, 67)
    rock = np.clip(source * (0.57 / np.maximum(0.18, illumination[:, :, None])) ** 0.83, 0, 1)

    def wrap(values, axis, count):
        values = np.moveaxis(values, axis, 0)
        blend = np.linspace(0, 1, count, dtype="f4")
        blend = (blend * blend * (3 - 2 * blend))[:, None, None]
        ends = values[-count:] * (1 - blend) + values[:count] * blend
        return np.moveaxis(np.concatenate([ends, values[count:-count]]), 0, axis)

    rock = wrap(wrap(rock, 1, 120), 0, 105)
    tile = Image.fromarray(np.uint8(rock * 255 + 0.5)).resize((768, 576), Image.Resampling.LANCZOS)
    tile.save(output / "acadia-otter-granite.webp", quality=90, method=6)


def survey(height, vegetation, bounds, chunk, error, low, scale, samples, sun, horizon_scale, target):
    """Store two-metre adaptive triangles and the four-metre flight/shading field."""
    left, top, right, bottom = bounds
    coarse = height[::2, ::2]
    rows, columns = np.indices(coarse.shape)
    nz, nx = coarse.shape

    def horizon(dx, dz):
        grade = np.zeros_like(coarse)
        for metres in samples:
            rz = np.clip(rows + round(dz * metres / 4), 0, nz - 1)
            rx = np.clip(columns + round(dx * metres / 4), 0, nx - 1)
            grade = np.maximum(grade, (coarse[rz, rx] - coarse) / metres)
        return np.arctan(grade)

    angles = np.linspace(0, 2 * np.pi, 8, endpoint=False)
    sky = 1 - np.mean([np.sin(horizon(np.cos(a), np.sin(a))) ** 2 for a in angles], axis=0)
    direct = horizon(*sun) / horizon_scale
    fields = np.stack([sky, direct, vegetation, np.ones_like(coarse)], axis=2)
    fields = np.clip(fields * 255, 0, 255).astype("u1")
    chunks = []
    for x in range(left, right, chunk):
        for z in range(top, bottom, chunk):
            x1, z1 = min(right, x + chunk), min(bottom, z + chunk)
            tile = height[(z-top)//2:(z1-top)//2+1, (x-left)//2:(x1-left)//2+1]
            if tile.max() < 0.18:
                continue
            mesh = Delatin(tile, max_error=error)
            col = mesh.vertices[:, 0].astype(int)
            row = tile.shape[0] - 1 - mesh.vertices[:, 1].astype(int)
            u, v = x - left + col * 2, z - top + row * 2
            vertices = np.stack([u, v, np.rint((tile[row, col] - low) / scale)], axis=1).astype("<u2")
            shading = np.stack([sample(fields[:, :, i], v/4, u/4) for i in range(4)], axis=1).astype("u1")
            triangles = np.array(mesh.triangles, dtype="<u2")
            a, b, c = vertices[triangles[0], :2].astype(float)
            ab, ac = b - a, c - a
            if ab[0]*ac[1] - ab[1]*ac[0] > 0:
                triangles = triangles[:, ::-1].copy()
            chunks.append((vertices, shading, triangles))
    grid = np.rint((coarse - low) / scale).astype("<i2")
    with target.open("wb") as file:
        file.write(struct.pack("<4sHH4iHHffI", b"ARF1", 1, 4, *bounds, nx, nz, low, scale, len(chunks)))
        file.write(grid.tobytes())
        for vertices, shading, triangles in chunks:
            file.write(struct.pack("<II", len(vertices), len(triangles)))
            file.write(vertices.tobytes())
            file.write(shading.tobytes())
            file.write(triangles.tobytes())
    print(f"{target.name}: {sum(len(part[2]) for part in chunks)} triangles")


def hamnoy(cache, game, output):
    left, top, right, bottom = bounds = (3500, 2480, 4320, 3360)
    z, x = np.mgrid[top:bottom+2:2, left:right+2:2]
    origin_x, origin_y = Transformer.from_crs(4326, 25833, always_xy=True).transform(13.038, 67.972)
    with rasterio.open(fetch(cache, "hamnoy-dtm.tif", HAMNOY_DEM)) as ds:
        row = (ds.transform.f - (origin_y - z)) / (-ds.transform.e) - 0.5
        col = ((origin_x + x) - ds.transform.c) / ds.transform.a - 0.5
        h = sample(ds.read(1), row, col)
    water = h <= 0.05
    h = np.where(water, -0.22 - np.minimum(distance_transform_edt(water)*0.19, 2.55), h)
    h = gaussian_filter(h, 0.33)
    photo = np.asarray(Image.open(game / "atlas-lofoten-photo.webp").convert("RGB"), dtype="f4")
    metres_per_pixel = 9200 / len(photo)
    rgb = np.stack([sample(photo[:, :, i], (z+4600)/metres_per_pixel-.5, (x+4600)/metres_per_pixel-.5)
                    for i in range(3)], axis=2)
    vegetation = np.clip((rgb[:,:,1]-.84*rgb[:,:,0]-.16*rgb[:,:,2]-1.7)/12, 0, 1)
    slope = np.hypot(*np.gradient(h, 2))
    vegetation *= np.clip((h-.8)/3.5, 0, 1) * np.clip((1-slope)/.52, 0, 1)
    # Lidar separates the turf-covered slopes and wet skerries within a 10 m Sentinel pixel.
    mineral = (1-vegetation) * (h>.10) * np.clip((16-h)/10+.75*slope, .05, .96)
    relief = h - gaussian_filter(h, 2.5)
    shade = (.83 + .21*np.clip(h/4,0,1) + np.clip(relief*.15,-.13,.17))[:, :, None]
    mineral = (.68 * mineral)[:, :, None]
    rgb = rgb*(1-mineral) + np.array([93,96,93],dtype="f4")*shade*mineral
    photo = Image.fromarray(np.clip(rgb,0,255).astype("u1"))
    photo.save(output / "landform-hamnoy-aerial.webp", quality=90, method=6)
    angle = np.deg2rad(-115)
    survey(h, vegetation[::2, ::2], bounds, 220, .32, -3, 1/40,
           [4,8,13,22,31,45,64,90,132,170,240,360], (np.cos(angle), np.sin(angle)),
           np.pi*.49, output / "landform-hamnoy.bin")


def oeschinen(cache, game, output):
    left, top, right, bottom = bounds = (-820, 304, -348, 648)
    z, x = np.mgrid[top:bottom+2:2, left:right+2:2]
    with rasterio.open(fetch(cache, "oeschinen-dtm.tif", SWISS_DEM)) as ds:
        row = (ds.transform.f - (1150000-z))/2-.5
        col = ((2622000+x) - ds.transform.c)/2-.5
        raw = sample(ds.read(1), row, col) - 1574.9
    wet = raw < .125
    h = np.where(wet,np.minimum(raw,-.12-np.minimum(distance_transform_edt(wet)*.24,3.9)),raw)
    h = gaussian_filter(h,.28)
    nz,nx = h[::2,::2].shape
    photo = Image.open(fetch(cache,"oeschinen-photo.jpg",SWISS_PHOTO)).convert("RGB")
    photo.save(output / "landform-swisswest-aerial.webp",quality=91,method=6)
    colors = np.asarray(photo.resize((nx,nz),Image.Resampling.LANCZOS),dtype="f4")
    vegetation = np.clip((colors[:,:,1]-colors[:,:,0]*.82-colors[:,:,2]*.18-3.5)/16,0,1)
    survey(h, vegetation, bounds, 160, .13, -5, 1/48, [4,8,14,23,36,58,95,150,220],
           (-.91,.414), 1.539, output / "landform-swisswest.bin")
    # Only the measured west fan changes. Keep all other lake material and cross-fade
    # into the archived optical margin so a second run produces the same bytes.
    optical = np.array(Image.open(game / "swiss-littoral.png").convert("RGB"))
    prior = np.asarray(Image.open(HERE / "source/oeschinen-optical-margin.png"),dtype="f4")/255
    field_z,field_x = np.mgrid[top:bottom,left:right]
    field_z,field_x = field_z+.5,field_x+.5
    local = sample(h,(field_z-top)/2,(field_x-left)/2)
    wet = local<.18
    shore = distance_transform_edt(wet)-distance_transform_edt(~wet)
    shore -= np.sign(shore)*.5
    depth = np.where(shore < -9, 0, np.maximum(0,.18-local))
    grade = np.clip(np.hypot(*np.gradient(gaussian_filter(local,3.5))), 0, 1)
    grade = np.where(np.abs(shore)>28,.3,grade)
    encoded = prior[:,:,0]*2-1
    old = np.sign(encoded)*encoded**2*56
    margin = np.minimum.reduce([field_x-left,right-field_x,field_z-top,bottom-field_z])
    blend = np.clip((margin-2)/24,0,1)
    blend = blend*blend*(3-2*blend)
    shore = old+(shore-old)*blend
    old_depth = 16*prior[:,:,1]**2
    old_depth += (depth-old_depth)*blend
    grade = prior[:,:,2]+(grade-prior[:,:,2])*blend
    colors = np.stack([.5+.5*np.sign(shore)*np.sqrt(np.clip(abs(shore)/56,0,1)),
                       np.sqrt(np.clip(old_depth/16,0,1)),grade],axis=2)
    optical[top+288:bottom+288, left+960:right+960] = np.rint(colors*255).astype("u1")
    Image.fromarray(optical).save(output / "swiss-littoral.png", optimize=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("site", choices=("otter","hamnoy","oeschinen","all"))
    parser.add_argument("--cache", type=Path, default=Path.home() / ".cache/aerie-field-sites")
    parser.add_argument("--game", type=Path, default=GAME, help="Existing source game assets")
    parser.add_argument("--output", type=Path, default=GAME)
    args = parser.parse_args()
    args.cache.mkdir(parents=True,exist_ok=True)
    args.output.mkdir(parents=True,exist_ok=True)
    if args.site in ("otter","all"):
        otter(args.cache,args.output)
    if args.site in ("hamnoy","all"):
        hamnoy(args.cache,args.game,args.output)
    if args.site in ("oeschinen","all"):
        oeschinen(args.cache,args.game,args.output)
