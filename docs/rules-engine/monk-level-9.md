# Monk level 9

Creation and same-class advancement now reach level 9. The pinned SRD Monk table
(page 50) grants Proficiency Bonus +4, nine Focus Points, d8 Martial Arts, and a
+15-foot Unarmored Movement bonus. Extra Attack remains two attacks. A Human Monk
without armor or a Shield normally has 45-foot Speed. Level-10 Heightened Focus,
Self-Restoration, and the +20-foot movement bonus are not granted early.

Acrobatic Movement (page 51) allows movement along vertical surfaces and across
liquids on the Monk's turn without falling during that movement, provided the Monk
isn't wearing armor or wielding a Shield. Generated feature metadata feeds a shared
movement-capability evaluator and UI; no Monk-specific frontend branch is needed.
Overview and Play show the capability, current adjusted Speed, equipment/Speed
eligibility, and explanation links for the calculation and feature sources.

Carrying armor or a Shield does not disable the feature; equipping either does.
Equipment can be removed to restore eligibility. Zero Speed from Grappled or
Restrained prevents use without deleting the grant. Exhaustion and modeled movement
statuses affect the displayed Speed before capability evaluation. The capability does
not bypass those restrictions or create separate Climb, Swim, or Fly Speeds.

Acrobatic Movement requires no action or Focus Point. Its equipment requirements
are not Martial Arts' weapon requirements; wielding a non-Monk weapon alone does
not disable it. Incapacitated alone does not set Speed to zero or independently
prohibit movement in the source rule. Conditions that actually stop movement still
apply. Evasion's separate Incapacitated restriction is unchanged and does not acquire
Acrobatic Movement's equipment restrictions.

The ability uses existing movement, not an independent movement allowance. Own-turn
timing, distances already moved, positions, and what supports the creature when it
stops remain manually adjudicated. The UI does not promise that the creature can
remain standing on a liquid or vertical surface after stopping. There is no map,
automatic falling/sinking resolution, or persistent movement-mode toggle.

Advancement preserves earlier acquisition records, feats, choices, loadout, HP,
temporary HP, and spent resources. Increasing maximum Focus from eight to nine
does not refresh the eight spent points. Short or Long Rest restores all Focus;
Wholeness of Body retains its separate Long Rest pool and d8-plus-Wisdom healing.
Unmodeled Monk turn triggers, tool choices, and higher-level features remain unfinished.
This slice does not establish independent semantic approval or the plan's full
browser/accessibility gates.

## Verification

`pnpm check` passes 927 tests, including 25 new Monk/capability cases. The 134 Python
tests, Ruff checks, mypy, and production build pass. Regenerating Monk content and
coverage produces identical hashes.

A headless Chrome smoke check of the production export created a level-9 Monk through
the builder, inspected Acrobatic Movement in Overview and Play, and opened its source
trace (page 51). Toggling Grappled changed the capability to Unavailable with zero
Speed; that state survived reload. Removing Grappled restored 45-foot Speed and
eligibility. The stopping-point guidance opened and closed. Desktop (1280-pixel) and
narrow (390-pixel) screenshots were inspected, with no horizontal overflow at the
narrow width or observed JavaScript exceptions. This focused smoke check does not
establish independent rules approval or complete browser/accessibility coverage.
