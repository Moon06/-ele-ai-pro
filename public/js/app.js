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
  selectedShopTab: null,
  pet: null,
  petAnimating: false,
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
var parentMode = 'create'; // 'create' or 'join'
function setRegisterRole(role) {
  registerRole = role;
  updateRegisterRole();
}

function setParentMode(mode) {
  parentMode = mode;
  updateRegisterRole();
}

function updateRegisterRole() {
  document.getElementById('reg-role-parent').classList.toggle('active', registerRole === 'parent');
  document.getElementById('reg-role-child').classList.toggle('active', registerRole === 'child');

  var parentModeToggle = document.getElementById('reg-parent-mode-toggle');
  var familyNameGroup = document.getElementById('reg-family-name-group');
  var inviteGroup = document.getElementById('reg-invite-group');

  if (registerRole === 'parent') {
    parentModeToggle.classList.remove('hidden');
    document.getElementById('reg-parent-create').classList.toggle('active', parentMode === 'create');
    document.getElementById('reg-parent-join').classList.toggle('active', parentMode === 'join');

    if (parentMode === 'create') {
      familyNameGroup.classList.remove('hidden');
      inviteGroup.classList.add('hidden');
    } else {
      familyNameGroup.classList.add('hidden');
      inviteGroup.classList.remove('hidden');
    }
  } else {
    parentModeToggle.classList.add('hidden');
    familyNameGroup.classList.add('hidden');
    inviteGroup.classList.remove('hidden');
  }
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

  if (registerRole === 'parent' && parentMode === 'create' && !familyName) {
    showAuthError('请填写家庭名称');
    return;
  }

  if ((registerRole === 'parent' && parentMode === 'join') || registerRole !== 'parent') {
    if (!inviteCode) {
      showAuthError('请填写邀请码');
      return;
    }
  }

  var body = {
    username: username,
    password: password,
    role: registerRole,
    display_name: displayName,
  };

  if (registerRole === 'parent' && parentMode === 'create') {
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

    // Load pet
    try {
      var petData = await API.getPet(AppState.selectedChildId);
      if (petData) AppState.pet = petData.pet;
    } catch (_) {}

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
    html += '<button class="child-chip" onclick="showInviteInfo()" style="border-style:dashed;color:var(--gray-400);font-weight:400">+ 邀请成员</button>';
    selectorEl.innerHTML = html;
    selectorEl.classList.remove('hidden');
  } else {
    selectorEl.classList.add('hidden');
  }
}

