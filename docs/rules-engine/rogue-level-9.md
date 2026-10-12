# Rogue level 9 and on-hit extra damage

Creation and same-class advancement now reach level 9. The pinned SRD Rogue table
(page 62) grants Proficiency Bonus +4 and 5d6 Sneak Attack. Four existing Expertise
choices and the two earlier ASIs remain unchanged. No level-10 ASI, Improved Cunning
Strike, or higher-level Thief feature is granted early. Advancement preserves prior
acquisitions, choices, equipment, HP, conditions, and expended resources.

Supreme Sneak (page 64) grants the Thief's Stealth Attack Cunning Strike option.
Its cost is 1d6. This attack does not end the Hide action's Invisible condition if
the Rogue ends the turn behind Three-Quarters Cover or Total Cover. Spell-granted
Invisibility alone is insufficient. It does not grant Invisible or prevent other
ways of ending Hide. The grant, die cost, source, requirements, and guidance come
from generated subclass authoring IR, not a class-ID switch in the frontend.

Play → Use a feature now includes a shared on-hit extra-damage card. Equipped
Finesse or Ranged weapons are eligible; non-Finesse melee weapons and Unarmed
Strikes are not. The player declares the creature hit, unused once-per-turn damage,
and Advantage or eligible adjacent ally. This is once per turn, including another
creature's turn, not once on the Rogue's own turn. Attack/ally eligibility is
explicitly declared rather than inferred from the last die roll.

Select no effect for 5d6, or one Cunning Strike effect for 4d6. A critical hit doubles
the remaining dice (10d6 or 8d6), after the cost is removed. No weapon/ability damage
bonus is added a second time. This separate pool uses fullscreen physical dice with
the existing instant fallback. Hit and turn confirmations reset after rolling;
this does not constitute an encounter-wide once-per-turn counter.

Poison and Trip show the current Dexterity-based save DC (17 for the default Human
level-9 build) and instructions to set Poisoned or Prone on the target's sheet after
its failed save. Poison requires a carried Poisoner's Kit; Trip requires a Large or
smaller target. Withdraw uses half the final adjusted Speed, without Opportunity
Attacks. Stealth Attack requires both Hide-origin Invisible and end-turn-cover
declarations and explicitly instructs manual resolution if cover fails. The card
allows only one effect, including Stealth Attack, at this level.

The roll helper checks current action availability, weapon eligibility, distinct
option limits, granted options, die costs, and declared requirements before rolling.
It does not mutate HP, resources, or conditions. Targets, kit possession, ally
position, turn boundaries, Hide provenance, cover, save outcomes, and duration remain
manual. It neither automatically preserves nor removes any Invisible condition.
Hide action state and a source-aware Invisible lifecycle still require future work.
Levels 10–20, independent semantic approval, and full browser/accessibility gates
remain unfinished.

## Verification

`pnpm check` passes all 958 tests across 65 files, including formatting, lint, and
root/web type checks. One earlier full-suite attempt exceeded the existing
five-second species/background matrix timeout; the complete rerun passed after
closing the browser, without changing the timeout or assertions.

The 31 focused Rogue/on-hit cases cover creation, advancement preservation, level
gates, all four Cunning Strike effects, cost-before-critical scaling, fullscreen and
fallback pools, invalid declarations, disabled actions, source traces, and authored
metadata on a non-Rogue class. The 136 Python tests, Ruff, mypy, and production build
pass. Repeated Rogue/coverage generation produces identical hashes.

A headless Chrome check of the production export created a level-9 Rogue through
the builder, selected Stealth Attack, checked its source trace (page 64), validated
the required declarations, and rolled 4d6 normally and 8d6 critically. The roll did
not change character play state. Trip showed DC 17 and target-sheet Prone guidance;
Withdraw showed 15-foot movement guidance. Reload retained the character but reset
the transient hit/turn declarations. Desktop (1280-pixel) and narrow (390-pixel)
screenshots were inspected, with no horizontal overflow or observed JavaScript
exceptions. This focused check does not establish the complete browser/accessibility
or independent review gates.
