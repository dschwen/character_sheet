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

## Builder availability

Both records are currently held out of the character builder's feat catalog: the rules engine does
not yet implement either variant's spell-granting semantics, so offering them would present a feat
that cannot grant its spells. They re-enter the builder only as a deliberate later step, with
explicit "2014 PHB variant" / "2024 PHB variant" source labels.

## Recorded divergences

The 2014 feat is rendered differently across printings and reprints, including the starting spell
count and how the ritual book grows. The project owner chose the policy recorded here: exactly two
1st-level ritual spells at acquisition, with later research capped at half the character's level,
rounded up. The divergence is recorded in the record's review notes instead of being resolved
silently, because no primary-source text for it is licensed in this repository.
