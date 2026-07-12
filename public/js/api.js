// ============ API Client ============
const API = {
  base: '',
  token: null,
  adminToken: null,

  headers() {
    const h = { 'Content-Type': 'application/json' };
    if (this.token) h['Authorization'] = `Bearer ${this.token}`;
    return h;
  },

  adminHeaders() {
    const h = { 'Content-Type': 'application/json' };
    if (this.adminToken) h['Authorization'] = `Bearer ${this.adminToken}`;
    return h;
  },

  async post(path, body, admin = false) {
    const res = await fetch(this.base + path, {
      method: 'POST',
      headers: admin ? this.adminHeaders() : this.headers(),
      body: JSON.stringify(body)
    });
    return res.json();
  },

  async get(path, admin = false) {
    const res = await fetch(this.base + path, {
      headers: admin ? this.adminHeaders() : this.headers()
    });
    return res.json();
  },

  async put(path, body, admin = false) {
    const res = await fetch(this.base + path, {
      method: 'PUT',
      headers: admin ? this.adminHeaders() : this.headers(),
      body: JSON.stringify(body)
    });
    return res.json();
  },

  async del(path, body = null, admin = false) {
    const options = {
      method: 'DELETE',
      headers: admin ? this.adminHeaders() : this.headers()
    };
    if (body) options.body = JSON.stringify(body);
    const res = await fetch(this.base + path, options);
    return res.json();
  },

  // Auth
  login(username, password) { return this.post('/api/auth/login', { username, password }); },
  register(username, password) { return this.post('/api/auth/register', { username, password }); },
  getProfile() { return this.get('/api/auth/profile'); },
  logout() { return this.post('/api/auth/logout', {}); },

  // Chat
  async sendMessageStream(message, onChunk, onDone) {
    const res = await fetch(this.base + '/api/chat/send', {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ message, stream: true })
    });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const json = JSON.parse(line.slice(6));
            if (json.done) { onDone && onDone(json); }
            else if (json.content) { fullContent += json.content; onChunk && onChunk(json.content, fullContent); }
          } catch (e) { /* skip */ }
        }
      }
    }
    return fullContent;
  },

  saveResponse(content, crisisFlag) { return this.post('/api/chat/save-response', { content, crisis_flag: crisisFlag }); },
  getChatHistory(limit = 50, range = 'today') { return this.get('/api/chat/history?limit=' + limit + '&range=' + encodeURIComponent(range)); },

  // Mood
  checkin(mood, note) { return this.post('/api/mood/checkin', { mood, note }); },
  createMoodEvent(mood, note) { return this.post('/api/mood/events', { mood, note }); },
  getTodayMood() { return this.get('/api/mood/today'); },
  getMoodHistory() { return this.get('/api/mood/history'); },
  getTodayMoodEvents() { return this.get('/api/mood/events/today'); },

  // Moments
  getMoments() { return this.get('/api/moments'); },
  likeMoment(id) { return this.post('/api/moments/' + id + '/like'); },
  generateMoment() { return this.post('/api/moments/generate'); },

  // Diaries
  getDiaries() { return this.get('/api/diaries'); },
  generateDiary() { return this.post('/api/diaries/generate'); },

  // User
  updateSettings(settings) { return this.put('/api/user/settings', settings); },
  exportUserData() { return this.get('/api/user/export'); },
  deleteAccount(password) { return this.del('/api/user/account', { password, confirm: 'DELETE' }); },

  // Admin
  adminLogin(username, password) { return this.post('/api/admin/login', { username, password }, true); },
  adminLogout() { return this.post('/api/admin/logout', {}, true); },
  adminDashboard() { return this.get('/api/admin/dashboard', true); },
  adminUsers() { return this.get('/api/admin/users', true); },
  adminUserDetail(id) { return this.get('/api/admin/users/' + id, true); },
  adminCrisisAlerts() { return this.get('/api/admin/crisis-alerts', true); },
  updateCrisisAlert(id, data) { return this.put('/api/admin/crisis-alerts/' + id, data, true); },
  adminMoodStats() { return this.get('/api/admin/mood-stats', true); },
  adminConfig() { return this.get('/api/admin/config', true); },
  updateConfig(key, value) { return this.put('/api/admin/config', { key, value }, true); },
  adminKeywords() { return this.get('/api/admin/keywords', true); },
  addKeyword(keyword) { return this.post('/api/admin/keywords', { keyword }, true); },
  deleteKeyword(id) { return this.del('/api/admin/keywords/' + id, null, true); }
};
