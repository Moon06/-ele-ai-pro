var AppState = {
  currentUser: null,
  family: null,
  familyMembers: [],
  selectedChildId: null,
  points: 0,
  tasks: [],
  rewards: [],
  history: [],
  reviews: [],
  viewMode: 'child',
  adjustType: 'add',
};

var grClass = 'text-grass-deep';
var coClass = 'text-coral-deep';
var toastTimer;

// ====================== Init ======================

async function initApp() {
  var token = API.getToken();
  if (!token) { showAuthScreen(); return; }

  try {
    var data = await API.getMe();
    if (!data) { showAuthScreen(); return; }

    AppState.currentUser = data.user;
    AppState.family = data.family;
    AppState.familyMembers = data.members;

    if (AppState.currentUser.role === 'child') {
      AppState.selectedChildId = AppState.currentUser.id;
    } else {
      var children = data.members.filter(function(m) { return m.role === 'child'; });
      AppState.selectedChildId = children.length > 0 ? children[0].id : null;
    }

    showAppScreen();
    await loadDashboard();
  } catch (e) {
    API.clearToken();
    showAuthScreen();
  }
}

// ====================== Auth Screen ======================

function showAuthScreen() {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('app-screen').classList.add('hidden');
  document.getElementById('auth-error').classList.add('hidden');
  document.getElementById('login-form').classList.remove('hidden');
  document.getElementById('register-form').classList.add('hidden');
  document.getElementById('auth-mode-text').textContent = '还没有账号？注册';
}

function showAppScreen() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app-screen').classList.remove('hidden');
  renderHeader();

  var isChild = AppState.currentUser.role === 'child';
  var tabContainer = document.getElementById('tabContainer');
  if (isChild) {
    tabContainer.classList.add('hidden');
    AppState.viewMode = 'child';
    document.getElementById('child-view').classList.remove('hidden');
    document.getElementById('parent-view').classList.add('hidden');
  } else {
    tabContainer.classList.remove('hidden');
  }
}

function toggleAuthMode(mode) {
  document.getElementById('auth-error').classList.add('hidden');
  if (mode === 'login') {
    document.getElementById('login-form').classList.remove('hidden');
    document.getElementById('register-form').classList.add('hidden');
    document.getElementById('auth-mode-text').textContent = '还没有账号？注册';
  } else {
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('register-form').classList.remove('hidden');
    document.getElementById('auth-mode-text').textContent = '已有账号？登录';
    updateRegisterRole();
  }
}

var registerRole = 'parent';
function setRegisterRole(role) {
  registerRole = role;
  updateRegisterRole();
}

function updateRegisterRole() {
  document.getElementById('reg-role-parent').classList.toggle('active', registerRole === 'parent');
  document.getElementById('reg-role-child').classList.toggle('active', registerRole === 'child');
  document.getElementById('reg-family-name-group').classList.toggle('hidden', registerRole !== 'parent');
  document.getElementById('reg-invite-group').classList.toggle('hidden', registerRole === 'parent');
}

// ====================== Auth Actions ======================

async function handleLogin() {
  var username = document.getElementById('login-username').value.trim();
  var password = document.getElementById('login-password').value;

  if (!username || !password) {
    showAuthError('请填写用户名和密码');
    return;
  }

  try {
    var data = await API.login({ username: username, password: password });
    if (!data) { showAuthError('登录失败，请重试'); return; }
    API.setToken(data.token);
    AppState.currentUser = data.user;
    AppState.family = data.family;
    AppState.familyMembers = data.members;

    if (data.user.role === 'child') {
      AppState.selectedChildId = data.user.id;
    } else {
      var children = data.members.filter(function(m) { return m.role === 'child'; });
      AppState.selectedChildId = children.length > 0 ? children[0].id : null;
    }

    showAppScreen();
    await loadDashboard();
  } catch (e) {
    showAuthError(e.message);
  }
}

