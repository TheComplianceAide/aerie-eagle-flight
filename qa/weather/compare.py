"""Finite read-only comparison against a timestamped public forecast fixture."""
import json
import math
import subprocess
import time
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen


def clip(x, lo, hi):
    return max(lo, min(hi, x))


def acoustic_inputs(values):
    temperature, humidity, pressure = (values[k] for k in
                                      ("temperature_2m", "relative_humidity_2m", "surface_pressure"))
    tlo, thi = values["temperature_80m"], values["temperature_120m"]
    wlo, whi = values["wind_speed_80m"], values["wind_speed_120m"]
    height = 120 if thi is not None else 80
    temp_high = thi if thi is not None else tlo
    wind_high = whi if whi is not None else wlo
    lapse = (temp_high-temperature)/(height-2) if temp_high is not None else -.0065
    inversion = clip((lapse+.0065)/.015, 0, 1)*.6
    shear = clip((wind_high-values["wind_speed_10m"])/(height-10)/.02, .3, 2.2) if wind_high is not None else 1
    return [temperature, humidity, pressure/10, lapse*1000, inversion, shear]


def bounds(values):
    return [round(v, 5) for v in values]


def container_metrics():
    paths = ["/sys/fs/cgroup/memory.current", "/sys/fs/cgroup/memory.peak",
             "/sys/class/net/eth0/statistics/rx_bytes", "/sys/class/net/eth0/statistics/tx_bytes"]
    output = subprocess.check_output(["docker", "exec", "parity", "cat", *paths], text=True)
    cache = subprocess.check_output(["docker", "exec", "parity", "du", "-sB1", "/app/data"], text=True)
    return dict(zip(["memory_bytes", "peak_bytes", "rx_bytes", "tx_bytes", "cache_allocated_bytes"],
                    [int(x) for x in output.split()] + [int(cache.split()[0])]))


fixture = json.loads(Path(__file__).with_name("public-reference.json").read_text())
print("REFERENCE", fixture["capturedUtc"], "MATCHED HOUR", fixture["hourUtc"])
print("AUDIO ORDER tempC, relative_humidity_percent, surface_kPa, lapse_K_per_km, inversion, windRefract")
print("METRICS cold-start", container_metrics())
num_incomplete = 0
for stage in ("cold", "warm"):
    for model, group in fixture["queries"].items():
        start = time.monotonic()
        url = "http://127.0.0.1:8080/v1/forecast?" + urlencode(group["parameters"])
        with urlopen(url, timeout=215) as response:
            rows = json.load(response)
        elapsed = round(time.monotonic()-start, 3)
        assert len(rows) == len(group["worlds"])
        print("BATCH", stage, model, "seconds", elapsed, "METRICS", container_metrics())
        if stage == "warm":
            continue
        for world, reference, local in zip(group["worlds"], group["locations"], rows):
            assert reference["hourly"]["time"] == local["hourly"]["time"] == [fixture["hourUtc"]]
            keys = group["parameters"]["hourly"].split(",")
            ref = {key: reference["hourly"][key][0] for key in keys}
            now = {key: local["hourly"][key][0] for key in keys}
            print("WEATHER", world, "source", model, "coordinates/elevation(public,local)",
                  [(p["latitude"],p["longitude"],p["elevation"]) for p in [reference,local]],
                  "published",ref,"self",now)
            required = group["parameters"]["current"].split(",")
            if any(now[k] is None or ref[k] is None for k in required):
                num_incomplete += 1
                print("MISSING REQUIRED FIELDS", world)
                continue
            a,b = acoustic_inputs(ref),acoustic_inputs(now)
            print("AUDIO",world,"published",bounds(a),"self",bounds(b),"delta",bounds(y-x for x,y in zip(a,b)))
            if reference["current"]["time"]==local["current"]["time"]:
                live_ref=ref|{k:reference["current"][k] for k in required}
                live_now=now|{k:local["current"][k] for k in required}
                if all(live_now[k] is not None and live_ref[k] is not None for k in required):
                    live_a,live_b=acoustic_inputs(live_ref),acoustic_inputs(live_now)
                    print("CURRENT_DELTA",world,local["current"]["time"],bounds(y-x for x,y in zip(live_a,live_b)))
print("END", num_incomplete, "locations missing required values")
if num_incomplete:
    raise SystemExit(2)
