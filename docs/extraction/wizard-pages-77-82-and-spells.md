# Wizard and representative spell extraction

The Wizard slice is generated from the pinned SRD 5.2.1 artifact in two independently reproducible
passes:

- pages 77–82 contain the Core Wizard Traits table, all 20 progression rows, class features, the
  complete Wizard spell list, and the Evoker subclass;
- pages 107–175 contain the spell descriptions selected for the level-5 vertical slice.

The parser validates the progression's level sequence, proficiency bonuses, nine spell-slot
columns, expected Wizard and Evoker feature headings, and a lower bound on the spell-list count.
It then reconciles each representative spell's level and school between the class spell list and
its description.

Each selected spell records its source page and block IDs, casting time, range, components,
duration, Concentration and Ritual flags, spell attack kind, saving throws, damage dice, and
higher-slot behavior. The original normalized description remains attached for display and review.

The first representative set contains 20 spells across cantrips and levels 1–3: Acid Splash,
Burning Hands, Chromatic Orb, Counterspell, Detect Magic, Feather Fall, Fireball, Fly, Light, Mage
Armor, Mage Hand, Magic Missile, Misty Step, Ray of Frost, Scorching Ray, Shatter, Shield, Sleep,
Thunderwave, and Web.
