import json
import shutil
import tempfile
import threading
import unittest
from pathlib import Path
import sys
from urllib.error import URLError

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from serve_local import Handler, LocalStore, ThreadingHTTPServer
from simulate_raters import run


class HttpSimulationTest(unittest.TestCase):
    def test_three_raters_over_http(self):
        tmp = Path(tempfile.mkdtemp(prefix="stealth-rate-http-"))
        old_store = getattr(Handler, "store", None)
        try:
            Handler.store = LocalStore(tmp)
            try:
                server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
            except PermissionError as exc:
                self.skipTest(f"HTTP bind denied; direct path remains covered: {exc}")
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                run("sample_synthetic_v0", 3, base_url=f"http://127.0.0.1:{server.server_port}")
            except (URLError, OSError) as exc:
                self.skipTest(f"HTTP loopback unavailable: {exc}")
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=2)
            sessions = Handler.store.read("sample_synthetic_v0", "sessions")
            self.assertEqual(sum(row.get("status") == "completed" for row in sessions), 3)
        finally:
            if old_store is None:
                del Handler.store
            else:
                Handler.store = old_store
            shutil.rmtree(tmp)
