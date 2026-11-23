#!/usr/bin/env python3
"""Run Open-Meteo once, validate Aerie's weather and conditionally replace one private blob."""
import argparse
from datetime import datetime, timezone
from email.utils import format_datetime
from http.client import HTTPException
import ipaddress
import json
import os
from pathlib import Path
import re
import signal
import socket
import subprocess
import tempfile
import time
from urllib.error import HTTPError
from urllib.parse import urlencode, urlsplit
from urllib.request import build_opener, ProxyHandler, Request

from weather_snapshot import NoRedirects, publish

DATA = "https://openmeteo.s3.amazonaws.com/data/"
BLOB_PATH = re.compile(r"https://[a-z0-9]{3,24}\.blob\.core\.windows\.net/"
                       r"(?![a-z0-9-]*--)[a-z0-9][a-z0-9-]{1,61}[a-z0-9]/air\.json")
MAX_BYTES = 16 * 1024


def bounded_read(response):
    body = response.read(MAX_BYTES + 1)
    if len(body) > MAX_BYTES:
        raise ValueError("Response exceeds size limit.")
    return body


def storage_token(env):
    address = urlsplit(env["IDENTITY_ENDPOINT"])
    # Container Apps supplies this local identity endpoint and its rotating header.
    try:
        ip = ipaddress.ip_address(address.hostname or "")
        local = (ip.is_loopback or ip.is_private or ip.is_link_local) and not ip.is_unspecified
    except ValueError:
        local = address.hostname == "localhost"
    if address.scheme != "http" or not local or address.username is not None or address.query or address.fragment:
        raise ValueError("Invalid Container Apps local identity endpoint.")
    params = {"resource": "https://storage.azure.com/", "api-version": "2019-08-01"}
    if env.get("AZURE_CLIENT_ID"):
        params["client_id"] = env["AZURE_CLIENT_ID"]
    request = Request(address.geturl() + "?" + urlencode(params),
                      headers={"X-IDENTITY-HEADER": env["IDENTITY_HEADER"]})
    # The platform-local request must never leave via an outbound HTTP proxy.
    with build_opener(ProxyHandler({}), NoRedirects()).open(request, timeout=10) as response:
        token = json.loads(bounded_read(response))["access_token"]
    if not isinstance(token, str) or not token or any(c.isspace() for c in token):
        raise ValueError("Invalid Container Apps storage token.")
    return token


def already_published(existing, candidate):
    if existing["version"] != 1:
        raise ValueError("The existing blob has an unknown snapshot version.")
    if existing["generatedAt"] >= candidate["generatedAt"]:
        return True
    return any(existing["regions"][world]["current"]["time"] > entry["current"]["time"]
               for world, entry in candidate["regions"].items())


def store(url, token, body, opener):
    if not BLOB_PATH.fullmatch(url):
        raise ValueError("Expected a private Azure Blob URL ending in /<container>/air.json.")
    candidate = json.loads(body)
    headers = {"Authorization": "Bearer " + token, "x-ms-version": "2023-11-03"}
    for attempt in range(2):
        headers["x-ms-date"] = format_datetime(datetime.now(timezone.utc), usegmt=True)
        try:
            with opener.open(Request(url, headers=headers), timeout=15) as prior:
                etag = prior.headers["ETag"]
                if not etag:
                    raise ValueError("Stored forecast is missing its ETag.")
                if already_published(json.loads(bounded_read(prior)), candidate):
                    return "Already published a matching or newer snapshot."
            condition = {"If-Match": etag}
        except HTTPError as error:
            error.close()
            if error.code != 404:
                raise
            condition = {"If-None-Match": "*"}
        put_headers = {**headers, **condition, "x-ms-blob-type": "BlockBlob",
                       "Content-Type": "application/json", "Cache-Control": "no-cache"}
        try:
            with opener.open(Request(url, method="PUT", data=body, headers=put_headers), timeout=15) as saved:
                if saved.status != 201:
                    raise ValueError(f"Unexpected Blob write status {saved.status}.")
            return "Published the validated snapshot."
        except HTTPError as error:
            error.close()
            raced = error.code == 412 or (error.code == 409 and error.headers.get("x-ms-error-code") == "BlobAlreadyExists")
            if not raced or attempt:
                raise


def generate(output):
    env = {k: v for k, v in os.environ.items() if k not in ("IDENTITY_ENDPOINT", "IDENTITY_HEADER")}
    env.update(REMOTE_DATA_DIRECTORY=DATA, CACHE_SIZE="1GB", DATA_DIRECTORY="/app/data/")
    command = ["/app/openmeteo-api", "serve", "--env", "production", "--hostname", "127.0.0.1", "--port", "8080"]
    child = subprocess.Popen(command, cwd="/app", env=env)
    try:
        deadline = time.monotonic() + 45
        while child.poll() is None and time.monotonic() < deadline:
            try:
                with socket.create_connection(("127.0.0.1", 8080), timeout=.5):
                    break
            except OSError:
                time.sleep(.25)
        else:
            raise RuntimeError("Local forecast service failed to start.")
        publish(output)
    finally:
        if child.poll() is None:
            child.terminate()
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()


def main(output):
    if output:
        generate(output)
        print(f"Validated snapshot written to {output}.")
        return
    url = os.environ.get("AERIE_WEATHER_BLOB_URL", "")
    if not BLOB_PATH.fullmatch(url):
        raise ValueError("Set AERIE_WEATHER_BLOB_URL to the private air.json blob URL.")
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / "air.json"
        generate(path)
        try:
            token = storage_token(os.environ)
        except HTTPError as error:
            error.close()
            raise RuntimeError(f"Managed identity returned HTTP {error.code}.") from None
        try:
            result = store(url, token, path.read_bytes(), build_opener(NoRedirects()))
        except HTTPError as error:
            code = (error.headers or {}).get("x-ms-error-code", "")
            detail = f" ({code})" if re.fullmatch(r"[A-Za-z0-9]{1,64}", code) else ""
            error.close()
            raise RuntimeError(f"Forecast storage returned HTTP {error.code}{detail}.") from None
        print(result)


def stop(signum, frame):
    raise SystemExit(f"Weather worker stopped by signal {signum}.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-only", type=Path, help="write the snapshot locally and skip Azure")
    args = parser.parse_args()
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGALRM, stop)
    signal.alarm(360)
    try:
        main(args.output_only)
    except HTTPError as error:
        parser.exit(1, f"Forecast request returned HTTP {error.code}.\n")
    except (OSError, HTTPException, KeyError, ValueError, RuntimeError) as error:
        parser.exit(1, f"Weather worker failed: {error}\n")