async function handleRegister() {
  var username = document.getElementById('reg-username').value.trim();
  var password = document.getElementById('reg-password').value;
  var displayName = document.getElementById('reg-display-name').value.trim();
  var familyName = document.getElementById('reg-family-name').value.trim();
  var inviteCode = document.getElementById('reg-invite-code').value.trim();

  if (!username || !password || !displayName) {
    showAuthError('请填写所有必填字段');
    return;
  }

  if (registerRole === 'parent' && !familyName) {
    showAuthError('请填写家庭名称');
    return;
  }

  if (registerRole !== 'parent' && !inviteCode) {
    showAuthError('请填写邀请码');
    return;
  }

  var body = {
    username: username,
    password: password,
    role: registerRole,
    display_name: displayName,
  };

  if (registerRole === 'parent') {
    body.family_name = familyName;
  } else {
    body.invite_code = inviteCode;
  }

  try {
    var data = await API.register(body);
    if (!data) { showAuthError('注册失败，请重试'); return; }
    API.setToken(data.token);
    AppState.currentUser = data.user;
    AppState.family = data.family;
    AppState.familyMembers = data.members;

    if (data.user.role === 'child') {
      AppState.selectedChildId = data.user.id;
    } else {
      var children = data.members.filter(function(m) { return m.role === 'child'; });
      AppState.selectedChildId = children.length > 0 ? children[0].id : null;
    }

    showAppScreen();
    await loadDashboard();
  } catch (e) {
    showAuthError(e.message);
  }
}

function showAuthError(msg) {
  var el = document.getElementById('auth-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function handleLogout() {
  API.clearToken();
  location.reload();
}

// Key binding for auth
document.getElementById('login-password') && document.getElementById('login-password').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') handleLogin();
});

// ====================== Data Loading ======================

async function loadDashboard() {
  if (!AppState.selectedChildId) {
    renderAll();
    return;
  }

  try {
    var data = await API.getChildDashboard(AppState.selectedChildId);
    if (!data) return;
    AppState.points = data.points;
    AppState.tasks = data.tasks;
    AppState.rewards = data.rewards;
    AppState.history = data.history;

    if (AppState.currentUser.role === 'parent') {
      var reviewData = await API.getPendingReviews();
      if (reviewData) AppState.reviews = reviewData.reviews;
      // Refresh children points for selector
      var childrenData = await API.getChildren();
      if (childrenData) {
        for (var i = 0; i < AppState.familyMembers.length; i++) {
          var m = AppState.familyMembers[i];
          if (m.role === 'child') {
            var found = childrenData.children.find(function(c) { return c.id === m.id; });
            if (found) m.total_points = found.total_points;
          }
        }
      }
    }
  } catch (e) {
    showToast('加载数据失败: ' + e.message);
  }

  renderAll();
}

// ====================== Rendering ======================

function renderAll() {
  renderHeader();
  if (AppState.currentUser.role === 'child') {
    renderChildView();
  } else {
    if (AppState.viewMode === 'child') {
      renderChildView();
    } else {
      renderParentView();
    }
  }
}

function renderHeader() {
  var u = AppState.currentUser;
  if (!u) return;

  document.getElementById('header-avatar').textContent = u.avatar_emoji || '🐼';
  document.getElementById('header-name').textContent = u.display_name;
  document.getElementById('header-subtitle').textContent = u.role === 'parent' ? '✨ 家庭管理员' : '✨ 今日也要加油哦';

  // Points badge
  var pointsEl = document.getElementById('totalPoints');
  pointsEl.textContent = AppState.points;

  // Child selector
  var selectorEl = document.getElementById('childSelector');
  if (u.role === 'parent') {
    var children = AppState.familyMembers.filter(function(m) { return m.role === 'child'; });
    var html = '';
    for (var i = 0; i < children.length; i++) {
      var c = children[i];
      var active = c.id === AppState.selectedChildId ? ' active' : '';
      html += '<button class="child-chip' + active + '" onclick="selectChild(' + c.id + ')">' +
        '<span class="chip-emoji">' + (c.avatar_emoji || '🧒') + '</span>' +
        '<span>' + c.display_name + '</span>' +
        '<span class="chip-points">⭐' + (c.total_points || 0) + '</span>' +
      '</button>';
    }
    html += '<button class="child-chip" onclick="showInviteInfo()" style="border-style:dashed;color:var(--gray-400);font-weight:400">+ 邀请孩子</button>';
    selectorEl.innerHTML = html;
    selectorEl.classList.remove('hidden');
  } else {
    selectorEl.classList.add('hidden');
  }
}

