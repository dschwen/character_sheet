"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { characterDocumentSchema, type CharacterDocument } from "@dnd/character-model";
import type { CharacterEvaluation, LoadedRulesPackage } from "@dnd/rules-api";
import { evaluateCharacter } from "@dnd/rules-core";

import type { FixtureOption } from "../lib/server-data";
import {
  abilities,
  classSummary,
  damageText,
  entityNames,
  numericFact,
  shortEntityName,
  signed,
  titleCase,
} from "../lib/presentation";

const storageKey = "dnd-character-manager.document.v1";
const tabs = ["overview", "combat", "spells", "features", "diagnostics"] as const;
type Tab = (typeof tabs)[number];
type Trace = CharacterEvaluation["traces"][string];

interface CharacterManagerProps {
  rulesPackage: LoadedRulesPackage;
  fixtures: FixtureOption[];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The character could not be loaded.";
}

function traceLabel(traceId: string): string {
  return titleCase(traceId.replaceAll(".", "-"));
}

function Section({
  title,
  eyebrow,
  children,
}: Readonly<{ title: string; eyebrow?: string; children: React.ReactNode }>) {
  return (
    <section className="panel">
      <div className="panel-heading">
        {eyebrow === undefined ? null : <span>{eyebrow}</span>}
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function TraceButton({
  traceId,
  onSelect,
  className,
  children,
}: Readonly<{
  traceId: string;
  onSelect: (traceId: string) => void;
  className?: string;
  children: React.ReactNode;
}>) {
  return (
    <button
      className={className ?? "trace-button"}
      type="button"
      onClick={() => {
        onSelect(traceId);
      }}
      title="Inspect calculation"
    >
      {children}
    </button>
  );
}

export function CharacterManager({ rulesPackage, fixtures }: Readonly<CharacterManagerProps>) {
  const firstFixture = fixtures[0];
  if (firstFixture === undefined) throw new Error("The web app requires at least one fixture.");

  const [character, setCharacter] = useState<CharacterDocument>(firstFixture.character);
  const [source, setSource] = useState(firstFixture.filename);
  const [tab, setTab] = useState<Tab>("overview");
  const [selectedTraceId, setSelectedTraceId] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [storageReady, setStorageReady] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (saved === null) {
      setStorageReady(true);
      return;
    }
    try {
      setCharacter(characterDocumentSchema.parse(JSON.parse(saved) as unknown));
      setSource("browser-save");
      setNotice("Restored your last browser-local character.");
    } catch {
      window.localStorage.removeItem(storageKey);
    } finally {
      setStorageReady(true);
    }
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(storageKey, JSON.stringify(character));
  }, [character, storageReady]);

  const result = useMemo(() => {
    try {
      return {
        evaluation: evaluateCharacter({ character, packages: [rulesPackage] }),
        error: undefined,
      };
    } catch (error) {
      return { evaluation: undefined, error: errorMessage(error) };
    }
  }, [character, rulesPackage]);
  const names = useMemo(() => entityNames(rulesPackage), [rulesPackage]);
  const evaluation = result.evaluation;
  const trace = selectedTraceId === undefined ? undefined : evaluation?.traces[selectedTraceId];

  function selectFixture(filename: string): void {
    const fixture = fixtures.find((option) => option.filename === filename);
    if (fixture === undefined) return;
    setCharacter(fixture.character);
    setSource(filename);
    setSelectedTraceId(undefined);
    setNotice(`Loaded ${fixture.character.name}.`);
  }

  async function importCharacter(file: File | undefined): Promise<void> {
    if (file === undefined) return;
    try {
      const parsed = characterDocumentSchema.parse(JSON.parse(await file.text()) as unknown);
      setCharacter(parsed);
      setSource("imported");
      setSelectedTraceId(undefined);
      setNotice(`Imported ${parsed.name}; it is saved only in this browser.`);
    } catch (error) {
      setNotice(`Import failed: ${errorMessage(error)}`);
    } finally {
      if (importInput.current !== null) importInput.current.value = "";
    }
  }

  function exportCharacter(): void {
    const blob = new Blob([`${JSON.stringify(character, null, 2)}\n`], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${character.name.toLowerCase().replaceAll(/[^a-z0-9]+/gu, "-")}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice("Exported the current character document.");
  }

  return (
    <main>
      <header className="app-header">
        <a className="brand" href="#top" aria-label="Adventurer's Ledger home">
          <span className="brand-mark" aria-hidden="true">
            A
          </span>
          <span>
            <strong>Adventurer&apos;s Ledger</strong>
            <small>SRD 5.2.1 · local-first</small>
          </span>
        </a>
        <div className="header-actions">
          <label className="select-wrap">
            <span className="sr-only">Select sample character</span>
            <select
              value={source}
              onChange={(event) => {
                selectFixture(event.target.value);
              }}
            >
              {source === "imported" ? <option value="imported">Imported character</option> : null}
              {source === "browser-save" ? (
                <option value="browser-save">Browser save</option>
              ) : null}
              {fixtures.map((fixture) => (
                <option key={fixture.filename} value={fixture.filename}>
                  {fixture.character.name} · {classSummary(fixture.character)}
                </option>
              ))}
            </select>
          </label>
          <input
            ref={importInput}
            className="sr-only"
            type="file"
            accept="application/json,.json"
            onChange={(event) => void importCharacter(event.target.files?.[0])}
          />
          <button
            className="button secondary"
            type="button"
            onClick={() => importInput.current?.click()}
          >
            Import JSON
          </button>
          <button className="button primary" type="button" onClick={exportCharacter}>
            Export
          </button>
        </div>
      </header>

      <div id="top" className="workspace">
        {notice === undefined ? null : (
          <div className="notice" role="status">
            <span>{notice}</span>
            <button
              type="button"
              onClick={() => {
                setNotice(undefined);
              }}
              aria-label="Dismiss notice"
            >
              ×
            </button>
          </div>
        )}

        {evaluation === undefined ? (
          <section className="fatal-error">
            <p>Character evaluation failed</p>
            <h1>{character.name}</h1>
            <pre>{result.error}</pre>
          </section>
        ) : (
          <>
            <section className="character-hero">
              <div className="hero-copy">
                <span className="eyebrow">Current adventurer</span>
                <h1>{character.name}</h1>
                <p>
                  {classSummary(character)} · {shortEntityName(character.build.speciesId)} ·{" "}
                  {shortEntityName(character.build.backgroundId)} background
                </p>
                <div className="hero-tags">
                  <span>Level {String(character.build.levels.length)}</span>
                  {character.build.subclassId === undefined ? null : (
                    <span>
                      {names.get(character.build.subclassId) ??
                        shortEntityName(character.build.subclassId)}
                    </span>
                  )}
                  <span>Revision {String(character.metadata.revision)}</span>
                </div>
              </div>
              <div className="vitals" aria-label="Character vitals">
                <TraceButton
                  className="vital-card"
                  traceId="armorClass"
                  onSelect={setSelectedTraceId}
                >
                  <span>Armor class</span>
                  <strong>{String(numericFact(evaluation, "armorClass"))}</strong>
                  <small>view calculation</small>
                </TraceButton>
                <div className="vital-card hp-card">
                  <span>Hit points</span>
                  <strong>
                    {String(character.state.currentHitPoints)}
                    <small> / {String(numericFact(evaluation, "hitPoints.maximum"))}</small>
                  </strong>
                  <div className="hp-track" aria-hidden="true">
                    <i
                      style={{
                        width: `${String(Math.max(0, Math.min(100, (character.state.currentHitPoints / Math.max(1, numericFact(evaluation, "hitPoints.maximum"))) * 100)))}%`,
                      }}
                    />
                  </div>
                </div>
                <TraceButton
                  className="vital-card"
                  traceId="initiative"
                  onSelect={setSelectedTraceId}
                >
                  <span>Initiative</span>
                  <strong>{signed(numericFact(evaluation, "initiative"))}</strong>
                  <small>view calculation</small>
                </TraceButton>
                <TraceButton
                  className="vital-card"
                  traceId="speed.walking"
                  onSelect={setSelectedTraceId}
                >
                  <span>Speed</span>
                  <strong>
                    {String(numericFact(evaluation, "speed.walking"))}
                    <small> ft.</small>
                  </strong>
                  <small>view calculation</small>
                </TraceButton>
              </div>
            </section>

            <nav className="tabs" aria-label="Character sheet sections">
              {tabs.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={tab === item ? "active" : undefined}
                  onClick={() => {
                    setTab(item);
                  }}
                >
                  {titleCase(item)}
                  {item === "diagnostics" && evaluation.validations.length > 0 ? (
                    <span className="count">{String(evaluation.validations.length)}</span>
                  ) : null}
                </button>
              ))}
            </nav>

            {tab === "overview" ? (
              <div className="sheet-grid overview-grid">
                <Section title="Ability scores" eyebrow="Core attributes">
                  <div className="abilities">
                    {abilities.map((ability) => {
                      const modifier = numericFact(evaluation, `ability.${ability}.modifier`);
                      const save = evaluation.d20Tests[`savingThrow.${ability}`];
                      return (
                        <TraceButton
                          key={ability}
                          className="ability-card"
                          traceId={`ability.${ability}.modifier`}
                          onSelect={setSelectedTraceId}
                        >
                          <span>{ability.slice(0, 3).toUpperCase()}</span>
                          <strong>{signed(modifier)}</strong>
                          <small>
                            {String(numericFact(evaluation, `ability.${ability}.score`))} score ·{" "}
                            {save?.proficiency.level === "none" ? "" : "● "}
                            {signed(save?.modifier ?? modifier)} save
                          </small>
                        </TraceButton>
                      );
                    })}
                  </div>
                </Section>

                <Section title="Skills" eyebrow="Checks & proficiencies">
                  <div className="skill-list">
                    {Object.values(evaluation.d20Tests)
                      .filter((test) => test.id.startsWith("skill."))
                      .sort((left, right) => left.id.localeCompare(right.id))
                      .map((skill) => (
                        <TraceButton
                          key={skill.id}
                          traceId={skill.traceId}
                          onSelect={setSelectedTraceId}
                        >
                          <i className={`prof-dot ${skill.proficiency.level}`} aria-hidden="true" />
                          <span>{titleCase(skill.id.replace("skill.", ""))}</span>
                          <small>{skill.ability.slice(0, 3).toUpperCase()}</small>
                          <strong>{signed(skill.modifier)}</strong>
                        </TraceButton>
                      ))}
                  </div>
                </Section>

                <Section title="At a glance" eyebrow="Defenses & senses">
                  <dl className="fact-list">
                    <div>
                      <dt>Proficiency bonus</dt>
                      <dd>{signed(numericFact(evaluation, "proficiencyBonus"))}</dd>
                    </div>
                    <div>
                      <dt>Passive perception</dt>
                      <dd>{String(numericFact(evaluation, "passive.perception"))}</dd>
                    </div>
                    <div>
                      <dt>Temporary HP</dt>
                      <dd>{String(character.state.temporaryHitPoints)}</dd>
                    </div>
                    <div>
                      <dt>Heroic inspiration</dt>
                      <dd>{character.state.heroicInspiration ? "Ready" : "None"}</dd>
                    </div>
                    <div>
                      <dt>Exhaustion</dt>
                      <dd>{String(character.state.exhaustion)}</dd>
                    </div>
                    <div>
                      <dt>Resistances</dt>
                      <dd>
                        {evaluation.resistances.length === 0
                          ? "None"
                          : evaluation.resistances.map(titleCase).join(", ")}
                      </dd>
                    </div>
                  </dl>
                </Section>
              </div>
            ) : null}

            {tab === "combat" ? (
              <div className="sheet-grid two-column">
                <Section title="Attacks" eyebrow="Attack action">
                  {evaluation.attacks.length === 0 ? (
                    <p className="empty">No attacks in this loadout.</p>
                  ) : (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Attack</th>
                            <th>To hit</th>
                            <th>Damage</th>
                            <th>Range</th>
                          </tr>
                        </thead>
                        <tbody>
                          {evaluation.attacks.map((attack) => (
                            <tr key={attack.id}>
                              <td>
                                <TraceButton traceId={attack.traceId} onSelect={setSelectedTraceId}>
                                  {attack.name}
                                </TraceButton>
                                <small>
                                  {titleCase(attack.attackType)} ·{" "}
                                  {attack.properties.map(titleCase).join(", ")}
                                </small>
                              </td>
                              <td>{signed(attack.attackBonus)}</td>
                              <td>{damageText(attack.damage)}</td>
                              <td>
                                {attack.range === undefined
                                  ? "Reach"
                                  : `${String(attack.range.normal)}/${String(attack.range.long)} ft.`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Section>
                <Section title="Equipment" eyebrow="Current loadout">
                  <div className="item-list">
                    {evaluation.inventory.map((item) => (
                      <div key={item.id}>
                        <span>
                          <strong>{item.name}</strong>
                          <small>{titleCase(item.kind)}</small>
                        </span>
                        <span>{item.equipped ? "Equipped" : `×${String(item.quantity)}`}</span>
                      </div>
                    ))}
                  </div>
                </Section>
                <Section title="Conditions" eyebrow="Active state">
                  <div className="tag-list">
                    {character.state.conditionIds.length === 0 ? (
                      <span className="empty">No active conditions</span>
                    ) : (
                      character.state.conditionIds.map((id) => (
                        <span key={id}>{names.get(id) ?? shortEntityName(id)}</span>
                      ))
                    )}
                    {character.state.concentrationSpellId === undefined ? null : (
                      <span>
                        Concentrating:{" "}
                        {names.get(character.state.concentrationSpellId) ??
                          shortEntityName(character.state.concentrationSpellId)}
                      </span>
                    )}
                  </div>
                </Section>
              </div>
            ) : null}

            {tab === "spells" ? (
              <div className="sheet-grid two-column">
                <Section title="Spellcasting" eyebrow="Magic">
                  {evaluation.spellcasting === undefined ? (
                    <p className="empty">This character does not have spellcasting.</p>
                  ) : (
                    <>
                      <div className="spell-metrics">
                        <TraceButton
                          traceId={evaluation.spellcasting.attackTraceId}
                          onSelect={setSelectedTraceId}
                        >
                          <span>Spell attack</span>
                          <strong>{signed(evaluation.spellcasting.attackBonus)}</strong>
                        </TraceButton>
                        <TraceButton
                          traceId={evaluation.spellcasting.saveTraceId}
                          onSelect={setSelectedTraceId}
                        >
                          <span>Save DC</span>
                          <strong>{String(evaluation.spellcasting.saveDifficultyClass)}</strong>
                        </TraceButton>
                        <div>
                          <span>Ability</span>
                          <strong>
                            {evaluation.spellcasting.ability.slice(0, 3).toUpperCase()}
                          </strong>
                        </div>
                      </div>
                      <div className="slot-list">
                        {evaluation.spellcasting.slots.map((slot) => (
                          <TraceButton
                            key={slot.level}
                            traceId={slot.traceId}
                            onSelect={setSelectedTraceId}
                          >
                            <span>Level {String(slot.level)}</span>
                            <i>
                              {Array.from({ length: slot.maximum }, (_, index) => (
                                <b
                                  key={index}
                                  className={index < slot.current ? "available" : undefined}
                                />
                              ))}
                            </i>
                            <small>
                              {String(slot.current)} / {String(slot.maximum)}
                            </small>
                          </TraceButton>
                        ))}
                      </div>
                    </>
                  )}
                </Section>
                <Section
                  title="Known & prepared spells"
                  eyebrow={`${String(evaluation.spells.length)} spells`}
                >
                  {evaluation.spells.length === 0 ? (
                    <p className="empty">No spells known.</p>
                  ) : (
                    <div className="spell-list">
                      {evaluation.spells.map((spell) => (
                        <div key={spell.id}>
                          <span>
                            <strong>{spell.name}</strong>
                            <small>
                              {spell.level === 0 ? "Cantrip" : `Level ${String(spell.level)}`} ·{" "}
                              {titleCase(spell.school)}
                            </small>
                          </span>
                          <span className="spell-badges">
                            {spell.prepared ? <i>Prepared</i> : null}
                            {spell.concentration ? <i>Concentration</i> : null}
                            {spell.ritual ? <i>Ritual</i> : null}
                          </span>
                          <small>
                            {spell.castingTime} · {spell.range} · {spell.duration}
                          </small>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>
              </div>
            ) : null}

            {tab === "features" ? (
              <div className="sheet-grid two-column">
                <Section title="Resources" eyebrow="Uses & recovery">
                  {evaluation.resources.length === 0 ? (
                    <p className="empty">No tracked resources.</p>
                  ) : (
                    <div className="resource-list">
                      {evaluation.resources.map((resource) => (
                        <TraceButton
                          key={resource.id}
                          traceId={resource.traceId}
                          onSelect={setSelectedTraceId}
                        >
                          <span>
                            <strong>
                              {names.get(resource.id) ?? shortEntityName(resource.id)}
                            </strong>
                            <small>
                              Recovers:{" "}
                              {resource.recharge.map((rule) => titleCase(rule.event)).join(", ")}
                            </small>
                          </span>
                          <b>
                            {String(resource.current)} <small>/ {String(resource.maximum)}</small>
                          </b>
                        </TraceButton>
                      ))}
                    </div>
                  )}
                </Section>
                <Section title="Available actions" eyebrow="Rules engine">
                  <div className="action-list">
                    {evaluation.actions.map((action) => (
                      <TraceButton
                        key={action.id}
                        traceId={action.traceId}
                        onSelect={setSelectedTraceId}
                      >
                        <span>
                          <strong>{names.get(action.id) ?? shortEntityName(action.id)}</strong>
                          <small>
                            {action.actionEconomy === undefined
                              ? "Special action"
                              : titleCase(action.actionEconomy)}
                          </small>
                        </span>
                        <i className={action.available ? "ready" : "blocked"}>
                          {action.available ? "Ready" : "Unavailable"}
                        </i>
                      </TraceButton>
                    ))}
                  </div>
                </Section>
                <Section title="Build selections" eyebrow="Character record">
                  <div className="tag-list">
                    {character.build.featIds.map((id) => (
                      <span key={id}>{names.get(id) ?? shortEntityName(id)}</span>
                    ))}
                    {character.build.featIds.length === 0 ? (
                      <span className="empty">No feats selected</span>
                    ) : null}
                  </div>
                </Section>
              </div>
            ) : null}

            {tab === "diagnostics" ? (
              <div className="sheet-grid two-column">
                <Section
                  title="Validation messages"
                  eyebrow={`${String(evaluation.validations.length)} findings`}
                >
                  {evaluation.validations.length === 0 ? (
                    <p className="success">✓ No validation problems found.</p>
                  ) : (
                    <div className="diagnostic-list">
                      {evaluation.validations.map((validation) => (
                        <article key={validation.id} className={validation.severity}>
                          <span>{validation.severity}</span>
                          <div>
                            <strong>{validation.code}</strong>
                            <p>{validation.message.en ?? Object.values(validation.message)[0]}</p>
                            <small>{validation.paths.join(" · ")}</small>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </Section>
                <Section
                  title="Automation coverage"
                  eyebrow={`${String(evaluation.coverageWarnings.length)} warnings`}
                >
                  {evaluation.coverageWarnings.length === 0 ? (
                    <p className="success">✓ All granted mechanics have approved automation.</p>
                  ) : (
                    <div className="diagnostic-list">
                      {evaluation.coverageWarnings.map((warning) => (
                        <article key={warning.entityId} className="warning">
                          <span>{warning.status}</span>
                          <div>
                            <strong>
                              {names.get(warning.entityId) ?? shortEntityName(warning.entityId)}
                            </strong>
                            <p>{warning.message}</p>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </Section>
                <Section
                  title="Calculation index"
                  eyebrow={`${String(Object.keys(evaluation.traces).length)} traces`}
                >
                  <div className="trace-index">
                    {Object.keys(evaluation.traces)
                      .sort()
                      .map((traceId) => (
                        <TraceButton key={traceId} traceId={traceId} onSelect={setSelectedTraceId}>
                          {traceLabel(traceId)}
                        </TraceButton>
                      ))}
                  </div>
                </Section>
              </div>
            ) : null}
          </>
        )}
      </div>

      {selectedTraceId === undefined ? null : (
        <div
          className="drawer-backdrop"
          onMouseDown={() => {
            setSelectedTraceId(undefined);
          }}
        >
          <aside
            className="trace-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Calculation trace"
            onMouseDown={(event) => {
              event.stopPropagation();
            }}
          >
            <div className="drawer-heading">
              <div>
                <span>Calculation trace</span>
                <h2>{traceLabel(selectedTraceId)}</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedTraceId(undefined);
                }}
                aria-label="Close calculation trace"
              >
                ×
              </button>
            </div>
            {trace === undefined ? (
              <p className="empty">No trace was emitted for this value.</p>
            ) : (
              <TraceDetails trace={trace} names={names} />
            )}
          </aside>
        </div>
      )}
    </main>
  );
}

function TraceDetails({
  trace,
  names,
}: Readonly<{ trace: Trace; names: ReadonlyMap<string, string> }>) {
  return (
    <div className="trace-details">
      <div className="trace-result">
        <span>Final result</span>
        <strong>{JSON.stringify(trace.result)}</strong>
      </div>
      <ol>
        {trace.nodes.map((node) => (
          <li key={node.id} className={node.suppressed === true ? "suppressed" : undefined}>
            <div>
              <span>{titleCase(node.operation)}</span>
              {node.suppressed === true ? <i>Suppressed</i> : null}
            </div>
            <strong>{node.label ?? node.id}</strong>
            <code>
              {node.inputs.map((input) => JSON.stringify(input)).join(" · ")} →{" "}
              {JSON.stringify(node.output)}
            </code>
            {node.reason === undefined ? null : <p>{node.reason}</p>}
            {node.source === undefined ? null : (
              <small>
                {node.source.entityId === undefined
                  ? node.source.sourceId
                  : (names.get(node.source.entityId) ?? node.source.entityId)}
                {node.source.page === undefined ? "" : ` · p. ${String(node.source.page)}`}
              </small>
            )}
          </li>
        ))}
      </ol>
      {trace.sourceReferences.length === 0 ? null : (
        <div className="sources">
          <h3>Sources</h3>
          {trace.sourceReferences.map((source, index) => (
            <p key={`${source.sourceId}-${String(index)}`}>
              {source.entityId === undefined
                ? source.sourceId
                : (names.get(source.entityId) ?? source.entityId)}
              {source.page === undefined ? "" : ` · page ${String(source.page)}`}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
