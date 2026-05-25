window.API = (function() {
  var BASE = '/api';

  function getToken() {
    return localStorage.getItem('fp_token');
  }

  function setToken(t) {
    localStorage.setItem('fp_token', t);
  }

  function clearToken() {
    localStorage.removeItem('fp_token');
  }

  async function request(method, path, body) {
    var headers = { 'Content-Type': 'application/json' };
    var token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;

    var res = await fetch(BASE + path, {
      method: method,
      headers: headers,
      body: body ? JSON.stringify(body) : undefined
    });

    if (res.status === 401) {
      clearToken();
      return null;
    }

    var data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Request failed');
    return data.data;
  }

  return {
    getToken: getToken,
    setToken: setToken,
    clearToken: clearToken,

    // Auth
    register: function(body) { return request('POST', '/auth/register', body); },
    login: function(body) { return request('POST', '/auth/login', body); },
    getMe: function() { return request('GET', '/auth/me'); },

    // Family
    getInviteCode: function() { return request('GET', '/family/invite-code'); },
    getMembers: function() { return request('GET', '/family/members'); },

    // Tasks
    getTasks: function(childId) { return request('GET', '/tasks?childId=' + (childId || '')); },
    createTask: function(body) { return request('POST', '/tasks', body); },
    updateTask: function(id, body) { return request('PUT', '/tasks/' + id, body); },
    deleteTask: function(id) { return request('DELETE', '/tasks/' + id); },
    completeTask: function(taskId, childId) { return request('POST', '/tasks/' + taskId + '/complete', { child_id: childId }); },
    resetAllTasks: function() { return request('POST', '/tasks/reset-all'); },

    // Reviews
    getPendingReviews: function() { return request('GET', '/reviews/pending'); },
    approveReview: function(id) { return request('POST', '/reviews/' + id + '/approve'); },
    rejectReview: function(id) { return request('POST', '/reviews/' + id + '/reject'); },

    // Rewards
    getRewards: function(childId) { return request('GET', '/rewards?childId=' + (childId || '')); },
    createReward: function(body) { return request('POST', '/rewards', body); },
    updateReward: function(id, body) { return request('PUT', '/rewards/' + id, body); },
    deleteReward: function(id) { return request('DELETE', '/rewards/' + id); },
    redeemReward: function(rewardId, childId) { return request('POST', '/rewards/' + rewardId + '/redeem', { child_id: childId }); },

    // Points
    getPoints: function(childId) { return request('GET', '/points/child/' + childId); },
    adjustPoints: function(body) { return request('POST', '/points/adjust', body); },

    // History
    getHistory: function(childId, limit) { return request('GET', '/history?childId=' + (childId || '') + '&limit=' + (limit || 20)); },

    // Children
    getChildren: function() { return request('GET', '/children'); },
    getChildDashboard: function(childId) { return request('GET', '/children/' + childId + '/dashboard'); }
  };
})();
