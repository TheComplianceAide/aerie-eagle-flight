"""USGS and Maine GeoLibrary raster exports in UTM zone 19N."""

import json, time
import requests
from pyproj import Transformer

nad = Transformer.from_crs(4326, 32619, always_xy=True)
origins = {
    k: tuple(round(a) for a in nad.transform(*pos))
    for k, pos in [
        ("moosehead", (-69.735, 45.692)),
        ("winnipesaukee", (-71.3032, 43.58)),
    ]
}
sites = {
    "lily": ("moosehead", 15200, 9680, 800),
    "spencer": ("moosehead", 11440, 215, 800),
    "meredith": ("winnipesaukee", -13125, -6430, 1000),
    "wolfeboro": ("winnipesaukee", 7310, 500, 1100),
    "diamond": ("winnipesaukee", -1410, 845, 650),
    "sleepers": ("winnipesaukee", 870, 3070, 650),
    "hesky": ("winnipesaukee", -15500, -8950, 480),
}
photo = (
    "https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer"
)
maine = "https://gis.maine.gov/image/rest/services/NAIP/orthoNaip2018/ImageServer"
dem = "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer"


def fetch(out, job):
    name, kind = job
    world, x, z, half = sites[name]
    origin = origins[world]
    spacing = 2 if kind == "height" else 1
    count = 1 + 2 * half // spacing if kind == "height" else 2 * half // spacing
    e, n = origin[0] + x, origin[1] - z
    h = half + (spacing / 2 if kind == "height" else 0)
    bbox = ",".join(map(str, [e - h, n - h, e + h, n + h]))
    if kind == "height":
        service = dem
        opts = dict(pixelType="F32", renderingRule='{"rasterFunction":"None"}')
    else:
        service = maine if world == "moosehead" else photo
        opts = dict(
            pixelType="U8", bandIds="0,1,2,3", renderingRule='{"rasterFunction":"None"}'
        )
    p = out / (name + "-" + kind + ".tif")
    args = dict(
        bbox=bbox,
        bboxSR=32619,
        imageSR=32619,
        size=f"{count},{count}",
        f="image",
        format="tiff",
        interpolation="RSP_BilinearInterpolation",
        **opts,
    )
    if p.is_file():
        return
    import rasterio

    for attempt in range(4):
        try:
            resp = requests.get(service + "/exportImage", params=args, timeout=100)
            resp.raise_for_status()
            with rasterio.MemoryFile(resp.content) as f, f.open() as im:
                assert (im.width, im.height) == (count, count)
                print(name, kind, im.count, im.dtypes, len(resp.content), flush=True)
                assert im.count == (1 if kind == "height" else 4)
            p.write_bytes(resp.content)
            p.with_suffix(".json").write_text(
                json.dumps(
                    dict(
                        url=resp.url,
                        coordinates=sites[name],
                        origin=origin,
                        spacing=spacing,
                        shape=[count, count],
                        bytes=len(resp.content),
                    ),
                    indent=2,
                )
            )
            return
        except Exception as err:
            print(name, kind, type(err).__name__, str(err)[:120], flush=True)
            if attempt == 3:
                raise
            time.sleep(1.5 * (attempt + 1))