function renderChildView() {
  renderTasks();
  renderRewards();
  renderHistory();
  updateStats();
}

function renderTasks() {
  var container = document.getElementById('taskList');
  var tasks = AppState.tasks;
  var doneCount = tasks.filter(function(t) { return t.completion_status === 'approved'; }).length;
  var total = tasks.length;

  container.innerHTML = tasks.map(function(t) {
    var rowClass = 'flex items-center gap-3 p-3 rounded-2xl';
    var statusHtml;
    if (t.completion_status === 'approved') {
      rowClass += ' bg-grass-light-half';
      statusHtml = '<span class="text-grass-mid font-black text-sm bg-white px-3 py-1 rounded-full" style="box-shadow:0 2px 8px rgba(0,0,0,.04)">✅ 已完成</span>';
    } else if (t.completion_status === 'pending') {
      rowClass += ' ring-2 bg-sun-light-half';
      statusHtml = '<span class="text-sun-deep font-bold text-sm bg-white px-3 py-1 rounded-full animate-pulse" style="box-shadow:0 2px 8px rgba(0,0,0,.04)">⏳ 等待确认</span>';
    } else {
      rowClass += ' bg-gray-50';
      statusHtml = '<button class="btn-bounce bg-sky-deep text-white font-bold text-sm px-4 py-1 rounded-full hover-bg-sky-deep" onclick="handleCompleteTask(' + t.id + ')">我完成啦!</button>';
    }
    var titleClass = t.completion_status === 'approved' ? 'font-bold text-sm text-gray-400 line-through' : 'font-bold text-sm text-gray-700';
    return '<div class="' + rowClass + '">' +
      '<span class="emoji-icon">' + t.icon + '</span>' +
      '<div class="flex-1 min-w-0">' +
        '<div class="' + titleClass + '">' + t.title + '</div>' +
        '<div class="text-xs text-sun-deep font-bold">+' + t.points + ' 分</div>' +
      '</div>' + statusHtml +
    '</div>';
  }).join('');

  document.getElementById('dailyProgress').style.width = total > 0 ? (doneCount / total * 100) + '%' : '0%';
  document.getElementById('progressText').textContent = doneCount + '/' + total + ' 项已完成';
  document.getElementById('doneCount').textContent = doneCount;
  var pendingCount = tasks.filter(function(t) { return t.completion_status === 'pending'; }).length;
  document.getElementById('pendingCount').textContent = pendingCount || (total - doneCount);
}

function renderRewards() {
  var container = document.getElementById('rewardList');
  var rewards = AppState.rewards;
  var isParent = AppState.currentUser && AppState.currentUser.role === 'parent';
  document.getElementById('rewardCount').textContent = rewards.length;

  container.innerHTML = rewards.map(function(r) {
    var can = r.affordable;
    var cls = can ? 'bg-sun-deep text-white hover-bg-sun-deep' : 'bg-gray-200 text-gray-400';
    var disabled = can ? '' : ' disabled';
    var tip = can ? '✅' : '🔒';
    var manageBtns = '';
    if (isParent) {
      manageBtns = '<button class="bg-transparent border-none cursor-pointer text-xs px-1" onclick="handleEditReward(' + r.id + ')" title="编辑" style="font-family:inherit">✏️</button>' +
        '<button class="bg-transparent border-none cursor-pointer text-xs px-1" onclick="handleDeleteReward(' + r.id + ')" title="删除" style="font-family:inherit">🗑️</button>';
    }
    return '<div class="flex items-center gap-3 p-3 rounded-2xl bg-gray-50 hover-bg-sun-light">' +
      '<span class="emoji-icon">' + r.icon + '</span>' +
      '<div class="flex-1 min-w-0">' +
        '<div class="font-bold text-sm text-gray-700">' + r.title + '</div>' +
        '<div class="text-xs font-bold ' + (can ? 'text-grass-deep' : 'text-coral-mid') + '">' + tip + ' ' + r.cost + ' 积分</div>' +
      '</div>' +
      manageBtns +
      '<button class="btn-bounce font-bold text-sm px-4 py-1 rounded-full ' + cls + '"' + disabled + ' onclick="handleRedeemReward(' + r.id + ')">' +
        (can ? '兑换 🎁' : '还不够') +
      '</button>' +
    '</div>';
  }).join('');
}

