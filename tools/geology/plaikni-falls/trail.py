"""Read the NPS Arrow Gold+ trail centerline to the Plaikni observation area."""

from argparse import ArgumentParser
from pathlib import Path
import json, requests
import numpy as np
from shapely.geometry import LineString, box

if __name__ == "__main__":
    p = ArgumentParser()
    p.add_argument("cache", type=Path)
    p.add_argument("game", type=Path)
    args = p.parse_args()
    endpoint = "https://mapservices.nps.gov/arcgis/rest/services/NationalDatasets/NPS_Public_Trails/FeatureServer/0/query"
    query = dict(
        geometry="577450,4750950,577860,4751330",
        geometryType="esriGeometryEnvelope",
        inSR=32610,
        outSR=32610,
        returnGeometry="true",
        outFields="*",
        spatialRel="esriSpatialRelIntersects",
        f="json",
    )
    reply = requests.get(endpoint, params=query, timeout=25)
    reply.raise_for_status()
    f = next(
        feature
        for feature in reply.json()["features"]
        if feature["attributes"]["TRLNAME"] == "Plaikni Falls Trail"
    )
    full = max(f["geometry"]["paths"], key=len)
    local = LineString([(x - 571464, 4755190 - y) for x, y, *_ in full])
    end = local.length
    # Keep the actual approach through the whole local aerial. Resample the
    # surveyed line every 0.75 m so its narrow gravel margins curve naturally.
    trace = local.intersection(box(6012, 3855, 6298, 4141))
    line = (
        trace
        if trace.geom_type == "LineString"
        else max(trace.geoms, key=lambda g: g.length)
    )
    pts = [
        line.interpolate(float(t)).coords[0]
        for t in [*np.arange(0, line.length, 0.75), line.length]
    ]
    vals = [[round(x, 2), round(z, 2)] for x, z in pts]
    meta = f["attributes"]
    (args.cache / "plaikni-trail.json").write_text(
        json.dumps(
            dict(
                pts=vals,
                service=endpoint,
                objectID=meta["OBJECTID"],
                method=meta.get("MAPSOURCE"),
                editDate=meta.get("EDITDATE"),
            ),
            indent=2,
        )
        + "\n"
    )
    print(len(vals), "stations, endpoint", vals[-1])
