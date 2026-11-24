"""Add source-linked statuses to representative SRD spells."""

from __future__ import annotations

import argparse
from copy import deepcopy
from pathlib import Path
from typing import Any

from srd_extract.coverage import coverage_report
from srd_extract.io import read_json, write_json

HASTE_LETHARGY_ID = "srd521.status.spell.haste-lethargy"

SPELL_STATUS_NAMES = {
    "srd521.spell.aid": "Aided",
    "srd521.spell.barkskin": "Barkskin",
    "srd521.spell.bless": "Blessed",
    "srd521.spell.death-ward": "Death Ward",
    "srd521.spell.dragon-s-breath": "Dragon’s Breath",
    "srd521.spell.enhance-ability": "Enhance Ability",
    "srd521.spell.feather-fall": "Feather Falling",
    "srd521.spell.fly": "Flying",
    "srd521.spell.guidance": "Guided",
    "srd521.spell.haste": "Hasted",
    "srd521.spell.heroism": "Heroism",
    "srd521.spell.longstrider": "Longstrider",
    "srd521.spell.mage-armor": "Mage Armor",
    "srd521.spell.pass-without-trace": "Pass without Trace",
    "srd521.spell.protection-from-energy": "Protection from Energy",
    "srd521.spell.protection-from-evil-and-good": "Protection from Evil and Good",
    "srd521.spell.shield-of-faith": "Shield of Faith",
    "srd521.spell.warding-bond": "Warding Bond",
    "srd521.spell.water-breathing": "Water Breathing",
    "srd521.spell.water-walk": "Water Walking",
}

SPELL_STATUS_MECHANICS: dict[str, dict[str, Any]] = {
    "srd521.spell.aid": {
        "hitPointBonus": {
            "base": 5,
            "minimumSelection": 2,
            "maximumSelection": 9,
            "perSelectedLevel": 5,
        }
    },
    "srd521.spell.barkskin": {"armorClassMinimum": 17},
    "srd521.spell.bless": {
        "d20BonusDice": [
            {"scope": "attack-rolls", "diceCount": 1, "diceSize": 4},
            {"scope": "saving-throw", "diceCount": 1, "diceSize": 4},
        ]
    },
    "srd521.spell.death-ward": {"preventsDropToZero": True},
    "srd521.spell.dragon-s-breath": {
        "grantedAction": {
            "id": "srd521.action.status.dragon-s-breath",
            "name": "Dragon’s Breath",
            "actionEconomy": "magic-action",
            "area": "15-foot Cone",
            "savingThrowAbility": "dexterity",
            "difficultyClassParameter": "saveDifficultyClass",
            "damage": {
                "diceCount": 3,
                "diceSize": 6,
                "minimumSlotLevel": 2,
                "maximumSlotLevel": 9,
                "dicePerSlotLevel": 1,
                "types": ["acid", "cold", "fire", "lightning", "poison"],
            },
        }
    },
    "srd521.spell.enhance-ability": {
        "abilityCheckAdvantageChoices": [
            "strength",
            "dexterity",
            "intelligence",
            "wisdom",
            "charisma",
        ],
    },
    "srd521.spell.feather-fall": {
        "factGrants": {
            "fall.descentRateFeetPerRound": 60,
            "fall.damagePreventedOnLanding": True,
        },
        "assistedInstructions": [
            "Descent is limited to 60 feet per round.",
            "Take no falling damage when landing.",
            "End this status when the creature lands.",
        ],
    },
    "srd521.spell.fly": {
        "speedOverrides": {"speed.fly": 60},
        "assistedInstructions": [
            "You can hover while flying.",
            "When this status ends, resolve any fall if the creature is still aloft.",
        ],
    },
    "srd521.spell.haste": {
        "speedMultiplier": 2,
        "armorClassBonus": 2,
        "onEndStatusId": HASTE_LETHARGY_ID,
        "assistedInstructions": [
            "On each of your turns, you can take one extra action to Attack (one attack only), "
            "Dash, Disengage, Hide, or Utilize."
        ],
        "d20RollEffects": [{"scope": "saving-throw", "ability": "dexterity", "kind": "advantage"}],
    },
    "srd521.spell.guidance": {
        "d20BonusDice": [
            {
                "scope": "ability-checks",
                "diceCount": 1,
                "diceSize": 4,
                "selection": "skill",
            }
        ]
    },
    "srd521.spell.heroism": {
        "conditionImmunities": ["srd521.condition.frightened"],
        "turnStartTemporaryHitPoints": {
            "selectionLabel": "Caster spellcasting modifier",
            "minimum": 0,
            "maximum": 10,
        },
    },
    "srd521.spell.longstrider": {"speedBonus": 10},
    "srd521.spell.mage-armor": {
        "armorClassCandidate": {
            "base": 13,
            "ability": "dexterity",
            "requiresUnarmored": True,
        }
    },
    "srd521.spell.pass-without-trace": {
        "d20Modifiers": [{"target": "skill.stealth", "bonus": 10}],
        "factGrants": {"stealth.leavesNoTracks": True},
    },
    "srd521.spell.protection-from-energy": {
        "damageResistanceChoices": ["acid", "cold", "fire", "lightning", "thunder"]
    },
    "srd521.spell.protection-from-evil-and-good": {
        "situationalProtection": {
            "creatureTypes": [
                "aberration",
                "celestial",
                "elemental",
                "fey",
                "fiend",
                "undead",
            ],
            "incomingAttackRollEffect": "disadvantage",
            "blockedConditions": ["charmed", "frightened", "possessed"],
            "existingEffectSavingThrowRollEffect": "advantage",
        }
    },
    "srd521.spell.shield-of-faith": {"armorClassBonus": 2},
    "srd521.spell.warding-bond": {
        "armorClassBonus": 1,
        "savingThrowBonus": 1,
        "sharesIncomingDamage": True,
        "damageResistances": [
            "acid",
            "bludgeoning",
            "cold",
            "fire",
            "force",
            "lightning",
            "necrotic",
            "piercing",
            "poison",
            "psychic",
            "radiant",
            "slashing",
            "thunder",
        ],
        "assistedInstructions": [
            "Apply the damage this recipient takes to the caster’s sheet as well.",
            "End the bond if the caster drops to 0 HP, the pair move more than 60 feet apart, "
            "or the spell is cast again on either creature.",
        ],
    },
    "srd521.spell.water-breathing": {
        "factGrants": {
            "respiration.underwater": True,
            "respiration.normalRetained": True,
        },
        "assistedInstructions": [
            "The creature can breathe underwater and retains its normal respiration.",
            "End this status after 24 hours.",
        ],
    },
    "srd521.spell.water-walk": {
        "factGrants": {"movement.walkOnLiquids": True},
        "assistedInstructions": [
            "Walk on liquid surfaces for 1 hour. Lava can still deal heat damage.",
            "Use a Bonus Action to move between the surface and the liquid. Falling into "
            "the liquid passes through the surface.",
        ],
    },
}


