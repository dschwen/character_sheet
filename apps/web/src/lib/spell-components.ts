import { resolveMaterialComponent } from "@dnd/rules-core";

export function materialComponentMessage(
  ...args: Parameters<typeof resolveMaterialComponent>
): string | undefined {
  const component = resolveMaterialComponent(...args);
  if (!component) return undefined;
  const { material, requiresSpecifiedComponent, equippedSubstitutes } = component;
  if (requiresSpecifiedComponent) return `Material: ${material}. Provide the specified component.`;
  return equippedSubstitutes.length > 0
    ? `Material: ${material}. Equipped substitute: ${equippedSubstitutes.join(", ")}.`
    : `Material: ${material}. You can provide it or equip a compatible focus or Component Pouch.`;
}
