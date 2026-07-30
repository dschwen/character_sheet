from pathlib import Path

import pytest

from srd_extract.io import parse_page_specification, read_json, write_json


def test_parse_page_specification_sorts_and_deduplicates() -> None:
    assert parse_page_specification("30,28-29,29") == (28, 29, 30)


@pytest.mark.parametrize("value", ["", "0", "3-2", "1,,2"])
def test_parse_page_specification_rejects_invalid_values(value: str) -> None:
    with pytest.raises(ValueError):
        parse_page_specification(value)


def test_write_json_is_deterministic(tmp_path: Path) -> None:
    path = tmp_path / "nested" / "value.json"
    write_json(path, {"z": 1, "a": "Rage"})
    first = path.read_bytes()
    write_json(path, {"a": "Rage", "z": 1})

    assert path.read_bytes() == first
    assert read_json(path) == {"a": "Rage", "z": 1}
