# Fighter level 10 and Heroic Warrior

The pinned Fighter table (page 47) grants Proficiency Bonus +4, four Second Wind
uses, and five Weapon Mastery choices at level 10. Extra Attack remains two attacks;
Indomitable remains one use with a Fighter-level bonus of +10. The Champion retains
two distinct Fighting Styles and the Fighter's three earlier ASIs. No level-11
attack increase or level-15 critical threshold is granted early.

Heroic Warrior (page 49) lets the Champion give itself Heroic Inspiration when
starting its turn during combat without already having it. Generated subclass
authoring IR supplies a shared, strictly typed grant definition. The engine and UI
do not switch on Fighter or Champion IDs to implement the grant. Its availability
predicate reads the current stored Inspiration state, with a source-linked trace.

Play → Use a feature offers **Gain Inspiration**, with separate combat and turn-start
confirmations and an explanation link. The atomic proposal validates the declaration,
current availability, missing Inspiration, and absence of incompatible dice, spending,
target, or completed-test payloads. The sole change is `state.heroicInspiration` to
`true`, with source and declared-trigger trace inputs. The normal local-first save,
reload, export, and Undo workflow applies. Confirmations reset after a successful use.

The feature takes no action or Reaction and spends no resource. Incapacitated,
Stunned, Paralyzed, or Unconscious alone do not disable this no-action grant; a dead
character is rejected. Held Inspiration cannot stack or transfer through this
feature. After spending it, another grant requires another declared eligible turn
start, not immediate mid-turn replenishment. There is no encounter-wide turn tracker.

Creation and 9→10 advancement support the extra Weapon Mastery choice while preserving
earlier acquisition records, feats, inventory, currency, HP, conditions, and expended
resources. Increasing Second Wind maximum from three to four does not refresh three
spent uses. Short Rest still restores one use; Long Rest restores all. Heroic Warrior
does not itself grant Inspiration on rests; Human Resourceful remains a separate rule.
Knowing a weapon's mastery does not require ownership, so unowned selected weapon
warnings do not prevent creating or advancing the character.

Combat/turn timing, actual Inspiration rerolls and consumption, mastery target effects,
and other encounter triggers remain manually adjudicated. The feature grants the
existing boolean Inspiration state, not automatic Advantage, a die bonus, extra HP,
or a tracked rechargeable pool. Levels 11–20, remaining classes' level-10 features,
independent review, and the plan's broader gates remain unfinished.

## Verification

`pnpm check` passes 1,025 tests across 66 files, including formatting, lint, and
root/web type checks. The 31 new Fighter/grant cases cover progression preservation,
resource/mastery changes, source traces, timing declarations, held Inspiration,
disabled-action conditions, dead characters, invalid payloads and authored metadata,
rest separation, and use of the shared grant on another class. The origin matrix was
split into per-background cases after repeated five-second timeouts, retaining all
class/species/background combinations, assertions, and the original timeout.

The 137 Python tests, Ruff checks, mypy, and production build pass. Regenerating
Fighter content and coverage produces identical hashes.

A headless Chrome check of the production export verified level-10 creation and
9→10 advancement, the fifth mastery choice, preservation of prior levels and play
state, both trigger confirmations, the Inspiration grant without dice or resource
changes, confirmation reset, Undo, reload persistence, manual spending, and the
page-49 source explanation. Desktop (1280-pixel) and narrow (390-pixel) screenshots
were inspected, with no horizontal overflow or observed JavaScript exceptions.
This focused check does not establish independent semantic approval or complete
browser/accessibility coverage.
