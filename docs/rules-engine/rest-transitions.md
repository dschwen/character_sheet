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
- applies only resource rules whose event is `short-rest`.

For the level-1 Barbarian fixture, spending one d12 Hit Die and rolling 5 restores up to 8 HP. A
Short Rest restores one expended Rage use, not every use.

## Long Rest

The modeled Long Rest proposal:

- requires at least 1 current Hit Point;
- restores all lost HP and spent Hit Dice;
- resets Death Saving Throw marks when HP is regained;
- expires Temporary Hit Points;
- reduces Exhaustion by 1;
- ends Concentration during the required sleep;
- applies resource rules whose event is `long-rest`.

Long Rest benefits cite the glossary rule on SRD page 185; Short Rest and Hit Die spending cite page 187. Resource changes retain the source of the feature that defined their recharge rule.

## Current boundary

Ability-score reductions and spell-slot recovery are not yet represented by the character model.
Rest duration, interruption, the 16-hour interval between Long Rests, food, watch order, and timed
effect expiration require clock/campaign context and remain outside this proposal.
