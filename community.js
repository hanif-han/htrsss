/* ══════════════════════════════════════════════════════════════
   HTRS COMMUNITY SYSTEM — community.js
   Profile · XP/Level · Badges · Online Presence
   Notifications · Activity Log
   ══════════════════════════════════════════════════════════════
   Depends on: firebase (app, auth, firestore, storage) from script.js
   Load AFTER script.js in HTML.
   ══════════════════════════════════════════════════════════════ */

/* ── GUARDS ── */
if (window._communityLoaded) {
  console.warn('[HTRS Community] Already loaded, skipping.');
} else {
  window._communityLoaded = true;
  initCommunitySystem();
}

function initCommunitySystem() {

/* ────────────────────────────────────────────────────
   CONSTANTS
──────────────────────────────────────────────────── */
const XP_PER_CHAT     = 5;
const XP_PER_LOGIN    = 20;
const XP_PER_EVENT    = 50;
const ONLINE_TIMEOUT  = 3 * 60 * 1000;   // 3 min → still "Online"
const RECENT_TIMEOUT  = 15 * 60 * 1000;  // 15 min → "Recently Active"
const PRESENCE_PING   = 60 * 1000;       // update lastSeen every 1 min

const BADGE_DEFS = [
  { id: 'founder',  label: '🏆 Founder',     cls: 'badge-founder',  desc: 'Anggota pendiri HTRS' },
  { id: 'leader',   label: '👑 Leader',      cls: 'badge-leader',   desc: 'Pemimpin squad' },
  { id: 'veteran',  label: '🎖 Veteran',     cls: 'badge-veteran',  desc: 'Member setia 30+ hari' },
  { id: 'elite',    label: '⚡ Elite Squad', cls: 'badge-elite',    desc: 'Level 10+' },
  { id: 'active',   label: '🟢 Active',      cls: 'badge-active',   desc: 'Aktif di community' },
  { id: 'event',    label: '🎮 Event Hunter',cls: 'badge-event',    desc: 'Aktif ikut event' },
];

const LEVEL_THRESHOLDS = [0,100,250,500,900,1400,2100,3000,4200,5800,8000];
// Level 1 = 0 XP, Level 2 = 100 XP, ..., Level 11 = 8000 XP

/* ────────────────────────────────────────────────────
   STATE
──────────────────────────────────────────────────── */
let _currentUser    = null;   // Firebase Auth user
let _currentProfile = null;   // Firestore profile data
let _presenceTimer  = null;
let _onlineUnsub    = null;
let _notifUnsub     = null;
let _onlineListUnsub = null;

/* ────────────────────────────────────────────────────
   HELPERS
──────────────────────────────────────────────────── */
function esc(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(String(str || '')));
  return d.innerHTML;
}

function timeAgo(ts) {
  if (!ts) return 'Baru saja';
  const ms   = Date.now() - (ts.toDate ? ts.toDate().getTime() : ts);
  const secs = Math.floor(ms / 1000);
  if (secs < 60)   return 'Baru saja';
  if (secs < 3600) return `${Math.floor(secs/60)}m lalu`;
  if (secs < 86400)return `${Math.floor(secs/3600)}j lalu`;
  return `${Math.floor(secs/86400)}h lalu`;
}

function getLevelFromXP(xp) {
  let lv = 1;
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i]) { lv = i + 1; break; }
  }
  return lv;
}

function getXPProgress(xp) {
  const lv      = getLevelFromXP(xp);
  const curBase = LEVEL_THRESHOLDS[lv - 1] || 0;
  const nxtBase = LEVEL_THRESHOLDS[lv]     || LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
  const pct     = nxtBase === curBase ? 100 : Math.min(100, Math.round((xp - curBase) / (nxtBase - curBase) * 100));
  return { lv, pct, cur: xp - curBase, need: nxtBase - curBase };
}

function getStatusClass(lastSeen) {
  if (!lastSeen) return 'offline';
  const ms = Date.now() - (lastSeen.toDate ? lastSeen.toDate().getTime() : lastSeen);
  if (ms < ONLINE_TIMEOUT)  return 'online';
  if (ms < RECENT_TIMEOUT)  return 'recent';
  return 'offline';
}

function getStatusLabel(lastSeen) {
  const s = getStatusClass(lastSeen);
  if (s === 'online')  return 'Online';
  if (s === 'recent')  return 'Aktif baru-baru ini';
  if (!lastSeen)       return 'Offline';
  return timeAgo(lastSeen);
}

