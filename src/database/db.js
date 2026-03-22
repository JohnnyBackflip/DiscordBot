const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'bot.db'));

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

// ─── Schema ────────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS instances (
    name        TEXT PRIMARY KEY,
    host        TEXT NOT NULL DEFAULT 'localhost',
    port        INTEGER NOT NULL,
    description TEXT DEFAULT '',
    active      INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS user_permissions (
    user_id       TEXT NOT NULL,
    instance_name TEXT NOT NULL,
    granted_by    TEXT NOT NULL,
    granted_at    TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, instance_name),
    FOREIGN KEY (instance_name) REFERENCES instances(name) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS command_permissions (
    user_id      TEXT NOT NULL,
    command_name TEXT NOT NULL,
    allowed      INTEGER NOT NULL DEFAULT 0,
    set_by       TEXT NOT NULL,
    PRIMARY KEY (user_id, command_name)
  );

  CREATE TABLE IF NOT EXISTS user_settings (
    user_id        TEXT PRIMARY KEY,
    default_model  TEXT DEFAULT NULL,
    updated_at     TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS model_restrictions (
    user_id   TEXT NOT NULL,
    model     TEXT NOT NULL,
    type      TEXT NOT NULL CHECK(type IN ('lock', 'block')),
    set_by    TEXT NOT NULL,
    PRIMARY KEY (user_id, model, type)
  );
`);

// ─── Instance Helpers ──────────────────────────────────────────────────────────

const stmts = {
  addInstance: db.prepare(
    `INSERT OR REPLACE INTO instances (name, host, port, description) VALUES (?, ?, ?, ?)`
  ),
  removeInstance: db.prepare(`DELETE FROM instances WHERE name = ?`),
  getInstance: db.prepare(`SELECT * FROM instances WHERE name = ?`),
  listInstances: db.prepare(`SELECT * FROM instances ORDER BY name`),
  setInstanceActive: db.prepare(`UPDATE instances SET active = ? WHERE name = ?`),

  // Permissions
  grantAccess: db.prepare(
    `INSERT OR REPLACE INTO user_permissions (user_id, instance_name, granted_by) VALUES (?, ?, ?)`
  ),
  revokeAccess: db.prepare(
    `DELETE FROM user_permissions WHERE user_id = ? AND instance_name = ?`
  ),
  revokeAllAccess: db.prepare(`DELETE FROM user_permissions WHERE user_id = ?`),
  hasAccess: db.prepare(
    `SELECT 1 FROM user_permissions WHERE user_id = ? AND instance_name = ?`
  ),
  getUserInstances: db.prepare(
    `SELECT instance_name FROM user_permissions WHERE user_id = ?`
  ),
  getInstanceUsers: db.prepare(
    `SELECT user_id FROM user_permissions WHERE instance_name = ?`
  ),

  // Command permissions
  setCommandAccess: db.prepare(
    `INSERT OR REPLACE INTO command_permissions (user_id, command_name, allowed, set_by) VALUES (?, ?, ?, ?)`
  ),
  getCommandAccess: db.prepare(
    `SELECT allowed FROM command_permissions WHERE user_id = ? AND command_name = ?`
  ),
  getUserCommands: db.prepare(
    `SELECT command_name, allowed FROM command_permissions WHERE user_id = ?`
  ),
  removeCommandAccess: db.prepare(
    `DELETE FROM command_permissions WHERE user_id = ? AND command_name = ?`
  ),

  // User settings
  setDefaultModel: db.prepare(
    `INSERT INTO user_settings (user_id, default_model, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET default_model = excluded.default_model, updated_at = datetime('now')`
  ),
  getDefaultModel: db.prepare(
    `SELECT default_model FROM user_settings WHERE user_id = ?`
  ),

  // Model restrictions
  addModelRestriction: db.prepare(
    `INSERT OR REPLACE INTO model_restrictions (user_id, model, type, set_by) VALUES (?, ?, ?, ?)`
  ),
  removeModelRestriction: db.prepare(
    `DELETE FROM model_restrictions WHERE user_id = ? AND model = ? AND type = ?`
  ),
  getModelRestrictions: db.prepare(
    `SELECT model, type FROM model_restrictions WHERE user_id = ?`
  ),
  isModelBlocked: db.prepare(
    `SELECT 1 FROM model_restrictions WHERE user_id = ? AND model = ? AND type = 'block'`
  ),
  getLockedModel: db.prepare(
    `SELECT model FROM model_restrictions WHERE user_id = ? AND type = 'lock' LIMIT 1`
  ),
};

module.exports = { db, stmts };
