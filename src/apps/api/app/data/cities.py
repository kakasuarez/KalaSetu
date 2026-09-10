"""
Approximate coordinates for placing an artisan pin on the India map.

There is no geocoding provider wired up (that would need an API key and a
network call for a feature that only needs to be roughly right), so this is a
small fixed lookup, matched case-insensitively against the village/district
the coordinator typed. Good enough to spread pins recognisably across the
country for a demo; not meant to be authoritative.
"""
from __future__ import annotations

import hashlib

# name -> (lat, lon). A representative spread across regions, not an
# exhaustive gazetteer -- the point is visual spread on the map, not accuracy.
CITY_COORDS: dict[str, tuple[float, float]] = {
    "delhi": (28.6139, 77.2090),
    "new delhi": (28.6139, 77.2090),
    "mumbai": (19.0760, 72.8777),
    "bengaluru": (12.9716, 77.5946),
    "bangalore": (12.9716, 77.5946),
    "hyderabad": (17.3850, 78.4867),
    "chennai": (13.0827, 80.2707),
    "kolkata": (22.5726, 88.3639),
    "ahmedabad": (23.0225, 72.5714),
    "pune": (18.5204, 73.8567),
    "jaipur": (26.9124, 75.7873),
    "lucknow": (26.8467, 80.9462),
    "kanpur": (26.4499, 80.3319),
    "nagpur": (21.1458, 79.0882),
    "indore": (22.7196, 75.8577),
    "bhopal": (23.2599, 77.4126),
    "patna": (25.5941, 85.1376),
    "varanasi": (25.3176, 82.9739),
    "agra": (27.1767, 78.0081),
    "surat": (21.1702, 72.8311),
    "vadodara": (22.3072, 73.1812),
    "guwahati": (26.1445, 91.7362),
    "bhubaneswar": (20.2961, 85.8245),
    "raipur": (21.2514, 81.6296),
    "ranchi": (23.3441, 85.3096),
    "amritsar": (31.6340, 74.8723),
    "chandigarh": (30.7333, 76.7794),
    "dehradun": (30.3165, 78.0322),
    "shimla": (31.1048, 77.1734),
    "srinagar": (34.0837, 74.7973),
    "jodhpur": (26.2389, 73.0243),
    "udaipur": (24.5854, 73.7125),
    "kochi": (9.9312, 76.2673),
    "thiruvananthapuram": (8.5241, 76.9366),
    "coimbatore": (11.0168, 76.9558),
    "madurai": (9.9252, 78.1198),
    "visakhapatnam": (17.6868, 83.2185),
    "mysuru": (12.2958, 76.6394),
    "mysore": (12.2958, 76.6394),
    "nashik": (19.9975, 73.7898),
    "jamshedpur": (22.8046, 86.2029),
    "imphal": (24.8170, 93.9368),
    "shillong": (25.5788, 91.8933),
    "agartala": (23.8315, 91.2868),
    "itanagar": (27.0844, 93.6053),
    "kohima": (25.6751, 94.1086),
    "gangtok": (27.3389, 88.6065),
    "panaji": (15.4909, 73.8278),
}

# Fallback spread, used when nothing matches: real Indian coordinates chosen
# to land in visually distinct parts of the map rather than piling every
# unmatched artisan on the same point.
_FALLBACK_POOL = list(CITY_COORDS.values())


def coords_for(village: str | None, seed: str) -> tuple[float, float]:
    """
    Best-effort (lat, lon) for a pin.

    Tries an exact-ish match against `village` first (case-insensitive,
    matches if the city name appears in what was typed, since "Village near
    Jaipur" should still land near Jaipur). Falls back to a deterministic pick
    from `_FALLBACK_POOL`, keyed on `seed` (typically the artisan's name) so
    the same artisan always lands in the same place and different unmatched
    artisans still spread out instead of stacking.
    """
    if village:
        needle = village.strip().lower()
        for name, coords in CITY_COORDS.items():
            if name in needle or needle in name:
                return coords

    index = int(hashlib.sha1(seed.encode("utf-8")).hexdigest(), 16) % len(_FALLBACK_POOL)
    return _FALLBACK_POOL[index]