/* ────────────────────────────────────────────────────
   XP SYSTEM
──────────────────────────────────────────────────── */
async function awardXP(uid, amount, reason) {
  if (!uid || !amount) return;
  try {
    const ref  = db.collection('users').doc(uid);
    const snap = await ref.get();
    if (!snap.exists) return;

    const data    = snap.data();
    const oldXP   = data.xp || 0;
    const newXP   = oldXP + amount;
    const oldLevel= getLevelFromXP(oldXP);
    const newLevel= getLevelFromXP(newXP);

    await ref.update({ xp: newXP });

    // Show floating XP gain if it's the current user
    if (_currentUser && uid === _currentUser.uid) {
      showXPGainFloat(amount);
      _currentProfile = { ..._currentProfile, xp: newXP };

      // Level up?
      if (newLevel > oldLevel) {
        setTimeout(() => showLevelUpAnimation(newLevel), 600);
        addNotification(uid, {
          icon: '⬆️',
          title: 'Level Up!',
          text: `Selamat! Kamu naik ke Level ${newLevel}!`,
          type: 'levelup'
        });
        // Auto-badge: Elite at level 10
        if (newLevel >= 10) grantBadge(uid, 'elite');
      }

      // Log activity
      logActivity(uid, data.name || 'User', 'xp', `Mendapat +${amount} XP (${reason})`);
    }
  } catch (e) {
    console.warn('[XP] award failed:', e);
  }
}

function showXPGainFloat(amount) {
  const el = document.createElement('div');
  el.className = 'xp-gain-float';
  el.textContent = `+${amount} XP`;
  el.style.cssText = `left:${Math.random()*60+20}%;top:${Math.random()*30+30}%;`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2000);
}

function showLevelUpAnimation(level) {
  const overlay = document.createElement('div');
  overlay.className = 'levelup-overlay';
  overlay.innerHTML = `
    <div class="levelup-box">
      <div class="levelup-label">⬆ Level Up!</div>
      <div class="levelup-number">${level}</div>
      <div class="levelup-sub">// RANK UPGRADE · HTRS SYSTEM //</div>
    </div>`;
  document.body.appendChild(overlay);
  setTimeout(() => overlay.remove(), 3200);
}

/* ────────────────────────────────────────────────────
   BADGE SYSTEM
──────────────────────────────────────────────────── */
async function grantBadge(uid, badgeId) {
  try {
    const ref  = db.collection('users').doc(uid);
    const snap = await ref.get();
    if (!snap.exists) return;
    const badges = snap.data().badges || [];
    if (badges.includes(badgeId)) return; // already has it
    await ref.update({ badges: [...badges, badgeId] });

    if (_currentUser && uid === _currentUser.uid) {
      const def = BADGE_DEFS.find(b => b.id === badgeId);
      if (def) {
        addNotification(uid, {
          icon: '🏅',
          title: 'Badge Unlocked!',
          text: `Kamu mendapatkan badge ${def.label}!`,
          type: 'badge'
        });
        showToastNotif('🏅', 'Badge Unlocked!', `${def.label} telah diraih!`);
      }
    }
  } catch (e) {
    console.warn('[Badge] grant failed:', e);
  }
}

function renderBadges(badges) {
  if (!badges || !badges.length) return '<span style="color:#444;font-size:0.75rem;font-family:\'Share Tech Mono\',monospace;">Belum ada badge</span>';
  return badges.map(id => {
    const def = BADGE_DEFS.find(b => b.id === id);
    if (!def) return '';
    return `<span class="htrs-badge ${def.cls}" title="${esc(def.desc)}">${esc(def.label)}</span>`;
  }).join('');
}

/* ────────────────────────────────────────────────────
   ONLINE PRESENCE
──────────────────────────────────────────────────── */
function startPresence(uid) {
  if (!uid) return;

  const updatePresence = () => {
    db.collection('users').doc(uid).update({
      lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
      isOnline: true
    }).catch(() => {});
  };

  updatePresence();
  _presenceTimer = setInterval(updatePresence, PRESENCE_PING);

  // Mark offline on tab close / visibility hidden
  const markOffline = () => {
    navigator.sendBeacon && db.collection('users').doc(uid).update({
      isOnline: false,
      lastSeen: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(() => {});
  };

  window.addEventListener('beforeunload', markOffline);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) markOffline();
    else updatePresence();
  });
}

function stopPresence() {
  if (_presenceTimer) { clearInterval(_presenceTimer); _presenceTimer = null; }
}

/* ────────────────────────────────────────────────────
   ONLINE LIST PANEL
──────────────────────────────────────────────────── */
function buildOnlinePanel() {
  if (document.getElementById('htrs-online-panel')) return;

  const panel = document.createElement('div');
  panel.id        = 'htrs-online-panel';
  panel.className = 'online-panel';
  panel.innerHTML = `
    <div class="online-panel-header" onclick="toggleOnlinePanel()">
      <div class="online-panel-title">
        <span class="online-pulse"></span>
        ONLINE
      </div>
      <span class="online-panel-count" id="online-count-badge">0</span>
    </div>
    <div class="online-panel-body" id="online-panel-body">
      <div class="online-member-item" style="color:#555;font-family:'Share Tech Mono',monospace;font-size:0.7rem;padding:20px;letter-spacing:2px;">LOADING...</div>
    </div>`;
  document.body.appendChild(panel);
}

