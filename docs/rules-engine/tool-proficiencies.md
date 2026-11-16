# Source-driven tool proficiencies

The pinned SRD 5.2.1 tools section (pages 93–94) supplies 37 individual proficiencies:
17 artisan's tools, six other tools, four gaming sets and ten musical instruments. Each gaming
set and instrument variant is a separate proficiency; neither generic parent is offered as one.
`srd_extract.tools` reads normalized source nodes, retains block/page/hash provenance (including
Smith's Tools spanning pages 93–94), and emits a source-linked proficiency rule. Semantic and test
review approval remains separate from automated tests.

Shared tool-body and choice schemas drive the catalog, engine and pickers. Bard's three musical
instruments, Monk's one artisan tool/instrument, and Soldier's gaming set are metadata-driven
choices. Acolyte, Criminal, Sage and Rogue retain their fixed grants. Choosing proficiency does
not grant ownership, equipment or inventory items.

Skilled permits any combination of three distinct skills and tools, both as an original Origin
grant and at an unrestricted feat acquisition. Original choices are stored as
`build.toolProficiencyChoices: [{sourceId, toolIds}]`; acquisition records retain their own
`skillIds` and optional `toolIds`. The shared count never becomes three skills _plus_ three tools.
Unknown tools, wrong categories, invalid sources, duplicate source records, duplicate chosen
proficiencies and over-budget selections are rejected. Fixed duplicate grants do not stack the
Proficiency Bonus and retain their separate sources. Repeatable Skilled preserves acquisition
boundaries, and earlier skill/tool choices are locked on advancement.

Tool checks use stable catalog check IDs, add Proficiency Bonus once, inherit existing tool-check
effects such as Reliable Talent, and expose all six ability choices for the DM's ruling. Traces
include the granting source, tool description and page-93 proficiency rule. Tool ownership,
skill/tool overlap Advantage, Utilize DC adjudication and crafting remain manual. The UI labels
these boundaries instead of claiming automatic target or equipment validation.

The new original-choice field is optional for backward compatibility. Older saves with no records
stay unrecorded through advancement; fixed grants still work and missing choices are never guessed.
The sheet explicitly identifies that legacy state. In Overview → Skills & tools, **Record missing
tool choices** opens an explicit editor with empty selections. Apply records only the missing
original choices; Cancel (or Escape) changes nothing. Existing skills, fixed grants and later feat
acquisitions remain locked, and Play → Undo last state change restores the previous document.
This editor works independently of advancement, including at the supported level cap. Ambiguous
or incomplete feat acquisition histories require repair before original tools can be recorded;
the editor never invents acquisition records. New characters receive editable builder defaults.

Unit tests cover catalog variants, 0–3 tool combinations, class/background pools, invalid imported
records, repeatable acquisitions, legacy compatibility, round trips and history/state preservation.
Production browser tests cover Bard/Monk/Soldier choices, mixed and all-tool original Skilled,
new Skilled at level 4, source explanations, reload and advancement at desktop and narrow widths.
Legacy-editor tests additionally cover empty initial choices, cancellation, explicit confirmation,
fixed and acquired exclusions, preserved skills/history/play state, level-cap edits, reload and Undo.

```sh
PYTHONPATH=extraction .venv/bin/python -m srd_extract.pipeline \
  --source sources/wotc-srd-5.2.1-en/8974902d109d6e63672d7c490bde9ccf052410503d9cfa768237154fbc5e3d87/source.pdf \
  --out generated/extraction/srd-5.2.1-tools --pages 93-94
PYTHONPATH=extraction .venv/bin/python -m srd_extract.tools \
  --extraction generated/extraction/srd-5.2.1-tools --output packages/content-srd-5.2.1/generated
PYTHONPATH=extraction .venv/bin/python -m srd_extract.coverage \
  --output packages/content-srd-5.2.1/generated --markdown docs/coverage/README.md
```
