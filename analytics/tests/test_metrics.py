import unittest

from analytics import metrics as m


class MetricsTests(unittest.TestCase):
    def test_ctr_is_zero_outside_ranked_positions(self):
        self.assertEqual(m.ctr(None), 0.0)
        self.assertEqual(m.ctr(0), 0.0)
        self.assertEqual(m.ctr(101), 0.0)

    def test_ctr_decreases_monotonically_across_page_boundary(self):
        values = [m.ctr(p) for p in range(1, 100)]
        self.assertTrue(all(a > b for a, b in zip(values, values[1:])))

    def test_visibility_bounds(self):
        self.assertEqual(m.visibility(1), 100.0)
        self.assertEqual(m.visibility(None), 0.0)
        self.assertAlmostEqual(m.visibility(10), 8.87, places=1)

    def test_registrable_folds_subdomains(self):
        self.assertEqual(m.registrable("www.example.com"), "example.com")
        self.assertEqual(m.registrable("blog.example.co.uk"), "example.co.uk")
        self.assertEqual(m.registrable(m.host_of("flowpilot.ai")), "flowpilot.ai")


if __name__ == "__main__":
    unittest.main()