window.toggleOnlinePanel = function() {
  const body = document.getElementById('online-panel-body');
  if (!body) return;
  body.style.display = body.style.display === 'none' ? 'block' : 'none';
};

function startOnlineListener() {
  if (_onlineListUnsub) return;
  buildOnlinePanel();

  // Listen to all users, sorted by lastSeen desc
  _onlineListUnsub = db.collection('users').onSnapshot(snap => {
    const body    = document.getElementById('online-panel-body');
    const badge   = document.getElementById('online-count-badge');
    if (!body) return;

    const members = [];
    snap.forEach(doc => {
      const d = { id: doc.id, ...doc.data() };
      members.push(d);
    });

    // Sort: online first, then recent, then offline
    const priority = { online: 0, recent: 1, offline: 2 };
    members.sort((a, b) => {
      const sa = getStatusClass(a.lastSeen);
      const sb = getStatusClass(b.lastSeen);
      if (priority[sa] !== priority[sb]) return priority[sa] - priority[sb];
      const ta = a.lastSeen?.toDate?.()?.getTime() || 0;
      const tb = b.lastSeen?.toDate?.()?.getTime() || 0;
      return tb - ta;
    });

    const onlineCount = members.filter(m => getStatusClass(m.lastSeen) === 'online').length;
    if (badge) badge.textContent = onlineCount;

    if (members.length === 0) {
      body.innerHTML = `<div class="online-member-item" style="color:#555;font-family:'Share Tech Mono',monospace;font-size:0.7rem;padding:20px;letter-spacing:2px;">NO MEMBERS</div>`;
      return;
    }

    body.innerHTML = members.map(m => {
      const statusCls   = getStatusClass(m.lastSeen);
      const statusLabel = getStatusLabel(m.lastSeen);
      const initial     = (m.name || '?').charAt(0).toUpperCase();
      const isOnline    = statusCls === 'online';
      const avatarInner = m.photoURL
        ? `<img src="${esc(m.photoURL)}" alt="${esc(initial)}" />`
        : esc(initial);

      return `
        <div class="online-member-item" onclick="openProfileModal('${m.id}')" style="cursor:pointer;">
          <div class="online-member-avatar">
            ${avatarInner}
            <span class="online-status-dot status-${statusCls}"></span>
          </div>
          <div style="flex:1;min-width:0;">
            <div class="online-member-name ${isOnline ? 'is-online' : ''}">${esc(m.name || 'Unknown')}</div>
            <div class="online-member-status ${isOnline ? 'is-online' : ''}">${esc(statusLabel)}</div>
          </div>
        </div>`;
    }).join('');
  }, err => console.warn('[OnlineList]', err));
}

/* ────────────────────────────────────────────────────
   NOTIFICATION SYSTEM
──────────────────────────────────────────────────── */
function buildNotifUI() {
  if (document.getElementById('htrs-notif-bell')) return;

  // Bell button
  const bell = document.createElement('div');
  bell.id        = 'htrs-notif-bell';
  bell.className = 'notif-bell-btn';
  bell.title     = 'Notifikasi';
  bell.innerHTML = `🔔<span class="notif-badge" id="notif-count" style="display:none;">0</span>`;
  bell.onclick   = toggleNotifPanel;
  document.body.appendChild(bell);

  // Panel
  const panel = document.createElement('div');
  panel.id        = 'htrs-notif-panel';
  panel.className = 'notif-panel';
  panel.innerHTML = `
    <div class="notif-panel-header">
      <span class="notif-panel-title"> NOTIFICATIONS</span>
      <button class="notif-clear-btn" onclick="clearAllNotifs()">CLEAR ALL</button>
    </div>
    <div class="notif-list" id="notif-list">
      <div class="notif-empty">NO NOTIFICATIONS</div>
    </div>`;
  document.body.appendChild(panel);

  // Close on outside click
  document.addEventListener('click', e => {
    if (!bell.contains(e.target) && !panel.contains(e.target)) {
      panel.classList.remove('open');
    }
  });
}

window.toggleNotifPanel = function() {
  const panel = document.getElementById('htrs-notif-panel');
  if (!panel) return;
  panel.classList.toggle('open');
  if (panel.classList.contains('open')) markNotifRead();
};

window.clearAllNotifs = function() {
  if (!_currentUser) return;
  db.collection('users').doc(_currentUser.uid)
    .collection('notifications')
    .get().then(snap => {
      const batch = db.batch();
      snap.forEach(d => batch.delete(d.ref));
      return batch.commit();
    }).catch(() => {});
};

