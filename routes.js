const {
  createFamily, createUser, getUserByUsername, getUserById, getFamilyMembers, getChildren,
  getTasksWithStatus, createTask, updateTask, deleteTask,
  getCompletion, createCompletion, getPendingReviews, approveCompletion, rejectCompletion, resetAllTasks,
  getRewards, getRewardById, createReward, updateReward, deleteReward, createRedemption,
  getChildPoints, addPointHistory, getHistory,
  seedDefaults, transaction, queryOne, updateUser, listBackups, restoreBackup,
  getPetByChildId, createPet, applyDecay, carePet, getCareCost, getCareActionName,
} = require('./db');
const { hashPassword, comparePassword, generateToken, requireAuth, requireParent } = require('./auth');

function today() {
  return new Date().toISOString().slice(0, 10);
}

// Simple validation helpers
function validate(v, field, min, max) {
  const s = (v || '').toString().trim();
  if (!s) return field + '不能为空';
  if (s.length < min || s.length > max) return field + '需要' + min + '-' + max + '个字符';
  return null;
}

function validateInt(v, field, min, max) {
  const n = parseInt(v, 10);
  if (isNaN(n) || n < min || n > max) return field + '需要在' + min + '-' + max + '之间';
  return null;
}

function badRequest(res, msg) {
  return res.status(400).json({ ok: false, error: msg });
}

function serverError(res, msg) {
  return res.status(500).json({ ok: false, error: msg || '服务器错误' });
}

// Simple in-memory rate limiter for auth routes
const rateLimitMap = {};
function rateLimit(req, res, next) {
  const ip = req.ip || '127.0.0.1';
  const now = Date.now();
  if (!rateLimitMap[ip]) rateLimitMap[ip] = [];
  rateLimitMap[ip] = rateLimitMap[ip].filter(t => now - t < 1000);
  if (rateLimitMap[ip].length >= 5) {
    return res.status(429).json({ ok: false, error: '请求太频繁，请稍后重试' });
  }
  rateLimitMap[ip].push(now);
  next();
}

