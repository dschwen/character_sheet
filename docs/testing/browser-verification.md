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
  recovery, Play-view spell selection, rest-time, and damage-rider controls are not exercised
  here.
- The axe scans cover two page states (initial sheet, builder dialog), not the Play/Combat/
  Spells/Features/Diagnostics tabs or the level-up dialog, and only critical/serious impacts.
- The creation/advancement matrix covers Fighter, Bard, Wizard, Paladin and Ranger, not all twelve
  classes or all legal choices. It covers Fighter 1→2, 3→4, and 4→5, Bard 10→11, and Wizard
  4→5 for each ritual variant. Only two of thirteen condition toggles are exercised. Full
  short-rest/long-rest, other dice, spell casting, inventory, and death-save flows remain uncovered.
- `ritual-caster` asserts the builder presentation, selection bounds, level-up rules, and sheet
  attribution; it does not cast a granted spell in the Play view, use the Quick Ritual resource,
  or research a 2014 book spell (research is a play-time flow the UI does not expose).
- `caster-level-up` asserts the prepared-spell growth counter and that sixth-level options
  render; it does not choose a specific replacement spell or assert numeric sheet values.
- `play-state` selects a fixture character; it does not assert numeric values, only state
  toggles, undo, and persistence of them.

The harness exists to make these gaps cheap to close, not to claim they are closed.
