"""Use first returns for crown envelopes and robustly fit roof shape to occupied footprints."""

import json, math, base64
from pathlib import Path
import numpy as np, rasterio
from affine import Affine
from rasterio.features import rasterize
from shapely.geometry import Polygon
from scipy import ndimage as nd
from skimage.segmentation import watershed
from PIL import Image, ImageDraw
from sources import sites
import argparse
from roof_planes import fit_roof


def encode(a):
    return base64.b64encode(a.tobytes()).decode()


def corrected(w, game):
    s = (game / ("atlas-" + w + "-survey.js")).read_text()
    obj = json.JSONDecoder().raw_decode(
        s.split('window.ATLAS_SURVEYS["' + w + '"]=', 1)[1]
    )[0]
    rings = [obj["shore"], *obj["shoreHoles"]]
    src = (
        (game / "lake-bay-data.js").read_text().split("window.aerieLakeBankRuns=", 1)[1]
    )
    for r in json.JSONDecoder().raw_decode(src)[0][w]:
        k = r["ring"]
        a = rings[k]
        i = a.index(r["start"])
        j = a.index(r["end"])
        mid = np.asarray(r["points"]).reshape(-1, 2) / 5
        mid = mid.tolist()
        if r["closed"]:
            rings[k] = [r["start"], *mid]
        elif i < j:
            rings[k] = a[: i + 1] + mid + a[j:]
        else:
            rings[k] = a[j : i + 1] + mid
    return Polygon(rings[0], rings[1:])


