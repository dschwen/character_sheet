"use client";

import { useEffect, useState } from "react";
import { characterDocumentSchema, type CharacterDocument } from "@dnd/character-model";
import { z } from "zod";

const membership = z.object({ id: z.string(), name: z.string(), role: z.enum(["gm", "player"]) });
const homeSchema = z.object({
  user: z.object({ name: z.string() }),
  campaigns: z.array(membership),
});
const rosterSchema = z.object({
  members: z.array(z.object({ name: z.string(), role: z.string() })),
  characters: z.array(z.object({ id: z.string(), name: z.string(), owner: z.string() })),
});

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request(path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(
    path,
    body === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new Error("Campaigns require the campaign server. Open the address provided by your GM.");
  const data: unknown = await response.json();
  if (!response.ok)
    throw new ApiError(response.status, z.object({ error: z.string() }).parse(data).error);
  return data;
}

export function CampaignPanel({ character }: { character: CharacterDocument }) {
  const [home, setHome] = useState<z.infer<typeof homeSchema>>();
  const [campaign, setCampaign] = useState<z.infer<typeof membership>>();
  const [roster, setRoster] = useState<z.infer<typeof rosterSchema>>();
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [invite, setInvite] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(true);
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        const { signedIn } = z
          .object({ signedIn: z.boolean() })
          .parse(await request("/api/session"));
        if (!signedIn) return;
        const data = homeSchema.parse(await request("/api/campaigns"));
        if (active) setHome(data);
      } catch (error) {
        if (active && !(error instanceof ApiError && error.status === 401)) {
          setAvailable(false);
          setMessage(error instanceof Error ? error.message : "Campaign server unavailable.");
        }
      } finally {
        if (active) setBusy(false);
      }
    }
    void initialize();
    return () => {
      active = false;
    };
  }, []);

  async function run(operation: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await operation();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setHome(undefined);
        setCampaign(undefined);
        setRoster(undefined);
        setInvite("");
      }
      setMessage(error instanceof Error ? error.message : "Campaign request failed.");
    } finally {
      setBusy(false);
    }
  }

  async function selectCampaign(selected: z.infer<typeof membership>) {
    const data = rosterSchema.parse(await request("/api/campaigns/" + selected.id));
    setCampaign(selected);
    setRoster(data);
    setInvite("");
  }

  async function enterCampaign(path: string, body: object) {
    const { id } = z.object({ id: z.string() }).parse(await request(path, body));
    const data = homeSchema.parse(await request("/api/campaigns"));
    setHome(data);
    setCode("");
    setName("");
    const selected = data.campaigns.find((entry) => entry.id === id);
    if (selected) await selectCampaign(selected);
  }

  return (
    <section className="panel campaign-panel">
      <div className="panel-heading">
        <h2>Campaigns</h2>
      </div>
      <fieldset disabled={busy || !available}>
        {home === undefined ? (
          available && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  await request("/api/login", { key: key.trim() });
                  setKey("");
                  setHome(homeSchema.parse(await request("/api/campaigns")));
                });
              }}
            >
              <label>
                Account access key
                <input
                  type="password"
                  value={key}
                  required
                  onChange={(event) => {
                    setKey(event.target.value);
                  }}
                />
              </label>
              <button className="button primary">Sign in</button>
            </form>
          )
        ) : (
          <>
            <div>
              <span>Signed in as {home.user.name}</span>
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  void run(async () => {
                    await request("/api/logout", {});
                    setHome(undefined);
                    setCampaign(undefined);
                    setRoster(undefined);
                    setInvite("");
                    setCode("");
                    setName("");
                  });
                }}
              >
                Sign out
              </button>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void run(() => enterCampaign("/api/campaigns", { name }));
              }}
            >
              <label>
                Campaign name
                <input
                  value={name}
                  maxLength={80}
                  required
                  onChange={(event) => {
                    setName(event.target.value);
                  }}
                />
              </label>
              <button className="button primary">Create campaign</button>
            </form>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void run(() => enterCampaign("/api/join", { code: code.trim() }));
              }}
            >
              <label>
                Invitation code
                <input
                  value={code}
                  required
                  onChange={(event) => {
                    setCode(event.target.value);
                  }}
                />
              </label>
              <button className="button secondary">Join campaign</button>
            </form>
            <div>
              {home.campaigns.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className="button secondary"
                  aria-pressed={campaign?.id === entry.id}
                  onClick={() => {
                    void run(() => selectCampaign(entry));
                  }}
                >
                  {entry.name}
                </button>
              ))}
            </div>
            {campaign && roster && (
              <>
                <h3>{campaign.name}</h3>
                <p>
                  {roster.members
                    .map((member) => member.name + " (" + member.role + ")")
                    .join(", ")}
                </p>
                <div>
                  {campaign.role === "gm" && (
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => {
                        void run(async () => {
                          const data = z
                            .object({ code: z.string() })
                            .parse(await request("/api/campaigns/" + campaign.id + "/invite", {}));
                          setInvite(data.code);
                        });
                      }}
                    >
                      Create invitation
                    </button>
                  )}
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => {
                      void run(() => selectCampaign(campaign));
                    }}
                  >
                    Refresh roster
                  </button>
                </div>
                {invite && (
                  <label>
                    Single-use invitation (valid for 24 hours)
                    <input
                      readOnly
                      value={invite}
                      onFocus={(event) => {
                        event.target.select();
                      }}
                    />
                  </label>
                )}
                <h4>Characters</h4>
                {roster.characters.length === 0 ? (
                  <p>No characters in this campaign yet.</p>
                ) : (
                  <ul>
                    {roster.characters.map((entry) => (
                      <li key={entry.id}>
                        {entry.name} · {entry.owner}{" "}
                        <button
                          type="button"
                          className="button secondary compact"
                          onClick={() => {
                            void run(async () => {
                              const copy = characterDocumentSchema.parse(
                                await request(
                                  "/api/campaigns/" + campaign.id + "/characters/" + entry.id,
                                ),
                              );
                              const url = URL.createObjectURL(
                                new Blob([JSON.stringify(copy, null, 2)], {
                                  type: "application/json",
                                }),
                              );
                              const link = document.createElement("a");
                              link.href = url;
                              link.download = entry.name + ".json";
                              link.click();
                              URL.revokeObjectURL(url);
                            });
                          }}
                        >
                          Download sheet
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  className="button primary"
                  onClick={() => {
                    void run(async () => {
                      await request("/api/campaigns/" + campaign.id + "/characters", { character });
                      await selectCampaign(campaign);
                      setMessage("Campaign copy saved. Members can download this sheet.");
                    });
                  }}
                >
                  Import a copy of {character.name}
                </button>
              </>
            )}
          </>
        )}
      </fieldset>
      <p role="status">{busy ? "Loading campaign…" : message}</p>
    </section>
  );
}
