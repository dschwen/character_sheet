# Paladin level 9

Creation and same-class advancement now reach level 9. The pinned SRD Paladin table
(page 53) grants Proficiency Bonus +4, nine ordinary preparations, and 4/3/2 spell
slots at levels 1–3. Lay On Hands has 45 points; Channel Divinity remains two uses.
Extra Attack stays at two attacks. Devotion adds Beacon of Hope and Dispel Magic
(page 56), giving eight always-prepared class/oath spells outside the ordinary nine.
Aura of Courage, Radiant Strikes, and the third Channel Divinity use are not granted early.

Abjure Foes (page 55) uses one Channel Divinity as a Magic action. Its generated
rule uses shared targeting metadata rather than Paladin-specific UI logic. The engine
resolves the target maximum from current Charisma modifier (minimum one), with a
source-linked calculation. Play → Use a feature displays the target-count input,
60-foot range/sight declaration, and current Paladin spell save DC for the Wisdom save.
Missing or over-limit declarations, unconfirmed eligibility, unexpected dice/spending,
unavailable actions, and exhausted uses cannot spend resources. Malformed counts fail
schema validation. A valid use spends exactly one shared use and returns a source-linked
target declaration plus explicit instructions. It does not change the caster's HP,
conditions, spell slots, or concentration. Incapacitation prevents this Magic action.

Each chosen creature makes its Wisdom save using its own sheet. On failure, set
Frightened on that sheet for one minute or until it takes any damage. While Frightened
this way, it can only move, take an action, or take a Bonus Action on its turn.
Those additional restrictions, target eligibility, saving-throw outcomes, damage, and
expiration are manually adjudicated; there is no target-sheet synchronization or
automatic expiration. This feature requires no Concentration and does not roll a save
using the caster's modifiers.

Channel Divinity is shared with Divine Sense and Sacred Weapon. A Short Rest restores
one spent use; a Long Rest restores all. Ordinary slots only recover on Long Rest.
Advancement preserves earlier acquisition records, feats, choices, equipment, currency,
HP, temporary HP, and expended state. New third-level slots start unspent; advancement
does not refresh earlier pools. Automatic oath spells can be cast without occupying
ordinary preparations; under-level or exhausted casts fail atomically.

Outstanding: the preparation editor still does not enforce the Paladin rule allowing
only one prepared-spell replacement per Long Rest (page 54), as with Ranger. Blessed
Warrior and other Fighting Style choices remain outside the existing reviewed Defense
path. External spell targets, components, and unmodeled effects remain assisted. This
slice does not establish levels 10+, independent semantic approval, or the plan's full
browser/accessibility review gates.

## Verification

`pnpm check` passes 902 tests, including 32 new Paladin/targeting cases. The 132 Python
extraction tests, Ruff, mypy, and `pnpm build` pass. Regenerating Paladin content and
coverage produces identical hashes.

A headless Chrome smoke check against the production export used an isolated temporary
profile and created a level-9 Paladin through the actual builder. It verified that
unconfirmed and excessive targets do not spend uses, valid uses show DC/status guidance,
the second use disables the exhausted action, and spent uses survive reload without
adding Frightened to the caster. The expandable manual guidance opened and closed.
Desktop (1280-pixel) and narrow (390-pixel) screenshots were inspected; the target card,
checkbox, save DC, and Use button fit without horizontal overflow. No JavaScript
exceptions were observed. This is a focused smoke check, not independent rules review,
all-browser coverage, or a complete accessibility audit.
