// ============ Moments / Diary / Album Module ============
function initMoments() {
  document.getElementById('btn-generate-moment').addEventListener('click', generateMoment);
  document.getElementById('btn-generate-diary').addEventListener('click', generateDiary);
}

// ============ Moments ============
async function loadMoments() {
  const container = document.getElementById('moments-list');
  try {
    const data = await API.getMoments();
    if (data.moments && data.moments.length > 0) {
      container.innerHTML = data.moments.map(m => `
        <div class="moment-card">
          <div class="moment-header">
            <div class="moment-avatar">${iconHtml('star')}</div>
            <div>
              <div class="moment-name">栖灵</div>
              <div class="moment-time">${formatTime(m.created_at)}</div>
            </div>
          </div>
          <div class="moment-body">${escapeHtml(m.content)}</div>
          ${m.mood_tag ? `<span class="moment-mood">#${m.mood_tag}</span>` : ''}
          <div class="moment-actions">
            <button class="btn-like ${m.liked_by_me ? 'liked' : ''}" onclick="toggleLike(${m.id}, this)">
              <span class="like-heart">${m.liked_by_me ? '❤️' : '♡'}</span>
            </button>
          </div>
        </div>
      `).join('');
    } else {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${iconHtml('moments')}</div><div class="empty-state-text">还没有动态，点击上方按钮生成第一条吧~</div></div>`;
    }
  } catch (e) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-text">加载失败</div></div>';
  }
}

async function toggleLike(momentId, btn) {
  const data = await API.likeMoment(momentId);
  if (data.ok) {
    btn.classList.toggle('liked', !data.unliked);
    const heartSpan = btn.querySelector('.like-heart');
    heartSpan.textContent = data.unliked ? '♡' : '❤️';
    if (!data.unliked) refreshUserProfile();
  }
}

async function generateMoment() {
  showToast('栖灵正在想... ✨');
  const data = await API.generateMoment();
  if (data.ok) {
    showToast('动态发布成功！');
    loadMoments();
    refreshUserProfile();
  } else {
    showToast(data.message || '生成失败，稍后再试', 'warning');
  }
}

// ============ Diaries ============
async function loadDiaries() {
  const container = document.getElementById('diary-list');
  try {
    const data = await API.getDiaries();
    if (data.diaries && data.diaries.length > 0) {
      container.innerHTML = data.diaries.map(d => `
        <div class="diary-card" onclick="viewDiary(${d.id})">
          <div class="diary-card-header">
            <div class="diary-card-title">${escapeHtml(d.title)}</div>
            <div class="diary-card-date">${d.diary_date}</div>
          </div>
          <div class="diary-card-preview">${escapeHtml(d.content.substring(0, 120))}...</div>
          ${d.mood_tags ? `<div class="diary-tags">${d.mood_tags.split(',').map(t => `<span class="diary-tag">#${t}</span>`).join('')}</div>` : ''}
        </div>
      `).join('');
    } else {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${iconHtml('diary')}</div><div class="empty-state-text">还没有日记，点击上方按钮生成今日日记吧~</div></div>`;
    }
  } catch (e) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-text">加载失败</div></div>';
  }
}

async function viewDiary(id) {
  const data = await API.get('/api/diaries/' + id);
  if (!data.diary) return;

  const closeDiaryOverlay = () => {
    overlay.classList.remove('is-entered');
    window.setTimeout(() => {
      if (!overlay.classList.contains('is-entered')) {
        overlay.remove();
      }
    }, 260);
  };

  const overlay = document.createElement('div');
  overlay.className = 'diary-detail-overlay';
  overlay.style.display = 'flex';
  overlay.innerHTML = `
    <div class="diary-detail" style="position:relative;">
      <h2>${escapeHtml(data.diary.title)}</h2>
      <div class="diary-detail-date">${data.diary.diary_date} · ${escapeHtml(data.diary.mood_tags || '')}</div>
      <div class="diary-detail-content">${escapeHtml(data.diary.content)}</div>
      <button class="diary-detail-close" type="button" aria-label="关闭日记详情">✕</button>
    </div>
  `;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeDiaryOverlay();
  });
  document.body.appendChild(overlay);
  overlay.querySelector('.diary-detail-close')?.addEventListener('click', closeDiaryOverlay);
  requestAnimationFrame(() => overlay.classList.add('is-entered'));
}

async function generateDiary() {
  showToast('栖灵正在写日记... 📝');
  const data = await API.generateDiary();
  if (data.ok) {
    showToast('日记生成成功！');
    loadDiaries();
    refreshUserProfile();
    switchPanel('diary');
  } else {
    showToast(data.message || '今天还没有对话记录哦~', 'warning');
  }
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  return d.toLocaleDateString('zh-CN');
}