function renderHistory() {
  var container = document.getElementById('historyList');
  var history = AppState.history.slice(0, 10);
  container.innerHTML = history.map(function(h) {
    var isGain = h.change_amount > 0;
    var clr = isGain ? grClass : coClass;
    var prefix = isGain ? '+' : '';
    return '<div class="flex items-center justify-between py-2 border-b last-border-0">' +
      '<div class="flex items-center gap-2">' +
        '<span class="text-xs text-gray-400 shrink-0" style="width:64px">' + formatTime(h.created_at) + '</span>' +
        '<span class="text-sm text-gray-600 truncate">' + h.child_name + ': ' + h.reason + '</span>' +
      '</div>' +
      '<span class="font-black text-sm ml-2 shrink-0 ' + clr + '">' + prefix + h.change_amount + '</span>' +
    '</div>';
  }).join('');

  if (history.length === 0) {
    container.innerHTML = '<div class="text-center text-gray-300 text-sm py-3">暂无记录</div>';
  }
}

function renderReviews() {
  var container = document.getElementById('reviewList');
  var badge = document.getElementById('pendingReviewBadge');
  var empty = document.getElementById('emptyReview');
  var reviews = AppState.reviews;

  if (reviews.length === 0) {
    container.innerHTML = '';
    empty.classList.remove('hidden');
    badge.classList.add('hidden');
  } else {
    empty.classList.add('hidden');
    badge.classList.remove('hidden');
    badge.textContent = reviews.length + ' 条待处理';
    container.innerHTML = reviews.map(function(r) {
      return '<div class="flex items-center gap-3 p-3 rounded-2xl bg-sun-light-half">' +
        '<span class="emoji-icon">' + r.icon + '</span>' +
        '<div class="flex-1 min-w-0">' +
          '<div class="font-bold text-sm text-gray-700">' + r.task_title + '</div>' +
          '<div class="text-xs text-gray-400">' + r.child_name + ' · ' + formatTime(r.created_at) + ' · <span class="text-sun-deep font-bold">+' + r.points + '分</span></div>' +
        '</div>' +
        '<button class="btn-bounce bg-grass-mid text-white font-bold text-xs px-4 py-2 rounded-full hover-bg-grass-deep" onclick="handleApproveReview(' + r.id + ')">✅ 确认</button>' +
        '<button class="btn-bounce bg-coral-light text-coral-deep font-bold text-xs px-4 py-2 rounded-full hover-bg-coral-mid hover-text-white" onclick="handleRejectReview(' + r.id + ')">❌ 驳回</button>' +
      '</div>';
    }).join('');
  }
}

function renderParentView() {
  renderReviews();
  // Reset adjust buttons
  var btns = document.querySelectorAll('#parent-view .adjust-type-btn');
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.remove('bg-grass-light', 'text-grass-deep', 'bg-coral-light', 'text-coral-deep');
    btns[i].classList.add('bg-gray-100', 'text-gray-500');
  }
  if (AppState.adjustType === 'add') {
    var addBtn = document.getElementById('addBtn');
    if (addBtn) { addBtn.classList.remove('bg-gray-100', 'text-gray-500'); addBtn.classList.add('bg-grass-light', 'text-grass-deep'); }
  } else {
    var dedBtn = document.getElementById('deductBtn');
    if (dedBtn) { dedBtn.classList.remove('bg-gray-100', 'text-gray-500'); dedBtn.classList.add('bg-coral-light', 'text-coral-deep'); }
  }
}

function updateStats() {
  var tasks = AppState.tasks;
  var doneCount = tasks.filter(function(t) { return t.completion_status === 'approved'; }).length;
  var pendingCount = tasks.filter(function(t) { return t.completion_status === 'pending'; }).length;
  var total = tasks.length;

  document.getElementById('doneCount').textContent = doneCount;
  document.getElementById('pendingCount').textContent = pendingCount || (total - doneCount);
  document.getElementById('dailyProgress').style.width = total > 0 ? (doneCount / total * 100) + '%' : '0%';
  document.getElementById('progressText').textContent = doneCount + '/' + total + ' 项已完成';
}