function registerRoutes(app) {

  // ==================== Auth Routes ====================

  app.post('/api/auth/register', rateLimit, (req, res) => {
    try {
      const { username, password, role, display_name, family_name, invite_code, avatar_emoji } = req.body;

      let err;
      err = validate(username, '用户名', 3, 20);
      if (err) return badRequest(res, err);
      if (!/^[a-zA-Z0-9_一-龥]+$/.test(username)) return badRequest(res, '用户名只能包含字母、数字、下划线和中文');

      err = validate(password, '密码', 6, 100);
      if (err) return badRequest(res, err);

      if (role !== 'parent' && role !== 'child') return badRequest(res, '角色必须是parent或child');

      err = validate(display_name, '显示名称', 1, 20);
      if (err) return badRequest(res, err);

      if (getUserByUsername(username)) return badRequest(res, '用户名已被占用');

      const hash = hashPassword(password);
      let familyId;

      if (role === 'parent' && !invite_code) {
        // New family
        err = validate(family_name, '家庭名称', 1, 30);
        if (err) return badRequest(res, err);
        const family = createFamily(family_name);
        familyId = family.id;
      } else if (invite_code) {
        // Join existing family
        const family = queryOne('SELECT * FROM families WHERE invite_code = ?', [invite_code.toUpperCase().trim()]);
        if (!family) return badRequest(res, '邀请码无效，请检查后重试');
        familyId = family.id;
      } else {
        return badRequest(res, '孩子注册需要提供邀请码');
      }

      const user = createUser(username, hash, role, familyId, display_name, avatar_emoji || (role === 'parent' ? '👨‍👩‍👧' : '🧒'));

      // Seed defaults for new families
      const memberCount = getFamilyMembers(familyId).length;
      if (memberCount === 1) {
        seedDefaults(familyId, user.id);
      }

      const token = generateToken(user);
      const family = queryOne('SELECT * FROM families WHERE id = ?', [familyId]);
      const members = getFamilyMembers(familyId);

      res.json({
        ok: true,
        data: { token, user, family, invite_code: family.invite_code, members }
      });
    } catch (e) {
      console.error('Register error:', e);
      serverError(res);
    }
  });

  app.post('/api/auth/login', rateLimit, (req, res) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) return badRequest(res, '用户名和密码不能为空');

      const user = getUserByUsername(username);
      if (!user) return badRequest(res, '用户名或密码错误');

      if (!comparePassword(password, user.password_hash)) return badRequest(res, '用户名或密码错误');

      const token = generateToken(user);
      const family = queryOne('SELECT * FROM families WHERE id = ?', [user.family_id]);
      const members = getFamilyMembers(user.family_id);

      res.json({
        ok: true,
        data: {
          token,
          user: { id: user.id, username: user.username, role: user.role, family_id: user.family_id, display_name: user.display_name, avatar_emoji: user.avatar_emoji, shop_name: user.shop_name },
          family,
          invite_code: family.invite_code,
          members
        }
      });
    } catch (e) {
      console.error('Login error:', e);
      serverError(res);
    }
  });

  app.get('/api/auth/me', requireAuth, (req, res) => {
    try {
      const user = getUserById(req.user.userId);
      if (!user) return res.status(401).json({ ok: false, error: '用户不存在' });

      const family = queryOne('SELECT * FROM families WHERE id = ?', [user.family_id]);
      const members = getFamilyMembers(user.family_id);

      res.json({ ok: true, data: { user, family, invite_code: family.invite_code, members } });
    } catch (e) {
      console.error('Me error:', e);
      serverError(res);
    }
  });

  app.put('/api/auth/profile', requireAuth, (req, res) => {
    try {
      const { display_name, avatar_emoji, shop_name, current_password, new_password } = req.body;
      const user = getUserById(req.user.userId);
      if (!user) return badRequest(res, '用户不存在');

      const fields = {};

      if (display_name !== undefined) {
        const err = validate(display_name, '显示名称', 1, 20);
        if (err) return badRequest(res, err);
        fields.display_name = display_name;
      }

      if (avatar_emoji !== undefined) {
        if (avatar_emoji && avatar_emoji.length > 4) return badRequest(res, '头像格式不正确');
        fields.avatar_emoji = avatar_emoji;
      }

      if (shop_name !== undefined) {
        if (shop_name && shop_name.length > 20) return badRequest(res, '店铺名称不能超过20个字符');
        fields.shop_name = shop_name;
      }

      if (new_password !== undefined && new_password !== '') {
        if (!current_password) return badRequest(res, '请输入当前密码');
        if (!comparePassword(current_password, user.password_hash)) return badRequest(res, '当前密码不正确');
        const err = validate(new_password, '新密码', 6, 100);
        if (err) return badRequest(res, err);
        fields.password_hash = hashPassword(new_password);
      }

      if (Object.keys(fields).length === 0) return badRequest(res, '没有需要更新的信息');

      const updated = updateUser(req.user.userId, fields);
      res.json({ ok: true, data: { user: updated } });
    } catch (e) {
      console.error('Update profile error:', e);
      serverError(res);
    }
  });

  // ==================== Family Routes ====================

  app.get('/api/family/invite-code', requireAuth, requireParent, (req, res) => {
    try {
      const family = queryOne('SELECT * FROM families WHERE id = ?', [req.user.familyId]);
      res.json({ ok: true, data: { invite_code: family.invite_code } });
    } catch (e) {
      serverError(res);
    }
  });

  app.get('/api/family/members', requireAuth, (req, res) => {
    try {
      const members = getFamilyMembers(req.user.familyId);
      res.json({ ok: true, data: { members } });
    } catch (e) {
      serverError(res);
    }
  });

  // ==================== Backup Routes ====================

  app.get('/api/admin/backups', requireAuth, requireParent, (req, res) => {
    try {
      const backups = listBackups();
      res.json({ ok: true, data: { backups } });
    } catch (e) {
      serverError(res);
    }
  });

  app.post('/api/admin/backups/:filename/restore', requireAuth, requireParent, (req, res) => {
    try {
      const filename = req.params.filename;
      if (!filename || filename.includes('..') || filename.includes('/')) {
        return badRequest(res, '无效的文件名');
      }
      const ok = restoreBackup(filename);
      if (!ok) return badRequest(res, '备份文件不存在或恢复失败');
      res.json({ ok: true, data: { message: '备份已恢复，请刷新页面' } });
    } catch (e) {
      serverError(res);
    }
  });

  // ==================== Task Routes ====================

  app.get('/api/tasks', requireAuth, (req, res) => {
    try {
      let childId = req.query.childId ? parseInt(req.query.childId, 10) : null;
      if (!childId && req.user.role === 'child') childId = req.user.userId;
      if (!childId) return badRequest(res, '请指定孩子');

      const tasks = getTasksWithStatus(req.user.familyId, childId, today());
      res.json({ ok: true, data: { tasks } });
    } catch (e) {
      serverError(res);
    }
  });

  app.post('/api/tasks', requireAuth, requireParent, (req, res) => {
    try {
      const { icon, title, points } = req.body;
      let err;
      err = validate(title, '任务名称', 1, 50);
      if (err) return badRequest(res, err);
      err = validateInt(points, '积分', 1, 100);
      if (err) return badRequest(res, err);

      const task = createTask(req.user.familyId, icon || '🌟', title, points);
      res.json({ ok: true, data: { task } });
    } catch (e) {
      serverError(res);
    }
  });

  app.put('/api/tasks/:id', requireAuth, requireParent, (req, res) => {
    try {
      const taskId = parseInt(req.params.id, 10);
      const { icon, title, points, is_active } = req.body;

      if (points !== undefined) {
        const err = validateInt(points, '积分', 1, 100);
        if (err) return badRequest(res, err);
      }
      if (title !== undefined) {
        const err = validate(title, '任务名称', 1, 50);
        if (err) return badRequest(res, err);
      }

      const task = updateTask(taskId, req.user.familyId, { icon, title, points, is_active });
      if (!task) return badRequest(res, '任务不存在');

      res.json({ ok: true, data: { task } });
    } catch (e) {
      serverError(res);
    }
  });

  app.delete('/api/tasks/:id', requireAuth, requireParent, (req, res) => {
    try {
      deleteTask(parseInt(req.params.id, 10), req.user.familyId);
      res.json({ ok: true });
    } catch (e) {
      serverError(res);
    }
  });

  app.post('/api/tasks/:id/complete', requireAuth, (req, res) => {
    try {
      const taskId = parseInt(req.params.id, 10);
      const date = today();

      // Determine childId
      let childId;
      if (req.user.role === 'parent') {
        childId = req.body.child_id ? parseInt(req.body.child_id, 10) : null;
        if (!childId) return badRequest(res, '请指定孩子');
      } else {
        childId = req.user.userId;
      }

      // Verify task belongs to family
      const task = queryOne('SELECT * FROM tasks WHERE id = ? AND family_id = ?', [taskId, req.user.familyId]);
      if (!task) return badRequest(res, '任务不存在');

      // Verify child belongs to family
      const child = queryOne('SELECT * FROM users WHERE id = ? AND family_id = ? AND role = ?', [childId, req.user.familyId, 'child']);
      if (!child) return badRequest(res, '孩子不存在');

      // Check for existing completion
      const existing = getCompletion(taskId, childId, date);
      if (existing) return badRequest(res, '今日已完成此任务');

      if (req.user.role === 'parent') {
        // Auto-approve when parent does it
        const comp = transaction(() => {
          const c = createCompletion(taskId, childId, date, 'approved');
          addPointHistory(req.user.familyId, childId, req.user.userId, task.points, '✅ 完成：' + task.title, 'task_completion', c.id);
          return { ...c, status: 'approved', auto_approved: true };
        });
        res.json({ ok: true, data: { completion: comp } });
      } else {
        // Child submits for review
        const comp = createCompletion(taskId, childId, date, 'pending');
        res.json({ ok: true, data: { completion: comp } });
      }
    } catch (e) {
      console.error('Complete task error:', e);
      serverError(res);
    }
  });

  app.post('/api/tasks/reset-all', requireAuth, requireParent, (req, res) => {
    try {
      resetAllTasks(req.user.familyId, today());
      res.json({ ok: true });
    } catch (e) {
      serverError(res);
    }
  });

  // ==================== Review Routes ====================

  app.get('/api/reviews/pending', requireAuth, requireParent, (req, res) => {
    try {
      const reviews = getPendingReviews(req.user.familyId);
      res.json({ ok: true, data: { reviews } });
    } catch (e) {
      serverError(res);
    }
  });

  app.post('/api/reviews/:id/approve', requireAuth, requireParent, (req, res) => {
    try {
      const reviewId = parseInt(req.params.id, 10);
      const review = queryOne(
        `SELECT tc.*, t.points, t.title AS task_title, t.family_id
         FROM task_completions tc JOIN tasks t ON t.id = tc.task_id
         WHERE tc.id = ? AND tc.status = 'pending'`, [reviewId]
      );

      if (!review) return badRequest(res, '审核记录不存在或已处理');
      if (review.family_id !== req.user.familyId) return badRequest(res, '无权操作');

      transaction(() => {
        approveCompletion(reviewId, review.points);
        addPointHistory(req.user.familyId, review.child_id, req.user.userId, review.points, '✅ 完成：' + review.task_title, 'task_completion', reviewId);
      });

      const points = getChildPoints(review.child_id);
      const result = { ok: true, data: { reviewId: reviewId, points_awarded: review.points, total_points: points } };
      res.json(result);
    } catch (e) {
      console.error('Approve error:', e.message, e.stack);
      serverError(res);
    }
  });

  app.post('/api/reviews/:id/reject', requireAuth, requireParent, (req, res) => {
    try {
      const reviewId = parseInt(req.params.id, 10);
      const review = queryOne(
        `SELECT tc.*, t.title AS task_title, t.family_id
         FROM task_completions tc JOIN tasks t ON t.id = tc.task_id
         WHERE tc.id = ? AND tc.status = 'pending'`, [reviewId]
      );

      if (!review) return badRequest(res, '审核记录不存在或已处理');
      if (review.family_id !== req.user.familyId) return badRequest(res, '无权操作');

      rejectCompletion(reviewId);
      res.json({ ok: true });
    } catch (e) {
      console.error('Reject error:', e);
      serverError(res);
    }
  });

  // ==================== Reward Routes ====================

  app.get('/api/rewards', requireAuth, (req, res) => {
    try {
      let childId = req.query.childId ? parseInt(req.query.childId, 10) : null;
      if (!childId && req.user.role === 'child') childId = req.user.userId;

      const rewards = getRewards(req.user.familyId);
      const points = childId ? getChildPoints(childId) : 0;

      const rewardsWithAffordability = rewards.map(r => ({
        ...r,
        affordable: points >= r.cost,
        childPoints: points,
      }));

      res.json({ ok: true, data: { rewards: rewardsWithAffordability } });
    } catch (e) {
      serverError(res);
    }
  });

  app.post('/api/rewards', requireAuth, requireParent, (req, res) => {
    try {
      const { icon, title, cost } = req.body;
      let err;
      err = validate(title, '奖励名称', 1, 50);
      if (err) return badRequest(res, err);
      err = validateInt(cost, '所需积分', 1, 9999);
      if (err) return badRequest(res, err);

      const reward = createReward(req.user.familyId, icon || '🎁', title, cost, req.user.userId);
      res.json({ ok: true, data: { reward } });
    } catch (e) {
      serverError(res);
    }
  });

  app.put('/api/rewards/:id', requireAuth, requireParent, (req, res) => {
    try {
      const rewardId = parseInt(req.params.id, 10);
      const { icon, title, cost } = req.body;

      const reward = getRewardById(rewardId);
      if (!reward || reward.family_id !== req.user.familyId) return badRequest(res, '奖励不存在');
      if (reward.creator_id && reward.creator_id !== req.user.userId) return badRequest(res, '只能修改自己添加的商品');

      if (cost !== undefined) {
        const err = validateInt(cost, '所需积分', 1, 9999);
        if (err) return badRequest(res, err);
      }
      if (title !== undefined) {
        const err = validate(title, '奖励名称', 1, 50);
        if (err) return badRequest(res, err);
      }

      const updated = updateReward(rewardId, req.user.familyId, { icon, title, cost });
      res.json({ ok: true, data: { reward: updated } });
    } catch (e) {
      serverError(res);
    }
  });

  app.delete('/api/rewards/:id', requireAuth, requireParent, (req, res) => {
    try {
      const reward = getRewardById(parseInt(req.params.id, 10));
      if (!reward || reward.family_id !== req.user.familyId) return badRequest(res, '奖励不存在');
      if (reward.creator_id && reward.creator_id !== req.user.userId) return badRequest(res, '只能删除自己添加的商品');
      deleteReward(parseInt(req.params.id, 10), req.user.familyId);
      res.json({ ok: true });
    } catch (e) {
      serverError(res);
    }
  });

  app.post('/api/rewards/:id/redeem', requireAuth, (req, res) => {
    try {
      const rewardId = parseInt(req.params.id, 10);
      const reward = getRewardById(rewardId);
      if (!reward || !reward.is_active) return badRequest(res, '奖励不存在');
      if (reward.family_id !== req.user.familyId) return badRequest(res, '无权操作');

      let childId;
      if (req.user.role === 'parent') {
        childId = req.body.child_id ? parseInt(req.body.child_id, 10) : null;
        if (!childId) return badRequest(res, '请指定孩子');
      } else {
        childId = req.user.userId;
      }

      const points = getChildPoints(childId);
      if (points < reward.cost) return badRequest(res, '积分不足，还差' + (reward.cost - points) + '分');

      transaction(() => {
        const redemption = createRedemption(rewardId, childId, reward.cost);
        addPointHistory(req.user.familyId, childId, req.user.userId, -reward.cost, '🎁 兑换：' + reward.title, 'reward_redemption', redemption.id);
      });

      const newPoints = getChildPoints(childId);
      res.json({ ok: true, data: { points_spent: reward.cost, total_points: newPoints } });
    } catch (e) {
      console.error('Redeem error:', e);
      serverError(res);
    }
  });

  // ==================== Points Routes ====================

  app.get('/api/points/child/:childId', requireAuth, (req, res) => {
    try {
      const childId = parseInt(req.params.childId, 10);
      const points = getChildPoints(childId);
      res.json({ ok: true, data: { child_id: childId, total_points: points } });
    } catch (e) {
      serverError(res);
    }
  });

  app.post('/api/points/adjust', requireAuth, requireParent, (req, res) => {
    try {
      const { child_id, amount, reason } = req.body;

      let err;
      err = validateInt(amount, '调整分数', -100, 100);
      if (err) return badRequest(res, err);
      if (amount === 0) return badRequest(res, '分数不能为0');
      err = validate(reason, '原因', 1, 100);
      if (err) return badRequest(res, err);

      const child = queryOne('SELECT * FROM users WHERE id = ? AND family_id = ? AND role = ?', [child_id, req.user.familyId, 'child']);
      if (!child) return badRequest(res, '孩子不存在');

      // Check for negative balance when deducting
      if (amount < 0) {
        const currentPoints = getChildPoints(child_id);
        if (currentPoints + amount < 0) return badRequest(res, '扣除后积分不能为负数');
      }

      const changeAmount = amount;
      const reasonText = amount > 0 ? ('⭐ 奖励：' + reason) : ('⚠️ 扣分：' + reason);

      transaction(() => {
        addPointHistory(req.user.familyId, child_id, req.user.userId, changeAmount, reasonText, 'manual_adjust', null);
      });

      const newPoints = getChildPoints(child_id);
      res.json({ ok: true, data: { child_id, change_amount: changeAmount, total_points: newPoints } });
    } catch (e) {
      console.error('Adjust error:', e);
      serverError(res);
    }
  });

  // ==================== History Routes ====================

  app.get('/api/history', requireAuth, (req, res) => {
    try {
      let childId = req.query.childId ? parseInt(req.query.childId, 10) : null;
      const limit = parseInt(req.query.limit, 10) || 20;
      const history = getHistory(req.user.familyId, childId, limit);
      res.json({ ok: true, data: { history } });
    } catch (e) {
      serverError(res);
    }
  });

  // ==================== Children Routes ====================

  app.get('/api/children', requireAuth, (req, res) => {
    try {
      const children = getChildren(req.user.familyId);
      res.json({ ok: true, data: { children } });
    } catch (e) {
      serverError(res);
    }
  });

  app.get('/api/children/:id/dashboard', requireAuth, (req, res) => {
    try {
      const childId = parseInt(req.params.id, 10);
      const date = today();

      // Verify child belongs to family
      const child = queryOne('SELECT * FROM users WHERE id = ? AND family_id = ? AND role = ?', [childId, req.user.familyId, 'child']);
      if (!child) return badRequest(res, '孩子不存在');

      const tasks = getTasksWithStatus(req.user.familyId, childId, date);
      const rewards = getRewards(req.user.familyId);
      const points = getChildPoints(childId);
      const history = getHistory(req.user.familyId, childId, 10);

      const rewardsWithAffordability = rewards.map(r => ({
        ...r,
        affordable: points >= r.cost,
      }));

      const doneCount = tasks.filter(t => t.completion_status === 'approved').length;
      const pendingCount = tasks.filter(t => t.completion_status === 'pending').length;
      const total = tasks.length;

      res.json({
        ok: true,
        data: {
          child: { id: child.id, display_name: child.display_name, avatar_emoji: child.avatar_emoji },
          points,
          tasks,
          doneCount,
          pendingCount: pendingCount || (total - doneCount),
          totalTasks: total,
          rewards: rewardsWithAffordability,
          history,
        }
      });
    } catch (e) {
      console.error('Dashboard error:', e);
      serverError(res);
    }
  });

  // ==================== Pet Routes ====================

  app.get('/api/pets/:childId', requireAuth, (req, res) => {
    try {
      const childId = parseInt(req.params.childId, 10);
      let pet = getPetByChildId(childId);
      if (!pet) return res.json({ ok: true, data: { pet: null } });

      pet = applyDecay(pet);
      res.json({ ok: true, data: { pet } });
    } catch (e) {
      serverError(res);
    }
  });

  app.post('/api/pets/adopt', requireAuth, requireParent, (req, res) => {
    try {
      const { child_id, pet_type, pet_name } = req.body;

      if (!['cat', 'dog', 'rabbit'].includes(pet_type)) return badRequest(res, '无效的宠物类型');
      const err = validate(pet_name, '宠物名字', 1, 10);
      if (err) return badRequest(res, err);

      const child = queryOne('SELECT * FROM users WHERE id = ? AND family_id = ? AND role = ?', [child_id, req.user.familyId, 'child']);
      if (!child) return badRequest(res, '孩子不存在');

      const existing = getPetByChildId(child_id);
      if (existing) return badRequest(res, '这个孩子已经领养过宠物了');

      const adoptCost = 10;
      const childPoints = getChildPoints(child_id);
      if (childPoints < adoptCost) return badRequest(res, '积分不足，领养需要 ' + adoptCost + ' 积分，当前只有 ' + childPoints + ' 分');

      const pet = transaction(() => {
        const p = createPet(child_id, pet_type, pet_name);
        addPointHistory(req.user.familyId, child_id, req.user.userId, -adoptCost, '🎪 领养宠物：' + pet_name, 'manual_adjust', null);
        return p;
      });
      res.json({ ok: true, data: { pet, points_spent: adoptCost } });
    } catch (e) {
      console.error('Adopt error:', e);
      serverError(res);
    }
  });

  app.post('/api/pets/:id/care', requireAuth, (req, res) => {
    try {
      const petId = parseInt(req.params.id, 10);
      const { action } = req.body;
      const pet = queryOne('SELECT * FROM pets WHERE id = ?', [petId]);
      if (!pet) return badRequest(res, '宠物不存在');

      // Verify child belongs to family
      const child = queryOne('SELECT * FROM users WHERE id = ? AND family_id = ?', [pet.child_id, req.user.familyId]);
      if (!child) return badRequest(res, '无权操作');

      if (!['feed', 'play', 'clean'].includes(action)) return badRequest(res, '无效的操作');

      const cost = getCareCost(action);
      const childPoints = getChildPoints(pet.child_id);
      if (childPoints < cost) return badRequest(res, '积分不足，需要 ' + cost + ' 分');

      const actionName = getCareActionName(action);
      transaction(() => {
        carePet(petId, action);
        addPointHistory(req.user.familyId, pet.child_id, req.user.userId, -cost, '🐾 ' + actionName + '宠物：' + pet.pet_name, 'manual_adjust', null);
      });

      const updatedPet = applyDecay(getPetByChildId(pet.child_id));
      const newPoints = getChildPoints(pet.child_id);

      res.json({ ok: true, data: { pet: updatedPet, points_spent: cost, total_points: newPoints } });
    } catch (e) {
      console.error('Care error:', e);
      serverError(res);
    }
  });

}

module.exports = { registerRoutes };
