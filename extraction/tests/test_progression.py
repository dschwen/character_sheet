from typing import Any

from srd_extract.progression import progression_feature_ids


def test_repeated_asi_rows_resolve_to_original_source_feature() -> None:
    features: list[dict[str, Any]] = [
        {"id": "source.asi", "level": 4, "name": "Ability Score Improvement"},
        {"id": "source.other", "level": 2, "name": "Other"},
    ]
    rows = [(4, ["Ability Score Improvement"]), (8, ["Ability Score Improvement"]), (9, ["Other"])]
    result = progression_feature_ids(features, rows)
    assert result[(4, "Ability Score Improvement")] == "source.asi"
    assert result[(8, "Ability Score Improvement")] == "source.asi"
    assert (9, "Other") not in result
    assert result[(2, "Other")] == "source.other"


def test_does_not_invent_asi_without_an_extracted_feature_or_before_its_level() -> None:
    assert progression_feature_ids([], [(8, ["Ability Score Improvement"])]) == {}
    result = progression_feature_ids(
        [{"id": "source.asi", "level": 4, "name": "Ability Score Improvement"}],
        [(2, ["Ability Score Improvement"])],
    )
    assert (2, "Ability Score Improvement") not in result
