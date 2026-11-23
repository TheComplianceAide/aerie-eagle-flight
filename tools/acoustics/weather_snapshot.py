#!/usr/bin/env python3
"""Publish the complete Open-Meteo acoustic forecast for Aerie (Python 3.9+)."""
import argparse
from datetime import datetime, timedelta, timezone
import ipaddress
import json
import math
import os
from pathlib import Path
import stat
import tempfile
from urllib.parse import urlencode, urlsplit
from urllib.request import build_opener, HTTPRedirectHandler

# Origins and provider choices used by game/soundscapes.js.
SITES = {
    "gfs_seamless": {
        "winnipesaukee": (43.585, -71.330), "yosemite": (37.723, -119.637),
        "crater": (42.944, -122.109), "alaska": (58.418, -134.565),
        "yellowstone": (44.461, -110.829), "canyon": (36.879, -111.510),
        "surry": (43.006, -72.311), "dixville": (44.867, -71.305),
        "moosehead": (45.700, -69.730), "acadia": (44.321, -68.187),
    },
    "best_match": {
        "swiss": (46.498, 7.727), "labrador": (50.747, -68.500),
        "lofoten": (67.932, 13.089),
    },
}
CURRENT = {"temperature_2m": "°C", "relative_humidity_2m": "%",
           "surface_pressure": "hPa", "wind_speed_10m": "m/s"}
HOURLY = {"temperature_80m": "°C", "temperature_120m": "°C",
          "wind_speed_80m": "m/s", "wind_speed_120m": "m/s"}
DEFAULT_ENDPOINT = "http://127.0.0.1:8080/v1/forecast"


class NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


def checked_endpoint(url):
    parts = urlsplit(url)
    host = parts.hostname
    if not host or parts.username is not None or parts.password is not None or parts.query or parts.fragment:
        raise ValueError("Use a forecast endpoint without credentials, query, or fragment.")
    if parts.scheme != "https":
        try:
            loopback = ipaddress.ip_address(host).is_loopback
        except ValueError:
            loopback = host == "localhost"
        if parts.scheme != "http" or not loopback:
            raise ValueError("Use HTTPS or an HTTP loopback endpoint.")
    return url


# Same physical bounds as commerce/src/air.mjs.
LIMITS = {"°C": (-100, 70), "%": (0, 100), "hPa": (300, 1100), "m/s": (0, 150)}


def read_fields(values, units, fields, hourly=False):
    result = {}
    for key, unit in fields.items():
        value = values[key]
        if hourly:
            if not isinstance(value, list) or len(value) != 1:
                raise ValueError(f"{key} must contain one hourly value")
            value = value[0]
        missing = hourly and value is None
        if units[key] != unit and not (missing and units[key] == "undefined"):
            raise ValueError(f"{key} must use {unit}")
        if not missing:
            if type(value) not in (int, float) or not math.isfinite(value):
                raise ValueError(f"{key} must be a finite number")
            low, high = LIMITS[unit]
            if not low <= value <= high:
                raise ValueError(f"{key} is out of range")
        result[key] = [value] if hourly else value
    return result


def read_region(world, row, now):
    current, hourly = row["current"], row["hourly"]
    time = datetime.strptime(current["time"], "%Y-%m-%dT%H:%M").replace(tzinfo=timezone.utc)
    if row["utc_offset_seconds"] != 0 or hourly["time"] != [time.strftime("%Y-%m-%dT%H:00")]:
        raise ValueError("expected UTC current and hourly data for the same hour")
    if not now - timedelta(hours=2) < time <= now + timedelta(minutes=15):
        raise ValueError("current data is stale or in the future")
    low = read_fields(current, row["current_units"], CURRENT)
    high = read_fields(hourly, row["hourly_units"], HOURLY, hourly=True)
    if all(high[k] == [None] for k in ("wind_speed_80m", "wind_speed_120m")):
        raise ValueError("upper-air wind is unavailable")
    # The Lofoten best-match model supplies wind aloft but neither temperature.
    if world != "lofoten" and all(high[k] == [None] for k in ("temperature_80m", "temperature_120m")):
        raise ValueError("upper-air temperature is unavailable")
    return {"current": {"time": current["time"], **low}, "hourly": high}


def collect(endpoint, now):
    endpoint = checked_endpoint(endpoint)
    opener = build_opener(NoRedirects())
    regions = {}
    for model, sites in SITES.items():
        params = {"latitude": ",".join(str(lat) for lat, _ in sites.values()),
                  "longitude": ",".join(str(lon) for _, lon in sites.values()),
                  "current": ",".join(CURRENT), "hourly": ",".join(HOURLY),
                  "forecast_hours": 1, "wind_speed_unit": "ms", "timezone": "GMT"}
        if model != "best_match":
            params["models"] = model
        with opener.open(endpoint + "?" + urlencode(params), timeout=90) as response:
            rows = json.load(response)
        if not isinstance(rows, list) or len(rows) != len(sites):
            raise ValueError(f"{model} returned an incomplete set of locations")
        for index, (world, row) in enumerate(zip(sites, rows)):
            try:
                # The upstream omits location_id=0 from the first result.
                if row.get("location_id", 0) != index:
                    raise ValueError("unexpected location order")
                regions[world] = read_region(world, row, now)
            except (AttributeError, KeyError, TypeError, ValueError) as error:
                raise ValueError(f"{world}: {error}") from error
    return {"version": 1, "generatedAt": now.isoformat(timespec="seconds").replace("+00:00", "Z"),
            "regions": regions}


def publish(output, endpoint=DEFAULT_ENDPOINT):
    snapshot = collect(endpoint, datetime.now(timezone.utc))
    mode = stat.S_IMODE(output.stat().st_mode) if output.exists() else 0o644
    tmp = tempfile.NamedTemporaryFile("w", dir=output.parent, prefix="." + output.name + ".",
                                      encoding="utf-8", delete=False)
    try:
        with tmp:
            json.dump(snapshot, tmp, allow_nan=False, separators=(",", ":"))
            tmp.write("\n")
            tmp.flush()
            os.fchmod(tmp.fileno(), mode)
            os.fsync(tmp.fileno())
        os.replace(tmp.name, output)
    finally:
        Path(tmp.name).unlink(missing_ok=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="JSON destination in an existing directory")
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT, help="trusted self-hosted /v1/forecast URL")
    args = parser.parse_args()
    try:
        publish(args.output, args.endpoint)
    except (ValueError, OSError) as error:
        parser.exit(1, f"Forecast snapshot failed: {error}\n")
