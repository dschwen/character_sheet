# Rest state transitions

The rules kernel exports `proposeRest(evaluationInput, request)`. It evaluates the character and
returns an immutable, source-linked preview rather than changing the character document.

## Short Rest

A Short Rest proposal:

- requires at least 1 current Hit Point;
- optionally accepts explicit Hit Die rolls grouped by class;
- validates remaining Hit Dice and each roll's die range;
- adds the Constitution modifier to each roll, with a minimum of 1 HP per die;
- caps healing at maximum HP;
- increments expended Hit Dice;
- applies only resource rules whose event is `short-rest`;
- restores all expended spell slots when the active spellcasting model declares Short-Rest slot
  recharge, as Pact Magic does.

For the level-1 Barbarian fixture, spending one d12 Hit Die and rolling 5 restores up to 8 HP. A
Short Rest restores one expended Rage use, not every use.

For the level-5 Fighter fixture, a Short Rest restores one Second Wind use and all expended Action
Surge uses. The different amounts come from each feature's own recharge data.

## Long Rest

The modeled Long Rest proposal:

- requires at least 1 current Hit Point;
- restores all lost HP and spent Hit Dice;
- resets Death Saving Throw marks when HP is regained;
- expires Temporary Hit Points;
- reduces Exhaustion by 1;
- ends Concentration during the required sleep;
- restores all expended spell slots;
- applies resource rules whose event is `long-rest`.

Long Rest benefits cite the glossary rule on SRD page 185; Short Rest and Hit Die spending cite page 187. Resource changes retain the source of the feature that defined their recharge rule.

A Human's Resourceful trait also proposes setting Heroic Inspiration to true after a Long Rest.
That change cites the Human species entry on page 86 and remains immutable and previewable with
the rest of the proposal.

## Current boundary

Ability-score reductions are not yet represented by the character model. Rest duration,
interruption, the 16-hour interval between Long Rests, food, watch order, and timed effect
expiration require clock/campaign context and remain outside this proposal.