function markNotifRead() {
  if (!_currentUser) return;
  db.collection('users').doc(_currentUser.uid)
    .collection('notifications')
    .where('read', '==', false)
    .get().then(snap => {
      const batch = db.batch();
      snap.forEach(d => batch.update(d.ref, { read: true }));
      return batch.commit();
    }).catch(() => {});
}

async function addNotification(uid, { icon, title, text, type }) {
  if (!uid) return;
  try {
    await db.collection('users').doc(uid)
      .collection('notifications')
      .add({
        icon, title, text, type,
        read: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
  } catch (e) {
    console.warn('[Notif] add failed:', e);
  }
}

function startNotifListener(uid) {
  if (_notifUnsub || !uid) return;
  buildNotifUI();

  _notifUnsub = db.collection('users').doc(uid)
    .collection('notifications')
    .orderBy('createdAt', 'desc')
    .limit(30)
    .onSnapshot(snap => {
      const list     = document.getElementById('notif-list');
      const countEl  = document.getElementById('notif-count');
      const bellEl   = document.getElementById('htrs-notif-bell');
      if (!list) return;

      const unread = snap.docs.filter(d => !d.data().read).length;

      if (countEl) {
        countEl.textContent    = unread > 9 ? '9+' : unread;
        countEl.style.display  = unread > 0 ? 'flex' : 'none';
      }
      if (bellEl && unread > 0) {
        bellEl.classList.add('has-notif');
        setTimeout(() => bellEl.classList.remove('has-notif'), 600);
      }

      if (snap.empty) {
        list.innerHTML = `<div class="notif-empty">// NO NOTIFICATIONS</div>`;
        return;
      }

      list.innerHTML = snap.docs.map(doc => {
        const d  = doc.data();
        const ts = d.createdAt ? timeAgo(d.createdAt) : '';
        return `
          <div class="notif-item ${d.read ? '' : 'unread'}">
            <div class="notif-icon">${esc(d.icon || '🔔')}</div>
            <div class="notif-content">
              <div class="notif-text"><strong>${esc(d.title)}</strong> — ${esc(d.text)}</div>
              <div class="notif-time">${esc(ts)}</div>
            </div>
          </div>`;
      }).join('');
    }, err => console.warn('[Notif listener]', err));
}

function showToastNotif(icon, title, msg) {
  // Remove existing toast
  const old = document.getElementById('htrs-notif-toast');
  if (old) old.remove();

  const toast = document.createElement('div');
  toast.id        = 'htrs-notif-toast';
  toast.className = 'notif-toast';
  toast.innerHTML = `
    <div class="notif-toast-icon">${icon}</div>
    <div class="notif-toast-body">
      <div class="notif-toast-title">${esc(title)}</div>
      <div class="notif-toast-msg">${esc(msg)}</div>
    </div>
    <div class="notif-toast-progress"></div>`;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('leaving');
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

/* ────────────────────────────────────────────────────
   ACTIVITY LOG
──────────────────────────────────────────────────── */
async function logActivity(uid, userName, type, desc) {
  try {
    await db.collection('activityLog').add({
      uid, userName, type, desc,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) { /* silent */ }
}

/* ────────────────────────────────────────────────────
   PROFILE MODAL
──────────────────────────────────────────────────── */
function buildProfileModal() {
  if (document.getElementById('profile-modal')) return;
  const modal = document.createElement('div');
  modal.id        = 'profile-modal';
  modal.className = '';
  modal.innerHTML = `
    <div class="profile-modal-box" id="profile-modal-box">
      <button class="profile-modal-close" onclick="closeProfileModal()">✕</button>
      <div id="profile-modal-content">
        <div style="padding:40px;text-align:center;font-family:'Share Tech Mono',monospace;font-size:0.8rem;letter-spacing:2px;color:#555;">LOADING...</div>
      </div>
    </div>`;
  modal.addEventListener('click', e => { if (e.target === modal) closeProfileModal(); });
  document.body.appendChild(modal);
}

window.openProfileModal = async function(uid) {
  buildProfileModal();
  const modal   = document.getElementById('profile-modal');
  const content = document.getElementById('profile-modal-content');
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';

  content.innerHTML = `<div style="padding:40px;text-align:center;font-family:'Share Tech Mono',monospace;font-size:0.8rem;letter-spacing:2px;color:#555;">LOADING PROFILE...</div>`;

  try {
    const snap = await db.collection('users').doc(uid).get();
    if (!snap.exists) { content.innerHTML = `<div style="padding:40px;text-align:center;color:#ff6b88;">Profile tidak ditemukan.</div>`; return; }

    const d        = snap.data();
    const isSelf   = _currentUser && uid === _currentUser.uid;
    const xpData   = getXPProgress(d.xp || 0);
    const status   = getStatusClass(d.lastSeen);
    const dotCls   = status === 'online' ? '' : (status === 'recent' ? 'recent' : 'offline');
    const statusLbl= getStatusLabel(d.lastSeen);
    const initial  = (d.name || '?').charAt(0).toUpperCase();

    const avatarInner = d.photoURL
      ? `<img src="${esc(d.photoURL)}" alt="${esc(initial)}" />`
      : esc(initial);

    content.innerHTML = `
      <!-- Cover -->
      <div class="profile-cover">
        <div class="profile-cover-scan"></div>
        <div class="profile-avatar-wrap">
          <div class="profile-avatar-img" id="pm-avatar" ${isSelf ? 'onclick="triggerAvatarUpload()"' : ''} title="${isSelf ? 'Klik untuk ganti foto' : ''}">
            ${avatarInner}
            ${isSelf ? '<div class="avatar-upload-overlay">UPLOAD</div>' : ''}
          </div>
          <span class="online-dot-profile ${dotCls}" title="${esc(statusLbl)}"></span>
        </div>
      </div>

      ${isSelf ? '<input type="file" id="avatar-file-input" accept="image/*" style="display:none;" onchange="handleAvatarUpload(this)" />' : ''}

      <!-- Body -->
      <div class="profile-body">
        <div class="profile-name-row">
          <div>
            <div class="profile-display-name">${esc(d.name || 'Unknown')}</div>
            <div class="profile-username">@${esc((d.name || 'user').toLowerCase().replace(/\s+/g,'_'))}</div>
          </div>
          <div class="status-indicator ${status}">
            <span class="dot"></span>
            <span>${esc(statusLbl)}</span>
          </div>
        </div>

        <div class="profile-badges-row" id="pm-badges-row">
          ${renderBadges(d.badges)}
        </div>

        <div class="profile-bio" id="pm-bio">${esc(d.bio || '[ No bio yet — tambahkan deskripsi singkat tentang dirimu ]')}</div>

        <!-- XP Bar -->
        <div class="profile-xp-section">
          <div class="xp-label-row">
            <span class="xp-level-badge">LVL ${xpData.lv}</span>
            <span class="xp-points-text">${d.xp || 0} XP · ${xpData.cur}/${xpData.need} to next</span>
          </div>
          <div class="xp-bar-outer">
            <div class="xp-bar-inner" id="pm-xp-bar" style="width:0%"></div>
          </div>
        </div>

        <!-- Stats -->
        <div class="profile-stats-row">
          <div class="profile-stat-card">
            <div class="profile-stat-num">${d.xp || 0}</div>
            <div class="profile-stat-label">XP Total</div>
          </div>
          <div class="profile-stat-card">
            <div class="profile-stat-num">${xpData.lv}</div>
            <div class="profile-stat-label">Level</div>
          </div>
          <div class="profile-stat-card">
            <div class="profile-stat-num">${(d.badges || []).length}</div>
            <div class="profile-stat-label">Badges</div>
          </div>
        </div>

        <!-- Edit Form (own profile only) -->
        ${isSelf ? `
        <div class="profile-edit-section">
          <div class="profile-edit-title">EDIT PROFILE</div>
          <div class="alert" id="profile-save-alert" style="margin-bottom:12px;"></div>
          <div class="profile-edit-grid">
            <div class="form-group">
              <label class="form-label">Display Name</label>
              <input class="form-input" id="pe-name" type="text" value="${esc(d.name || '')}" maxlength="32" />
            </div>
            <div class="form-group">
              <label class="form-label">Squad Role</label>
              <input class="form-input" id="pe-jabatan" type="text" value="${esc(d.jabatan && d.jabatan !== '-' ? d.jabatan : '')}" maxlength="30" placeholder="e.g. Engineer, Scout..." />
            </div>
            <div class="form-group full">
              <label class="form-label">Bio / About Me</label>
              <textarea class="form-input" id="pe-bio" maxlength="150" rows="3"
                style="resize:none;font-family:'Rajdhani',sans-serif;"
                oninput="updateBioCounter(this)"
                placeholder="Ceritakan sedikit tentang dirimu...">${esc(d.bio || '')}</textarea>
              <div class="char-counter" id="bio-counter">${150 - (d.bio || '').length} karakter tersisa</div>
            </div>
          </div>
          <button class="btn btn-primary" onclick="saveProfile('${uid}')" style="width:100%;justify-content:center;margin-top:4px;">
            💾 SAVE PROFILE
          </button>
        </div>` : ''}
      </div>`;

    // Animate XP bar after render
    requestAnimationFrame(() => {
      setTimeout(() => {
        const bar = document.getElementById('pm-xp-bar');
        if (bar) bar.style.width = xpData.pct + '%';
      }, 100);
    });

  } catch (e) {
    console.error('[Profile Modal]', e);
    content.innerHTML = `<div style="padding:40px;text-align:center;color:#ff6b88;">Gagal memuat profile.</div>`;
  }
};

window.closeProfileModal = function() {
  const modal = document.getElementById('profile-modal');
  if (modal) modal.classList.remove('open');
  document.body.style.overflow = '';
};

window.updateBioCounter = function(el) {
  const counter = document.getElementById('bio-counter');
  if (!counter) return;
  const left = 150 - el.value.length;
  counter.textContent = `${left} karakter tersisa`;
  counter.className   = `char-counter ${left < 20 ? 'warn' : ''}`;
};

window.saveProfile = async function(uid) {
  if (!_currentUser || _currentUser.uid !== uid) return;
  const alertEl = document.getElementById('profile-save-alert');
  const btn     = document.querySelector('#profile-modal-box .btn-primary');

  const name    = (document.getElementById('pe-name')?.value || '').trim();
  const jabatan = (document.getElementById('pe-jabatan')?.value || '').trim() || '-';
  const bio     = (document.getElementById('pe-bio')?.value || '').trim().slice(0, 150);

  if (!name) {
    if (alertEl) { alertEl.textContent = 'Nama tidak boleh kosong.'; alertEl.className = 'alert alert-error show'; }
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'SAVING...'; }

  try {
    await db.collection('users').doc(uid).update({ name, jabatan, bio });
    _currentProfile = { ..._currentProfile, name, jabatan, bio };

    if (alertEl) { alertEl.textContent = 'Profile berhasil disimpan!'; alertEl.className = 'alert alert-success show'; }
    // Update navbar avatar text
    updateNavbarProfile(_currentProfile);
    // Log
    logActivity(uid, name, 'profile', 'Memperbarui profile');
    // Badge: Active member after first bio
    if (bio) grantBadge(uid, 'active');

    setTimeout(() => { if (alertEl) alertEl.className = 'alert'; }, 3000);
  } catch (e) {
    if (alertEl) { alertEl.textContent = 'Gagal menyimpan: ' + e.message; alertEl.className = 'alert alert-error show'; }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 SAVE PROFILE'; }
  }
};

/* ────────────────────────────────────────────────────
   AVATAR UPLOAD
──────────────────────────────────────────────────── */
window.triggerAvatarUpload = function() {
  const inp = document.getElementById('avatar-file-input');
  if (inp) inp.click();
};

window.handleAvatarUpload = async function(input) {
  if (!input.files || !input.files[0] || !_currentUser) return;
  const file = input.files[0];

  // Validate
  if (!file.type.startsWith('image/')) { showToastNotif('❌', 'Error', 'File harus berupa gambar.'); return; }
  if (file.size > 3 * 1024 * 1024)    { showToastNotif('❌', 'Error', 'Ukuran maksimal 3MB.'); return; }

  showToastNotif('⏳', 'Uploading...', 'Sedang mengupload foto profil...');

  try {
    const storage = firebase.storage();
    const ref     = storage.ref(`avatars/${_currentUser.uid}`);

    // Compress: draw to canvas
    const compressed = await compressImage(file, 300, 300, 0.7);
    await ref.put(compressed);
    const url = await ref.getDownloadURL();

    await db.collection('users').doc(_currentUser.uid).update({ photoURL: url });
    _currentProfile = { ..._currentProfile, photoURL: url };

    // Update avatar in modal
    const avatarEl = document.getElementById('pm-avatar');
    if (avatarEl) {
      avatarEl.innerHTML = `<img src="${esc(url)}" alt="avatar" /><div class="avatar-upload-overlay">UPLOAD</div>`;
    }
    updateNavbarProfile(_currentProfile);
    showToastNotif('✅', 'Berhasil!', 'Foto profil berhasil diperbarui.');
    logActivity(_currentUser.uid, _currentProfile?.name || 'User', 'profile', 'Mengganti foto profil');

  } catch (e) {
    console.error('[Avatar Upload]', e);
    showToastNotif('❌', 'Upload Gagal', e.message || 'Terjadi kesalahan.');
  }
};

function compressImage(file, maxW, maxH, quality) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.width, h = img.height;
      if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
      if (h > maxH) { w = Math.round(w * maxH / h); h = maxH; }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob(resolve, 'image/jpeg', quality);
    };
    img.src = URL.createObjectURL(file);
  });
}

/* ────────────────────────────────────────────────────
   NAVBAR PROFILE BUTTON
──────────────────────────────────────────────────── */
function buildNavbarProfile(profile) {
  const actions = document.getElementById('nav-actions');
  if (!actions) return;

  const initial = (profile?.name || 'U').charAt(0).toUpperCase();
  const avatar  = profile?.photoURL
    ? `<img src="${esc(profile.photoURL)}" alt="${esc(initial)}" />`
    : esc(initial);

  // Replace existing nav-actions content while keeping logout btn
  const isSuperAdmin = profile?.role === 'superadmin';

  actions.innerHTML = `
    <button class="nav-profile-btn" onclick="openProfileModal('${_currentUser?.uid}')">
      <div class="nav-profile-avatar">${avatar}</div>
      <span>${esc(profile?.name || 'User')}</span>
    </button>
    ${isSuperAdmin ? `<a href="admin.html" class="btn btn-cyan btn-sm">⚡ Admin</a>` : ''}
    <button onclick="doLogout()" class="btn btn-danger btn-sm">↩ Logout</button>
  `;
}

function updateNavbarProfile(profile) {
  if (!_currentUser) return;
  buildNavbarProfile(profile);
}

/* ────────────────────────────────────────────────────
   DAILY LOGIN XP
──────────────────────────────────────────────────── */
async function checkDailyLogin(uid, userName) {
  try {
    const ref  = db.collection('users').doc(uid);
    const snap = await ref.get();
    if (!snap.exists) return;

    const d          = snap.data();
    const lastLogin  = d.lastLoginDate;
    const today      = new Date().toDateString();

    if (lastLogin === today) return; // Already claimed today

    await ref.update({ lastLoginDate: today });
    await awardXP(uid, XP_PER_LOGIN, 'Daily Login');
    showToastNotif('📅', 'Daily Login!', `+${XP_PER_LOGIN} XP untuk login hari ini!`);
    addNotification(uid, {
      icon: '📅',
      title: 'Daily Login Reward',
      text: `Kamu mendapat +${XP_PER_LOGIN} XP untuk login hari ini!`,
      type: 'xp'
    });
  } catch (e) {
    console.warn('[Daily Login]', e);
  }
}

/* ────────────────────────────────────────────────────
   CHAT XP HOOK
   Call this from sendMessage() after success
──────────────────────────────────────────────────── */
let _lastChatXP = 0;
window.onChatMessageSent = function() {
  if (!_currentUser) return;
  const now = Date.now();
  // Rate limit: 1 XP reward per 60 seconds of chatting
  if (now - _lastChatXP < 60000) return;
  _lastChatXP = now;
  awardXP(_currentUser.uid, XP_PER_CHAT, 'Chat Active');
};

/* ────────────────────────────────────────────────────
   ADMIN: ACTIVITY MONITOR
──────────────────────────────────────────────────── */
window.initActivityMonitor = function() {
  buildActivityLogPanel();
  buildLeaderboardPanel();
  loadActivityLog();
  loadLeaderboard('alltime');
};

function buildActivityLogPanel() {
  const target = document.getElementById('admin-community-section');
  if (!target || document.getElementById('activity-log-wrap')) return;

  target.innerHTML += `
    <div class="activity-log-wrap" id="activity-log-wrap">
      <div class="activity-log-header">
        <div class="activity-log-title">📜 Activity Log</div>
        <span style="font-family:'Share Tech Mono',monospace;font-size:0.65rem;color:#555;letter-spacing:2px;" id="log-count">—</span>
      </div>
      <div class="activity-log-list" id="activity-log-list">
        <div style="padding:24px;text-align:center;font-family:'Share Tech Mono',monospace;font-size:0.75rem;color:#555;letter-spacing:2px;">LOADING...</div>
      </div>
    </div>`;
}

function buildLeaderboardPanel() {
  const target = document.getElementById('admin-community-section');
  if (!target || document.getElementById('leaderboard-wrap')) return;

  target.innerHTML += `
    <div class="leaderboard-wrap" id="leaderboard-wrap">
      <div class="leaderboard-header">
        <div class="leaderboard-title">🏆 XP Leaderboard</div>
        <div class="leaderboard-filter-row">
          <button class="lb-filter-btn active" id="lb-btn-alltime" onclick="loadLeaderboard('alltime')">ALL TIME</button>
        </div>
      </div>
      <div class="leaderboard-list" id="leaderboard-list">
        <div style="padding:24px;text-align:center;font-family:'Share Tech Mono',monospace;font-size:0.75rem;color:#555;letter-spacing:2px;">LOADING...</div>
      </div>
    </div>`;
}

async function loadActivityLog() {
  const list    = document.getElementById('activity-log-list');
  const countEl = document.getElementById('log-count');
  if (!list) return;

  const LOG_ICONS = { login:'🟢', logout:'🔴', chat:'💬', event:'🎮', profile:'👤', xp:'⭐', levelup:'⬆️' };

  try {
    const snap = await db.collection('activityLog').orderBy('createdAt', 'desc').limit(50).get();
    if (countEl) countEl.textContent = `${snap.size} ENTRIES`;

    if (snap.empty) {
      list.innerHTML = `<div style="padding:24px;text-align:center;font-family:'Share Tech Mono',monospace;font-size:0.75rem;color:#555;letter-spacing:2px;">NO ACTIVITY YET</div>`;
      return;
    }

    list.innerHTML = snap.docs.map(doc => {
      const d   = doc.data();
      const ico = LOG_ICONS[d.type] || '📝';
      const cls = `log-${d.type || 'profile'}`;
      return `
        <div class="activity-log-item">
          <div class="activity-log-icon ${cls}">${ico}</div>
          <div class="activity-log-content">
            <div class="activity-log-desc">${esc(d.desc || 'Activity')}</div>
            <div class="activity-log-meta">
              <span class="activity-log-user">${esc(d.userName || 'Unknown')}</span>
              <span class="activity-log-time">${d.createdAt ? timeAgo(d.createdAt) : '—'}</span>
            </div>
          </div>
        </div>`;
    }).join('');
  } catch (e) {
    list.innerHTML = `<div style="padding:24px;text-align:center;color:#ff6b88;">Error: ${esc(e.message)}</div>`;
  }
}

window.loadLeaderboard = async function(filter) {
  const list = document.getElementById('leaderboard-list');
  if (!list) return;

  // Update active filter button
  document.querySelectorAll('.lb-filter-btn').forEach(b => b.classList.remove('active'));
  const activeBtn = document.getElementById(`lb-btn-${filter}`);
  if (activeBtn) activeBtn.classList.add('active');

  list.innerHTML = `<div style="padding:24px;text-align:center;font-family:'Share Tech Mono',monospace;font-size:0.75rem;color:#555;letter-spacing:2px;">COMPUTING...</div>`;

  try {
    const snap = await db.collection('users').orderBy('xp', 'desc').limit(20).get();
    if (snap.empty) {
      list.innerHTML = `<div style="padding:24px;text-align:center;font-family:'Share Tech Mono',monospace;font-size:0.75rem;color:#555;">NO DATA</div>`;
      return;
    }

    const maxXP = snap.docs[0]?.data().xp || 1;

    list.innerHTML = snap.docs.map((doc, i) => {
      const d       = doc.data();
      const xp      = d.xp || 0;
      const rankCls = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : 'rank-other';
      const rankTxt = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`;
      const lvl     = getLevelFromXP(xp);
      const pct     = Math.round(xp / maxXP * 100);
      const initial = (d.name || '?').charAt(0).toUpperCase();
      const avatar  = d.photoURL
        ? `<img src="${esc(d.photoURL)}" alt="${esc(initial)}" />`
        : esc(initial);

      return `
        <div class="lb-item" onclick="openProfileModal('${doc.id}')" style="cursor:pointer;">
          <div class="lb-rank ${rankCls}">${rankTxt}</div>
          <div class="lb-avatar">${avatar}</div>
          <div class="lb-info">
            <div class="lb-name">${esc(d.name || 'Unknown')}</div>
            <div class="lb-xp-bar-row">
              <div class="lb-xp-bar"><div class="lb-xp-bar-fill" style="width:${pct}%"></div></div>
              <span class="lb-xp-val">${xp} XP · LV${lvl}</span>
            </div>
          </div>
          <div class="lb-badges">${renderBadges((d.badges || []).slice(0,2))}</div>
        </div>`;
    }).join('');
  } catch (e) {
    list.innerHTML = `<div style="padding:24px;text-align:center;color:#ff6b88;">Error: ${esc(e.message)}</div>`;
  }
};

/* ────────────────────────────────────────────────────
   MAIN INIT — called from script.js hooks
──────────────────────────────────────────────────── */

/**
 * Call this after user logs in (from onUserLoggedIn in script.js).
 * @param {object} user     - Firebase Auth user
 * @param {object} userData - Firestore profile data
 */
window.initCommunityForUser = async function(user, userData) {
  if (!user) return;
  _currentUser    = user;
  _currentProfile = userData || {};

  // Ensure XP field exists
  if (userData && userData.xp === undefined) {
    db.collection('users').doc(user.uid).update({ xp: 0, badges: [] }).catch(() => {});
  }

  // Start systems
  startPresence(user.uid);
  startNotifListener(user.uid);
  startOnlineListener();

  // Build profile navbar button
  buildNavbarProfile(userData);

  // Daily login XP
  await checkDailyLogin(user.uid, userData?.name || 'User');

  // Grant founder badge to superadmin
  if (userData?.role === 'superadmin') {
    grantBadge(user.uid, 'founder');
    grantBadge(user.uid, 'leader');
  }

  // Log login
  logActivity(user.uid, userData?.name || 'User', 'login', 'Login ke HTRS');
};

/**
 * Guest: still show online list (read-only)
 */
window.initCommunityForGuest = function() {
  startOnlineListener();
};

/**
 * Expose awardXP globally for other scripts (e.g. events.js)
 */
window.htrsAwardXP       = awardXP;
window.htrsGrantBadge    = grantBadge;
window.htrsLogActivity   = logActivity;
window.htrsAddNotification = addNotification;
window.htrsShowToast     = showToastNotif;

} // end initCommunitySystem
