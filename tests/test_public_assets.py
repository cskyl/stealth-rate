"""Public-only local serving, with fixtures unrelated to study records."""
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import serve_local


class PublicAssetsTest(unittest.TestCase):
    def test_asset_routing_and_private_denial(self):
        with tempfile.TemporaryDirectory(prefix="stealthrate-public-") as tmp:
            root = Path(tmp)
            for name in ["frontend/dist/index.html", "frontend/dist/assets/app.js", "frontend/dist/assets/app.css",
                         "studies/demo/study.json", "studies/demo/private/key.json", "media/demo/clip.mp4",
                         "local/demo/responses.jsonl", ".git/config", "README.md"]:
                p = root / name
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text("fixture")
            with patch.object(serve_local, "ROOT", root):
                self.assertEqual(serve_local.public_file("/"), root / "frontend/dist/index.html")
                self.assertEqual(serve_local.public_file("/assets/app.js"), root / "frontend/dist/assets/app.js")
                self.assertIsNotNone(serve_local.public_file("/assets/app.css"))
                self.assertIsNotNone(serve_local.public_file("/studies/demo/study.json"))
                self.assertIsNotNone(serve_local.public_file("/media/demo/clip.mp4"))
                for denied in ["/README.md", "/.git/config", "/local/demo/responses.jsonl",
                               "/studies/demo/private/key.json", "/assets/../../README.md",
                               "/media/demo/%2e%2e/%2e%2e/README.md", "/studies/demo/study.yaml"]:
                    self.assertIsNone(serve_local.public_file(denied), denied)
                (root / "frontend/dist/assets/leak.js").symlink_to(root / "README.md")
                self.assertIsNone(serve_local.public_file("/assets/leak.js"))

    def test_identifier_validation(self):
        self.assertEqual(serve_local.valid_study("sample_synthetic_v0"), "sample_synthetic_v0")
        for bad in ["", "../x", "x/y", "x\\y", "/tmp", None]:
            with self.assertRaises(ValueError):
                serve_local.valid_study(bad)

    def test_repeat_local_assignment_keeps_item_list(self):
        with tempfile.TemporaryDirectory(prefix="stealthrate-assignment-") as tmp:
            store = serve_local.LocalStore(Path(tmp))
            original = store.assign("sample_synthetic_v0", "qa_opaque_id")
            resumed = store.assign("sample_synthetic_v0", "qa_opaque_id")
            self.assertTrue(resumed["existing"])
            self.assertEqual(resumed["session_id"], original["session_id"])
            self.assertEqual(resumed["items"], original["items"])


if __name__ == "__main__":
    unittest.main()
