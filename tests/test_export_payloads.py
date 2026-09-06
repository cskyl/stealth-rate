import base64
import gzip
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1] / "tools"))
from export_and_analyze import payload_files  # noqa: E402


def bundle(sid="s1", answer="a"):
    return {"session": {"session_id": sid}, "events": [], "responses": [{"answers": {"choice": answer}}]}


class PayloadImportTests(unittest.TestCase):
    def test_accepts_raw_gzip_base64_text_and_plain_json(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            value = bundle("raw")
            (root / "raw.gz").write_bytes(gzip.compress(json.dumps(value).encode()))
            value = bundle("b64")
            (root / "payload.txt").write_text(base64.b64encode(gzip.compress(json.dumps(value).encode())).decode())
            (root / "plain.json").write_text(json.dumps(bundle("plain")))
            self.assertEqual({row["session"]["session_id"] for row in payload_files(root)}, {"raw", "b64", "plain"})

    def test_same_bundle_deduplicates_but_conflict_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            value = json.dumps(bundle("same"))
            (root / "a.json").write_text(value)
            (root / "b.json").write_text(value)
            self.assertEqual(len(payload_files(root)), 1)
            (root / "c.json").write_text(json.dumps(bundle("same", "different")))
            with self.assertRaisesRegex(ValueError, "conflicting"):
                payload_files(root)

    def test_named_malformed_payload_fails_loudly(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "downloaded-payload.txt"
            path.write_text("not gzip or json")
            with self.assertRaisesRegex(ValueError, "malformed"):
                payload_files(path.parent)

    def test_truncated_gzip_and_empty_directory_fail(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "bad.gz").write_bytes(gzip.compress(json.dumps(bundle()).encode())[:-3])
            with self.assertRaisesRegex(ValueError, "malformed"):
                payload_files(root)
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(ValueError, "no valid"):
                payload_files(Path(tmp))


if __name__ == "__main__":
    unittest.main()
