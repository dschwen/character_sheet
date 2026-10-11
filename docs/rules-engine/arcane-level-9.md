# Wizard and Sorcerer level 9

Both class builders and same-class advancement now support level 9. The pinned SRD
progression tables (Wizard page 77; Sorcerer page 65) grant Proficiency Bonus +4,
four/three/three/three/one spell slots at levels 1–5, and fourteen regular prepared
spells. Wizard retains four cantrips; Sorcerer retains five and has nine Sorcery Points.
The implementation extends generated builder metadata and skill counts; it adds no
class-specific frontend branches or duplicate spell-selection algorithms.

## Wizard

Advancing from level 8 adds two normal spellbook spells and one separate Evocation
Savant selection. The source's Savant rule (page 82) applies when a new spell-slot
level becomes available; the existing table-driven choice generator therefore exposes
the level-9 choice with an Evocation/Wizard-list/level-5 ceiling. It is mandatory,
recorded at acquisition, and does not replace either normal addition. Higher-level,
wrong-school, cantrip, and foreign-list selections are rejected.

The level-9 minimum spellbook has 27 leveled spells including Savant grants, plus
four cantrips. Savant additions are not automatically prepared: Wizard preparations
still select fourteen learned leveled spells. Existing preparation controls work
with the expanded pool. Arcane Recovery has a five-level budget and can recover
the newly available fifth-level slot during a Short Rest, spending its normal use.

## Sorcerer

Draconic Sorcery's page-70 table adds Legend Lore and Summon Dragon as always-prepared
fifth-level spells. These bring the automatic subclass total to ten and do not consume
the fourteen ordinary preparation selections. Summon Dragon starts Concentration
through the existing cast transition. Sorcerer preparations remain level-up-only:
two new ordinary selections are added at level 9, with the existing single-spell
replacement allowance. Existing Metamagic choices are preserved, not increased at 9.

## Persistence and limits

Advancement preserves earlier levels, feats, ability allocations, equipment, currency,
current HP, and expended resources/slots. The new slot starts unspent; old spent slots
do not refresh on level up. Casting spends a fifth-level slot atomically, rejects
under-level or exhausted slots, and Long Rest recovery uses the existing engine.

This is progression and casting-resource support, not full automation of every newly
available spell. Summoned creature stat blocks, external targets, costly components,
and display-only spell effects still require manual adjudication. Sorcerer Font of
Magic slot conversion and the broader spell-effect/provenance audit remain unfinished.
Level 10+, multiclass legality, independent semantic review, and rendered browser
verification are not claimed by this slice.
