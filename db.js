const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'family.db');

let db = null;
let _inTransaction = false;

function saveDB() {
  if (!db) return;
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DB_PATH, db.export());
}

function getDB() {
  return db;
}

async function initDB() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA foreign_keys = ON');

  db.run(`
    CREATE TABLE IF NOT EXISTS families (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      invite_code TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('parent','child')),
      family_id INTEGER NOT NULL REFERENCES families(id),
      display_name TEXT NOT NULL,
      avatar_emoji TEXT DEFAULT '🐼',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_id INTEGER NOT NULL REFERENCES families(id),
      icon TEXT NOT NULL,
      title TEXT NOT NULL,
      points INTEGER NOT NULL CHECK(points > 0),
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS task_completions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES tasks(id),
      child_id INTEGER NOT NULL REFERENCES users(id),
      completed_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected')),
      points_awarded INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE(task_id, child_id, completed_date)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS rewards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_id INTEGER NOT NULL REFERENCES families(id),
      icon TEXT NOT NULL,
      title TEXT NOT NULL,
      cost INTEGER NOT NULL CHECK(cost > 0),
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS reward_redemptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reward_id INTEGER NOT NULL REFERENCES rewards(id),
      child_id INTEGER NOT NULL REFERENCES users(id),
      points_spent INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS point_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_id INTEGER NOT NULL REFERENCES families(id),
      child_id INTEGER NOT NULL REFERENCES users(id),
      operator_id INTEGER NOT NULL REFERENCES users(id),
      change_amount INTEGER NOT NULL,
      reason TEXT NOT NULL,
      reason_type TEXT NOT NULL CHECK(reason_type IN ('task_completion','manual_adjust','reward_redemption','reward_reject_refund')),
      ref_id INTEGER,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  // Drop old view first (sql.js doesn't support CREATE VIEW IF NOT EXISTS cleanly)
  db.run('DROP VIEW IF EXISTS child_points');
  db.run(`
    CREATE VIEW child_points AS
    SELECT child_id, SUM(change_amount) AS total_points
    FROM point_history
    GROUP BY child_id
  `);

  saveDB();
  return db;
}

// ---- Query helpers ----

function queryAll(sql, params) {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function queryOne(sql, params) {
  const rows = queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

function runSQL(sql, params) {
  db.run(sql, params);
  if (!_inTransaction) saveDB();
}

// ---- Family helpers ----

function createFamily(name) {
  const code = generateInviteCode();
  runSQL('INSERT INTO families (name, invite_code) VALUES (?, ?)', [name, code]);
  const family = queryOne('SELECT * FROM families WHERE invite_code = ?', [code]);
  return family;
}

function generateInviteCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (queryOne('SELECT id FROM families WHERE invite_code = ?', [code]));
  return code;
}

// ---- User helpers ----

function createUser(username, passwordHash, role, familyId, displayName, avatarEmoji) {
  runSQL(
    'INSERT INTO users (username, password_hash, role, family_id, display_name, avatar_emoji) VALUES (?, ?, ?, ?, ?, ?)',
    [username, passwordHash, role, familyId, displayName, avatarEmoji || '🐼']
  );
  return queryOne('SELECT id, username, role, family_id, display_name, avatar_emoji, created_at FROM users WHERE username = ?', [username]);
}

function getUserByUsername(username) {
  return queryOne('SELECT * FROM users WHERE username = ?', [username]);
}

function getUserById(id) {
  return queryOne('SELECT id, username, role, family_id, display_name, avatar_emoji, created_at FROM users WHERE id = ?', [id]);
}

function getFamilyMembers(familyId) {
  return queryAll(
    'SELECT id, username, role, family_id, display_name, avatar_emoji, created_at FROM users WHERE family_id = ? ORDER BY role, created_at',
    [familyId]
  );
}

function getChildren(familyId) {
  const children = queryAll(
    'SELECT u.id, u.username, u.display_name, u.avatar_emoji, COALESCE(cp.total_points, 0) AS total_points FROM users u LEFT JOIN child_points cp ON cp.child_id = u.id WHERE u.family_id = ? AND u.role = ? ORDER BY u.created_at',
    [familyId, 'child']
  );
  return children;
}

// ---- Task helpers ----

function getTasksWithStatus(familyId, childId, date) {
  return queryAll(
    `SELECT t.id, t.icon, t.title, t.points, t.is_active,
            tc.id AS completion_id, tc.status AS completion_status
     FROM tasks t
     LEFT JOIN task_completions tc ON tc.task_id = t.id AND tc.child_id = ? AND tc.completed_date = ?
     WHERE t.family_id = ? AND t.is_active = 1
     ORDER BY t.id`,
    [childId, date, familyId]
  );
}

function createTask(familyId, icon, title, points) {
  runSQL('INSERT INTO tasks (family_id, icon, title, points) VALUES (?, ?, ?, ?)', [familyId, icon, title, points]);
  return queryOne('SELECT * FROM tasks WHERE id = last_insert_rowid()');
}

function updateTask(taskId, familyId, fields) {
  const sets = [];
  const params = [];
  if (fields.icon !== undefined) { sets.push('icon = ?'); params.push(fields.icon); }
  if (fields.title !== undefined) { sets.push('title = ?'); params.push(fields.title); }
  if (fields.points !== undefined) { sets.push('points = ?'); params.push(fields.points); }
  if (fields.is_active !== undefined) { sets.push('is_active = ?'); params.push(fields.is_active); }
  if (sets.length === 0) return null;
  params.push(taskId, familyId);
  runSQL(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ? AND family_id = ?`, params);
  return queryOne('SELECT * FROM tasks WHERE id = ?', [taskId]);
}

