from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from cache_public_assets import install_cache, SCRIPT


class PublicAssetCacheTest(unittest.TestCase):
    def test_byte_identical_aliases_persist_across_releases(self):
        with TemporaryDirectory() as temporary:
            root = Path(temporary)
            template = root / "template.js"
            template.write_text("const assets = /* immutable public files */ {};")
            public = root / "dist"
            (public / "api").mkdir(parents=True)
            (public / "api" / "excluded.webp").write_bytes(b"d" * 750_000)
            scenery = public / "terrain.webp"
            original = b"a" * 750_000
            scenery.write_bytes(original)

            paths, added = install_cache(public, template)
            self.assertEqual(set(paths), {"terrain.webp"})
            self.assertEqual(added, len(original))
            alias = public / paths["terrain.webp"].lstrip("/")
            self.assertEqual(alias.read_bytes(), original)
            first_script = (public / SCRIPT).read_bytes()
            self.assertEqual(install_cache(public, template), (paths, 0))
            self.assertEqual((public / SCRIPT).read_bytes(), first_script)

            updated = b"b" * 750_000
            scenery.write_bytes(updated)
            next_paths, added = install_cache(public, template)
            self.assertNotEqual(paths, next_paths)
            self.assertEqual(added, len(updated))
            self.assertEqual(alias.read_bytes(), original)
            self.assertEqual((public / next_paths["terrain.webp"].lstrip("/")).read_bytes(), updated)


if __name__ == "__main__":
    unittest.main()
