# Browser verification harness

The web app is tested against the real production artifact: `next build` exports the static site
to `out/`, `apps/web/scripts/serve-out.mjs` serves that export, and Playwright drives it in
Chromium at two viewports (`desktop` 1280×720 and `narrow` 390×844). This is the rendered-behavior
gate that engine tests and type checks deliberately do not cover.

## Running it

```sh
pnpm build      # every workspace package first: the web export resolves
                # @dnd/* through each package's built dist, so a stale dist
                # silently tests stale engine code
pnpm test:e2e   # root alias for pnpm --filter @dnd/web test:e2e
```

`playwright.config.ts` starts the static server automatically and reuses a local one while
not in CI. The CI `browser` job installs Chromium with system dependencies, builds, and runs the
same suite.

## What the suite verifies

`magic-items.spec.ts` exercises loot, equipping, attunement, reload, removal, and Undo. It checks
the three-item attunement limit, same-item duplicates, cloak swapping, and the displayed effects
from attuned protection, falling, and swimming items. The Ring of Swimming works while equipped
without attunement.
The item-power checks cast Water Walk from the equipped ring without spending a spell slot
and verify the resulting effect through reload and Undo. They spend charges from one wand
copy, recharge it at a declared dawn, and undo the recharge. Rules tests cover the charge cap
and both outcomes of the last-charge destruction roll.
The Boots of Speed check covers attunement-gated activation, elapsed rounds, reload,
deactivation on unequip and ending attunement, and Long Rest recharge with Undo.
The Ring of Evasion check resolves a declared failed Dexterity save with and without damage.
It checks attunement, other ability and successful-save exclusion, atomic Undo, and dawn recharge.
The healing potion check buys the common potion, rolls and applies capped healing while using
one dose, and undoes both changes. It also reloads the remaining dose and administers it to
another creature. Rules tests cover the three higher-rarity formulas and invalid rolls.
`familiars-and-focuses.spec.ts` checks that an equipped Arcane Focus covers Hex's material
component and Find Familiar still lists its consumed incense. It verifies the Imp's SRD HP,
AC, speed, senses, and Sting. It exercises the Pact free cast with and without a tracked
incense dose, atomic Undo of the tracked cast, dismiss and recall across reload, and
disappearing at 0 HP. It also verifies that
drinking a Potion of Invulnerability uses one dose and enables all-damage resistance.
`spell-components.spec.ts` checks that Revivify spends a tracked diamond and its spell
slot together, Undo restores both, and turning off tracking in Settings persists across
reload. It also checks that Identify can use a tracked pearl in a ritual and keep the pearl.

`scholar-and-land.spec.ts` checks Scholar Expertise from Skilled, source inspection,
reload/advancement preservation and invalid-import diagnostics. It also checks Circle of the Land
draft-only choices, Short Rest exclusion, Long Rest application, Undo, updated spell pools,
reload/advancement and explicit preparation-conflict repair. Both viewports run these flows.

`healing-flow.spec.ts` checks Second Wind's authored d10 + level, actual capped HP restoration,
one resource spend per use, retained roll feedback, unavailable/exhausted actions, Undo and reload.
It also checks invalid/over-budget Lay on Hands spending and Cure Wounds' slot confirmation,
Life Cleric healing dice/modifier, explicit manual healing, and preservation of the cast when that
manual healing is undone. The Second Wind test uses the real fullscreen d10 with the render guard
enabled; inward collision faces are not accepted as expected console errors.

`spell-effects.spec.ts` casts Bless and Shield of Faith and verifies the named target-status
instruction, slot cost, concentration replacement, removal of stale confirmation on Undo, and
reload. A separate recipient fixture is then explicitly toggled: Blessed adds its d4 to a rendered
saving throw; Shield of Faith adds and removes 2 AC. Recipient changes support Undo and reload;
casting does not silently apply statuses or modify another character.
Mage Armor changes the unarmored Fighter’s AC from 12 to 15, persists on reload, and ends when
armor is equipped. Undo restores both the previous loadout and the active effect. Taking the
armor off after the spell ends restores normal unarmored AC.
The suite also checks Haste and Fly together, Haste lethargy through reload and Undo, Aid’s slot
scaling on both HP values, and Guidance’s selected-skill roll and concentration cleanup. It
exercises Longstrider, Pass without Trace, Heroism, and the recipient instructions for Feather Fall,
Water Breathing, and Protection from Evil and Good. The recipient marks when a spell ends and
clears Haste lethargy at the end of their next turn.
The recipient flow also checks Barkskin’s AC floor, Enhance Ability’s saved choice and Passive Perception,
and Protection from Energy’s saved damage type. Fire resistance rounds down after any saving
throw adjustment, and the damage form clears its resistance selection after applying the hit.
Warding Bond adds to AC and reports the damage to apply on the caster’s sheet. Death Ward
consumes itself when damage would drop the recipient to zero. Undo restores HP and the ward,
and the recipient can spend the ward manually against a non-damaging instant-death effect.

`spell-preparation.spec.ts` verifies Wizard spellbook-only choices, count bounds, incomplete-save
blocking, Cancel, Save, Undo, casting eligibility and reload without changing build or play state.
Cleric coverage checks full-list choices, always-prepared spells excluded from the budget, and exclusion of unlisted or
too-high-level choices. Bard and Sorcerer cannot use daily preparation to bypass level-up-only
replacement rules. All three new specs run at both configured viewports; they are representative
checks, not a complete spell, feature, or level-1–5 semantic audit.

