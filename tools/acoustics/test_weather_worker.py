import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlsplit

import weather_worker as worker

URL = "https://aerietest.blob.core.windows.net/weather/air.json"
TOKEN = "example-token"


class Response(io.BytesIO):
    def __init__(self, obj=None, status=200, etag=None):
        super().__init__(json.dumps(obj).encode())
        self.status = status
        self.headers = {"ETag": etag}


class Transport:
    def __init__(self, *steps):
        self.steps = iter(steps)
        self.requests = []

    def open(self, request, timeout):
        self.requests.append(request)
        reply = next(self.steps)
        if isinstance(reply, HTTPError):
            raise reply
        return reply


def failure(status, reason=""):
    return HTTPError(URL, status, reason, {"x-ms-error-code": reason}, io.BytesIO())


def snapshot(generated="2026-11-23T06:30:00Z", observed="2026-11-23T06:30"):
    return {"version": 1, "generatedAt": generated, "regions": {"alaska": {"current": {"time": observed}}}}


class WorkerTest(unittest.TestCase):
    def setUp(self):
        self.body = json.dumps(snapshot()).encode()

    def test_create_and_replace_with_preconditions(self):
        for prior, condition in [
            (failure(404), {"if-none-match": "*"}),
            (Response(snapshot("2026-11-23T06:00:00Z"), etag='"a"'), {"if-match": '"a"'}),
        ]:
            storage = Transport(prior, Response(status=201))
            worker.store(URL, TOKEN, self.body, storage)
            get, put = storage.requests
            self.assertEqual((get.get_method(), put.get_method()), ("GET", "PUT"))
            self.assertEqual(put.full_url, URL)
            self.assertEqual(put.data, self.body)
            headers = {k.lower(): v for k,v in put.header_items()}
            self.assertTrue(condition.items() <= headers.items())
            self.assertEqual(headers["authorization"], "Bearer " + TOKEN)
            self.assertEqual(headers["x-ms-blob-type"], "BlockBlob")

    def test_losing_create_or_update_race_keeps_newer_snapshot(self):
        for status in (409, 412):
            storage = Transport(failure(404), failure(status, "BlobAlreadyExists"),
                                Response(snapshot("2026-11-23T06:31:00Z"), etag='"b"'))
            worker.store(URL, TOKEN, self.body, storage)
            self.assertEqual([r.get_method() for r in storage.requests], ["GET", "PUT", "GET"])

    def test_source_time_regression_or_absent_etag(self):
        prior = snapshot("2026-11-23T06:29:00Z", "2026-11-23T06:45")
        storage = Transport(Response(prior, etag='"previous"'))
        worker.store(URL, TOKEN, self.body, storage)
        self.assertEqual(len(storage.requests), 1)
        with self.assertRaisesRegex(ValueError, "ETag"):
            worker.store(URL, TOKEN, self.body, Transport(Response(prior)))

    def test_failure_does_not_blindly_overwrite(self):
        storage = Transport(failure(403))
        with self.assertRaises(HTTPError):
            worker.store(URL, TOKEN, self.body, storage)
        self.assertEqual(len(storage.requests), 1)
        with self.assertRaises(ValueError):
            worker.store("https://storage.example.com/weather/air.json", TOKEN, self.body, Transport())

    def test_managed_identity_uses_storage_audience_and_platform_header(self):
        env = {"IDENTITY_ENDPOINT": "http://127.0.0.1:42356/msi/token", "IDENTITY_HEADER": "fixture-header"}
        for extra in ({}, {"AZURE_CLIENT_ID": "fixture-client"}):
            identity = Transport(Response({"access_token": TOKEN}))
            with patch.object(worker, "build_opener", return_value=identity):
                self.assertEqual(worker.storage_token(env | extra), TOKEN)
            request, = identity.requests
            args = parse_qs(urlsplit(request.full_url).query)
            self.assertEqual(args["resource"], ["https://storage.azure.com/"])
            self.assertEqual(args["api-version"], ["2019-08-01"])
            self.assertEqual(args.get("client_id"), ["fixture-client"] if extra else None)
            self.assertEqual(request.get_header("X-identity-header"), "fixture-header")
        with self.assertRaises(ValueError):
            worker.storage_token(env | {"IDENTITY_ENDPOINT":"http://remote.example.org/msi"})

    def test_output_mode_and_failed_generation_do_not_request_tokens(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(worker, "generate") as generate:
            output = Path(directory) / "air.json"
            with patch.object(worker, "storage_token") as identity:
                worker.main(output)
                generate.assert_called_once_with(output)
                generate.side_effect = ValueError("incomplete forecast")
                with patch.dict(worker.os.environ, {"AERIE_WEATHER_BLOB_URL":URL}):
                    with self.assertRaisesRegex(ValueError, "incomplete forecast"):
                        worker.main(None)
                identity.assert_not_called()

    def test_cloud_errors_report_the_stage_without_request_details(self):
        with (patch.dict(worker.os.environ, {"AERIE_WEATHER_BLOB_URL": URL}),
              patch.object(worker, "generate", side_effect=lambda path: path.write_bytes(self.body)),
              patch.object(worker, "storage_token", side_effect=failure(403, TOKEN)) as identity,
              patch.object(worker, "store") as storage):
            with self.assertRaisesRegex(RuntimeError, r"^Managed identity returned HTTP 403\.$"):
                worker.main(None)
            storage.assert_not_called()
            identity.side_effect = None
            identity.return_value = TOKEN
            storage.side_effect = failure(403, "AuthorizationPermissionMismatch")
            with self.assertRaisesRegex(RuntimeError, r"^Forecast storage returned HTTP 403 \(AuthorizationPermissionMismatch\)\.$"):
                worker.main(None)
            storage.side_effect = failure(403, URL)
            with self.assertRaisesRegex(RuntimeError, r"^Forecast storage returned HTTP 403\.$"):
                worker.main(None)


if __name__ == "__main__":
    unittest.main()