def make(name, lake, out, destination, report):
    world, cx, cz, h = sites[name]
    left = cx - h
    top = cz - h
    size = 2 * h
    with rasterio.open(out / (name + "-photo.tif")) as f:
        photo = f.read().astype("f4")
    with rasterio.open(out / (name + "-height.tif")) as f:
        dem = f.read(1)
    dem = nd.zoom(dem, size / dem.shape[0], order=1, prefilter=False)
    data = np.load(out / (name + "-ept.npz"))
    first = data["top"]
    valid = first != -32768
    sampled = data["floor"]
    groundOK = sampled != -32768
    iy, ix = nd.distance_transform_edt(
        ~groundOK, return_distances=False, return_indices=True
    )
    laserGround = nd.gaussian_filter(sampled[iy, ix].astype("f4") * 0.05, 0.9)
    # A modern 3DEP DTM and the older leaf-off flight have a small local datum
    # residual, so obtain above-ground measurements from the same return set.
    rawHeight = np.maximum(0.0, np.where(valid, first * 0.05 - laserGround, 0)).astype(
        "f4"
    )
    late = np.load(out / (name + "-last-ept.npz"))["roof"]
    rr = data["roof"]
    ndvi = (photo[3] - photo[0]) / (photo[3] + photo[0] + 0.001)
    # The newer leaf-off state image exposes otherwise tree-covered roofs.
    # Average registered subpixels into the same one-metre ground cells.
    roofPhoto = photo[:3].copy()
    if world == "winnipesaukee":
        for j in range(2):
            for i in range(2):
                tile = out / "photos" / (name + "-tile-" + str(i) + str(j) + ".jpg")
                with Image.open(tile) as source:
                    assert source.size == (h * 3, h * 3)
                    image = np.asarray(
                        source.resize((h, h), Image.Resampling.BOX)
                    ).transpose(2, 0, 1)
                roofPhoto[:, j * h : (j + 1) * h, i * h : (i + 1) * h] = image

    wet = (
        rasterize(
            [(lake, 1)],
            out_shape=(size, size),
            transform=Affine(1, 0, left, 0, 1, top),
            dtype="uint8",
        )
        > 0
    )
    bankDist = nd.distance_transform_edt(~wet)
    docs = json.loads((out / (name + "-footprints.json")).read_text())
    polys = docs["polygons"]
    blocked = np.zeros((size, size), dtype=bool)
    roofs = []
    modes = {}

    def measured_roof(poly):
        poly = poly.simplify(0.33, preserve_topology=True)
        if not poly.is_valid or not 15 < poly.area < 4200:
            return
        box = np.array(poly.minimum_rotated_rectangle.exterior.coords)[:-1]
        span = np.linalg.norm(np.roll(box, -1, axis=0) - box, axis=1)
        if max(span) > 125 or min(span) < 2.4:
            return
        axis = box[(np.argmax(span) + 1) % 4] - box[np.argmax(span)]
        axis = axis / np.linalg.norm(axis)
        center = box.mean(axis=0)
        side = min(span) * 0.5
        a, b, c, d = poly.bounds
        u = max(0, int(np.floor(a - left)))
        v = max(0, int(np.floor(b - top)))
        u2 = min(size, int(np.ceil(c - left)))
        v2 = min(size, int(np.ceil(d - top)))
        if u2 <= u or v2 <= v:
            return
        inside = (
            rasterize(
                [(poly, 1)],
                out_shape=(v2 - v, u2 - u),
                transform=Affine(1, 0, left + u, 0, 1, top + v),
                dtype="uint8",
            )
            > 0
        )
        if not np.any(inside):
            return
        ys, xs = np.where(inside)
        ys += v
        xs += u
        if np.mean(wet[ys, xs]) > 0.72:
            return
        colors = roofPhoto[:, ys, xs].T
        veg = ndvi[ys, xs]
        early = rr[ys, xs]
        lateHits = late[ys, xs]
        first = np.where(early != -32768, early * 0.05, np.nan)
        last = np.where(lateHits != -32768, lateHits * 0.05, np.nan)
        solution = fit_roof(
            xs + left + 0.5,
            ys + top + 0.5,
            first,
            last,
            laserGround[ys, xs],
            center,
            axis,
            side,
            max(span) * 0.5,
        )
        visible = (veg < 0.19) & (np.max(colors, axis=1) > 39)
        if solution is None:
            if visible.mean() < 0.36 or visible.sum() < 12:
                return
            # Here the footprint and photograph establish a building but insufficient
            # planar returns establish its eaves. Keep an explicitly estimated height.
            wall = 3.1 if poly.area < 135 else 4.8
            slope = min(3.4, side * 0.43)
            fit = "plan-only"
            selected = visible
        else:
            wall = solution["eave"]
            slope = solution["rise"]
            fit = "laser"
            if solution["swapped"]:
                axis = np.array([-axis[1], axis[0]])
                side = max(span) * 0.5
            selected = solution["matched"] & visible
            if selected.sum() < 5:
                selected = solution["matched"]
        mid = poly.buffer(-max(0.65, min(1.3, side * 0.26)))
        if not mid.is_empty:
            middle = rasterize(
                [(mid, 1)],
                out_shape=(v2 - v, u2 - u),
                transform=Affine(1, 0, left + u, 0, 1, top + v),
                dtype="uint8",
            )
            central = selected & (middle[ys - v, xs - u] > 0)
            if central.sum() >= 5:
                selected = central
        rgb = np.median(colors[selected], axis=0)
        # Average roof color after rejecting bright walls and tree-covered eaves.
        ring = np.round(np.asarray(poly.exterior.coords)[:-1], 1)
        if len(ring) < 3:
            return
        blocked[v:v2, u:u2] |= inside
        modes[fit] = modes.get(fit, 0) + 1
        roofs.append(
            dict(
                p=ring.tolist(),
                rgb=rgb.astype(int).tolist(),
                center=np.round(center, 1).tolist(),
                axis=np.round(axis, 4).tolist(),
                halfWidth=round(side, 2),
                eave=round(wall, 2),
                rise=round(slope, 2),
                fit=fit,
            )
        )

    for p in polys:
        measured_roof(Polygon(p))
    blocked = nd.binary_dilation(blocked, iterations=2)
    rawHeight[wet | blocked] = 0
    hit = nd.gaussian_filter((rawHeight > 3).astype("f4"), 1.8)
    crown = nd.gaussian_filter(nd.maximum_filter(rawHeight, 3), 1.05)
    cover = (hit > 0.17) & (crown > 4.5) & ~blocked & ~wet
    yy, xx = np.indices((size, size), dtype="i4")
    margin = np.minimum.reduce([xx, yy, size - xx - 1, size - yy - 1])
    edge = margin > 9
    # A 16 m mask is shared with the existing forest renderer, including
    # genuine open lawns and gaps. It selects the 240 m shoreline band.
    cell = 16
    hh = (size + cell - 1) // cell
    domain = np.zeros((hh, hh), dtype=np.uint8)
    for j in range(hh):
        for i in range(hh):
            row = min(size - 1, j * cell + cell // 2)
            col = min(size - 1, i * cell + cell // 2)
            domain[j, i] = bankDist[row, col] < 240 and margin[row, col] > 12
    evaluate = domain[yy // cell, xx // cell].astype(bool) & edge
    peaks = cover & evaluate & (crown >= nd.maximum_filter(crown, 9)) & (crown > 5.5)
    marks, num = nd.label(peaks)
    labels = watershed(-crown, marks, mask=cover & evaluate)
    sizes = np.bincount(labels.ravel(), minlength=num + 1)
    locations = nd.maximum_position(crown, marks, index=np.arange(1, num + 1))
    # A winding stem is not located by airborne lidar; the crown top is the
    # reproducible stand position and the watershed supplies its visible span.
    trees = []
    for mid, (y, x) in enumerate(locations, 1):
        high = float(crown[y, x])
        width = float(
            np.clip(2 * math.sqrt(sizes[mid] / math.pi), high * 0.22, high * 0.81)
        )
        if high > 50 or bankDist[y, x] < 1.4:
            continue
        c = photo[:3, y, x] / 255
        greenness = c[1] - 0.52 * c[0] - 0.48 * c[2]
        fir = (width / high < 0.42 and greenness < 0.125) or (
            width / high < 0.53 and c.mean() < 0.275 and greenness < 0.101
        )
        trees.append(
            (
                round(2 * (x + 0.5 - h)),
                round(2 * (y + 0.5 - h)),
                round(high * 8),
                round(width * 8),
                int(fir),
            )
        )
    records = np.array(trees, dtype="<i2").reshape(-1, 5)
    draw = Image.fromarray(np.moveaxis(photo[:3].astype("uint8"), 0, 2))
    dv = ImageDraw.Draw(draw)
    for b in roofs:
        dv.line(
            [(px - left, pz - top) for px, pz in b["p"]]
            + [(b["p"][0][0] - left, b["p"][0][1] - top)],
            fill="#ffcc4e",
            width=2,
        )
    for x, z, hg, span, tf in trees:
        X = x / 2 + h
        Y = z / 2 + h
        dv.point((X, Y), fill="aqua" if tf else "white")
    draw.thumbnail((900, 900))
    if report:
        draw.save(report / (name + "-registration.jpg"), quality=88)
    print(
        name,
        len(records),
        "crowns",
        modes,
        "roofs; median",
        np.round(np.median(records[:, 2:4] / 8, axis=0), 1),
        flush=True,
    )
    data = dict(
        center=[cx, cz],
        half=h,
        cols=hh,
        coverage=encode(np.packbits(domain.ravel(), bitorder="little")),
        trees=encode(records),
        buildings=roofs,
    )

    # Use the same 1 m returns for a bounded terrain-shadow lookup; actual
    # time of day, surface normals and weather remain the runtime shader's work.
    step = 2
    a = math.radians(-84 if world == "moosehead" else -112)
    alt = math.radians(15.5 if world == "moosehead" else 4.2)
    relief = dem[::step, ::step]
    canopy = crown[::step, ::step] * cover[::step, ::step]
    confidence = hit[::step, ::step]
    vv = np.ones_like(relief)
    rows, cols = np.indices(vv.shape)
    for travel in [*range(3, 57, 3), *range(60, 145, 7), *range(150, 361, 14)]:
        qx = np.clip(cols + round(math.cos(a) * travel / step), 0, vv.shape[1] - 1)
        qz = np.clip(rows + round(math.sin(a) * travel / step), 0, vv.shape[0] - 1)
        crownHit = canopy[qz, qx]
        occlude = (
            np.clip(
                (relief[qz, qx] + crownHit - relief - travel * math.tan(alt) - 1.4) / 5,
                0,
                1,
            )
            * (crownHit > 4)
            * np.clip(confidence[qz, qx] * 1.7, 0, 1)
        )
        vv = np.minimum(vv, 1.0 - 0.84 * occlude)
    trans = Image.fromarray(np.uint8(255 * nd.gaussian_filter(vv, 0.8))).resize(
        (size, size), Image.Resampling.BILINEAR
    )
    image = Image.fromarray(np.moveaxis(photo[:3].astype("uint8"), 0, 2))
    image.putalpha(trans)
    image.save(
        destination / ("landform-" + name + "-aerial.webp"), quality=88, method=5
    )
    return data


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", required=True, type=Path)
    parser.add_argument(
        "--game", type=Path, default=Path(__file__).resolve().parents[3] / "game"
    )
    parser.add_argument("--output", type=Path)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    destination = args.output or args.game
    destination.mkdir(parents=True, exist_ok=True)
    if args.report:
        args.report.mkdir(parents=True, exist_ok=True)
    for w in ["winnipesaukee", "moosehead"]:
        lake = corrected(w, args.game)
        docs = {}
        for name, (region, *_) in sites.items():
            if region == w:
                docs[name] = make(name, lake, args.cache, destination, args.report)
        filename = destination / ("lake-habitat-" + w + ".js")
        filename.write_text(
            "window.aerieLakeHabitatData=window.aerieLakeHabitatData||{};\nwindow.aerieLakeHabitatData["
            + json.dumps(w)
            + "]="
            + json.dumps(docs, separators=(",", ":"))
            + ";\n"
        )