The vendored geometry unit test separately checks all six die types at three scales for closed
edges, outward triangles, convexity and the expected number of labeled faces. The d10 has ten
coplanar kite faces (twenty triangles), rather than an open set of ten triangles.

`legacy-tool-choices.spec.ts` checks empty initial selections, Cancel/Escape without mutation,
explicit Apply, Undo, reload persistence and source-specific tool pools for old saves. Bard and
Monk are tested at their metadata-defined level caps; missing feat histories block confirmation
without inventing grants. These checks run at both configured viewports.

`grappler.spec.ts` checks acquiring Grappler and declaring its Combat benefits: Fighter fixed
damage/save feedback, Monk critical dice and Dexterity DC traces, oversized targets, size-aware
movement guidance, Wizard spell-attack cancellation under Poisoned, unchanged saved state and
discarding late roll results after a character switch. It runs at both configured viewports.

`tool-proficiencies.spec.ts` checks the Bard/Monk category pools, Soldier's specific gaming-set
choice, mixed/all-tool original Skilled, level-4 Skilled with mixed proficiencies, source-linked
check explanations, reload persistence and locked advancement history at both viewport sizes.

`weapon-damage-choice.spec.ts` exercises Savage Attacker's hit/unused-turn declarations,
source explanation, normal/critical fullscreen pools, either-result selection, transient results,
and intentional WebGL failure with fallback/state preservation. The negative test accepts only
the exact vendor console error it deliberately induces; every other render error still fails.

`warrior-cantrips.spec.ts` checks Paladin/Ranger style options, selecting their conditional
cantrip alternative, reload persistence, and one cantrip replacement on level 2→3. Both configured
viewports run these flows; these are not complete spell/combat effect tests.

`feat-acquisition.spec.ts` additionally checks Origin-feat acquisition without replacing origin
grants, a second Fighting Style, repeatable Skilled's three acquisition-specific choices and
preservation through advancement, and new Magic Initiate spell/ability choices during level up.
All four scenarios run at both configured viewports against the production export. Stored build
assertions complement the rendered controls; they do not establish full combat-effect coverage.

| Spec                      | Behavior under test                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `builder-flow.spec.ts`    | Create a Fighter through the builder (class selection asserted, not assumed), reload persistence from browser storage, one level up with the level-2 feature grant visible, Shift-click inspection opening the calculation trace, export via the production download path, and import of the exported document back into the same page.                                                                                                                                                                            |
| `caster-level-up.spec.ts` | Creating a Bard at the builder's reviewed maximum level 10, then a level up to 11: the prepared-spell growth counter and sixth-level spell options render, the level applies, and advancement closes with its stated reason.                                                                                                                                                                                                                                                                                       |
| `ritual-caster.spec.ts`   | Creating a level 4 Wizard who takes each Ritual Caster variant through the feat select: the variant label and out-of-SRD provenance note render, the 2024 book auto-fills to the Proficiency Bonus and swaps stay within its bounds while the 2014 book stays fixed to the character's class list at exactly two, a subsequent level up locks the 2014 book (applying without issue) and opens exactly one new selection for the 2024 book, and every grant renders on the sheet attributed to its variant record. |
| `play-state.spec.ts`      | Applying a condition, undoing it, and confirming a separate change survives a reload from browser storage.                                                                                                                                                                                                                                                                                                                                                                                                         |
| `accessibility.spec.ts`   | axe-core scans of the initial sheet and the opened character builder, failing on any critical or serious violation.                                                                                                                                                                                                                                                                                                                                                                                                |

All specs share a render guard: any uncaught page exception or console error fails the test.
Selectors use roles and accessible names, not test ids, because the app has no test ids.

## What the suite does not yet cover

- It is one fixed smoke matrix, not the complete interaction audit. Earlier healing, aura,
  recovery, Play-view spell selection and damage-rider controls remain incompletely exercised.
  Rest-time coverage includes Circle of the Land but not every rest-replaceable feature.
- The axe scans cover two page states (initial sheet, builder dialog), not the Play/Combat/
  Spells/Features/Diagnostics tabs or the level-up dialog, and only critical/serious impacts.
- The creation/advancement matrix covers Fighter, Bard, Wizard, Druid, Paladin and Ranger, not all
  twelve classes or all legal choices. In addition to feat/warrior flows, it covers Bard 10→11,
  Wizard Scholar 2→3 and malformed-save advancement blocking, Wizard 4→5 for each ritual variant,
  and Druid 5→6 with a confirmed terrain choice. Only a few condition toggles are exercised. Full
  rest/recovery, other dice, spell casting, inventory and death-save interaction matrices remain open.
- `ritual-caster` asserts the builder presentation, selection bounds, level-up rules, and sheet
  attribution; it does not cast a granted spell in the Play view, use the Quick Ritual resource,
  or research a 2014 book spell (research is a play-time flow the UI does not expose).
- `caster-level-up` asserts the prepared-spell growth counter and that sixth-level options
  render; it does not choose a specific replacement spell or assert numeric sheet values.
- `play-state` selects a fixture character; it does not assert numeric values, only state
  toggles, undo, and persistence of them.

The harness exists to make these gaps cheap to close, not to claim they are closed.
