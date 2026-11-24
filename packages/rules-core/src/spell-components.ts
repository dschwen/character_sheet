import { z } from "zod";

import type { LoadedRulesPackage } from "@dnd/rules-api";

const componentBody = z.object({
  spellComponent: z.object({ spellId: z.string(), consumed: z.boolean() }),
});

export interface TrackedSpellComponent {
  itemId: string;
  name: string;
  consumed: boolean;
}

export function trackedSpellComponents(
  packages: readonly LoadedRulesPackage[],
): ReadonlyMap<string, TrackedSpellComponent> {
  const components = new Map<string, TrackedSpellComponent>();
  for (const { entities } of packages) {
    for (const entity of entities) {
      if (entity.kind !== "equipment-gear" || !entity.tags.includes("spell-component")) continue;
      const parsed = componentBody.safeParse(entity.body);
      if (!parsed.success) continue;
      const { spellId, consumed } = parsed.data.spellComponent;
      components.set(spellId, {
        itemId: entity.id,
        name: entity.name.en ?? entity.id,
        consumed,
      });
    }
  }
  return components;
}
