import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from serve_local import LocalStore


class LocalBackendTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="stealth-rate-local-"))
        self.store = LocalStore(self.tmp)

    def test_balanced_assignments_and_expiry(self):
        sessions = [self.store.assign("sample_synthetic_v0", f"pid-{i}") for i in range(60)]
        self.assertTrue(all(row["ok"] for row in sessions))
        counts = {f"b{i:02d}": 0 for i in range(6)}
        for row in sessions:
            counts[row["block_id"]] += 1
        self.assertLessEqual(max(counts.values()) - min(counts.values()), 1)
        old = self.store.read("sample_synthetic_v0", "sessions")[0]
        old["started_at"] = (datetime.now(timezone.utc) - timedelta(minutes=31)).isoformat().replace("+00:00", "Z")
        self.store.append("sample_synthetic_v0", "sessions", old)
        fresh = self.store.assign("sample_synthetic_v0", "new-after-expiry")
        self.assertTrue(fresh["ok"])

    def test_response_is_idempotent(self):
        payload = {"session_id": "s_test", "item_id": "it_test", "task": "mcq", "answers": {"choice": "bell"}, "rt_ms": 12, "replay_count": 0}
        self.assertFalse(self.store.response("sample_synthetic_v0", payload)["duplicate"])
        self.assertTrue(self.store.response("sample_synthetic_v0", payload)["duplicate"])
        self.assertEqual(len(self.store.read("sample_synthetic_v0", "responses")), 1)


if __name__ == "__main__":
    unittest.main()
