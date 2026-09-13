import unittest

from backend import personas


class PersonaSelectionTests(unittest.TestCase):
    def test_yusuf_is_first(self):
        self.assertEqual(personas.pick(1)[0].name, "Yusuf")

    def test_selection_order_is_deterministic(self):
        first = [persona.name for persona in personas.pick(15)]
        second = [persona.name for persona in personas.pick(15)]

        self.assertEqual(first, second)
        self.assertEqual(first, personas.names())

    def test_selection_wraps_with_unique_names(self):
        selected = [persona.name for persona in personas.pick(16)]

        self.assertEqual(selected[-1], "Yusuf-2")
        self.assertEqual(len(selected), len(set(selected)))

    def test_generic_personas_follow_the_seven_saved_personas(self):
        selected = [persona.name for persona in personas.pick(15)]

        self.assertEqual(
            selected[:7],
            ["Yusuf", "Cobb", "Arthur", "Ariadne", "Eames", "Saito", "Mal"],
        )
        self.assertEqual(selected[7:], [f"Generic {index}" for index in range(1, 9)])


if __name__ == "__main__":
    unittest.main()
