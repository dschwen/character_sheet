# Ritual Caster — 2024 PHB variant engine semantics

The 2024 Ritual Caster is evaluated from its out-of-SRD edition-reference record
`dnd2024.feat.general.ritual-caster` (see `docs/adr/0013-out-of-source-edition-reference-records.md`
and [Out-of-SRD edition-reference records](../extraction/edition-references.md)). It is not SRD
content and is never presented as such. Acquisition rides the existing General-feat machinery: a
recorded entry in `build.levels[].featSelections` at a level where the feat is available, the feat's
own +1 recorded in the aggregate, and the shared `FEAT_*` validations. The spell selection is a
single record in `build.choices` under choice id `<featId>.choice.ritual-spells`; a second record
for the same choice is rejected with `DUPLICATE_RITUAL_CASTER_CHOICE`.

## Spell count

At acquisition the number of chosen spells equals the character's Proficiency Bonus. The source text
grants additions as Proficiency Bonus increases ("you can add one additional spell"), so the engine
bounds the selection between the Proficiency Bonus at the recorded acquisition level and the current
Proficiency Bonus; it never grows the selection automatically. A selection outside that range, or a
list with duplicates, is `RITUAL_CASTER_SPELL_COUNT_INVALID`.

Only level 1 spells carrying the Ritual tag are grantable, from any class's spell list — the 2024
feat has no class restriction. Anything else is `RITUAL_CASTER_SPELL_INVALID`, and the rejected
spell is not granted. Granted spells are always prepared, and their casting options carry a
`freeCastResourceId` pointing at the Quick Ritual resource.

## Casting ability

The 2024 text makes the increased ability the spells' spellcasting ability. The engine requires the
feat's recorded selection to contain exactly one +1 to Intelligence, Wisdom, or Charisma; any other
shape — zero increases, two abilities, +2, or an ability outside the feat's own allowed set — is
`RITUAL_CASTER_CASTING_ABILITY_TIE_INVALID`, and the feat grants nothing until the tie is well
formed. The tied ability feeds the shared spellcasting traces and every granted spell's casting
option. Because both Ritual Caster records share the feat slug `general.ritual-caster`, the trace
ids are qualified by the full feat entity id — `spellcasting.dnd2024.feat.general.ritual-caster.attackBonus`
and `.saveDifficultyClass` — so a sheet carrying both variants keeps the two feats' spellcasting
distinct (see [Ritual Caster — 2014 PHB variant](ritual-caster-2014.md)).

## Quick Ritual

Quick Ritual is one free cast of a Ritual spell without preparing it, modelled as the resource
`<featId>.free-cast` with maximum 1 and a full Long Rest recharge — the same resource shape and the
same `request.useFreeCast` spell-transition consumption as Magic Initiate's free cast. Using it
expends the resource; the granted spells' `freeCastAvailable` flag follows the remaining uses.

## Provenance

The feat's traces and casting options cite its edition-reference span honestly: `sourceId phb-2024`
with the record's own quote hash and no page, because no pinned SRD page contains it. The spells it
grants are real SRD 5.2.1 entities and keep their pinned sources — the feat's provenance never
relabels them.

## Feat prerequisite schema note

Because 2014-era feats can have ability-only prerequisites, `featBodySchema`'s prerequisite block now
treats `minimumCharacterLevel` as optional; an absent level floor means no level gate (compared as
zero in `FEAT_LEVEL_PREREQUISITE` and `FEAT_ACQUISITION_PREREQUISITE`, and in the builder's level
gate). This is what makes the 2014-style record expressible without inventing a level requirement
its source text does not state.

## Not yet implemented

The 2014 variant's engine semantics are implemented alongside this one — see
[Ritual Caster — 2014 PHB variant](ritual-caster-2014.md). Both variants remain held out of the
builder catalog — see [Out-of-SRD edition-reference records](../extraction/edition-references.md) —
until they are re-admitted with explicit "2014 PHB variant" / "2024 PHB variant" labels and a
browser-verified selection flow.