function formatTime(ts) {
  if (!ts) return '';
  var d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  var now = new Date();
  var month = d.getMonth() + 1;
  var day = d.getDate();
  var hours = d.getHours();
  var mins = d.getMinutes();
  var pad = function(n) { return n < 10 ? '0' + n : '' + n; };

  if (now.toDateString() === d.toDateString()) {
    return '今天 ' + pad(hours) + ':' + pad(mins);
  }
  var yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (yesterday.toDateString() === d.toDateString()) {
    return '昨天 ' + pad(hours) + ':' + pad(mins);
  }
  return month + '/' + day + ' ' + pad(hours) + ':' + pad(mins);
}

// ====================== Actions ======================

async function handleCompleteTask(taskId) {
  try {
    var childId = AppState.currentUser.role === 'child' ? AppState.selectedChildId : AppState.selectedChildId;
    await API.completeTask(taskId, childId);
    if (AppState.currentUser.role === 'child') {
      showToast('✅ 已提交申请，等待爸爸妈妈确认~');
    } else {
      showToast('✅ 已完成！积分已奖励');
    }
    await loadDashboard();
  } catch (e) {
    showToast(e.message || '操作失败');
  }
}

async function handleApproveReview(reviewId) {
  try {
    var data = await API.approveReview(reviewId);
    showToast('🎉 已确认！+' + data.points_awarded + ' 积分');
    await loadDashboard();
  } catch (e) {
    showToast(e.message || '操作失败');
  }
}

async function handleRejectReview(reviewId) {
  try {
    await API.rejectReview(reviewId);
    showToast('已驳回申请，继续加油哦~');
    await loadDashboard();
  } catch (e) {
    showToast(e.message || '操作失败');
  }
}

async function handleRedeemReward(rewardId) {
  var childId = AppState.selectedChildId;
  if (!childId) { showToast('请先选择一个孩子'); return; }

  var reward = AppState.rewards.find(function(r) { return r.id === rewardId; });
  if (!reward) return;

  var ok = await showModal({
    icon: '🎁',
    title: '确认兑换',
    message: '确定要用 ' + reward.cost + ' 积分兑换「' + reward.title + '」吗？',
    confirmText: '确认兑换',
  });
  if (!ok) return;

  try {
    var data = await API.redeemReward(rewardId, childId);
    showToast('🎁 兑换成功！扣除 ' + data.points_spent + ' 积分');
    await loadDashboard();
  } catch (e) {
    showToast(e.message || '兑换失败');
  }
}

async function handleEditReward(rewardId) {
  var reward = AppState.rewards.find(function(r) { return r.id === rewardId; });
  if (!reward) return;

  var values = await showModal({
    icon: '✏️',
    title: '编辑奖励',
    message: '修改「' + reward.title + '」的信息',
    fields: [
      { id: 'title', value: reward.title, placeholder: '奖励名称', required: true },
      { id: 'cost', value: String(reward.cost), placeholder: '所需积分', type: 'number', required: true },
    ],
    confirmText: '保存',
  });

  if (!values) return;
  var newCost = parseInt(values.cost, 10);
  if (!newCost || newCost < 1) { showToast('积分值无效'); return; }

  try {
    await API.updateReward(rewardId, { title: values.title, cost: newCost });
    showToast('✅ 奖励已更新');
    await loadDashboard();
  } catch (e) {
    showToast(e.message || '更新失败');
  }
}

async function handleDeleteReward(rewardId) {
  var reward = AppState.rewards.find(function(r) { return r.id === rewardId; });
  if (!reward) return;

  var ok = await showModal({
    icon: '🗑️',
    title: '删除奖励',
    message: '确定要删除「' + reward.title + '」吗？删除后不可恢复。',
    confirmText: '确认删除',
    danger: true,
  });
  if (!ok) return;

  try {
    await API.deleteReward(rewardId);
    showToast('🗑️ 奖励已删除');
    await loadDashboard();
  } catch (e) {
    showToast(e.message || '删除失败');
  }
}

