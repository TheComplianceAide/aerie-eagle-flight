"""Build the west-buttress and additional registered oblique wall samples.

The right side of the texture stores NPS/C. Jacoby's dry-rock reflectance and
the measured line-of-sight distance in alpha. The existing west-buttress field
image occupies the left panel at essentially its original resolution. There is
one terrain sampler on the GPU for both panels.
"""

import argparse, ctypes, json, subprocess, tempfile
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter
from register import matrix, read_grid


def smooth(a, b, x):
    k = np.clip((x - a) / (b - a), 0, 1)
    return k * k * (3 - 2 * k)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("cache", type=Path)
    p.add_argument("game", type=Path)
    args = p.parse_args()
    cache, game = args.cache, args.game
    q = np.array(json.loads((cache / "tunnel-camera.json").read_text()), "d")
    grid = np.ascontiguousarray(read_grid(cache), "f")
    photo = Image.open(cache / "tunnel-field.jpg").convert("RGB")
    W, H = 1536, 864
    photo = photo.resize((W, H), Image.Resampling.LANCZOS)
    img = np.asarray(photo, dtype="f") / 255
    depth = np.full((H, W), 1.0e6, "f")
    world = np.zeros((H, W, 3), "f")
    with tempfile.TemporaryDirectory() as tmp:
        lib = Path(tmp) / "depth.so"
        subprocess.run(
            [
                "c++",
                "-std=c++17",
                "-O3",
                "-shared",
                "-fPIC",
                str(Path(__file__).with_name("terrain_depth.cpp")),
                "-o",
                str(lib),
            ],
            check=True,
        )
        raster = ctypes.CDLL(str(lib)).raster
        f32 = np.ctypeslib.ndpointer(dtype="f", flags="C_CONTIGUOUS")
        f64 = np.ctypeslib.ndpointer(dtype="d", flags="C_CONTIGUOUS")
        raster.argtypes = [
            f32,
            ctypes.c_int,
            ctypes.c_int,
            ctypes.c_float,
            ctypes.c_float,
            ctypes.c_float,
            f64,
            ctypes.c_int,
            ctypes.c_int,
            f32,
            f32,
        ]
        raster(
            grid, grid.shape[1], grid.shape[0], -5000, -6400, 8, q, W, H, depth, world
        )
    # Hand-supervised rock envelopes exclude the open sky, the floor's trees,
    # the waterfall, low cloud and the rim's treetops. Depth also prevents a
    # feature on a far wall from being painted onto a nearer spur.
    polygons = [
        [
            (36, 201),
            (113, 188),
            (153, 194),
            (177, 206),
            (211, 217),
            (218, 251),
            (240, 285),
            (253, 322),
            (262, 351),
            (289, 367),
            (279, 376),
            (241, 369),
            (205, 348),
            (161, 322),
            (114, 282),
            (76, 260),
            (54, 238),
        ],
        [
            (267, 310),
            (299, 302),
            (324, 309),
            (339, 294),
            (359, 299),
            (381, 281),
            (429, 269),
            (452, 265),
            (471, 269),
            (478, 277),
            (443, 287),
            (417, 315),
            (403, 345),
            (389, 369),
            (326, 375),
            (306, 365),
        ],
        [
            (416, 344),
            (433, 310),
            (434, 284),
            (447, 275),
            (465, 279),
            (478, 288),
            (487, 300),
            (499, 305),
            (509, 321),
            (508, 359),
            (494, 371),
            (471, 371),
            (455, 354),
            (433, 379),
            (421, 380),
        ],
        [
            (478, 273),
            (489, 244),
            (498, 226),
            (513, 224),
            (536, 234),
            (544, 222),
            (558, 225),
            (583, 231),
            (588, 244),
            (577, 262),
            (558, 270),
            (542, 279),
            (519, 296),
            (496, 287),
        ],
        [
            (530, 323),
            (542, 292),
            (563, 276),
            (581, 265),
            (591, 249),
            (605, 233),
            (620, 230),
            (628, 237),
            (652, 225),
            (679, 221),
            (698, 209),
            (702, 222),
            (693, 254),
            (695, 280),
            (680, 296),
            (664, 297),
            (650, 306),
            (638, 320),
            (620, 331),
            (600, 336),
            (576, 348),
            (550, 350),
        ],
        [
            (708, 233),
            (718, 212),
            (738, 208),
            (749, 190),
            (766, 170),
            (779, 165),
            (795, 157),
            (811, 157),
            (821, 142),
            (838, 135),
            (847, 111),
            (862, 92),
            (877, 78),
            (897, 71),
            (899, 157),
            (874, 174),
            (872, 212),
            (847, 238),
            (830, 262),
            (806, 269),
            (778, 288),
            (751, 298),
            (722, 294),
            (700, 303),
        ],
    ]
    mask = Image.new("L", (W, H))
    draw = ImageDraw.Draw(mask)
    for poly in polygons:
        draw.polygon(
            [(int(x * W / 900), int(y * H / 506.25)) for x, y in poly], fill=255
        )
    rock = np.array(mask) > 0
    rock &= (depth > 1800) & (depth < 19000)
    y = img @ np.array([0.245, 0.625, 0.130])
    # Exclude leaf crowns, deep crevices without signal, bright snow and the
    # white falling water. Preserve fine granite joint detail in shaded rock.
    r, g, b = img.transpose(2, 0, 1)
    rock &= (g - r < 0.055) & (y > 0.058) & (y < 0.935)
    normal = np.cross(np.gradient(world, axis=1), np.gradient(world, axis=0))
    normal /= np.maximum(0.01, np.linalg.norm(normal, axis=2, keepdims=True))
    rock &= np.abs(normal[:, :, 1]) < 0.93
    # Remove the field day's illumination gradient, preserving long dark
    # fractures along with finer fluting, and re-light it in the live scene.
    quality = rock.astype("f")
    density = gaussian_filter(quality, 30)
    medium = gaussian_filter(y * quality, 30) / np.maximum(0.02, density)
    detail = (y - medium) / (0.20 + medium * 0.55)
    light = np.clip(0.54 + 0.21 * (y - 0.40) + 0.36 * detail, 0.21, 0.85)
    color = (
        light[..., None] * np.array([1.007, 0.997, 0.986])
        + np.clip((img - y[..., None]), -0.075, 0.075) * 0.43
    )
    xx, yy = np.meshgrid(np.arange(W), np.arange(H))
    alpha = (
        np.clip(
            (np.log(np.maximum(depth, 1) / 1500) / np.log(20000 / 1500)) * 0.86 + 0.10,
            0.10,
            0.96,
        )
        * rock
    )
    wall = Image.fromarray(
        np.uint8(np.dstack([np.clip(color, 0, 1), alpha]) * 255 + 0.5), "RGBA"
    )
    legacy = (
        Image.open(game / "atlas-yosemite-west-face.webp")
        .convert("RGBA")
        .resize((2560, 1920), Image.Resampling.LANCZOS)
    )
    atlas = Image.new("RGBA", (4096, 1920))
    atlas.paste(legacy, (0, 0))
    atlas.paste(wall, (2560, 0))
    dome = Image.open(cache / "half-dome-field.png").convert("RGBA")
    assert dome.size == (716, 612) and dome.getchannel("A").getbbox()
    atlas.paste(dome, (2560, 896))
    mineral = Image.open(cache / "el-capitan-mineral.png").convert("RGBA")
    assert mineral.size == (344, 376)
    atlas.paste(mineral, (3312, 896))
    name = "atlas-yosemite-tunnel-walls.webp"
    atlas.save(game / name, quality=93, alpha_quality=100, method=6)
    atlas.resize((2560, 1200), Image.Resampling.LANCZOS).save(
        game / "mobile" / name, quality=89, alpha_quality=100, method=6
    )
    overlay = img.copy()
    overlay[rock] = 0.55 * img[rock] + 0.45 * np.array([0.31, 0.89, 0.61])
    Image.fromarray(np.uint8(np.clip(overlay, 0, 1) * 255)).resize((900, 506)).save(
        cache / "tunnel-rock-coverage.jpg", quality=90
    )
    report = dict(
        camera=q.tolist(),
        basis=matrix(q).tolist(),
        visibleRockPixels=int(rock.sum()),
        fittedStations=7,
        distanceRangeM=np.percentile(depth[rock], [0, 1, 50, 99, 100]).tolist(),
        maskPhotoWidth=W,
    )
    (cache / "tunnel-wall-receipt.json").write_text(json.dumps(report, indent=2) + "\n")
    print(report)


if __name__ == "__main__":
    main()
