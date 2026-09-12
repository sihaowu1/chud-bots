import unittest

from backend import personas


class PersonaSelectionTests(unittest.TestCase):
    def test_yusuf_is_first(self):
        self.assertEqual(personas.pick(1)[0].name, "Yusuf")

    def test_selection_order_is_deterministic(self):
        first = [persona.name for persona in personas.pick(8)]
        second = [persona.name for persona in personas.pick(8)]

        self.assertEqual(first, second)
        self.assertEqual(first, personas.names())

    def test_selection_wraps_with_unique_names(self):
        selected = [persona.name for persona in personas.pick(9)]

        self.assertEqual(selected[-1], "Yusuf-2")
        self.assertEqual(len(selected), len(set(selected)))


if __name__ == "__main__":
    unittest.main()
