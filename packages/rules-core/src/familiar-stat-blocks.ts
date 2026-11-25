import statBlocks from "../../content-srd-5.2.1/familiar-stat-blocks.json" with { type: "json" };

interface FamiliarStatBlock {
  page: number;
  armorClass: number;
  hitPoints: number;
  speed: string;
  senses: string;
  traits?: readonly string[];
  actions: readonly string[];
}

const byName = new Map<string, FamiliarStatBlock>(
  Object.entries(statBlocks).map(([form, stats]) => [form.toLowerCase(), stats]),
);

export function familiarStatBlock(form: string): FamiliarStatBlock | undefined {
  return byName.get(form.trim().toLowerCase());
}
