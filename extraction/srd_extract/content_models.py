"""Typed records for the first class-content parser."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class CoreClassTraits:
    primary_abilities: tuple[str, ...]
    hit_point_die: int
    saving_throw_proficiencies: tuple[str, ...]
    skill_choice_count: int
    skill_options: tuple[str, ...]
    weapon_proficiencies: tuple[str, ...]
    armor_training: tuple[str, ...]
    starting_equipment_text: str

    def __post_init__(self) -> None:
        if self.hit_point_die not in {6, 8, 10, 12}:
            raise ValueError(f"Unsupported hit-point die: d{self.hit_point_die}")
        if self.skill_choice_count < 1:
            raise ValueError("A class skill choice must grant at least one selection")


@dataclass(frozen=True, slots=True)
class ClassProgressionRow:
    level: int
    proficiency_bonus: int
    feature_names: tuple[str, ...]
    rages: int
    rage_damage: int
    weapon_mastery: int

    def __post_init__(self) -> None:
        if not 1 <= self.level <= 20:
            raise ValueError(f"Class level is outside 1–20: {self.level}")
        expected_bonus = 2 + (self.level - 1) // 4
        if self.proficiency_bonus != expected_bonus:
            raise ValueError(
                f"Level {self.level} has proficiency bonus "
                f"{self.proficiency_bonus}; expected {expected_bonus}"
            )


@dataclass(frozen=True, slots=True)
class ExtractedFeature:
    id: str
    name: str
    level: int
    heading_node_id: str
    body_nodes: tuple[dict[str, Any], ...]
    source_spans: tuple[dict[str, Any], ...]


def typed_record_to_dict(record: Any) -> dict[str, Any]:
    return asdict(record)