function renderChildView() {
  renderPetRoom();
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
  var userId = AppState.currentUser ? AppState.currentUser.id : null;
  document.getElementById('rewardCount').textContent = rewards.length;

  if (rewards.length === 0) {
    container.innerHTML = '<div class="text-center text-gray-300 text-sm py-6">🏪 商店还是空的，让家长来上架商品吧</div>';
    return;
  }

  // Get parents in the family
  var parents = AppState.familyMembers.filter(function(m) { return m.role === 'parent'; });

  // Group rewards by creator_id
  var groups = [];
  var seen = {};
  for (var i = 0; i < rewards.length; i++) {
    var r = rewards[i];
    var cid = r.creator_id || 0;
    if (!seen[cid]) {
      seen[cid] = true;
      var parentInfo = parents.find(function(p) { return p.id === cid; });
      groups.push({
        creator_id: cid,
        creator_name: parentInfo ? parentInfo.display_name : (r.creator_name || '系统'),
        creator_emoji: parentInfo ? parentInfo.avatar_emoji : (r.creator_emoji || '🏪'),
        creator_shop: parentInfo ? (parentInfo.shop_name || parentInfo.display_name + '的小店') : (r.creator_shop || '默认小店'),
        items: []
      });
    }
    var group = groups[groups.length - 1];
    if (group.creator_id !== cid) {
      for (var j = 0; j < groups.length; j++) {
        if (groups[j].creator_id === cid) { group = groups[j]; break; }
      }
    }
    group.items.push(r);
  }

  // Default to first parent's shop
  if (AppState.selectedShopTab === null && groups.length > 0) {
    AppState.selectedShopTab = groups[0].creator_id;
  }
  // Validate selected tab still exists
  var tabValid = groups.some(function(g) { return g.creator_id === AppState.selectedShopTab; });
  if (!tabValid) {
    AppState.selectedShopTab = groups[0].creator_id;
  }

  // Build shop tabs
  var html = '<div class="shop-tabs" style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap">';
  for (var g = 0; g < groups.length; g++) {
    var grp = groups[g];
    var active = grp.creator_id === AppState.selectedShopTab;
    var tabStyle = active
      ? 'background:var(--sky-deep);color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.1)'
      : 'background:var(--gray-100);color:var(--gray-600)';
    html += '<button class="shop-tab-btn" data-creator="' + grp.creator_id + '" style="display:flex;align-items:center;gap:5px;padding:6px 14px;border-radius:20px;border:none;cursor:pointer;font-family:inherit;font-size:0.8rem;font-weight:700;transition:all .15s;' + tabStyle + '">';
    html += '<span style="font-size:1rem">' + grp.creator_emoji + '</span>';
    html += grp.creator_shop;
    html += '<span style="font-size:0.65rem;opacity:0.7;font-weight:600">' + grp.items.length + '</span>';
    html += '</button>';
  }
  html += '</div>';

  // Show items for selected shop
  var selectedGroup = groups.find(function(g) { return g.creator_id === AppState.selectedShopTab; });
  if (selectedGroup) {
    for (var k = 0; k < selectedGroup.items.length; k++) {
      var r = selectedGroup.items[k];
      var can = r.affordable;
      var cls = can ? 'bg-sun-deep text-white hover-bg-sun-deep' : 'bg-gray-200 text-gray-400';
      var disabled = can ? '' : ' disabled';
      var tip = can ? '✅' : '🔒';
      var manageBtns = '';
      if (isParent && r.creator_id === userId) {
        manageBtns = '<button class="bg-transparent border-none cursor-pointer text-xs px-1" onclick="handleEditReward(' + r.id + ')" title="编辑" style="font-family:inherit">✏️</button>' +
          '<button class="bg-transparent border-none cursor-pointer text-xs px-1" onclick="handleDeleteReward(' + r.id + ')" title="删除" style="font-family:inherit">🗑️</button>';
      }
      html += '<div class="flex items-center gap-3 p-3 rounded-2xl bg-gray-50 hover-bg-sun-light" style="margin-bottom:6px">' +
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
    }
  }

  container.innerHTML = html;

  // Bind tab click events
  var tabBtns = container.querySelectorAll('.shop-tab-btn');
  for (var t = 0; t < tabBtns.length; t++) {
    tabBtns[t].onclick = function() {
      AppState.selectedShopTab = parseInt(this.getAttribute('data-creator'), 10);
      renderRewards();
    };
  }
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

// ====================== Profile Editor ======================

var avatarEmojiOptions = ['🐼','🐻','🐰','🦊','🐱','🐶','🐨','🐯','🐮','🐷','🐸','🐵','🦁','🐙','🦄','👑','🌟','🌈','🌸','🍀'];

async function showProfileEditor() {
  var u = AppState.currentUser;
  if (!u) return;

  var avatarGrid = '<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;max-height:180px;overflow-y:auto;padding:4px 0">';
  for (var i = 0; i < avatarEmojiOptions.length; i++) {
    var e = avatarEmojiOptions[i];
    var sel = e === u.avatar_emoji ? ' style="box-shadow:0 0 0 3px var(--sky-mid);transform:scale(1.2)"' : '';
    avatarGrid += '<button class="avatar-option" data-emoji="' + e + '" style="font-size:1.5rem;width:44px;height:44px;border-radius:50%;border:2px solid var(--gray-200);background:var(--white);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;font-family:inherit"' + sel + '>' + e + '</button>';
  }
  avatarGrid += '</div>';

  var fields = [
    { id: 'display_name', value: u.display_name, placeholder: '显示名称', required: true },
  ];

  if (u.role === 'parent') {
    fields.push({ id: 'shop_name', value: u.shop_name || '', placeholder: '店铺名称（如：爸爸的小店）' });
  }

  fields.push(
    { id: 'current_password', value: '', placeholder: '当前密码（仅修改密码时填写）', type: 'password' },
    { id: 'new_password', value: '', placeholder: '新密码（不修改则留空）', type: 'password' }
  );

  var values = await showModal({
    icon: u.avatar_emoji || '⚙️',
    title: '编辑个人资料',
    message: '',
    fields: fields,
    customBody: avatarGrid,
    confirmText: '保存',
  });

  if (!values) return;

  var selectedEmoji = document.querySelector('.avatar-option[style*="sky-mid"]');
  var newEmoji = selectedEmoji ? selectedEmoji.getAttribute('data-emoji') : u.avatar_emoji;

  var body = { display_name: values.display_name, avatar_emoji: newEmoji };

  if (u.role === 'parent' && values.shop_name !== undefined) {
    body.shop_name = values.shop_name;
  }

  if (values.new_password) {
    body.current_password = values.current_password || '';
    body.new_password = values.new_password;
  }

  try {
    var data = await API.updateProfile(body);
    if (!data) { showToast('更新失败'); return; }
    AppState.currentUser = data.user;
    renderAll();
    showToast('✅ 个人资料已更新');
  } catch (e) {
    showToast(e.message || '更新失败');
  }
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

// ====================== Backup Manager ======================

async function showBackupManager() {
  try {
    var data = await API.getBackups();
    if (!data) { showToast('获取备份列表失败'); return; }
    var backups = data.backups;

    var bodyHTML;
    if (backups.length === 0) {
      bodyHTML = '<div class="text-center text-gray-400 text-sm py-4">还没有备份。每次数据变更都会自动创建备份。</div>';
    } else {
      bodyHTML = '<div style="max-height:280px;overflow-y:auto;text-align:left">';
      for (var i = 0; i < backups.length; i++) {
        var b = backups[i];
        var d = new Date(b.time);
        var label = d.getFullYear() + '-' +
          String(d.getMonth()+1).padStart(2,'0') + '-' +
          String(d.getDate()).padStart(2,'0') + ' ' +
          String(d.getHours()).padStart(2,'0') + ':' +
          String(d.getMinutes()).padStart(2,'0') + ':' +
          String(d.getSeconds()).padStart(2,'0');
        var sizeKB = (b.size / 1024).toFixed(1) + ' KB';
        bodyHTML += '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--gray-100)">' +
          '<div><div style="font-weight:700;font-size:0.875rem;color:var(--gray-700)">' + label + '</div>' +
          '<div style="font-size:0.75rem;color:var(--gray-400)">' + sizeKB + '</div></div>' +
          '<button class="btn-bounce font-bold text-xs px-3 py-1 rounded-full bg-sky-deep text-white" style="font-family:inherit" onclick="handleRestoreBackup(\'' + b.filename + '\')">恢复</button>' +
        '</div>';
      }
      bodyHTML += '</div>';
      bodyHTML += '<div class="text-xs text-gray-400 mt-3 text-center">共 ' + backups.length + ' 个备份，最多保留 10 个。恢复后需刷新页面。</div>';
    }

    var ok = await showModal({
      icon: '💾',
      title: '数据库备份管理',
      message: '',
      customBody: bodyHTML,
      confirmText: '关闭',
      cancelText: '',
    });

    // Wait a tick so the restore buttons get bound
  } catch(e) {
    showToast('获取备份失败: ' + e.message);
  }
}

var pendingRestoreFile = null;
async function handleRestoreBackup(filename) {
  // Close the backups modal first, then confirm restore
  // We need to do this via the overlay click handler...
  // Actually, let's close the modal and show a confirmation
  document.getElementById('modal-overlay').classList.add('hidden');

  var ok = await showModal({
    icon: '⚠️',
    title: '确认恢复备份',
    message: '将数据库恢复到「' + filename + '」。当前数据会先备份，然后被替换。确定要继续吗？',
    confirmText: '确认恢复',
    danger: true,
  });
  if (!ok) return;

  try {
    var data = await API.restoreBackup(filename);
    if (!data) { showToast('恢复失败'); return; }
    showToast('✅ 备份已恢复，即将刷新页面...');
    setTimeout(function() { location.reload(); }, 1500);
  } catch(e) {
    showToast('恢复失败: ' + e.message);
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
    var code = data.invite_code;
    var bodyHTML = '<div style="text-align:left">' +
      '<div style="background:var(--sky-light);border-radius:12px;padding:14px;margin-bottom:12px">' +
        '<div style="font-weight:800;font-size:0.9rem;color:var(--sky-deep);margin-bottom:6px">🧒 邀请孩子加入</div>' +
        '<div style="font-size:0.8rem;color:var(--gray-600);line-height:1.5">让孩子在注册页面选择 <b>「我是孩子」</b>，输入下方邀请码即可加入家庭。</div>' +
      '</div>' +
      '<div style="background:var(--grass-light);border-radius:12px;padding:14px;margin-bottom:12px">' +
        '<div style="font-weight:800;font-size:0.9rem;color:var(--grass-deep);margin-bottom:6px">👨‍👩‍👧 邀请另一位家长</div>' +
        '<div style="font-size:0.8rem;color:var(--gray-600);line-height:1.5">让对方在注册页面选择 <b>「我是家长」→「加入已有家庭」</b>，输入下方邀请码即可加入。</div>' +
      '</div>' +
      '<div style="text-align:center;background:var(--sun-light);border-radius:16px;padding:18px">' +
        '<div style="font-size:0.75rem;font-weight:700;color:var(--gray-500);margin-bottom:6px;text-transform:uppercase;letter-spacing:1px">邀请码</div>' +
        '<div style="font-size:2rem;font-weight:900;color:var(--sun-deep);letter-spacing:4px;font-family:monospace">' + code + '</div>' +
      '</div>' +
    '</div>';
    await showModal({
      icon: '📨',
      title: '邀请家庭成员',
      message: '',
      customBody: bodyHTML,
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
    var bodyHTML = '';
    if (opts.customBody) {
      bodyHTML += opts.customBody;
    }
    if (opts.fields) {
      bodyHTML += opts.fields.map(function(f) {
        return '<input type="' + (f.type || 'text') + '" id="modal-field-' + f.id + '" placeholder="' + (f.placeholder || '') + '" value="' + (f.value || '') + '" autocomplete="off">';
      }).join('');
    }
    if (bodyHTML) {
      body.innerHTML = bodyHTML;
      body.classList.remove('hidden');
    } else {
      body.innerHTML = '';
      body.classList.add('hidden');
    }

    // Bind avatar option clicks
    if (opts.customBody) {
      setTimeout(function() {
        var opts_btns = body.querySelectorAll('.avatar-option');
        for (var i = 0; i < opts_btns.length; i++) {
          opts_btns[i].onclick = function() {
            for (var j = 0; j < opts_btns.length; j++) {
              opts_btns[j].style.boxShadow = '';
              opts_btns[j].style.transform = '';
            }
            this.style.boxShadow = '0 0 0 3px var(--sky-mid)';
            this.style.transform = 'scale(1.2)';
          };
        }
      }, 50);
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

// ====================== Pet System ======================

// ====================== Pet SVG System ======================

var PET_SVG_DEFS = '\
<defs>\
  <radialGradient id="g-cat-body" cx="40%" cy="35%"><stop offset="0%" stop-color="#ffb347"/><stop offset="70%" stop-color="#f9a03f"/><stop offset="100%" stop-color="#e07b20"/></radialGradient>\
  <radialGradient id="g-cat-head" cx="45%" cy="35%"><stop offset="0%" stop-color="#ffb347"/><stop offset="100%" stop-color="#f0882a"/></radialGradient>\
  <radialGradient id="g-dog-body" cx="40%" cy="35%"><stop offset="0%" stop-color="#f5d78c"/><stop offset="70%" stop-color="#e8c062"/><stop offset="100%" stop-color="#c89838"/></radialGradient>\
  <radialGradient id="g-dog-head" cx="45%" cy="35%"><stop offset="0%" stop-color="#f5d78c"/><stop offset="100%" stop-color="#d4a840"/></radialGradient>\
  <radialGradient id="g-rabbit-body" cx="40%" cy="35%"><stop offset="0%" stop-color="#fafaf7"/><stop offset="60%" stop-color="#f0ece2"/><stop offset="100%" stop-color="#e0d8c8"/></radialGradient>\
  <radialGradient id="g-rabbit-head" cx="45%" cy="35%"><stop offset="0%" stop-color="#fdfdfb"/><stop offset="100%" stop-color="#ede8da"/></radialGradient>\
  <filter id="shadow-soft"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#00000018"/></filter>\
  <filter id="shadow-pet"><feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#00000012"/></filter>\
</defs>';

function renderCatSVG(className) {
  return '<svg class="svg-pet ' + (className || '') + '" viewBox="0 0 140 155" width="140" height="155" filter="url(#shadow-pet)">' + PET_SVG_DEFS +
    '<!-- tail --><g id="pet-tail" style="transform-origin:82px 95px">' +
      '<path d="M82 105 Q118 80 120 48 Q118 32 108 38" stroke="url(#g-cat-body)" stroke-width="10" stroke-linecap="round" fill="none"/>' +
      '<path d="M114 36 Q120 38 118 48" stroke="#e07b20" stroke-width="4" stroke-linecap="round" fill="none" opacity="0.5"/>' +
    '</g>' +
    '<!-- body --><g id="pet-body">' +
      '<ellipse cx="70" cy="100" rx="42" ry="44" fill="url(#g-cat-body)"/>' +
      '<path d="M38 82 Q70 74 102 82" stroke="#e07b20" stroke-width="1.8" fill="none" opacity="0.35"/>' +
      '<path d="M35 92 Q70 84 105 92" stroke="#e07b20" stroke-width="1.8" fill="none" opacity="0.3"/>' +
      '<path d="M36 102 Q70 94 104 102" stroke="#e07b20" stroke-width="1.5" fill="none" opacity="0.25"/>' +
    '</g>' +
    '<!-- paws --><g>' +
      '<ellipse cx="48" cy="138" rx="14" ry="8" fill="#f9a03f"/><ellipse cx="92" cy="138" rx="14" ry="8" fill="#f9a03f"/>' +
      '<line x1="42" y1="135" x2="42" y2="143" stroke="#e07b20" stroke-width="0.8" opacity="0.4"/><line x1="48" y1="136" x2="48" y2="144" stroke="#e07b20" stroke-width="0.8" opacity="0.4"/><line x1="54" y1="135" x2="54" y2="143" stroke="#e07b20" stroke-width="0.8" opacity="0.4"/>' +
      '<line x1="86" y1="135" x2="86" y2="143" stroke="#e07b20" stroke-width="0.8" opacity="0.4"/><line x1="92" y1="136" x2="92" y2="144" stroke="#e07b20" stroke-width="0.8" opacity="0.4"/><line x1="98" y1="135" x2="98" y2="143" stroke="#e07b20" stroke-width="0.8" opacity="0.4"/>' +
    '</g>' +
    '<!-- head --><g id="pet-head">' +
      '<circle cx="70" cy="60" r="32" fill="url(#g-cat-head)"/>' +
    '</g>' +
    '<!-- ears -->' +
      '<g id="pet-ear-l" style="transform-origin:44px 42px">' +
        '<polygon points="46,38 34,8 62,30" fill="#f9a03f" stroke="#e07b20" stroke-width="1"/>' +
        '<polygon points="44,34 36,16 57,30" fill="#fcd5b0"/>' +
      '</g>' +
      '<g id="pet-ear-r" style="transform-origin:96px 42px">' +
        '<polygon points="94,38 106,8 78,30" fill="#f9a03f" stroke="#e07b20" stroke-width="1"/>' +
        '<polygon points="96,34 104,16 83,30" fill="#fcd5b0"/>' +
      '</g>' +
    '<!-- eyes -->' +
      '<g id="pet-eye-l" style="transform-origin:58px 60px">' +
        '<ellipse cx="58" cy="60" rx="9" ry="10" fill="#7ab648"/><ellipse cx="58" cy="60" rx="3.5" ry="9" fill="#1a1a1a"/>' +
        '<circle id="pet-pupil-l" cx="57" cy="58" r="3" fill="white"/>' +
      '</g>' +
      '<g id="pet-eye-r" style="transform-origin:82px 60px">' +
        '<ellipse cx="82" cy="60" rx="9" ry="10" fill="#7ab648"/><ellipse cx="82" cy="60" rx="3.5" ry="9" fill="#1a1a1a"/>' +
        '<circle id="pet-pupil-r" cx="81" cy="58" r="3" fill="white"/>' +
      '</g>' +
    '<!-- nose --><ellipse cx="70" cy="71" rx="5" ry="3.5" fill="#f4a0a0"/>' +
    '<!-- mouth --><path id="pet-mouth" d="M64 75 Q70 81 76 75" stroke="#c49585" stroke-width="1" fill="none"/>' +
    '<!-- whiskers -->' +
      '<line x1="24" y1="66" x2="48" y2="70" stroke="#d4c5b0" stroke-width="0.7"/><line x1="22" y1="73" x2="48" y2="73" stroke="#d4c5b0" stroke-width="0.7"/>' +
      '<line x1="116" y1="66" x2="92" y2="70" stroke="#d4c5b0" stroke-width="0.7"/><line x1="118" y1="73" x2="92" y2="73" stroke="#d4c5b0" stroke-width="0.7"/>' +
  '</svg>';
}

function renderDogSVG(className) {
  return '<svg class="svg-pet ' + (className || '') + '" viewBox="0 0 140 155" width="140" height="155" filter="url(#shadow-pet)">' + PET_SVG_DEFS +
    '<!-- tail --><g id="pet-tail" style="transform-origin:96px 90px">' +
      '<path d="M98 105 Q125 80 128 56 Q126 48 120 52" stroke="#d4a840" stroke-width="9" stroke-linecap="round" fill="none"/>' +
      '<path d="M122 48 Q128 50 127 58" stroke="#f5e8c8" stroke-width="5" stroke-linecap="round" fill="none"/>' +
    '</g>' +
    '<!-- body --><g id="pet-body">' +
      '<rect x="30" y="68" rx="26" ry="26" width="80" height="52" fill="url(#g-dog-body)"/>' +
      '<ellipse cx="52" cy="82" rx="12" ry="18" fill="#f5dca0" opacity="0.5"/>' +
    '</g>' +
    '<!-- paws --><g>' +
      '<ellipse cx="42" cy="136" rx="13" ry="7" fill="#e8c062"/><ellipse cx="98" cy="136" rx="13" ry="7" fill="#e8c062"/>' +
      '<line x1="36" y1="133" x2="36" y2="141" stroke="#b08030" stroke-width="0.8" opacity="0.3"/><line x1="42" y1="134" x2="42" y2="142" stroke="#b08030" stroke-width="0.8" opacity="0.3"/><line x1="48" y1="133" x2="48" y2="141" stroke="#b08030" stroke-width="0.8" opacity="0.3"/>' +
      '<line x1="92" y1="133" x2="92" y2="141" stroke="#b08030" stroke-width="0.8" opacity="0.3"/><line x1="98" y1="134" x2="98" y2="142" stroke="#b08030" stroke-width="0.8" opacity="0.3"/><line x1="104" y1="133" x2="104" y2="141" stroke="#b08030" stroke-width="0.8" opacity="0.3"/>' +
    '</g>' +
    '<!-- head --><g id="pet-head">' +
      '<ellipse cx="70" cy="58" rx="34" ry="30" fill="url(#g-dog-head)"/>' +
      '<ellipse cx="54" cy="70" rx="16" ry="12" fill="#f5e0b0" opacity="0.5"/>' +
    '</g>' +
    '<!-- ears -->' +
      '<g id="pet-ear-l" style="transform-origin:40px 45px">' +
        '<ellipse cx="40" cy="60" rx="12" ry="22" fill="#b88230" transform="rotate(-10 40 60)"/>' +
        '<ellipse cx="40" cy="64" rx="7" ry="14" fill="#d4a860" transform="rotate(-10 40 64)"/>' +
      '</g>' +
      '<g id="pet-ear-r" style="transform-origin:100px 45px">' +
        '<ellipse cx="100" cy="60" rx="12" ry="22" fill="#b88230" transform="rotate(10 100 60)"/>' +
        '<ellipse cx="100" cy="64" rx="7" ry="14" fill="#d4a860" transform="rotate(10 100 64)"/>' +
      '</g>' +
    '<!-- eyes -->' +
      '<g id="pet-eye-l" style="transform-origin:56px 56px">' +
        '<circle cx="56" cy="56" r="8" fill="#3d2b1f"/>' +
        '<circle id="pet-pupil-l" cx="54" cy="54" r="3" fill="white"/>' +
        '<circle cx="58" cy="54" r="1.5" fill="white" opacity="0.4"/>' +
      '</g>' +
      '<g id="pet-eye-r" style="transform-origin:84px 56px">' +
        '<circle cx="84" cy="56" r="8" fill="#3d2b1f"/>' +
        '<circle id="pet-pupil-r" cx="82" cy="54" r="3" fill="white"/>' +
        '<circle cx="86" cy="54" r="1.5" fill="white" opacity="0.4"/>' +
      '</g>' +
    '<!-- nose --><ellipse cx="70" cy="68" rx="8" ry="5.5" fill="#2a1f14"/><ellipse cx="68" cy="66" rx="3" ry="2" fill="#fff" opacity="0.25"/>' +
    '<!-- tongue --><g id="pet-tongue"><ellipse cx="70" cy="80" rx="6" ry="10" fill="#f49898"/><line x1="70" y1="73" x2="70" y2="87" stroke="#e87878" stroke-width="0.8"/></g>' +
  '</svg>';
}

function renderRabbitSVG(className) {
  return '<svg class="svg-pet ' + (className || '') + '" viewBox="0 0 140 160" width="140" height="160" filter="url(#shadow-pet)">' + PET_SVG_DEFS +
    '<!-- tail --><g id="pet-tail"><circle cx="105" cy="112" r="14" fill="#fafaf7"/><circle cx="103" cy="110" r="10" fill="#fff"/></g>' +
    '<!-- body --><g id="pet-body">' +
      '<ellipse cx="66" cy="104" rx="40" ry="42" fill="url(#g-rabbit-body)"/>' +
      '<ellipse cx="58" cy="96" rx="18" ry="28" fill="#fff" opacity="0.5"/>' +
    '</g>' +
    '<!-- paws --><g>' +
      '<ellipse cx="46" cy="140" rx="12" ry="7" fill="#f0ece2"/><ellipse cx="86" cy="140" rx="12" ry="7" fill="#f0ece2"/>' +
      '<line x1="40" y1="137" x2="40" y2="144" stroke="#d0c8b8" stroke-width="0.6" opacity="0.4"/><line x1="46" y1="138" x2="46" y2="145" stroke="#d0c8b8" stroke-width="0.6" opacity="0.4"/><line x1="52" y1="137" x2="52" y2="144" stroke="#d0c8b8" stroke-width="0.6" opacity="0.4"/>' +
      '<line x1="80" y1="137" x2="80" y2="144" stroke="#d0c8b8" stroke-width="0.6" opacity="0.4"/><line x1="86" y1="138" x2="86" y2="145" stroke="#d0c8b8" stroke-width="0.6" opacity="0.4"/><line x1="92" y1="137" x2="92" y2="144" stroke="#d0c8b8" stroke-width="0.6" opacity="0.4"/>' +
    '</g>' +
    '<!-- head --><g id="pet-head">' +
      '<ellipse cx="66" cy="64" rx="30" ry="28" fill="url(#g-rabbit-head)"/>' +
    '</g>' +
    '<!-- ears -->' +
      '<g id="pet-ear-l" style="transform-origin:40px 50px">' +
        '<ellipse cx="42" cy="26" rx="10" ry="30" fill="#f0ece2"/>' +
        '<ellipse cx="42" cy="26" rx="5" ry="22" fill="#fcd5b0"/>' +
      '</g>' +
      '<g id="pet-ear-r" style="transform-origin:92px 50px">' +
        '<ellipse cx="90" cy="26" rx="10" ry="30" fill="#f0ece2"/>' +
        '<ellipse cx="90" cy="26" rx="5" ry="22" fill="#fcd5b0"/>' +
      '</g>' +
    '<!-- eyes -->' +
      '<g id="pet-eye-l" style="transform-origin:54px 60px">' +
        '<circle cx="54" cy="60" r="7" fill="#2a1f14"/>' +
        '<circle id="pet-pupil-l" cx="52" cy="58" r="2.5" fill="white"/>' +
      '</g>' +
      '<g id="pet-eye-r" style="transform-origin:78px 60px">' +
        '<circle cx="78" cy="60" r="7" fill="#2a1f14"/>' +
        '<circle id="pet-pupil-r" cx="76" cy="58" r="2.5" fill="white"/>' +
      '</g>' +
    '<!-- nose --><ellipse cx="66" cy="71" rx="4" ry="3" fill="#f4a0a0"/>' +
    '<!-- mouth --><path id="pet-mouth" d="M62 75 Q66 80 70 75" stroke="#c49585" stroke-width="1" fill="none"/><path d="M70 75 Q66 80 62 75" stroke="#c49585" stroke-width="0.5" fill="none" opacity="0.5"/>' +
    '<!-- whiskers -->' +
      '<line x1="26" y1="68" x2="46" y2="70" stroke="#e0d8c8" stroke-width="0.6"/><line x1="24" y1="74" x2="46" y2="72" stroke="#e0d8c8" stroke-width="0.6"/>' +
      '<line x1="106" y1="68" x2="86" y2="70" stroke="#e0d8c8" stroke-width="0.6"/><line x1="108" y1="74" x2="86" y2="72" stroke="#e0d8c8" stroke-width="0.6"/>' +
  '</svg>';
}

function renderPetSVG(type, className) {
  if (type === 'cat') return renderCatSVG(className);
  if (type === 'dog') return renderDogSVG(className);
  return renderRabbitSVG(className);
}

function renderNestHTML() {
  return '<div class="pet-nest" id="petNest">' +
    '<span class="pet-nest-zzz">Z</span>' +
    '<span class="pet-nest-zzz">z</span>' +
    '<span class="pet-nest-zzz">z</span>' +
    '<div class="pet-nest-bed"></div>' +
    '<div class="pet-nest-rim"></div>' +
    '<div class="pet-nest-label">出门玩啦~</div>' +
  '</div>';
}

function showNestInRoom() {
  var stage = document.getElementById('petStage');
  if (!stage) return;
  stage.innerHTML = renderNestHTML();
}

function restorePetInRoom() {
  var stage = document.getElementById('petStage');
  var pet = AppState.pet;
  if (!stage || !pet) return;
  stage.innerHTML = renderPetSVG(pet.pet_type, 'pet-return-home');
  startBlinking();
}

function getStatusDots(val) {
  var level = Math.round(val / 20); // 0-5
  var html = '';
  for (var i = 0; i < 5; i++) {
    html += '<span' + (i < level ? ' class="on"' : '') + '></span>';
  }
  return html;
}

function renderPetRoom() {
  var container = document.getElementById('pet-container');
  var pet = AppState.pet;

  if (!pet) {
    var isParent = AppState.currentUser && AppState.currentUser.role === 'parent';
    container.innerHTML = '<div class="pet-room" style="min-height:140px">' +
      '<div style="text-align:center;padding:24px">' +
        '<div style="font-size:2.5rem;margin-bottom:8px">🥚</div>' +
        '<div style="font-weight:800;font-size:0.9rem;color:var(--gray-600);margin-bottom:4px">还没有宠物伙伴</div>' +
        '<div style="font-size:0.75rem;color:var(--gray-400);margin-bottom:12px">领养一只可爱的小动物陪伴孩子成长吧</div>' +
        (isParent ? '<button class="btn-bounce bg-sun-deep text-white font-bold text-sm px-5 py-2 rounded-full" style="font-family:inherit;border:none;cursor:pointer" onclick="handleAdoptPet()">🎪 领养宠物</button>' : '') +
      '</div>' +
    '</div>';
    stopPetWandering();
    return;
  }

  // Render pet room with pet
  var low = (pet.hunger < 30 || pet.mood < 30 || pet.clean < 30);
  var moodEmoji = pet.mood >= 60 ? '😊' : (pet.mood >= 30 ? '😐' : '😢');
  var overallHappy = pet.hunger >= 30 && pet.mood >= 30 && pet.clean >= 30;

  container.innerHTML = '<div class="pet-room" id="petRoom">' +
    '<div class="rug"></div>' +
    '<div class="pet-name-tag">' + (overallHappy ? moodEmoji : moodEmoji) + ' ' + pet.pet_name + '</div>' +
    '<div class="pet-stage" id="petStage">' +
      (PetAI.active ? renderNestHTML() : renderPetSVG(pet.pet_type, 'pet-breathe')) +
    '</div>' +
    '<div class="pet-stats">' +
      '<div class="pet-stat' + (pet.hunger < 30 ? ' low' : '') + '">🍖<div class="pet-stat-dots">' + getStatusDots(pet.hunger) + '</div></div>' +
      '<div class="pet-stat' + (pet.mood < 30 ? ' low' : '') + '">💚<div class="pet-stat-dots">' + getStatusDots(pet.mood) + '</div></div>' +
      '<div class="pet-stat' + (pet.clean < 30 ? ' low' : '') + '">✨<div class="pet-stat-dots">' + getStatusDots(pet.clean) + '</div></div>' +
    '</div>' +
    '<div class="pet-care-btns">' +
      '<button class="pet-care-btn bg-sun-light text-sun-deep" onclick="handleCarePet(\'feed\')" style="font-family:inherit">🍖 喂食 3分</button>' +
      '<button class="pet-care-btn bg-sky-light text-sky-deep" onclick="handleCarePet(\'play\')" style="font-family:inherit">🎾 玩耍 2分</button>' +
      '<button class="pet-care-btn bg-grass-light text-grass-deep" onclick="handleCarePet(\'clean\')" style="font-family:inherit">🛁 洗澡 2分</button>' +
    '</div>' +
  '</div>';

  // Rebind blinking if pet is in room
  if (!PetAI.active) {
    startBlinking();
  }

  // Blink timer
  startBlinking();

  // Start wandering if not already (works for both parent-viewing-child and child users)
  if (!PetAI.active) {
    startPetWandering();
  }
}

// ---- Blink ----
var blinkTimer = null;
function startBlinking() {
  clearInterval(blinkTimer);
  blinkTimer = setInterval(function() {
    // SVG pets — blink both eyes
    var eyes = document.querySelectorAll('#petStage [id*="pet-eye"]');
    if (eyes.length === 0) return;
    for (var i = 0; i < eyes.length; i++) {
      eyes[i].style.transform = 'scaleY(0.1)';
    }
    setTimeout(function() {
      for (var i = 0; i < eyes.length; i++) {
        if (eyes[i]) eyes[i].style.transform = '';
      }
    }, 100);
  }, 3000 + Math.random() * 4000);
}

// ---- Adopt flow ----
async function handleAdoptPet() {
  var childId = AppState.selectedChildId;
  if (!childId) { showToast('请先选择一个孩子'); return; }

  var bodyHTML = '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">' +
    '<div class="adopt-card" onclick="selectAdoptPet(\'cat\')" id="adopt-cat">' +
      '<div class="pet-preview">🐱</div>' +
      '<div class="pet-type-name">小猫咪</div>' +
      '<div style="font-size:0.65rem;color:var(--gray-400)">活泼可爱</div>' +
    '</div>' +
    '<div class="adopt-card" onclick="selectAdoptPet(\'dog\')" id="adopt-dog">' +
      '<div class="pet-preview">🐶</div>' +
      '<div class="pet-type-name">小狗狗</div>' +
      '<div style="font-size:0.65rem;color:var(--gray-400)">忠诚热情</div>' +
    '</div>' +
    '<div class="adopt-card" onclick="selectAdoptPet(\'rabbit\')" id="adopt-rabbit">' +
      '<div class="pet-preview">🐰</div>' +
      '<div class="pet-type-name">小兔子</div>' +
      '<div style="font-size:0.65rem;color:var(--gray-400)">温顺乖巧</div>' +
    '</div>' +
  '</div>';

  AppState._adoptType = null;

  var values = await showModal({
    icon: '🎪',
    title: '选择宠物伙伴',
    message: '为孩子挑选一只可爱的小动物，需要消耗 10 积分才能领养哦',
    customBody: bodyHTML,
    fields: [{ id: 'pet_name', placeholder: '给宠物取个名字吧（如：小橘、旺财）', required: true }],
    confirmText: '领养',
    cancelText: '取消',
  });

  if (!values) return;
  if (!AppState._adoptType) { showToast('请选择一种宠物'); return; }

  try {
    var data = await API.adoptPet({ child_id: childId, pet_type: AppState._adoptType, pet_name: values.pet_name });
    if (!data) { showToast('领养失败'); return; }
    AppState.pet = data.pet;
    showToast('🎉 领养成功！欢迎 ' + values.pet_name + ' 加入家庭~');
    renderPetRoom();
  } catch (e) {
    showToast(e.message || '领养失败');
  }
}

function selectAdoptPet(type) {
  AppState._adoptType = type;
  var cards = document.querySelectorAll('.adopt-card');
  for (var i = 0; i < cards.length; i++) {
    cards[i].style.borderColor = 'var(--gray-200)';
    cards[i].style.boxShadow = '';
  }
  var selected = document.getElementById('adopt-' + type);
  if (selected) {
    selected.style.borderColor = 'var(--sun-mid)';
    selected.style.boxShadow = '0 0 0 3px rgba(212, 168, 83, 0.25)';
  }
}

// ---- Care actions ----
async function handleCarePet(action) {
  if (!AppState.pet || AppState.petAnimating) return;
  AppState.petAnimating = true;

  var petStage = document.getElementById('petStage');
  var petEl = petStage ? petStage.querySelector('svg') : null;
  var room = document.getElementById('petRoom');

  // Play animation based on action
  if (action === 'feed' && petEl) {
    petEl.classList.add('pet-bounce');
    // Drop food particle
    if (room) {
      var rect = room.getBoundingClientRect();
      spawnParticles(rect.left + rect.width / 2, rect.top + rect.height / 3, '🐟', 1);
      setTimeout(function() { spawnParticles(rect.left + rect.width / 2, rect.top + rect.height / 3 - 20, '❤️', 5); }, 400);
    }
  } else if (action === 'play' && petEl) {
    petEl.classList.add('pet-spin');
    if (room) {
      var rect2 = room.getBoundingClientRect();
      spawnParticles(rect2.left + rect2.width / 2, rect2.top + rect2.height / 3, '✨', 8);
    }
  } else if (action === 'clean' && petEl) {
    petEl.classList.add('pet-shine');
    if (room) {
      var rect3 = room.getBoundingClientRect();
      spawnParticles(rect3.left + rect3.width / 2, rect3.top + rect3.height / 3, '🫧', 6);
    }
  }

  // Clear animation classes
  setTimeout(function() {
    if (petEl) { petEl.classList.remove('pet-bounce', 'pet-spin', 'pet-shine'); }
  }, 600);

  try {
    var data = await API.carePet(AppState.pet.id, action);
    if (!data) { AppState.petAnimating = false; return; }
    AppState.pet = data.pet;
    AppState.points = data.total_points;
    document.getElementById('totalPoints').textContent = AppState.points;
    renderPetRoom();
    showToast('✅ 已' + ({feed:'喂食',play:'玩耍',clean:'清洁'})[action] + '，消耗 ' + data.points_spent + ' 积分');
  } catch (e) {
    showToast(e.message || '操作失败');
  }
  AppState.petAnimating = false;
}

// ---- Particle system ----
function spawnParticles(x, y, emoji, count) {
  for (var i = 0; i < count; i++) {
    var p = document.createElement('span');
    p.className = 'particle';
    p.textContent = emoji;
    p.style.left = x + 'px';
    p.style.top = y + 'px';
    var angle = Math.random() * Math.PI * 2;
    var dist = 30 + Math.random() * 60;
    p.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
    p.style.setProperty('--dy', Math.sin(angle) * dist - 30 - Math.random() * 40 + 'px');
    document.body.appendChild(p);
    setTimeout(function() { if (p.parentNode) p.parentNode.removeChild(p); }, 1000);
  }
}

// ---- Pet Physics Engine ----
var PetPhysics = {
  bodySquash: 1, bodySquashV: 0,
  earL: 0, earLV: 0, earR: 0, earRV: 0,
  tail: 0, tailV: 0,
  prevX: 0, prevY: 0, moveX: 0, moveY: 0,
  rafId: null,
  kEar: 0.04, dEar: 0.82,
  kTail: 0.025, dTail: 0.86,
  kBody: 0.05, dBody: 0.78
};

function startPhysicsLoop() {
  if (PetPhysics.rafId) return;
  PetPhysics.prevX = PetAI.targetX;
  PetPhysics.prevY = PetAI.targetY;
  function tick() {
    if (!PetAI.active || !PetAI.wanderingPet) { PetPhysics.rafId = null; return; }
    var wp = PetAI.wanderingPet;
    var rect = wp.getBoundingClientRect();
    var nowX = rect.left + rect.width/2;
    var nowY = rect.top + rect.height/2;
    var dt = 16;

    // Movement tracking
    var dx = nowX - PetPhysics.prevX;
    var dy = nowY - PetPhysics.prevY;
    PetPhysics.moveX += (dx - PetPhysics.moveX) * 0.15;
    PetPhysics.moveY += (dy - PetPhysics.moveY) * 0.15;
    PetPhysics.prevX = nowX;
    PetPhysics.prevY = nowY;

    var speed = Math.sqrt(PetPhysics.moveX*PetPhysics.moveX + PetPhysics.moveY*PetPhysics.moveY);

    // Body squash/stretch
    var tSquash = speed > 1 ? 1 + Math.min(speed * 0.003, 0.12) : 1;
    if (speed < 1) tSquash = 1;
    var fB = PetPhysics.kBody * (tSquash - PetPhysics.bodySquash) - PetPhysics.dBody * PetPhysics.bodySquashV;
    PetPhysics.bodySquashV += fB * dt;
    PetPhysics.bodySquash += PetPhysics.bodySquashV * dt * 0.06;
    if (Math.abs(PetPhysics.bodySquashV) < 0.001 && Math.abs(PetPhysics.bodySquash - 1) < 0.005) {
      PetPhysics.bodySquash = 1; PetPhysics.bodySquashV = 0;
    }

    // Ears — inertia-driven
    var tEL = PetPhysics.moveY * 0.04 + Math.sin(Date.now()/700) * 2.5;
    var tER = -PetPhysics.moveY * 0.04 + Math.cos(Date.now()/700 + 0.6) * 2.5;
    var fEL = PetPhysics.kEar * (tEL - PetPhysics.earL) - PetPhysics.dEar * PetPhysics.earLV;
    PetPhysics.earLV += fEL * dt * 0.06; PetPhysics.earL += PetPhysics.earLV * dt * 0.06;
    var fER = PetPhysics.kEar * (tER - PetPhysics.earR) - PetPhysics.dEar * PetPhysics.earRV;
    PetPhysics.earRV += fER * dt * 0.06; PetPhysics.earR += PetPhysics.earRV * dt * 0.06;

    // Tail — secondary motion
    var tTail = PetPhysics.moveX * -0.05 + Math.sin(Date.now()/350) * 7;
    var fT = PetPhysics.kTail * (tTail - PetPhysics.tail) - PetPhysics.dTail * PetPhysics.tailV;
    PetPhysics.tailV += fT * dt * 0.06; PetPhysics.tail += PetPhysics.tailV * dt * 0.06;

    // Apply to SVG
    try {
      var body = wp.querySelector('#pet-body');
      if (body) { body.setAttribute('transform', 'translate(70,100) scale(' + PetPhysics.bodySquash.toFixed(3) + ',' + (2-PetPhysics.bodySquash).toFixed(3) + ') translate(-70,-100)'); }
      var eL = wp.querySelector('#pet-ear-l');
      if (eL) eL.style.transform = 'rotate(' + PetPhysics.earL.toFixed(1) + 'deg)';
      var eR = wp.querySelector('#pet-ear-r');
      if (eR) eR.style.transform = 'rotate(' + PetPhysics.earR.toFixed(1) + 'deg)';
      var t = wp.querySelector('#pet-tail');
      if (t) t.style.transform = 'rotate(' + PetPhysics.tail.toFixed(1) + 'deg)';
    } catch(_) {}

    PetPhysics.rafId = requestAnimationFrame(tick);
  }
  PetPhysics.rafId = requestAnimationFrame(tick);
}

function stopPhysicsLoop() {
  if (PetPhysics.rafId) { cancelAnimationFrame(PetPhysics.rafId); PetPhysics.rafId = null; }
}

// ---- Pet wandering AI ----
var PetAI = {
  active: false,
  wanderingPet: null,
  wanderTimer: null,
  hideTimer: null,
  hideSeekActive: false,
  lastHideTime: 0,
  targetX: 0,
  targetY: 0,
};

function startPetWandering() {
  if (PetAI.active) return;
  PetAI.active = true;

  var pet = AppState.pet;
  if (!pet) return;

  if (!PetAI.wanderingPet) {
    PetAI.wanderingPet = document.createElement('div');
    PetAI.wanderingPet.className = 'wandering-pet';
    PetAI.wanderingPet.onclick = function(e) {
      e.stopPropagation();
      handleClickWanderingPet();
    };
    document.body.appendChild(PetAI.wanderingPet);
  }
  PetAI.wanderingPet.innerHTML = renderPetSVG(pet.pet_type, 'pet-breathe');

  showNestInRoom();

  var vw = window.innerWidth;
  var vh = window.innerHeight;
  PetAI.targetX = vw * 0.3 + Math.random() * vw * 0.4;
  PetAI.targetY = vh * 0.3 + Math.random() * vh * 0.35;
  PetAI.wanderingPet.style.left = PetAI.targetX + 'px';
  PetAI.wanderingPet.style.top = PetAI.targetY + 'px';
  PetAI.wanderingPet.style.display = 'block';

  startPhysicsLoop();
  scheduleWander();
  scheduleHideAndSeek();
}

function stopPetWandering() {
  PetAI.active = false;
  stopPhysicsLoop();
  clearTimeout(PetAI.wanderTimer);
  clearTimeout(PetAI.hideTimer);
  PetAI.hideSeekActive = false;
  if (PetAI.wanderingPet) {
    PetAI.wanderingPet.style.display = 'none';
    PetAI.wanderingPet.classList.remove('walking', 'hiding', 'hiding-peek');
  }
  restorePetInRoom();
  var ripple = document.getElementById('hintRipple');
  if (ripple) ripple.parentNode.removeChild(ripple);
}

function scheduleWander() {
  if (!PetAI.active) return;
  clearTimeout(PetAI.wanderTimer);
  var delay = PetAI.hideSeekActive ? 8000 : (4000 + Math.random() * 6000);
  PetAI.wanderTimer = setTimeout(function() {
    if (!PetAI.active || PetAI.hideSeekActive) { scheduleWander(); return; }
    doPetWalk();
    scheduleWander();
  }, delay);
}

function doPetWalk() {
  if (!PetAI.wanderingPet) return;
  var wp = PetAI.wanderingPet;
  var vw = window.innerWidth;
  var vh = window.innerHeight;
  var margin = 80;
  PetAI.targetX = margin + Math.random() * (vw - margin * 2);
  PetAI.targetY = 100 + Math.random() * (vh - 200);
  wp.style.left = PetAI.targetX + 'px';
  wp.style.top = PetAI.targetY + 'px';
  wp.classList.add('walking');
  setTimeout(function() { wp.classList.remove('walking'); }, 2500);
}

// ---- Hide and seek ----
function scheduleHideAndSeek() {
  if (!PetAI.active) return;
  clearTimeout(PetAI.hideTimer);

  var cooldown = Date.now() - PetAI.lastHideTime;
  var minDelay = cooldown < 120000 ? 120000 - cooldown : 30000; // 2min cooldown
  var delay = minDelay + Math.random() * 180000; // + up to 3min

  PetAI.hideTimer = setTimeout(function() {
    if (!PetAI.active || PetAI.hideSeekActive) { scheduleHideAndSeek(); return; }
    startHiding();
  }, delay);
}

function startHiding() {
  PetAI.hideSeekActive = true;
  PetAI.lastHideTime = Date.now();
  var wp = PetAI.wanderingPet;
  if (!wp) return;

  // Shake then hide
  wp.classList.add('pet-shake');
  showPetBubble('👀 来抓我呀~');

  setTimeout(function() {
    wp.classList.remove('pet-shake');
    wp.classList.add('hiding');

    // Move to a hiding spot
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    // Pick a corner or edge
    var spots = [
      { x: vw - 120, y: vh - 180, desc: '右下角' },
      { x: 20, y: vh - 180, desc: '左下角' },
      { x: vw - 120, y: 120, desc: '右上角' },
      { x: vw / 2 - 40, y: vh - 160, desc: '底部中间' },
    ];
    var spot = spots[Math.floor(Math.random() * spots.length)];
    wp.style.left = spot.x + 'px';
    wp.style.top = spot.y + 'px';

    // Show peeking after a moment
    setTimeout(function() {
      wp.classList.add('hiding-peek');
      showHintRipple(spot.x + 40, spot.y + 30);
    }, 2000);

    // Auto-reveal after 15-20 seconds
    var revealDelay = 15000 + Math.random() * 5000;
    PetAI.hideTimer = setTimeout(function() {
      revealPet();
    }, revealDelay);
  }, 1500);
}

function showPetBubble(text) {
  if (!PetAI.wanderingPet) return;
  // Remove existing bubble
  var old = PetAI.wanderingPet.querySelector('.pet-bubble');
  if (old) old.parentNode.removeChild(old);

  var bubble = document.createElement('div');
  bubble.className = 'pet-bubble';
  bubble.textContent = text;
  PetAI.wanderingPet.appendChild(bubble);
  setTimeout(function() { if (bubble.parentNode) bubble.parentNode.removeChild(bubble); }, 2000);
}

function showHintRipple(x, y) {
  var old = document.getElementById('hintRipple');
  if (old) old.parentNode.removeChild(old);
  var ripple = document.createElement('div');
  ripple.id = 'hintRipple';
  ripple.className = 'hint-ripple';
  ripple.style.left = (x - 20) + 'px';
  ripple.style.top = (y - 20) + 'px';
  document.body.appendChild(ripple);
}

function revealPet() {
  var wp = PetAI.wanderingPet;
  if (!wp) return;
  wp.classList.remove('hiding', 'hiding-peek');
  PetAI.hideSeekActive = false;

  // Briefly restore pet in room (coming home!), then back to wandering
  wp.style.display = 'none';
  restorePetInRoom();
  showPetBubble('找到我啦！🎉');

  // Remove hint ripple
  var ripple = document.getElementById('hintRipple');
  if (ripple) ripple.parentNode.removeChild(ripple);

  // Reward points
  var childId = AppState.selectedChildId;
  if (childId) {
    try {
      API.adjustPoints({ child_id: childId, amount: 3, reason: '🎯 找到了躲藏的宠物！' });
    } catch (_) {}
  }
  showToast('🎯 找到宠物啦！+3 积分');

  // After a pause, go wander again
  setTimeout(function() {
    if (!PetAI.active) return;
    wp.innerHTML = renderPetSVG(AppState.pet.pet_type, 'pet-breathe');
    wp.style.display = 'block';
    doPetWalk();
    showNestInRoom();
    scheduleHideAndSeek();
    scheduleWander();
  }, 2000);
}

function handleClickWanderingPet() {
  if (PetAI.hideSeekActive) {
    revealPet();
  } else {
    var wp = PetAI.wanderingPet;
    if (!wp) return;
    // Playful bounce + heart particles
    wp.classList.add('pet-bounce');
    var rect = wp.getBoundingClientRect();
    spawnParticles(rect.left + rect.width / 2, rect.top, '❤️', 4);
    showPetBubble('嘻嘻~');
    setTimeout(function() { wp.classList.remove('pet-bounce'); }, 500);

    // Give 1 bonus point
    var childId = AppState.selectedChildId;
    if (childId) {
      try {
        API.adjustPoints({ child_id: childId, amount: 1, reason: '💕 和宠物互动' });
      } catch (_) {}
    }
  }
}

// Cleanup wandering on view switch
var origSwitchView = switchView;
switchView = function(view) {
  origSwitchView(view);
  if (AppState.viewMode === 'parent') {
    stopPetWandering();
  } else if (AppState.pet) {
    startPetWandering();
  }
};

// Handle modal overlay: pause pet when modal is open
var origShowModal = showModal;
showModal = function(opts) {
  if (PetAI.wanderingPet) {
    PetAI.wanderingPet.style.display = 'none';
  }
  return origShowModal(opts).then(function(result) {
    if (PetAI.active && PetAI.wanderingPet) {
      PetAI.wanderingPet.style.display = 'block';
    }
    return result;
  });
};

// ====================== Keyboard Shortcuts ======================

document.addEventListener('keydown', function(e) {
  if (e.key === '1') switchView('child');
  if (e.key === '2') switchView('parent');
});

// ====================== Boot ======================

initApp();