function setAdjustType(type) {
  AppState.adjustType = type;
  var addBtn = document.getElementById('addBtn');
  var dedBtn = document.getElementById('deductBtn');

  [addBtn, dedBtn].forEach(function(b) {
    if (!b) return;
    b.classList.remove('bg-grass-light', 'text-grass-deep', 'bg-coral-light', 'text-coral-deep');
    b.classList.add('bg-gray-100', 'text-gray-500');
  });

  if (type === 'add') {
    addBtn.classList.remove('bg-gray-100', 'text-gray-500');
    addBtn.classList.add('bg-grass-light', 'text-grass-deep');
  } else {
    dedBtn.classList.remove('bg-gray-100', 'text-gray-500');
    dedBtn.classList.add('bg-coral-light', 'text-coral-deep');
  }
}

async function submitAdjust() {
  var amount = parseInt(document.getElementById('adjustAmount').value) || 0;
  var reason = document.getElementById('adjustReason').value;
  var childId = AppState.selectedChildId;

  if (amount <= 0) { showToast('请输入有效的分值'); return; }
  if (!childId) { showToast('请先选择一个孩子'); return; }

  var finalAmount = AppState.adjustType === 'add' ? amount : -amount;

  try {
    await API.adjustPoints({ child_id: childId, amount: finalAmount, reason: reason });
    showToast(AppState.adjustType === 'add' ? '✅ 已加 ' + amount + ' 分' : '⚠️ 已扣 ' + amount + ' 分');
    await loadDashboard();
  } catch (e) {
    showToast(e.message || '操作失败');
  }
}

async function addTask() {
  var values = await showModal({
    icon: '➕',
    title: '添加新任务',
    message: '设置任务名称和奖励积分',
    fields: [
      { id: 'title', placeholder: '任务名称', required: true },
      { id: 'points', value: '5', placeholder: '奖励积分', type: 'number', required: true },
    ],
    confirmText: '添加',
  });

  if (!values) return;
  var points = parseInt(values.points, 10) || 5;
  var icons = ['🌟','💪','🎯','📚','🎨','⚽','🎹','🧩','🌱','💎'];
  try {
    await API.createTask({ icon: icons[Math.floor(Math.random() * icons.length)], title: values.title, points: points });
    showToast('✅ 任务已添加');
    await loadDashboard();
  } catch (e) {
    showToast(e.message || '操作失败');
  }
}

async function addReward() {
  var values = await showModal({
    icon: '🎁',
    title: '添加兑换商品',
    message: '设置商品名称和所需积分',
    fields: [
      { id: 'title', placeholder: '商品名称', required: true },
      { id: 'cost', value: '30', placeholder: '所需积分', type: 'number', required: true },
    ],
    confirmText: '添加',
  });

  if (!values) return;
  var cost = parseInt(values.cost, 10) || 30;
  var icons = ['🎁','🎮','🍕','🎬','🧸','🚲','📱','🎪','🍰','🏖️'];
  try {
    await API.createReward({ icon: icons[Math.floor(Math.random() * icons.length)], title: values.title, cost: cost });
    showToast('🎁 商品已上架');
    await loadDashboard();
  } catch (e) {
    showToast(e.message || '操作失败');
  }
}

async function resetAll() {
  var ok = await showModal({
    icon: '🔄',
    title: '重置今日任务',
    message: '确定要重置今日所有任务的完成状态吗？积分不会减少。',
    confirmText: '确认重置',
  });
  if (!ok) return;

  try {
    await API.resetAllTasks();
    showToast('🔄 今日任务已重置');
    await loadDashboard();
  } catch (e) {
    showToast(e.message || '操作失败');
  }
}

// ====================== Child Selection ======================

async function selectChild(childId) {
  AppState.selectedChildId = childId;
  await loadDashboard();
  // Update child selector
  var chips = document.querySelectorAll('.child-chip');
  for (var i = 0; i < chips.length; i++) {
    chips[i].classList.remove('active');
  }
}

async function showInviteInfo() {
  try {
    var data = await API.getInviteCode();
    if (!data) { showToast('获取邀请码失败'); return; }
    await showModal({
      icon: '📨',
      title: '邀请孩子加入',
      message: '让孩子在注册时选择「我是孩子」，输入以下邀请码即可加入家庭。',
      fields: [{ id: 'code', value: data.invite_code, placeholder: '邀请码', type: 'text' }],
      confirmText: '知道了',
      cancelText: '关闭',
    });
  } catch(e) {
    showToast('获取邀请码失败');
  }
}

