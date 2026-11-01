# Out-of-SRD edition-reference records

Ritual Caster appears in no SRD edition: the pinned SRD 5.2.1 General Feats section contains only
Ability Score Improvement and Grappler, and the 2016 SRD 5.1 has no feats chapter at all. These
two records therefore have no pinned-source span. They are authored from rules text supplied and
labeled by the project owner, carry an `edition-reference` span instead, and are listed in the
package manifest's `referenceSources` section. See `docs/adr/0013-out-of-source-edition-reference-records.md`.

## Reproduction

```bash
.venv/bin/python -m srd_extract.edition_references \
  --output packages/content-srd-5.2.1/generated
```

There is no PDF extraction step: the module writes deterministic authored records and merges them
into the entity aggregate by ID. Their quote hash covers their own stored rules text. They have no
authoring IR, so they are absent from the review ledger queue by design; their review status is
`AUTHORED` and `extractionApproved` is false.

## Records

| Record id                            | Edition | Rules source of record                |
| ------------------------------------ | ------- | ------------------------------------- |
| `dnd2024.feat.general.ritual-caster` | 2024    | Owner-supplied 2024 PHB rules summary |
| `dnd2014.feat.general.ritual-caster` | 2014    | Owner-supplied 2014 PHB rules summary |

Reference anchors (captured renderings, not licensed text):
<https://www.dndbeyond.com/feats/1789180-ritual-caster> and
<https://www.dndbeyond.com/feats/40-ritual-caster>.

## Engine semantics

Both variants' engine semantics are implemented in `packages/rules-core`. The 2024 variant:
Proficiency-Bonus spell counts with optional growth, level 1 Ritual-tag-only selections, casting
ability tied to the feat's increased ability, and a Quick Ritual free cast recharged by a Long Rest
([Ritual Caster — 2024 PHB variant](../rules-engine/ritual-caster-2024.md)). The 2014 variant: a
chosen class spell list given as class entity ids in `classListOptions`, exactly two level 1 Ritual
spells at acquisition, research capped at half the character's level rounded up, the chosen class's
casting ability, and always-ritual slot-free casting ([Ritual Caster — 2014 PHB
variant](../rules-engine/ritual-caster-2014.md)). Each record's engine behavior is dispatched by its
`ritualCaster.edition` literal, and their calculation traces are qualified by the full feat entity id
so both variants can coexist on one sheet.

## Builder availability

Both records are in the character builder's feat catalog, gated like every other General feat: the
catalog admits an `AUTHORED` feat only when its body parses as a `ritualCaster` definition the
engine dispatches on, and the feat select offers each record only where its stated prerequisites
apply. Each appears under its explicit "2014 PHB variant" / "2024 PHB variant" label, the pickers
state that the record is an out-of-SRD edition reference rather than SRD 5.2.1 content, and the
sheet's spell list attributes each grant with the variant name. The whole selection flow — both
variants through creation and a level up — is gated by `e2e/ritual-caster.spec.ts` in the browser
suite.

## Recorded divergences

The 2014 feat is rendered differently across printings and reprints, including the starting spell
count and how the ritual book grows. The project owner chose the policy recorded here: exactly two
1st-level ritual spells at acquisition, with later research capped at half the character's level,
rounded up. The divergence is recorded in the record's review notes instead of being resolved
silently, because no primary-source text for it is licensed in this repository.