function deleteTask(taskId, familyId) {
  runSQL('UPDATE tasks SET is_active = 0 WHERE id = ? AND family_id = ?', [taskId, familyId]);
}

// ---- Task completion helpers ----

function getCompletion(taskId, childId, date) {
  return queryOne(
    'SELECT * FROM task_completions WHERE task_id = ? AND child_id = ? AND completed_date = ?',
    [taskId, childId, date]
  );
}

function createCompletion(taskId, childId, date, status) {
  runSQL(
    'INSERT OR IGNORE INTO task_completions (task_id, child_id, completed_date, status) VALUES (?, ?, ?, ?)',
    [taskId, childId, date, status]
  );
  return queryOne(
    'SELECT * FROM task_completions WHERE task_id = ? AND child_id = ? AND completed_date = ?',
    [taskId, childId, date]
  );
}

function getPendingReviews(familyId) {
  return queryAll(
    `SELECT tc.id, tc.task_id, tc.child_id, tc.completed_date, tc.status, tc.created_at,
            t.icon, t.title AS task_title, t.points,
            u.display_name AS child_name, u.avatar_emoji AS child_avatar
     FROM task_completions tc
     JOIN tasks t ON t.id = tc.task_id
     JOIN users u ON u.id = tc.child_id
     WHERE t.family_id = ? AND tc.status = 'pending'
     ORDER BY tc.created_at DESC`,
    [familyId]
  );
}

function approveCompletion(completionId, taskPoints) {
  runSQL(
    "UPDATE task_completions SET status = 'approved', points_awarded = ?, updated_at = datetime('now','localtime') WHERE id = ? AND status = 'pending'",
    [taskPoints, completionId]
  );
  return queryOne('SELECT * FROM task_completions WHERE id = ?', [completionId]);
}

function rejectCompletion(completionId) {
  runSQL(
    "UPDATE task_completions SET status = 'rejected', updated_at = datetime('now','localtime') WHERE id = ? AND status = 'pending'",
    [completionId]
  );
}

function resetAllTasks(familyId, date) {
  // Reset task completions for today — mark pending ones as rejected
  runSQL(
    `UPDATE task_completions SET status = 'rejected', updated_at = datetime('now','localtime')
     WHERE status = 'pending' AND completed_date = ? AND task_id IN (SELECT id FROM tasks WHERE family_id = ?)`,
    [date, familyId]
  );
}

// ---- Reward helpers ----

function getRewards(familyId) {
  return queryAll(
    'SELECT id, icon, title, cost, is_active FROM rewards WHERE family_id = ? AND is_active = 1 ORDER BY id',
    [familyId]
  );
}

function getRewardById(rewardId) {
  return queryOne('SELECT * FROM rewards WHERE id = ?', [rewardId]);
}

function createReward(familyId, icon, title, cost) {
  runSQL('INSERT INTO rewards (family_id, icon, title, cost) VALUES (?, ?, ?, ?)', [familyId, icon, title, cost]);
  return queryOne('SELECT * FROM rewards WHERE id = last_insert_rowid()');
}

function updateReward(rewardId, familyId, fields) {
  const sets = [];
  const params = [];
  if (fields.icon !== undefined) { sets.push('icon = ?'); params.push(fields.icon); }
  if (fields.title !== undefined) { sets.push('title = ?'); params.push(fields.title); }
  if (fields.cost !== undefined) { sets.push('cost = ?'); params.push(fields.cost); }
  if (sets.length === 0) return null;
  params.push(rewardId, familyId);
  runSQL(`UPDATE rewards SET ${sets.join(', ')} WHERE id = ? AND family_id = ?`, params);
  return queryOne('SELECT * FROM rewards WHERE id = ?', [rewardId]);
}

