import unittest
from pydantic import ValidationError

from backend.main import LaunchRequest


class LaunchRequestTests(unittest.TestCase):
    def test_all_fifteen_personas_can_be_launched(self):
        request = LaunchRequest(target="https://www.reddit.com", count=15)

        self.assertEqual(request.count, 15)

    def test_more_than_fifteen_personas_are_rejected(self):
        with self.assertRaises(ValidationError):
            LaunchRequest(target="https://www.reddit.com", count=16)

    def test_queries_can_be_empty(self):
        request = LaunchRequest(target="https://www.reddit.com", queries=[], count=1)

        self.assertEqual(request.queries, [])

    def test_queries_default_to_empty(self):
        request = LaunchRequest(target="https://www.reddit.com", count=1)

        self.assertEqual(request.queries, [])


if __name__ == "__main__":
    unittest.main()
