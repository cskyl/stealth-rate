import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from analyze_human_scores import krippendorff_alpha


class AnalysisTest(unittest.TestCase):
    def test_known_nominal_alpha(self):
        alpha = krippendorff_alpha({"one": ["a", "a", "a"], "two": ["a", "b", "b"]}, "nominal")
        self.assertIsNotNone(alpha)
        self.assertAlmostEqual(alpha, 0.25, delta=0.05)


if __name__ == "__main__": unittest.main()
