"""Municipal ground imagery, contiguous public pavements and managed park clearings."""

import base64
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as nd
from shapely import contains_xy
from shapely.geometry import shape, Polygon, LineString

HERE = Path(__file__).resolve().parent


def bake_streets(source, output, registry):
    covers = json.loads((HERE / "street-cover.json").read_text())
    refs = json.loads((HERE / "sources.json").read_text())
    for site, cover in covers.items():
        left, top, right, bottom = cover["bounds"]
        span = right - left
        key = cover["photo"] + ".jpg"
        meta = refs[key]
        zoom = meta["px"] / (2 * meta["half"])
        origin = [meta["cx"] - meta["half"], meta["cz"] - meta["half"]]
        bbox = tuple((k - origin[i % 2]) * zoom for i, k in enumerate(cover["bounds"]))
        with Image.open(source / key) as aerial:
            view = aerial.convert("RGB").transform(
                (1024, 1024), Image.Transform.EXTENT, bbox, Image.Resampling.BICUBIC
            )
        pavement = shape(cover["pavement"])
        park = shape(cover["parks"])
        dz, dx = np.indices((1024, 1024), dtype=np.float32)
        x = left + (dx + 0.5) * span / 1024
        z = top + (dz + 0.5) * span / 1024
        paved = contains_xy(pavement, x, z)
        lawns = contains_xy(park, x, z) & ~paved
        rgb = np.array(view).astype("f4")
        # The survey is leaf-off. Gently restore mown summer grass where the
        # town's park polygon and the recorded green/brown turf both agree.
        turf = (
            lawns
            & (rgb[:, :, 1] > rgb[:, :, 2] * 1.14)
            & (rgb[:, :, 0] < rgb[:, :, 1] * 1.25)
        )
        weight = nd.gaussian_filter(turf.astype("f4"), 2.2)
        rgb *= 1 + weight[:, :, None] * np.array([-0.035, 0.16, -0.02])
        # Remove the flat vehicle image where a reconstructed body occupies its
        # bay. Feather a local screened paint repair into the surrounding asphalt.
        masks = []
        for cx, cz, degrees, style, _ in registry[site]["cars"]:
            masks.append(
                (cx, cz, degrees, 3.02 if style in ("van", "pickup") else 2.84, 1.56)
            )
        # Remove transient construction machinery from the older spring survey
        # in the public summer parking area by the resurfaced Wolfeboro quay.
        if site == "wolfeboro":
            masks += [
                (7337.3, -247.0, -23, 4.9, 2.3),
                (7351.4, -251.9, 0, 3.2, 2.0),
                (7350.8, -259.0, 12, 3.4, 2.0),
                (7328.7, -244.3, -57, 3.2, 1.85),
            ]
        photographed = rgb.copy()

        def resurface(mask):
            if not mask.any():
                return
            # Use the actual pavement on the immediate outer shoulder to carry
            # its color through the occlusion. Select a clear donor patch for
            # fine-grained asphalt. Car shadows otherwise bleed into the bays.
            rows, cols = np.nonzero(mask)
            i0, i1 = max(0, cols.min() - 24), min(1024, cols.max() + 25)
            j0, j1 = max(0, rows.min() - 24), min(1024, rows.max() + 25)
            local = mask[j0:j1, i0:i1]
            dist = nd.distance_transform_edt(~local)
            image = photographed[j0:j1, i0:i1]
            gray = image.mean(axis=-1)
            shoulder = (
                (dist > 7)
                & (dist < 21)
                & (gray > 72)
                & (gray < 224)
                & (np.ptp(image, axis=-1) < 49)
            )
            if shoulder.sum() < 20:
                return
            tone = np.median(image[shoulder], axis=0)
            yy, xx = np.indices(local.shape)
            # East edge of each original photograph contains a clean piece of
            # local asphalt used for the grain of the replacement.
            donor = (7311.0, -260.1) if site == "wolfeboro" else (-15531.0, -8919.8)
            di, dj = (
                round((donor[0] - left) * 1024 / span),
                round((donor[1] - top) * 1024 / span),
            )
            sample = photographed[dj : dj + 17, di : di + 23].mean(axis=-1)
            grain = sample[(yy + j0) % 17, (xx + i0) % 23] - np.median(sample)
            grain = np.clip(grain, -12, 12)
            paint = tone + grain[:, :, None] * 0.57
            alpha = (1 - np.clip(dist / 3.3, 0, 1))[:, :, None]
            part = rgb[j0:j1, i0:i1]
            part[:] = part * (1 - alpha) + paint * alpha

        if site == "wolfeboro":
            # Spring civil works occupied the public parking apron that is
            # already open in the lake-level photograph. Keep the original
            # white angled-bay markings on the adjoining strip.
            apron = Polygon(
                [
                    (7311.2, -251.1),
                    (7336, -252.2),
                    (7354.4, -252.7),
                    (7354.8, -242.0),
                    (7343.1, -241.5),
                    (7310.4, -243.1),
                ]
            )
            resurface(contains_xy(apron, x, z))
        for cx, cz, degrees, length, width in masks:
            theta = np.deg2rad(degrees)
            a, b = x - cx + 0.34, z - cz + 0.38
            along = np.cos(theta) * a + np.sin(theta) * b
            side = -np.sin(theta) * a + np.cos(theta) * b
            resurface((abs(along) < length + 0.72) & (abs(side) < width + 0.58))
        im = Image.fromarray(np.uint8(np.clip(rgb, 0, 255)))
        im.save(output / (site + "-town-ground.webp"), quality=92, method=6)

        # A signed clearance grid catches a boulder's outer rim as well as its
        # center. Roof and measured-tree geometry use their own finer surveys.
        step = 2
        n = int(np.ceil(span / step))
        sy, sx = np.indices((n, n))
        open_ground = park.union(pavement)
        for wall in registry[site]["quays"]:
            open_ground = open_ground.union(LineString(wall).buffer(4.0))
        for ax, az, bx, bz, width, _ in registry[site]["docks"]:
            lane = LineString([(ax, az), (bx, bz)]).buffer(width / 2 + 4.2)
            open_ground = open_ground.union(lane)
        cleared = contains_xy(
            open_ground, left + step * (sx + 0.5), top + step * (sy + 0.5)
        )
        signed = step * (
            nd.distance_transform_edt(~cleared) - nd.distance_transform_edt(cleared)
        )
        grid = np.rint(np.clip(128 + signed * 2, 0, 255)).astype("u1")
        registry[site]["publicGround"] = {
            "bounds": cover["bounds"],
            "cols": n,
            "step": step,
            "clearance": base64.b64encode(grid.tobytes()).decode(),
        }
