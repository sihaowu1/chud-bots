import tempfile
import unittest
from pathlib import Path

from analytics import db


class TempDbTestCase(unittest.TestCase):
    """A fresh sqlite file per test, so aggregation numbers are exact."""

    def setUp(self):
        db.close()
        self._tmp = tempfile.TemporaryDirectory()
        db.connect(Path(self._tmp.name) / "test.db")
        self.addCleanup(self._tmp.cleanup)
        self.addCleanup(db.close)
