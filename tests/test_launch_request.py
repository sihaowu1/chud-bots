import unittest

from backend.main import LaunchRequest


class LaunchRequestTests(unittest.TestCase):
    def test_queries_can_be_empty(self):
        request = LaunchRequest(target="https://www.reddit.com", queries=[], count=1)

        self.assertEqual(request.queries, [])

    def test_queries_default_to_empty(self):
        request = LaunchRequest(target="https://www.reddit.com", count=1)

        self.assertEqual(request.queries, [])


if __name__ == "__main__":
    unittest.main()
