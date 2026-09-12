"""Search-rank scoring. Pure functions, no I/O."""

from urllib.parse import urlparse

# Organic CTR by position: table for page one, power-law tail past it.
_CTR = {1: 0.282, 2: 0.157, 3: 0.110, 4: 0.080, 5: 0.061, 6: 0.048, 7: 0.040, 8: 0.033, 9: 0.028, 10: 0.025}
_TAIL_EXPONENT = 1.6  # steeper than page one: encodes the page-two cliff
MAX_POSITION = 100


def ctr(position: int | None) -> float:
    if position is None or position < 1 or position > MAX_POSITION:
        return 0.0
    if position <= 10:
        return _CTR[position]
    return _CTR[10] * (10.0 / position) ** _TAIL_EXPONENT


def visibility(position: int | None) -> float:
    """0-100. Position 1 is 100, position 3 is ~39, position 10 is ~8.9, unranked is 0.
    Moving 11->1 counts far more than 60->50, which a linear 1/position would hide."""
    return 100.0 * ctr(position) / _CTR[1]


def registrable(host: str) -> str:
    """Approximate eTLD+1: last two labels plus a short list of two-part suffixes.
    Folds www./blog. into one domain; not a real public-suffix list."""
    host = (host or "").lower().strip(".")
    if host.startswith("www."):
        host = host[4:]
    parts = host.split(".")
    if len(parts) <= 2:
        return host
    two_part = {"co.uk", "org.uk", "ac.uk", "co.jp", "com.au", "co.nz", "com.br", "co.za", "com.mx"}
    if ".".join(parts[-2:]) in two_part:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:])


def host_of(url: str) -> str:
    return urlparse(url if "://" in url else f"https://{url}").hostname or url
