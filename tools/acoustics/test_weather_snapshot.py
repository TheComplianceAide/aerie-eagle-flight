import copy
from datetime import datetime, timezone, timedelta
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import threading
import unittest
from urllib.parse import parse_qs, urlsplit

import weather_snapshot as weather


FIXTURE = json.loads((Path(__file__).parent / "fixtures/forecast-location.json").read_text())


class SnapshotTest(unittest.TestCase):
    def setUp(self):
        self.requests = []
        self.change = lambda model, rows: rows
        self.now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
        test = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                query = parse_qs(urlsplit(self.path).query)
                test.requests.append(query)
                model = query.get("models", ["best_match"])[0]
                rows = []
                for index, (world, coordinates) in enumerate(weather.SITES[model].items()):
                    row = copy.deepcopy(FIXTURE)
                    row["latitude"], row["longitude"] = coordinates
                    if index:
                        row["location_id"] = index
                    row["current"]["time"] = test.now.strftime("%Y-%m-%dT%H:%M")
                    row["hourly"]["time"] = [test.now.strftime("%Y-%m-%dT%H:00")]
                    if world == "lofoten":
                        row["hourly"]["temperature_80m"] = row["hourly"]["temperature_120m"] = [None]
                    rows.append(row)
                body = json.dumps(test.change(model, rows)).encode()
                self.send_response(200)
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *args):
                pass

        self.server = HTTPServer(("127.0.0.1", 0), Handler)
        self.worker = threading.Thread(target=self.server.serve_forever, kwargs={"poll_interval": .02})
        self.worker.start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.worker.join)
        self.addCleanup(self.server.shutdown)
        self.endpoint = f"http://127.0.0.1:{self.server.server_port}/v1/forecast"
        self.directory = TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "air.json"

    def test_both_models_and_consumer_schema(self):
        weather.publish(self.path, self.endpoint)
        first, second = self.requests
        self.assertEqual(first["models"], ["gfs_seamless"])
        self.assertNotIn("models", second)
        for query, model in zip(self.requests, weather.SITES.values()):
            self.assertEqual(query["latitude"][0].split(","), [str(lat) for lat, _ in model.values()])
            self.assertEqual(query["longitude"][0].split(","), [str(lon) for _, lon in model.values()])
            self.assertEqual(query["wind_speed_unit"], ["ms"])
            self.assertEqual(query["forecast_hours"], ["1"])
            self.assertEqual(set(query["current"][0].split(",")), set(weather.CURRENT))
            self.assertEqual(set(query["hourly"][0].split(",")), set(weather.HOURLY))
        data = json.loads(self.path.read_text())
        self.assertEqual(data["version"], 1)
        self.assertTrue(data["generatedAt"].endswith("Z"))
        self.assertEqual(len(data["regions"]), 13)
        for region in data["regions"].values():
            self.assertEqual(set(region["current"]), {"time", *weather.CURRENT})
            self.assertEqual(set(region["hourly"]), set(weather.HOURLY))
            self.assertTrue(all(len(v) == 1 for v in region["hourly"].values()))
        self.assertEqual(data["regions"]["lofoten"]["hourly"]["temperature_120m"], [None])

    def test_second_batch_failure_preserves_existing_file(self):
        weather.publish(self.path, self.endpoint)
        existing = self.path.read_bytes()
        def change(field, value):
            def apply(rows):
                rows[1][field[0]][field[1]] = value
                return rows
            return apply

        for corrupt in [
                lambda rows: rows[:-1], lambda rows: rows[::-1],
                change(("current", "relative_humidity_2m"), None),
                change(("current_units", "wind_speed_10m"), "km/h"),
                change(("hourly", "wind_speed_80m"), []),
                change(("hourly", "temperature_120m"), [float("nan")]),
                change(("hourly", "time"), ["2000-01-01T00:00"]),
        ]:
            with self.subTest(corrupt=corrupt):
                self.change = lambda model, rows: corrupt(rows) if model=="best_match" else rows
                with self.assertRaises(ValueError):
                    weather.publish(self.path, self.endpoint)
                self.assertEqual(self.path.read_bytes(), existing)
                self.assertEqual(list(self.path.parent.iterdir()), [self.path])

    def test_old_or_empty_upper_air_response_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "stale"):
            weather.collect(self.endpoint, self.now + timedelta(days=1))
        def no_temperature(model, rows):
            rows[0]["hourly"]["temperature_80m"] = rows[0]["hourly"]["temperature_120m"] = [None]
            return rows
        self.change = no_temperature
        with self.assertRaisesRegex(ValueError, "winnipesaukee.*temperature"):
            weather.publish(self.path, self.endpoint)
        self.assertFalse(self.path.exists())

    def test_endpoint(self):
        for url in ["http://127.0.0.1:8080/v1/forecast", "http://[::1]/v1/forecast", "https://weather.example/forecast"]:
            self.assertEqual(weather.checked_endpoint(url), url)
        for url in ["http://weather.example/forecast", "file:///etc/passwd", "https://user:pw@weather.example/forecast"]:
            with self.assertRaises(ValueError):
                weather.checked_endpoint(url)


if __name__ == "__main__":
    unittest.main()
