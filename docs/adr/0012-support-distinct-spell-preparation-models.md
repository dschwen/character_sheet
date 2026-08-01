# ADR 0012: Support distinct spell preparation models

## Status

Accepted.

## Decision

Spellcasting classes declare a `spellPreparation` model in generated class content. `spellbook`
classes record cantrips and level 1+ spells in `learnedSpellIds`, then prepare a subset. `full-list`
classes record only learned cantrips and prepare level 1+ spells directly from their class list.

Subclass content may declare level-gated `alwaysPreparedSpells`. These spells are added to the
evaluated display and castable set without consuming the class's prepared-spell selections.

The calculation paths, validation codes, slots, attack bonus, save DC, spell summaries, and casting
transitions remain shared across preparation models.

## Consequences

- Wizard spellbook minimums remain reproducible without imposing spellbooks on divine casters.
- Cleric domain spells cannot accidentally consume prepared-spell selections.
- Later prepared, known, and pact casters can extend a content-level discriminator instead of
  duplicating the evaluator.
- The current milestone remains single-class; multiclass spell-slot combination is deferred to the
  dedicated multiclassing milestone.
