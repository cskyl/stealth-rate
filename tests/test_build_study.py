import json
import shutil
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
import sys
sys.path.insert(0, str(ROOT / "tools"))
from build_study import build


class BuildStudyTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="stealth-rate-build-"))
        study_dir = self.tmp / "study"
        study_dir.mkdir()
        shutil.copy(ROOT / "studies/sample_synthetic_v0/study.yaml", study_dir / "study.yaml")
        self.study = study_dir / "study.yaml"

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def test_deterministic_and_blinded(self):
        build(self.study)
        first = (self.study.parent / "items.json").read_bytes()
        build(self.study)
        self.assertEqual(first, (self.study.parent / "items.json").read_bytes())
        public = json.loads(first)
        self.assertTrue(public["items"])
        forbidden = ("clean", "harmless_av", "audio_low", "audio_high", "visual_low", "visual_high", "anchor", "attention", "harmless", "gold", "injected")
        blob = first.decode().lower()
        for word in forbidden:
            self.assertNotIn(word, blob)

    def test_blocks_balance_and_key_coverage(self):
        build(self.study)
        data = json.loads((self.study.parent / "blocks.json").read_text())
        items = json.loads((self.study.parent / "items.json").read_text())["items"]
        key = json.loads((self.study.parent / "private/key.json").read_text())["items"]
        self.assertEqual({item["item_id"] for item in items}, set(key))
        public_by_id = {item["item_id"]: item for item in items}
        for block in data["blocks"]:
            seen_sources = set()
            test_conditions = []
            for item_id in block["items"]:
                meta = key[item_id]
                if meta["role_kind"] == "test":
                    self.assertNotIn(meta["source_id"], seen_sources)
                    seen_sources.add(meta["source_id"])
                    test_conditions.append(meta["cond_id"])
                self.assertIn(item_id, public_by_id)
            counts = {condition: test_conditions.count(condition) for condition in set(test_conditions)}
            self.assertLessEqual(max(counts.values()) - min(counts.values()), 1)

    def test_options_are_distinct_and_contain_gold_and_injected(self):
        build(self.study)
        public = json.loads((self.study.parent / "items.json").read_text())["items"]
        key = json.loads((self.study.parent / "private/key.json").read_text())["items"]
        for item in public:
            options = item["options"]
            self.assertEqual(len(options), 4, item["item_id"])
            self.assertEqual(len(set(options)), 4, item["item_id"])
            meta = key[item["item_id"]]
            if meta["gold"] is not None:
                self.assertIn(meta["gold"], options)
            if meta["injected"] is not None:
                self.assertIn(meta["injected"], options)


if __name__ == "__main__":
    unittest.main()