def _status_id(spell_id: str) -> str:
    return f"srd521.status.spell.{spell_id.removeprefix('srd521.spell.')}"


def annotate_spell_statuses(
    source_entities: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    status_ids = {_status_id(spell_id) for spell_id in SPELL_STATUS_NAMES} | {HASTE_LETHARGY_ID}
    entities = [deepcopy(entity) for entity in source_entities if entity["id"] not in status_ids]
    by_id = {entity["id"]: entity for entity in entities}
    missing = sorted(set(SPELL_STATUS_NAMES) - set(by_id))
    if missing:
        raise ValueError(f"Beneficial-status spells are missing: {missing!r}")

    statuses: list[dict[str, Any]] = []
    for spell_id, status_name in SPELL_STATUS_NAMES.items():
        spell = by_id[spell_id]
        if spell["kind"] != "spell":
            raise ValueError(f"{spell_id} is not a spell")
        status_id = _status_id(spell_id)
        spell["body"]["appliedStatuses"] = [
            {"statusId": status_id, "statusName": status_name, "target": "target"}
        ]
        statuses.append(
            {
                "id": status_id,
                "kind": "status",
                "name": {"en": status_name},
                "tags": ["status", "beneficial", "spell"],
                "source": deepcopy(spell["source"]),
                "body": {
                    "description": spell["body"]["description"],
                    "duration": spell["body"]["duration"],
                    "concentration": spell["body"]["concentration"],
                    "sourceSpellId": spell_id,
                    **deepcopy(SPELL_STATUS_MECHANICS.get(spell_id, {})),
                },
                "rules": [],
                "review": {
                    "status": "STRUCTURED",
                    "extractionApproved": True,
                    "semanticsApproved": False,
                    "testsApproved": False,
                    "notes": f"Beneficial target status derived from {spell['name']['en']}.",
                },
            }
        )
    haste = next(status for status in statuses if status["id"] == _status_id("srd521.spell.haste"))
    statuses.append(
        {
            **deepcopy(haste),
            "id": HASTE_LETHARGY_ID,
            "name": {"en": "Haste lethargy"},
            "tags": ["status", "spell", "follow-up"],
            "review": {**haste["review"], "notes": "Lethargy after Haste ends."},
            "body": {
                "description": "Incapacitated with Speed 0 until the end of your next turn.",
                "duration": "Until the end of your next turn",
                "concentration": False,
                "grantsConditions": ["srd521.condition.incapacitated"],
                "breaksConcentration": True,
                "speedMaximum": 0,
                "endsOnRest": True,
                "assistedInstructions": ["End Haste lethargy at the end of your next turn."],
            },
        }
    )
    by_id.update({status["id"]: status for status in statuses})
    original_ids = {entity["id"] for entity in source_entities}
    return [
        *(by_id[entity["id"]] for entity in source_entities),
        *(status for status in statuses if status["id"] not in original_ids),
    ], statuses


def generate_spell_status_content(output: Path) -> list[dict[str, Any]]:
    entities, statuses = annotate_spell_statuses(read_json(output / "entities.json"))
    write_json(output / "entities" / "spell-statuses.json", statuses)
    write_json(output / "entities.json", entities)
    authoring_ir = [read_json(path) for path in sorted((output / "authoring-ir").glob("*.json"))]
    write_json(output / "coverage.json", coverage_report(entities, authoring_ir))
    return statuses


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    statuses = generate_spell_status_content(args.output)
    print(f"Generated {len(statuses)} spell statuses")


if __name__ == "__main__":
    main()
