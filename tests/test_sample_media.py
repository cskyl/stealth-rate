import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FFPROBE = "/usr3/graduate/tianle/bin/ffprobe"


class SampleMediaTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.study = ROOT / "studies/sample_synthetic_v0"
        cls.receipt = json.loads((cls.study / "MEDIA_RECEIPT.json").read_text())
        cls.media = sorted((ROOT / "media/sample_synthetic_v0").glob("*.mp4"))

    def test_inventory_and_size(self):
        key = json.loads((self.study / "private/key.json").read_text())["items"]
        self.assertEqual(len(self.media), len(key))
        self.assertLess(self.receipt["total_bytes"], 60 * 1024 * 1024)
        self.assertAlmostEqual(sum(p.stat().st_size for p in self.media), self.receipt["total_bytes"])

    def test_uniform_params_and_duration(self):
        probes = []
        for path in self.media:
            raw = subprocess.check_output([FFPROBE, "-v", "error", "-show_entries", "format=duration:stream=codec_name,width,height,r_frame_rate,channels,sample_rate", "-of", "json", str(path)], text=True)
            data = json.loads(raw); stream = data["streams"][0]
            probes.append((stream.get("codec_name"), stream.get("width"), stream.get("height"), stream.get("r_frame_rate"), stream.get("channels"), stream.get("sample_rate"), float(data["format"]["duration"])))
        self.assertEqual(len({probe[:6] for probe in probes}), 1)
        self.assertTrue(all(abs(probe[6] - 8.0) <= 0.1 for probe in probes))
        self.assertEqual({path.stem for path in self.media}, set(self.receipt["files"]))
        for item_id, row in self.receipt["files"].items():
            with self.subTest(item_id=item_id):
                self.assertIn("integrated_loudness", row)
                self.assertLessEqual(abs(float(row["integrated_loudness"]) + 16.0), 3.0)


if __name__ == "__main__": unittest.main()
