import { readdirSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

import { characterDocumentSchema, type CharacterDocument } from "@dnd/character-model";
import { authoringIrSchema, contentEntitySchema, packageManifestSchema } from "@dnd/content-schema";
import type { LoadedRulesPackage } from "@dnd/rules-api";

export interface FixtureOption {
  filename: string;
  character: CharacterDocument;
}

export interface WebData {
  rulesPackage: LoadedRulesPackage;
  fixtures: FixtureOption[];
}

const currentDirectory = process.cwd();
const repositoryRoot =
  basename(currentDirectory) === "web" ? resolve(currentDirectory, "../..") : currentDirectory;
const generatedRoot = resolve(repositoryRoot, "packages/content-srd-5.2.1/generated");
const fixturesRoot = resolve(repositoryRoot, "packages/test-fixtures/characters");

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

export function loadWebData(): WebData {
  const manifest = packageManifestSchema.parse(readJson(resolve(generatedRoot, "manifest.json")));
  const entities = contentEntitySchema
    .array()
    .parse(readJson(resolve(generatedRoot, "entities.json")));
  const authoringRoot = resolve(generatedRoot, "authoring-ir");
  const authoringIr = readdirSync(authoringRoot)
    .filter((filename) => filename.endsWith(".json"))
    .sort()
    .map((filename) => authoringIrSchema.parse(readJson(resolve(authoringRoot, filename))));
  const fixtures = readdirSync(fixturesRoot)
    .filter((filename) => filename.endsWith(".json"))
    .sort()
    .map((filename) => ({
      filename,
      character: characterDocumentSchema.parse(readJson(resolve(fixturesRoot, filename))),
    }));

  return { rulesPackage: { manifest, entities, authoringIr }, fixtures };
}
