"""Out-of-SRD edition-reference records follow the provenance rules in ADR 0013."""

from __future__ import annotations

import hashlib
from typing import Any

from srd_extract.edition_references import (
    RITUAL_2014_ID,
    RITUAL_2024_ID,
    generate_reference_records,
    merge_reference_records,
)


def records_by_id() -> dict[str, dict[str, Any]]:
    return {record["id"]: record for record in generate_reference_records()}


def joined_text(record: dict[str, Any]) -> str:
    return "\n".join(node["text"] for node in record["body"]["text"]["nodes"])


def test_both_variants_are_authored_feats_outside_the_srd() -> None:
    records = records_by_id()
    assert sorted(records) == sorted([RITUAL_2014_ID, RITUAL_2024_ID])
    for record in records.values():
        assert record["kind"] == "feat"
        assert record["body"]["category"] == "general"
        assert record["body"]["repeatable"] is False
        assert "out-of-srd" in record["tags"]
        assert "edition-reference" in record["tags"]
        review = record["review"]
        assert review["status"] == "AUTHORED"
        assert review["extractionApproved"] is False
        assert review["semanticsApproved"] is False
        assert review["testsApproved"] is False


def test_spans_are_edition_references_with_no_pinned_source_fields() -> None:
    for record in generate_reference_records():
        assert len(record["source"]) == 1
        span = record["source"][0]
        assert span["kind"] == "edition-reference"
        assert span["book"] == "Player's Handbook"
        assert span["referenceUrl"].startswith("https://")
        assert span["note"]
        assert "page" not in span
        assert "blocks" not in span
        expected = hashlib.sha256(joined_text(record).encode("utf-8")).hexdigest()
        assert span["quoteHash"] == expected


def test_editions_and_reference_urls_are_not_swapped() -> None:
    records = records_by_id()
    assert records[RITUAL_2024_ID]["source"][0]["edition"] == "2024"
    assert records[RITUAL_2024_ID]["source"][0]["sourceId"] == "phb-2024"
    assert "1789180" in records[RITUAL_2024_ID]["source"][0]["referenceUrl"]
    assert records[RITUAL_2014_ID]["source"][0]["edition"] == "2014"
    assert records[RITUAL_2014_ID]["source"][0]["sourceId"] == "phb-2014"
    assert records[RITUAL_2014_ID]["source"][0]["referenceUrl"].endswith("/40-ritual-caster")


def test_2024_variant_grants_a_half_feat_and_bounded_proficiency_bonus_rituals() -> None:
    record = records_by_id()[RITUAL_2024_ID]
    body = record["body"]
    assert body["prerequisite"]["minimumCharacterLevel"] == 4
    assert {entry["ability"] for entry in body["prerequisite"]["anyAbilityScoreMinimums"]} == {
        "intelligence",
        "wisdom",
        "charisma",
    }
    assert all(entry["minimum"] == 13 for entry in body["prerequisite"]["anyAbilityScoreMinimums"])
    assert body["abilityScoreIncreaseAbilities"] == ["intelligence", "wisdom", "charisma"]
    assert body["abilityScoreIncreasePatterns"] == [[1]]
    assert body["maximumAbilityScore"] == 20
    ritual = body["ritualCaster"]
    assert ritual["spellCountSource"] == "proficiency-bonus"
    assert ritual["maximumSpellLevel"] == 1
    assert ritual["spellListSource"] == "all"
    assert ritual["castingAbilitySource"] == "feat-increased-ability"
    assert ritual["growsWithProficiencyBonus"] is True
    assert ritual["quickRitualRecharge"] == "long-rest"


def test_2014_variant_takes_no_ability_bonus_and_books_two_rituals() -> None:
    record = records_by_id()[RITUAL_2014_ID]
    body = record["body"]
    assert "minimumCharacterLevel" not in body["prerequisite"]
    assert {entry["ability"] for entry in body["prerequisite"]["anyAbilityScoreMinimums"]} == {
        "intelligence",
        "wisdom",
    }
    assert body["abilityScoreIncreaseAbilities"] == []
    assert body["abilityScoreIncreasePatterns"] == []
    ritual = body["ritualCaster"]
    assert ritual["initialSpellCount"] == 2
    assert ritual["maximumInitialSpellLevel"] == 1
    assert ritual["researchSpellLevelCap"] == "half-character-level-rounded-up"
    assert ritual["classListOptions"] == [
        "bard",
        "cleric",
        "druid",
        "sorcerer",
        "warlock",
        "wizard",
    ]
    assert ritual["spellListSource"] == "chosen-class-list"
    assert ritual["castingAbilitySource"] == "chosen-class-list"
    assert ritual["growsWithProficiencyBonus"] is False
    assert ritual["quickRitualRecharge"] is None


def test_variant_texts_do_not_bleed_across_editions() -> None:
    records = records_by_id()
    text_2024 = joined_text(records[RITUAL_2024_ID])
    text_2014 = joined_text(records[RITUAL_2014_ID])
    assert "Ritual tag" in text_2024
    assert "Proficiency Bonus" in text_2024
    assert "Quick Ritual" in text_2024
    assert "ritual book" not in text_2024
    assert "two level 1 spells" in text_2014
    assert "half your character level" in text_2014
    assert "Proficiency Bonus" not in text_2014
    assert "Quick Ritual" not in text_2014


def test_merging_into_an_entity_list_is_idempotent_and_preserves_foreign_entities() -> None:
    records = generate_reference_records()
    foreign = [{"id": "srd521.feat.general.grappler", "kind": "feat"}, {"id": "other", "kind": "x"}]
    once = merge_reference_records(foreign, records)
    twice = merge_reference_records(once, records)
    assert once == twice
    ids = [entity["id"] for entity in once]
    assert ids == ["srd521.feat.general.grappler", "other", RITUAL_2024_ID, RITUAL_2014_ID]
