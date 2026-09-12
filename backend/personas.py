"""Who is dreaming. Each persona is a small behavioural profile for one agent."""

import random
from dataclasses import dataclass, field, replace

# How long a visitor lingers at each dream level (seconds).
DWELL_SERP = (2.0, 5.0)
DWELL_LANDING = (8.0, 20.0)
DWELL_DEEP = (6.0, 15.0)


@dataclass
class Persona:
    name: str
    mobile: bool
    typing_delay_ms: tuple[int, int]  # per-keystroke range
    max_depth: int  # how many internal links to follow after landing
    scroll_passes: tuple[int, int]
    traits: list[str] = field(default_factory=list)


_POOL = [
    # Yusuf is first temporarily so login runs exercise his saved credentials during testing.
    Persona("Yusuf", False, (80, 180), 2, (3, 6), ["desktop", "curious"]),
    Persona("Cobb", False, (60, 140), 3, (3, 6), ["thorough", "desktop"]),
    Persona("Arthur", False, (40, 90), 2, (2, 4), ["fast typist", "desktop"]),
    Persona("Ariadne", False, (90, 200), 3, (4, 8), ["desktop", "scroller"]),
    Persona("Eames", False, (70, 160), 1, (2, 3), ["skimmer", "desktop"]),
    Persona("Saito", False, (110, 220), 2, (3, 5), ["deliberate", "desktop"]),
    Persona("Mal", False, (50, 120), 4, (4, 7), ["deep diver", "desktop"]),
    Persona("Fischer", False, (100, 210), 1, (2, 4), ["desktop", "skimmer"]),
]


def pick(n: int) -> list[Persona]:
    out = []
    for i in range(n):
        p = _POOL[i % len(_POOL)]
        out.append(p if i < len(_POOL) else replace(p, name=f"{p.name}-{i // len(_POOL) + 1}"))
    return out


def names() -> list[str]:
    """Stable persona names available to the campaign coordinator."""
    return [persona.name for persona in _POOL]


def dwell(rng: tuple[float, float]) -> float:
    return random.uniform(*rng)
