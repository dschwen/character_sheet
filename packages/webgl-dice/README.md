# WebGL Poly Dice

A small JavaScript/ES-module library for physically simulated 3D dice in a WebGL scene.

Supported dice: **d4, d6, d8, d10, d12, d20**.

Each die accepts an arbitrary list of strings, so faces can contain numbers, words, Unicode symbols, or icons supported by the chosen browser font. Labels use a configurable light-reactive embossed/recessed height-map effect by default.

The **d4 is handled specially**: its four results correspond to the four tetrahedron vertices. Each value is repeated on the three faces adjacent to its vertex, and the highest vertex determines the roll result.

## Install / run the demo

```bash
npm install
npm run serve
```

Then open the Vite URL and visit `/demo/` if necessary.

## Basic usage

```js
import { DiceRoller } from './src/index.js';

const roller = new DiceRoller({
  container: document.querySelector('#dice-area')
});

const d20 = roller.addDie('d20', {
  color: 0xffffff,
  font: '700 112px Georgia, serif'
});

const [value] = await roller.rollAndWait(d20);
console.log(value);
```

## Fullscreen viewport rolls

A roller can also be a transparent, fixed overlay over the whole browser viewport.
In this mode an orthographic camera maps the visible viewport to an invisible
Cannon physics tray, including collision walls at all four screen edges. The tray
is rebuilt automatically on resize/orientation changes.

```js
const roller = new DiceRoller({
  fullscreen: true,
  transparent: true,
  viewportWorldHeight: 12
});

const result = await roller.throwAndWait([
  { type: 'd20', radius: 0.8 },
  { type: 'd20', radius: 0.8 },
  { type: 'd6', radius: 0.9 }
], {
  from: 'bottom-left',
  toward: 'top-right',
  velocity: 10,
  lift: 5,
  spin: 22
});
```

The fullscreen canvas defaults to `pointer-events: none`, so links, buttons,
scrolling, and other page interactions continue to work underneath it. Set
`pointerEvents: true` if the overlay itself should receive pointer events.

Supported throw origins/targets are `center`, `left`, `right`, `top`, `bottom`,
`top-left`, `top-right`, `bottom-left`, and `bottom-right`.

### `roller.throwDice(diceOrSpecs, options)`

Fullscreen-only. Throws existing die objects, type strings, or descriptors such
as `{ type: 'd20', color: 0xffffff }`. Useful options are `from`, `toward`,
`velocity`/`speed`, `lift`, `spin`, `spread`, `spacing`, `height`, and `margin`.
Returns the die objects that were thrown.

### `await roller.throwAndWait(diceOrSpecs, options)`

Equivalent to `throwDice()` but resolves with the result labels once all thrown
dice settle (or the timeout is reached).

## Custom face values

The label count must match the die: 4, 6, 8, 10, 12, or 20.

```js
roller.addDie('d6', {
  labels: ['☀', '☁', '☂', '★', '♥', '⚡'],
  font: '700 132px "Segoe UI Symbol", sans-serif',
  color: 0xfff4cc
});
```

Or a nonstandard numerical die:

```js
roller.addDie('d8', {
  labels: ['0', '0', '1', '1', '2', '2', '5', '10']
});
```

## API

### `new DiceRoller(options)`

- `container`: DOM element; optional when `fullscreen: true`
- `background`: Three.js color value
- `gravity`: Y-axis gravity, default `-24`
- `fullscreen`: create a fixed, viewport-sized transparent overlay
- `transparent`: transparent renderer/background; implied by fullscreen mode
- `pointerEvents`: whether a fullscreen canvas intercepts pointer input; default `false`
- `zIndex`: fullscreen canvas z-index; default `9999`
- `viewportWorldHeight`: physics/rendering height of the viewport in world units; default `12`
- `floorY`: fullscreen physics-floor height; default `0`
- `showFloor`: render the floor mesh; defaults to `false` fullscreen and `true` embedded

### `roller.addDie(type, options)`

Options include:

- `labels`: strings for every face
- `radius`: die size
- `color`: body color
- `font`: complete canvas font declaration, e.g. `700 110px Georgia`
- `labelColor`: face-label color
- `labelScale`: label-plane size relative to die radius
- `emboss`: `'recessed'` (default), `'raised'`, or `false`
- `embossStrength`: signed-lighting strength of the generated height field (default `0.16`)
- `embossBevel`: height-map blur radius in pixels controlling bevel width
- `embossDepth`: backwards-compatible alias for `embossStrength`
- `d4VertexInset`: d4-only placement; `0` is at the vertex and `1` is at face center
- `d4LabelScale`: d4-only label size
- `mass`, `roughness`, `metalness`
- `position`: `[x, y, z]`

Returns a die object.

### `roller.roll(die?)`

Roll one die, or all dice when omitted.

### `await roller.rollAndWait(die?)`

Rolls and resolves with the result labels after the dice settle. For d4, the highest vertex determines the result; all other dice use the upward-facing side.

### `roller.getValue(die)`

Returns the current result label (highest vertex for d4; upward-facing side for all other dice).

### `roller.clear()` / `roller.removeDie(die)` / `roller.dispose()`

Lifecycle helpers.

## Implementation notes

- Rendering: Three.js / WebGL
- Physics: cannon-es
- Labels: browser Canvas2D generates both a color mask and grayscale height map; Three.js `MeshStandardMaterial.bumpMap` turns the height gradients into lighting-reactive raised/recessed normals
- d4/d6/d8/d12/d20 use standard polyhedron geometry
- d10 uses a generated pentagonal trapezohedron

This is intentionally a small foundation rather than a full dice-game framework. Natural extensions would be a bounded dice tray, collision sounds, per-face material colors, deterministic seeded rolls, dice notation (`4d6+2`), and cryptographically generated requested outcomes separated from the visual physics animation.


## Emboss implementation

The emboss effect is no longer painted into the label texture. Each glyph produces two textures:

1. a transparent color/alpha texture for the visible symbol;
2. a grayscale height field with a softened bevel ramp.

That height field is connected to `MeshStandardMaterial.bumpMap`, so highlights and shadows move correctly as the die rotates under the actual Three.js lights. `raised` uses a positive bump scale and `recessed` uses a negative one. This preserves arbitrary browser fonts and Unicode glyphs without requiring font geometry.

This is true per-pixel surface-normal embossing rather than a static 2D lighting trick. It does **not** boolean-cut glyph geometry into the polyhedron, so the outer silhouette of a raised character does not protrude beyond the die face.
