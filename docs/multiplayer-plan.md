# Campaign multiplayer

## Goal and first release

Players keep the local character generator and sheet. A campaign groups people and character copies under a GM. Shared play uses the existing deterministic rules engine on the server. The browser can use the same engine to preview a result.

The first implementation adds provisioned accounts, sign-in and sign-out, campaign creation, single-use invitations, a member roster and server-stored character imports. Members can refresh the roster and download complete campaign sheets. The owner of an imported copy is the authenticated importer. The copy receives a new ID and independent state. A campaign accepts a given local character ID once per owner. Later local edits stay on the local sheet. Campaign members can see every imported character document, including its build and inventory.

### Run the first release

Use Node 24 and run these commands from the repository root after installing workspace dependencies. Build the workspace once and again after code or content changes.

```sh
pnpm build
pnpm campaign create-user Morgan
pnpm campaign create-user River
pnpm campaign
```

Each create-user command prints a private account access key once. Give each player their own key privately. Open `http://127.0.0.1:4174`, select **Campaigns**, and sign in. The GM creates a campaign and sends a single-use invitation to a player. The player signs in, joins with that code, opens their local character, and imports a copy. If the original sheet lives at another web address, use **Export** there and **Import JSON** on the campaign host first. Use **Refresh roster** to see changes from other players.

The campaign process serves the static web build and the API on the same origin. It listens on loopback. For remote users, proxy HTTPS to that listener and set `CAMPAIGN_ORIGIN` to the public origin. `PORT` selects the listener port. Sessions expire after seven days, invitations after 24 hours. Account keys, session tokens, and invitation codes are stored as hashes. The server controls membership and derives the acting user from an HTTP-only session cookie.

SQLite provides transactional persistence for one server process. The default data directory is `.campaign-data/`; override it with `CAMPAIGN_DATA_DIR`. Keep it outside the static export. To back it up, stop the server and copy the whole directory, or use SQLite's online backup facility. The static-only deployment continues to support local characters.

## Milestones and acceptance gates

1. **Durable campaigns and identities (initial slice).** Persist users, sessions, campaigns, memberships, invitations and character copies. The creator becomes GM. Only the GM issues invitations. A member can import their own sheet and read the roster. Test two independent browser sessions, duplicate imports, expired or reused invitations, outsider access, and recovery from disk. Follow up with account recovery/key rotation, membership removal, GM transfer and session revocation before a public rollout.
2. **Server-managed editing and rules versions.** Introduce a campaign character repository with owner/GM write permissions and required expected revisions. Store the engine version and a digest of the executable content bundle, including supplemental familiar data, per campaign. The existing PDF hash identifies the source document. Validate imports against the campaign rules and define migrations for old saves. Exercise simultaneous edits from two browsers and restore a backup in CI. Keep SQLite for the single-host pilot; introduce PostgreSQL with a data migration and equivalent transaction tests before running multiple application instances.
3. **Cross-character commands.** Add a campaign command endpoint for casting with a caster ID, target IDs, choices, expected revisions and a unique request ID. The server authenticates the actor, checks control of the caster, limits targets to the same campaign, loads the pinned rules and computes a proposal. Commit the caster's costs, all recipient changes and a campaign event in one transaction. A repeated request returns the original result. A conflict changes no sheets and returns the current revisions. Define player/GM confirmation for targeting, saves and table-adjudicated range. Preserve manual handling for assisted spells.
4. **Effect lifetimes, delivery and Undo.** Give each casting and applied effect an instance ID. Record its source, recipients, concentration link, expiry and stacking rules. Use ordered campaign events and a reconnect cursor to deliver changes, initially via polling or server-sent events. Undo is a permission-checked compensating command referencing the original event. Test that it preserves intervening damage, later casts and another caster's independent effects. Offline clients can preview and refresh; a stale command must pass server validation before it changes shared state.
5. **First shared-spell acceptance test.** A Cleric casts Bless on another player's character. Both sessions see one committed casting, one spent slot, and the recipient's d4 on applicable rolls. Retrying spends nothing. Ending concentration removes that casting's effects, including for a disconnected player on reconnect. Cross-campaign targets are rejected. Then add healing, multi-target spells, and save-dependent effects using the same command contract.

## Rules ownership

Keep class focus permissions and familiar stat-block facts with versioned SRD content. Core rules expose those lookups alongside spell preparation, healing dice and modifiers, damage, conditions, concentration, currency, purchases, equipment, and attunement operations. Browser, CLI, and server callers can apply the same operations to a character document. UI components own input, layout, and feedback. For milestone 3, extend the existing cast proposal to cover every affected document in one command.
