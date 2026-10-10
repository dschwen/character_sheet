"""Resolve class-table feature references, including repeated ASI grants."""

from collections.abc import Iterable, Sequence
from typing import Any


def progression_feature_ids(
    features: Sequence[dict[str, Any]], rows: Iterable[tuple[int, Sequence[str]]]
) -> dict[tuple[int, str], str]:
    result = {(feature["level"], feature["name"]): feature["id"] for feature in features}
    asi = next(
        (feature for feature in features if feature["name"] == "Ability Score Improvement"), None
    )
    if asi is not None:
        for level, names in rows:
            if level >= asi["level"] and "Ability Score Improvement" in names:
                result[(level, "Ability Score Improvement")] = asi["id"]
    return result