// ====================== View Switching ======================

function switchView(view) {
  if (AppState.currentUser.role === 'child') return;

  AppState.viewMode = view;
  var childView = document.getElementById('child-view');
  var parentView = document.getElementById('parent-view');
  var buttons = document.querySelectorAll('.tab-btn');

  for (var i = 0; i < buttons.length; i++) {
    buttons[i].classList.remove('active');
    buttons[i].classList.add('bg-gray-100', 'text-gray-600');
  }

  if (view === 'child') {
    childView.classList.remove('hidden');
    parentView.classList.add('hidden');
    buttons[0].classList.add('active');
    buttons[0].classList.remove('bg-gray-100', 'text-gray-600');
  } else {
    childView.classList.add('hidden');
    parentView.classList.remove('hidden');
    buttons[1].classList.add('active');
    buttons[1].classList.remove('bg-gray-100', 'text-gray-600');
    renderParentView();
  }
}

// ====================== Modal ======================

function showModal(opts) {
  return new Promise(function(resolve) {
    var overlay = document.getElementById('modal-overlay');
    document.getElementById('modal-icon').textContent = opts.icon || '📝';
    document.getElementById('modal-title').textContent = opts.title || '';
    document.getElementById('modal-message').textContent = opts.message || '';

    var body = document.getElementById('modal-body');
    if (opts.fields) {
      body.innerHTML = opts.fields.map(function(f) {
        return '<input type="' + (f.type || 'text') + '" id="modal-field-' + f.id + '" placeholder="' + (f.placeholder || '') + '" value="' + (f.value || '') + '" autocomplete="off">';
      }).join('');
      body.classList.remove('hidden');
    } else {
      body.innerHTML = '';
      body.classList.add('hidden');
    }

    var actions = document.getElementById('modal-actions');
    var confirmText = opts.confirmText || '确认';
    var cancelText = opts.cancelText || '取消';
    var confirmClass = opts.danger ? 'modal-btn-danger' : 'modal-btn-primary';
    actions.innerHTML =
      '<button class="modal-btn modal-btn-cancel" id="modal-cancel">' + cancelText + '</button>' +
      '<button class="modal-btn ' + confirmClass + '" id="modal-confirm">' + confirmText + '</button>';

    overlay.classList.remove('hidden');

    var resolved = false;

    function cleanup() {
      if (resolved) return;
      resolved = true;
      overlay.classList.add('hidden');
      overlay.onclick = null;
      document.removeEventListener('keydown', onEsc);
    }

    function onCancel() {
      cleanup();
      resolve(null);
    }

    function onEsc(e) {
      if (e.key === 'Escape') onCancel();
    }

    function onConfirm() {
      var values = {};
      if (opts.fields) {
        for (var i = 0; i < opts.fields.length; i++) {
          var f = opts.fields[i];
          var el = document.getElementById('modal-field-' + f.id);
          values[f.id] = el ? el.value.trim() : '';
          if (f.required && !values[f.id]) {
            if (el) el.focus();
            return;
          }
        }
      }
      cleanup();
      resolve(values);
    }

    document.getElementById('modal-cancel').onclick = onCancel;
    document.getElementById('modal-confirm').onclick = onConfirm;
    overlay.onclick = function(e) { if (e.target === overlay) onCancel(); };
    document.addEventListener('keydown', onEsc);

    setTimeout(function() {
      if (opts.fields && opts.fields.length > 0) {
        var first = document.getElementById('modal-field-' + opts.fields[0].id);
        if (first) first.focus();
      }
    }, 100);
  });
}

// ====================== Toast ======================

function showToast(msg) {
  var toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('toast-hide');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { toast.classList.add('toast-hide'); }, 1800);
}

// ====================== Keyboard Shortcuts ======================

document.addEventListener('keydown', function(e) {
  if (e.key === '1') switchView('child');
  if (e.key === '2') switchView('parent');
});

// ====================== Boot ======================

initApp();
