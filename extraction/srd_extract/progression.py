"""Resolve class-table feature references, including repeated ASI and Expertise grants."""

from collections.abc import Iterable, Sequence
from typing import Any


def progression_feature_ids(
    features: Sequence[dict[str, Any]], rows: Iterable[tuple[int, Sequence[str]]]
) -> dict[tuple[int, str], str]:
    result = {(feature["level"], feature["name"]): feature["id"] for feature in features}
    repeated = {
        feature["name"]: feature
        for feature in features
        if feature["name"] in {"Ability Score Improvement", "Expertise"}
    }
    for level, names in rows:
        for name in names:
            feature = repeated.get(name)
            if feature is not None and level >= feature["level"]:
                result.setdefault((level, name), feature["id"])
    return result
