// Run from the repository root with Node 24.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { characterDocumentSchema } from "@dnd/character-model";
import { serveExport } from "./serve-export.mjs";

const day = 86400000;
const token = () => randomBytes(32).toString("base64url");
const digest = (value) => createHash("sha256").update(value).digest("hex");

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function openDatabase(filename) {
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, key_hash TEXT NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS sessions (
      hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users, expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS campaigns (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS members (
      campaign_id TEXT NOT NULL REFERENCES campaigns, user_id TEXT NOT NULL REFERENCES users,
      role TEXT NOT NULL CHECK(role IN ('gm','player')), PRIMARY KEY(campaign_id,user_id)
    );
    CREATE TABLE IF NOT EXISTS invitations (
      hash TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns, expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, owner_id TEXT NOT NULL,
      source_id TEXT NOT NULL, name TEXT NOT NULL, document TEXT NOT NULL,
      UNIQUE(campaign_id,owner_id,source_id),
      FOREIGN KEY(campaign_id,owner_id) REFERENCES members(campaign_id,user_id)
    );
  `);
  return db;
}

function nameValue(value) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 80)
    throw new RequestError(400, "Enter a name of 1 to 80 characters.");
  return value.trim();
}

export function createUser(db, name) {
  const key = token();
  db.prepare("INSERT INTO users VALUES (?, ?, ?)").run(randomUUID(), nameValue(name), digest(key));
  return key;
}

function transaction(db, operation) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

async function jsonBody(request) {
  if (request.headers["content-type"]?.split(";")[0] !== "application/json")
    throw new RequestError(415, "Expected JSON.");
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 512 * 1024) throw new RequestError(413, "Character document is too large.");
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
  } catch {
    /* Invalid JSON. */
  }
  throw new RequestError(400, "Expected a JSON object.");
}

export function campaignServer(db, { origin: configuredOrigin, root }) {
  const publicOrigin = () => configuredOrigin ?? "http://127.0.0.1:" + server.address().port;
  const cookie = (value, seconds) =>
    `campaign_session=${value}; HttpOnly; SameSite=Strict; Path=/api/; Max-Age=${seconds}${publicOrigin().startsWith("https:") ? "; Secure" : ""}`;
  const missing = () => new RequestError(404, "Campaign resource not found.");

  async function api(request, response, path) {
    const method = request.method;
    if (method !== "GET" && method !== "POST") throw new RequestError(405, "Unsupported method.");
    if (method === "POST" && request.headers.origin && request.headers.origin !== publicOrigin())
      throw new RequestError(403, "Origin is not permitted.");
    const body = method === "POST" ? await jsonBody(request) : {};
    if (path === "/api/login" && method === "POST") {
      const user =
        typeof body.key === "string" &&
        db.prepare("SELECT id FROM users WHERE key_hash=?").get(digest(body.key));
      if (!user) throw new RequestError(401, "Invalid access key.");
      const session = token();
      db.prepare("DELETE FROM sessions WHERE expires<=?").run(Date.now());
      db.prepare("INSERT INTO sessions VALUES (?,?,?)").run(
        digest(session),
        user.id,
        Date.now() + 7 * day,
      );
      response.setHeader("Set-Cookie", cookie(session, 7 * 86400));
      return {};
    }
    const session = /(?:^|;\s*)campaign_session=([\w-]+)/.exec(request.headers.cookie ?? "")?.[1];
    const user =
      session &&
      db
        .prepare(
          "SELECT u.id,u.name FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.hash=? AND s.expires>?",
        )
        .get(digest(session), Date.now());
    if (method === "GET" && path === "/api/session") return { signedIn: Boolean(user) };
    if (!user) throw new RequestError(401, "Sign in with your access key.");
    if (path === "/api/logout" && method === "POST") {
      db.prepare("DELETE FROM sessions WHERE hash=?").run(digest(session));
      response.setHeader("Set-Cookie", cookie("", 0));
      return {};
    }
    if (path === "/api/campaigns" && method === "GET") {
      const campaigns = db
        .prepare(
          "SELECT c.id,c.name,m.role FROM campaigns c JOIN members m ON m.campaign_id=c.id WHERE m.user_id=? ORDER BY c.name,c.id",
        )
        .all(user.id);
      return { user, campaigns };
    }
    if (path === "/api/campaigns" && method === "POST") {
      const id = randomUUID();
      return transaction(db, () => {
        db.prepare("INSERT INTO campaigns VALUES (?,?)").run(id, nameValue(body.name));
        db.prepare("INSERT INTO members VALUES (?,?,'gm')").run(id, user.id);
        return { id };
      });
    }
    if (path === "/api/join" && method === "POST") {
      return transaction(db, () => {
        const hash = digest(typeof body.code === "string" ? body.code : "");
        const invite = db
          .prepare("SELECT campaign_id AS id FROM invitations WHERE hash=? AND expires>?")
          .get(hash, Date.now());
        if (!invite) throw new RequestError(404, "Invitation is invalid or expired.");
        const added = db
          .prepare("INSERT OR IGNORE INTO members VALUES (?,?,'player')")
          .run(invite.id, user.id);
        if (!added.changes) throw new RequestError(409, "You already belong to this campaign.");
        db.prepare("DELETE FROM invitations WHERE hash=?").run(hash);
        return { id: invite.id };
      });
    }
    const match = /^\/api\/campaigns\/([\w-]+)(?:\/(invite|characters)(?:\/([\w-]+))?)?$/.exec(
      path,
    );
    if (!match) throw missing();
    const [, id, action, characterId] = match;
    const membership = db
      .prepare("SELECT role FROM members WHERE campaign_id=? AND user_id=?")
      .get(id, user.id);
    if (!membership) throw missing();
    if (!action && method === "GET") {
      return {
        members: db
          .prepare(
            "SELECT u.name,m.role FROM members m JOIN users u ON m.user_id=u.id WHERE m.campaign_id=? ORDER BY u.name",
          )
          .all(id),
        characters: db
          .prepare(
            "SELECT c.id,c.name,u.name AS owner FROM characters c JOIN users u ON c.owner_id=u.id WHERE c.campaign_id=? ORDER BY c.name,c.id",
          )
          .all(id),
      };
    }
    if (action === "invite" && !characterId && method === "POST") {
      if (membership.role !== "gm") throw new RequestError(403, "Only the GM can invite players.");
      const code = token();
      db.prepare("INSERT INTO invitations VALUES (?,?,?)").run(digest(code), id, Date.now() + day);
      return { code };
    }
    if (action === "characters" && !characterId && method === "POST") {
      const parsed = characterDocumentSchema.safeParse(body.character);
      if (!parsed.success) throw new RequestError(400, "Invalid character document.");
      const character = parsed.data;
      const copy = { ...character, id: randomUUID() };
      const inserted = db
        .prepare(
          "INSERT INTO characters VALUES (?,?,?,?,?,?) ON CONFLICT(campaign_id,owner_id,source_id) DO NOTHING",
        )
        .run(copy.id, id, user.id, character.id, copy.name, JSON.stringify(copy));
      if (!inserted.changes)
        throw new RequestError(409, "This character has already been imported.");
      return { id: copy.id };
    }
    if (action === "characters" && characterId && method === "GET") {
      const row = db
        .prepare("SELECT document FROM characters WHERE campaign_id=? AND id=?")
        .get(id, characterId);
      if (!row) throw missing();
      return JSON.parse(row.document);
    }
    throw missing();
  }
  const server = createServer(async (request, response) => {
    try {
      const path = new URL(request.url, publicOrigin()).pathname;
      if (!path.startsWith("/api/")) {
        await serveExport(root, path, response);
        return;
      }
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      const result = await api(request, response, path);
      response.end(JSON.stringify(result));
    } catch (error) {
      response.statusCode = error instanceof RequestError ? error.status : 500;
      if (response.statusCode === 500) console.error(error);
      response.end(
        JSON.stringify({ error: response.statusCode === 500 ? "Server error." : error.message }),
      );
    }
  });
  return server;
}
