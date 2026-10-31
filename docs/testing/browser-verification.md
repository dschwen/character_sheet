# Browser verification harness

The web app is tested against the real production artifact: `next build` exports the static site
to `out/`, `apps/web/scripts/serve-out.mjs` serves that export, and Playwright drives it in
Chromium at two viewports (`desktop` 1280×720 and `narrow` 390×844). This is the rendered-behavior
gate that engine tests and type checks deliberately do not cover.

## Running it

```sh
pnpm --filter @dnd/web build
pnpm test:e2e   # root alias for pnpm --filter @dnd/web test:e2e
```

`playwright.config.ts` starts the static server automatically and reuses a local one while
not in CI. The CI `browser` job installs Chromium with system dependencies, builds, and runs the
same suite.

## What the suite verifies

| Spec                      | Behavior under test                                                                                                                                                                                                                                                                                                                     |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `builder-flow.spec.ts`    | Create a Fighter through the builder (class selection asserted, not assumed), reload persistence from browser storage, one level up with the level-2 feature grant visible, Shift-click inspection opening the calculation trace, export via the production download path, and import of the exported document back into the same page. |
| `caster-level-up.spec.ts` | Creating a Bard at the builder's reviewed maximum level 10, then a level up to 11: the prepared-spell growth counter and sixth-level spell options render, the level applies, and advancement closes with its stated reason.                                                                                                            |
| `play-state.spec.ts`      | Applying a condition, undoing it, and confirming a separate change survives a reload from browser storage.                                                                                                                                                                                                                              |
| `accessibility.spec.ts`   | axe-core scans of the initial sheet and the opened character builder, failing on any critical or serious violation.                                                                                                                                                                                                                     |

All specs share a render guard: any uncaught page exception or console error fails the test.
Selectors use roles and accessible names, not test ids, because the app has no test ids.

## What the suite does not yet cover

- It is one fixed smoke matrix, not the complete interaction audit. Earlier healing, aura,
  recovery, Play-view spell selection, rest-time, and damage-rider controls are not exercised
  here.
- The axe scans cover two page states (initial sheet, builder dialog), not the Play/Combat/
  Spells/Features/Diagnostics tabs or the level-up dialog, and only critical/serious impacts.
- Only two of the thirteen condition toggles, two classes through the builder (Fighter and a
  spellcaster at its maximum level), two level-ups (Fighter 1→2 and Bard 10→11), and the
  short-rest/long-rest, dice, spell, inventory, and death-save flows remain uncovered as stated.
- `caster-level-up` asserts the prepared-spell growth counter and that sixth-level options
  render; it does not choose a specific replacement spell or assert numeric sheet values.
- `play-state` selects a fixture character; it does not assert numeric values, only state
  toggles, undo, and persistence of them.

The harness exists to make these gaps cheap to close, not to claim they are closed.
