const { Pool } = require('pg');
const { AsyncLocalStorage } = require('async_hooks');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('neon.tech')
    ? { rejectUnauthorized: false }
    : false,
});

const txStore = new AsyncLocalStorage();

function getClient() {
  return txStore.getStore() || pool;
}

async function queryAll(sql, params) {
  const client = getClient();
  const result = await client.query(sql, params);
  return result.rows;
}

async function queryOne(sql, params) {
  const rows = await queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

async function runSQL(sql, params) {
  const client = getClient();
  await client.query(sql, params);
}

async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await txStore.run(client, fn);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// ---- Init ----

async function initDB() {
  // Families
  await runSQL(`
    CREATE TABLE IF NOT EXISTS families (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      invite_code TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Users
  await runSQL(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('parent','child')),
      family_id INTEGER NOT NULL REFERENCES families(id),
      display_name TEXT NOT NULL,
      avatar_emoji TEXT DEFAULT '🐼',
      shop_name TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Tasks
  await runSQL(`
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      family_id INTEGER NOT NULL REFERENCES families(id),
      icon TEXT NOT NULL,
      title TEXT NOT NULL,
      points INTEGER NOT NULL CHECK(points > 0),
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Task completions
  await runSQL(`
    CREATE TABLE IF NOT EXISTS task_completions (
      id SERIAL PRIMARY KEY,
      task_id INTEGER NOT NULL REFERENCES tasks(id),
      child_id INTEGER NOT NULL REFERENCES users(id),
      completed_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected')),
      points_awarded INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(task_id, child_id, completed_date)
    )
  `);

  // Rewards
  await runSQL(`
    CREATE TABLE IF NOT EXISTS rewards (
      id SERIAL PRIMARY KEY,
      family_id INTEGER NOT NULL REFERENCES families(id),
      icon TEXT NOT NULL,
      title TEXT NOT NULL,
      cost INTEGER NOT NULL CHECK(cost > 0),
      is_active INTEGER DEFAULT 1,
      creator_id INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Reward redemptions
  await runSQL(`
    CREATE TABLE IF NOT EXISTS reward_redemptions (
      id SERIAL PRIMARY KEY,
      reward_id INTEGER NOT NULL REFERENCES rewards(id),
      child_id INTEGER NOT NULL REFERENCES users(id),
      points_spent INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Point history
  await runSQL(`
    CREATE TABLE IF NOT EXISTS point_history (
      id SERIAL PRIMARY KEY,
      family_id INTEGER NOT NULL REFERENCES families(id),
      child_id INTEGER NOT NULL REFERENCES users(id),
      operator_id INTEGER NOT NULL REFERENCES users(id),
      change_amount INTEGER NOT NULL,
      reason TEXT NOT NULL,
      reason_type TEXT NOT NULL CHECK(reason_type IN ('task_completion','manual_adjust','reward_redemption','reward_reject_refund')),
      ref_id INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Pets
  await runSQL(`
    CREATE TABLE IF NOT EXISTS pets (
      id SERIAL PRIMARY KEY,
      child_id INTEGER NOT NULL REFERENCES users(id) UNIQUE,
      pet_type TEXT NOT NULL CHECK(pet_type IN ('cat','dog','rabbit')),
      pet_name TEXT NOT NULL,
      hunger INTEGER DEFAULT 80 CHECK(hunger >= 0 AND hunger <= 100),
      mood INTEGER DEFAULT 80 CHECK(mood >= 0 AND mood <= 100),
      clean INTEGER DEFAULT 80 CHECK(clean >= 0 AND clean <= 100),
      last_decay_at TIMESTAMPTZ DEFAULT NOW(),
      adopted_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Migrations
  await runSQL('ALTER TABLE users ADD COLUMN IF NOT EXISTS shop_name TEXT');
  await runSQL('ALTER TABLE rewards ADD COLUMN IF NOT EXISTS creator_id INTEGER REFERENCES users(id)');

  // View
  await runSQL('CREATE OR REPLACE VIEW child_points AS SELECT child_id, SUM(change_amount) AS total_points FROM point_history GROUP BY child_id');

  console.log('Database initialized');
}

// ---- Family helpers ----

async function createFamily(name) {
  const code = await generateInviteCode();
  return queryOne(
    'INSERT INTO families (name, invite_code) VALUES ($1, $2) RETURNING *',
    [name, code]
  );
}

async function generateInviteCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (await queryOne('SELECT id FROM families WHERE invite_code = $1', [code]));
  return code;
}

// ---- User helpers ----

async function createUser(username, passwordHash, role, familyId, displayName, avatarEmoji) {
  const defaultShop = role === 'parent' ? (displayName + '的小店') : null;
  return queryOne(
    'INSERT INTO users (username, password_hash, role, family_id, display_name, avatar_emoji, shop_name) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, username, role, family_id, display_name, avatar_emoji, shop_name, created_at',
    [username, passwordHash, role, familyId, displayName, avatarEmoji || '🐼', defaultShop]
  );
}

async function getUserByUsername(username) {
  return queryOne('SELECT * FROM users WHERE username = $1', [username]);
}

async function updateUser(id, fields) {
  const sets = [];
  const params = [];
  let p = 1;
  if (fields.display_name !== undefined) { sets.push('display_name = $' + (p++)); params.push(fields.display_name); }
  if (fields.avatar_emoji !== undefined) { sets.push('avatar_emoji = $' + (p++)); params.push(fields.avatar_emoji); }
  if (fields.shop_name !== undefined) { sets.push('shop_name = $' + (p++)); params.push(fields.shop_name); }
  if (fields.password_hash !== undefined) { sets.push('password_hash = $' + (p++)); params.push(fields.password_hash); }
  if (sets.length === 0) return null;
  params.push(id);
  await runSQL('UPDATE users SET ' + sets.join(', ') + ' WHERE id = $' + p, params);
  return queryOne('SELECT id, username, role, family_id, display_name, avatar_emoji, shop_name, created_at FROM users WHERE id = $1', [id]);
}

async function getUserById(id) {
  return queryOne('SELECT id, username, role, family_id, display_name, avatar_emoji, shop_name, created_at FROM users WHERE id = $1', [id]);
}

async function getFamilyMembers(familyId) {
  return queryAll(
    'SELECT id, username, role, family_id, display_name, avatar_emoji, shop_name, created_at FROM users WHERE family_id = $1 ORDER BY role, created_at',
    [familyId]
  );
}

async function getChildren(familyId) {
  return queryAll(
    'SELECT u.id, u.username, u.display_name, u.avatar_emoji, COALESCE(cp.total_points, 0) AS total_points FROM users u LEFT JOIN child_points cp ON cp.child_id = u.id WHERE u.family_id = $1 AND u.role = $2 ORDER BY u.created_at',
    [familyId, 'child']
  );
}

// ---- Task helpers ----

async function getTasksWithStatus(familyId, childId, date) {
  return queryAll(
    `SELECT t.id, t.icon, t.title, t.points, t.is_active,
            tc.id AS completion_id, tc.status AS completion_status
     FROM tasks t
     LEFT JOIN task_completions tc ON tc.task_id = t.id AND tc.child_id = $1 AND tc.completed_date = $2
     WHERE t.family_id = $3 AND t.is_active = 1
     ORDER BY t.id`,
    [childId, date, familyId]
  );
}

async function createTask(familyId, icon, title, points) {
  return queryOne(
    'INSERT INTO tasks (family_id, icon, title, points) VALUES ($1, $2, $3, $4) RETURNING *',
    [familyId, icon, title, points]
  );
}

async function updateTask(taskId, familyId, fields) {
  const sets = [];
  const params = [];
  let p = 1;
  if (fields.icon !== undefined) { sets.push('icon = $' + (p++)); params.push(fields.icon); }
  if (fields.title !== undefined) { sets.push('title = $' + (p++)); params.push(fields.title); }
  if (fields.points !== undefined) { sets.push('points = $' + (p++)); params.push(fields.points); }
  if (fields.is_active !== undefined) { sets.push('is_active = $' + (p++)); params.push(fields.is_active); }
  if (sets.length === 0) return null;
  params.push(taskId);
  params.push(familyId);
  await runSQL('UPDATE tasks SET ' + sets.join(', ') + ' WHERE id = $' + (p++) + ' AND family_id = $' + p, params);
  return queryOne('SELECT * FROM tasks WHERE id = $1', [taskId]);
}

async function deleteTask(taskId, familyId) {
  await runSQL('UPDATE tasks SET is_active = 0 WHERE id = $1 AND family_id = $2', [taskId, familyId]);
}

// ---- Task completion helpers ----

async function getCompletion(taskId, childId, date) {
  return queryOne(
    'SELECT * FROM task_completions WHERE task_id = $1 AND child_id = $2 AND completed_date = $3',
    [taskId, childId, date]
  );
}

async function createCompletion(taskId, childId, date, status) {
  const row = await queryOne(
    'INSERT INTO task_completions (task_id, child_id, completed_date, status) VALUES ($1, $2, $3, $4) ON CONFLICT (task_id, child_id, completed_date) DO NOTHING RETURNING *',
    [taskId, childId, date, status]
  );
  if (row) return row;
  // Conflict occurred — return existing row
  return queryOne(
    'SELECT * FROM task_completions WHERE task_id = $1 AND child_id = $2 AND completed_date = $3',
    [taskId, childId, date]
  );
}

async function getPendingReviews(familyId) {
  return queryAll(
    `SELECT tc.id, tc.task_id, tc.child_id, tc.completed_date, tc.status, tc.created_at,
            t.icon, t.title AS task_title, t.points,
            u.display_name AS child_name, u.avatar_emoji AS child_avatar
     FROM task_completions tc
     JOIN tasks t ON t.id = tc.task_id
     JOIN users u ON u.id = tc.child_id
     WHERE t.family_id = $1 AND tc.status = 'pending'
     ORDER BY tc.created_at DESC`,
    [familyId]
  );
}

async function approveCompletion(completionId, taskPoints) {
  await runSQL(
    "UPDATE task_completions SET status = 'approved', points_awarded = $1, updated_at = NOW() WHERE id = $2 AND status = 'pending'",
    [taskPoints, completionId]
  );
  return queryOne('SELECT * FROM task_completions WHERE id = $1', [completionId]);
}

async function rejectCompletion(completionId) {
  await runSQL(
    "UPDATE task_completions SET status = 'rejected', updated_at = NOW() WHERE id = $1 AND status = 'pending'",
    [completionId]
  );
}

async function resetAllTasks(familyId, date) {
  await runSQL(
    `UPDATE task_completions SET status = 'rejected', updated_at = NOW()
     WHERE status = 'pending' AND completed_date = $1 AND task_id IN (SELECT id FROM tasks WHERE family_id = $2)`,
    [date, familyId]
  );
}

// ---- Reward helpers ----

async function getRewards(familyId) {
  return queryAll(
    `SELECT r.id, r.icon, r.title, r.cost, r.is_active, r.creator_id,
            u.display_name AS creator_name, u.avatar_emoji AS creator_emoji, u.shop_name AS creator_shop
     FROM rewards r
     LEFT JOIN users u ON u.id = r.creator_id
     WHERE r.family_id = $1 AND r.is_active = 1
     ORDER BY r.creator_id, r.id`,
    [familyId]
  );
}

async function getRewardById(rewardId) {
  return queryOne('SELECT * FROM rewards WHERE id = $1', [rewardId]);
}

async function createReward(familyId, icon, title, cost, creatorId) {
  return queryOne(
    'INSERT INTO rewards (family_id, icon, title, cost, creator_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [familyId, icon, title, cost, creatorId || null]
  );
}

async function updateReward(rewardId, familyId, fields) {
  const sets = [];
  const params = [];
  let p = 1;
  if (fields.icon !== undefined) { sets.push('icon = $' + (p++)); params.push(fields.icon); }
  if (fields.title !== undefined) { sets.push('title = $' + (p++)); params.push(fields.title); }
  if (fields.cost !== undefined) { sets.push('cost = $' + (p++)); params.push(fields.cost); }
  if (sets.length === 0) return null;
  params.push(rewardId);
  params.push(familyId);
  await runSQL('UPDATE rewards SET ' + sets.join(', ') + ' WHERE id = $' + (p++) + ' AND family_id = $' + p, params);
  return queryOne('SELECT * FROM rewards WHERE id = $1', [rewardId]);
}

async function deleteReward(rewardId, familyId) {
  await runSQL('UPDATE rewards SET is_active = 0 WHERE id = $1 AND family_id = $2', [rewardId, familyId]);
}

async function createRedemption(rewardId, childId, pointsSpent) {
  return queryOne(
    'INSERT INTO reward_redemptions (reward_id, child_id, points_spent) VALUES ($1, $2, $3) RETURNING *',
    [rewardId, childId, pointsSpent]
  );
}

// ---- Point history helpers ----

async function getChildPoints(childId) {
  const row = await queryOne('SELECT total_points FROM child_points WHERE child_id = $1', [childId]);
  return row ? row.total_points : 0;
}

async function addPointHistory(familyId, childId, operatorId, changeAmount, reason, reasonType, refId) {
  return queryOne(
    'INSERT INTO point_history (family_id, child_id, operator_id, change_amount, reason, reason_type, ref_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
    [familyId, childId, operatorId, changeAmount, reason, reasonType, refId || null]
  );
}

async function getHistory(familyId, childId, limit) {
  let sql = `
    SELECT ph.id, ph.child_id, ph.operator_id, ph.change_amount, ph.reason, ph.reason_type, ph.created_at,
           u.display_name AS child_name
    FROM point_history ph
    JOIN users u ON u.id = ph.child_id
    WHERE ph.family_id = $1
  `;
  const params = [familyId];

  if (childId) {
    sql += ' AND ph.child_id = $' + (params.length + 1);
    params.push(childId);
  }

  sql += ' ORDER BY ph.created_at DESC LIMIT $' + (params.length + 1);
  params.push(limit || 50);

  return queryAll(sql, params);
}

// ---- Seed data ----

async function seedDefaults(familyId, creatorId) {
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
    await runSQL('INSERT INTO tasks (family_id, icon, title, points) VALUES ($1, $2, $3, $4)', [familyId, t.icon, t.title, t.points]);
  }

  for (const r of defaultRewards) {
    await runSQL('INSERT INTO rewards (family_id, icon, title, cost, creator_id) VALUES ($1, $2, $3, $4, $5)', [familyId, r.icon, r.title, r.cost, creatorId || null]);
  }
}

// ---- Pet helpers ----

async function getPetByChildId(childId) {
  return queryOne('SELECT * FROM pets WHERE child_id = $1', [childId]);
}

async function createPet(childId, petType, petName) {
  return queryOne(
    'INSERT INTO pets (child_id, pet_type, pet_name) VALUES ($1, $2, $3) RETURNING *',
    [childId, petType, petName]
  );
}

async function applyDecay(pet) {
  if (!pet) return null;
  var now = new Date();
  var last = new Date(pet.last_decay_at);
  var hours = Math.floor((now - last) / (1000 * 60 * 60));
  if (hours <= 0) return pet;

  var decay = hours * 5;
  var newHunger = Math.max(0, pet.hunger - decay);
  var newMood = Math.max(0, pet.mood - Math.floor(decay * 0.6));
  var newClean = Math.max(0, pet.clean - Math.floor(decay * 0.4));

  await runSQL(
    'UPDATE pets SET hunger = $1, mood = $2, clean = $3, last_decay_at = NOW() WHERE id = $4',
    [newHunger, newMood, newClean, pet.id]
  );
  return getPetByChildId(pet.child_id);
}

async function carePet(petId, action) {
  var pet = await queryOne('SELECT * FROM pets WHERE id = $1', [petId]);
  if (!pet) return null;

  if (action === 'feed') {
    var h = Math.min(100, pet.hunger + 25);
    await runSQL('UPDATE pets SET hunger = $1 WHERE id = $2', [h, petId]);
  } else if (action === 'play') {
    var m = Math.min(100, pet.mood + 30);
    await runSQL('UPDATE pets SET mood = $1 WHERE id = $2', [m, petId]);
  } else if (action === 'clean') {
    var c = Math.min(100, pet.clean + 35);
    await runSQL('UPDATE pets SET clean = $1 WHERE id = $2', [c, petId]);
  }

  return queryOne('SELECT * FROM pets WHERE id = $1', [petId]);
}

function getCareCost(action) {
  if (action === 'feed') return 3;
  if (action === 'play') return 2;
  if (action === 'clean') return 2;
  return 0;
}

function getCareActionName(action) {
  if (action === 'feed') return '喂养';
  if (action === 'play') return '玩耍';
  if (action === 'clean') return '清洁';
  return '';
}

// ---- Backup stubs (cloud DB handles persistence) ----

function listBackups() {
  return [];
}

function restoreBackup(filename) {
  return false;
}

module.exports = {
  initDB,
  queryAll,
  queryOne,
  runSQL,
  transaction,
  createFamily,
  generateInviteCode,
  createUser,
  getUserByUsername,
  getUserById,
  updateUser,
  getFamilyMembers,
  getChildren,
  getTasksWithStatus,
  createTask,
  updateTask,
  deleteTask,
  getCompletion,
  createCompletion,
  getPendingReviews,
  approveCompletion,
  rejectCompletion,
  resetAllTasks,
  getRewards,
  getRewardById,
  createReward,
  updateReward,
  deleteReward,
  createRedemption,
  getChildPoints,
  addPointHistory,
  getHistory,
  seedDefaults,
  listBackups,
  restoreBackup,
  getPetByChildId,
  createPet,
  applyDecay,
  carePet,
  getCareCost,
  getCareActionName,
};