function deleteReward(rewardId, familyId) {
  runSQL('UPDATE rewards SET is_active = 0 WHERE id = ? AND family_id = ?', [rewardId, familyId]);
}

function createRedemption(rewardId, childId, pointsSpent) {
  runSQL('INSERT INTO reward_redemptions (reward_id, child_id, points_spent) VALUES (?, ?, ?)', [rewardId, childId, pointsSpent]);
  return queryOne('SELECT * FROM reward_redemptions WHERE id = last_insert_rowid()');
}

// ---- Point history helpers ----

function getChildPoints(childId) {
  const row = queryOne('SELECT total_points FROM child_points WHERE child_id = ?', [childId]);
  return row ? row.total_points : 0;
}

function addPointHistory(familyId, childId, operatorId, changeAmount, reason, reasonType, refId) {
  runSQL(
    'INSERT INTO point_history (family_id, child_id, operator_id, change_amount, reason, reason_type, ref_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [familyId, childId, operatorId, changeAmount, reason, reasonType, refId || null]
  );
  return queryOne('SELECT * FROM point_history WHERE id = last_insert_rowid()');
}

function getHistory(familyId, childId, limit) {
  let sql = `
    SELECT ph.id, ph.child_id, ph.operator_id, ph.change_amount, ph.reason, ph.reason_type, ph.created_at,
           u.display_name AS child_name
    FROM point_history ph
    JOIN users u ON u.id = ph.child_id
    WHERE ph.family_id = ?
  `;
  const params = [familyId];

  if (childId) {
    sql += ' AND ph.child_id = ?';
    params.push(childId);
  }

  sql += ' ORDER BY ph.created_at DESC LIMIT ?';
  params.push(limit || 50);

  return queryAll(sql, params);
}

// ---- Seed data ----

function seedDefaults(familyId) {
  const defaultTasks = [
    { icon: '🪥', title: '按时刷牙洗脸', points: 5 },
    { icon: '✏️', title: '认真写完作业', points: 10 },
    { icon: '📖', title: '课外阅读 20 分钟', points: 8 },
    { icon: '🧹', title: '整理自己的书桌', points: 5 },
    { icon: '😴', title: '晚上9点前上床', points: 10 },
  ];

  const defaultRewards = [
    { icon: '📺', title: '看电视 30 分钟', cost: 20 },
    { icon: '🎮', title: '玩平板 20 分钟', cost: 25 },
    { icon: '🍦', title: '周末吃冰淇淋', cost: 15 },
    { icon: '🧸', title: '兑换小玩具 (50元内)', cost: 80 },
    { icon: '🎢', title: '周末去游乐场', cost: 120 },
  ];

  for (const t of defaultTasks) {
    runSQL('INSERT INTO tasks (family_id, icon, title, points) VALUES (?, ?, ?, ?)', [familyId, t.icon, t.title, t.points]);
  }

  for (const r of defaultRewards) {
    runSQL('INSERT INTO rewards (family_id, icon, title, cost) VALUES (?, ?, ?, ?)', [familyId, r.icon, r.title, r.cost]);
  }
}

// ---- Transaction helper ----

function transaction(fn) {
  _inTransaction = true;
  db.run('BEGIN');
  try {
    const result = fn();
    db.run('COMMIT');
    _inTransaction = false;
    saveDB();
    return result;
  } catch (e) {
    _inTransaction = false;
    try { db.run('ROLLBACK'); } catch (_) {}
    saveDB();
    throw e;
  }
}

module.exports = {
  initDB,
  getDB,
  queryAll,
  queryOne,
  runSQL,
  transaction,
  // Family
  createFamily,
  generateInviteCode,
  // User
  createUser,
  getUserByUsername,
  getUserById,
  getFamilyMembers,
  getChildren,
  // Tasks
  getTasksWithStatus,
  createTask,
  updateTask,
  deleteTask,
  // Completions
  getCompletion,
  createCompletion,
  getPendingReviews,
  approveCompletion,
  rejectCompletion,
  resetAllTasks,
  // Rewards
  getRewards,
  getRewardById,
  createReward,
  updateReward,
  deleteReward,
  createRedemption,
  // Points
  getChildPoints,
  addPointHistory,
  getHistory,
  // Seed
  seedDefaults,
};
