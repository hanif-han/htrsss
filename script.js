// ── FIREBASE CONFIG ──
const firebaseConfig = {
  apiKey: "AIzaSyC69Av6i5pv-5cpSgUkfdASveAzuIrlpeQ",
  authDomain: "htr-squad.firebaseapp.com",
  projectId: "htr-squad",
  storageBucket: "htr-squad.firebasestorage.app",
  messagingSenderId: "119724015982",
  appId: "1:119724015982:web:0edd4ed3efaa53f580c17f"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();

const SUPERADMIN_EMAIL = "hansdpr12@gmail.com";

// ── PAGE DETECTION ──
const PAGE = (() => {
  const path = location.pathname;
  if (path.includes('login')) return 'login';
  if (path.includes('register')) return 'register';
  if (path.includes('admin')) return 'admin';
  return 'home';
})();

// ── STATE TRACKING ──
let lastRenderedUID = null;
let navbarRendered = false;

// ── AUTH STATE ──
auth.onAuthStateChanged(async (user) => {
  if (user) {
    const alreadyRendered = lastRenderedUID === user.uid;
    lastRenderedUID = user.uid;

    let userData = null;
    try {
      const doc = await db.collection('users').doc(user.uid).get();
      if (doc.exists) userData = doc.data();
    } catch (e) {
      console.warn('Failed to fetch user data:', e);
    }

    if (user.email === SUPERADMIN_EMAIL) {
      try {
        await db.collection('users').doc(user.uid).set({
          name: userData?.name || 'Hans',
          email: user.email,
          role: 'superadmin',
          jabatan: 'Leader'
        }, { merge: true });
        userData = { ...userData, role: 'superadmin', jabatan: 'Leader' };
      } catch (e) { console.warn(e); }
    }

    if (!navbarRendered) {
      navbarRendered = true;
      renderNavbarLoggedIn(userData?.name || user.displayName || 'User');
    }

    // Always redirect login/register pages when user is logged in
    if (PAGE === 'login' || PAGE === 'register') {
      window.location.replace('index.html');
      return;
    }

    if (!alreadyRendered) {
      onUserLoggedIn(user, userData);
    }

  } else {
    lastRenderedUID = null;

    if (!navbarRendered) {
      navbarRendered = true;
      renderNavbarGuest();
    }

    if (PAGE === 'admin') {
      window.location.replace('login.html');
      return;
    }

    onUserGuest();
  }

  // Hide loading screen
  const loading = document.getElementById('loading-screen');
  if (loading && !loading.classList.contains('hidden')) {
    loading.classList.add('hidden');
    setTimeout(() => { if (loading.parentNode) loading.remove(); }, 600);
  }
});

// ── NAVBAR ──
function renderNavbarLoggedIn(name) {
  const actions = document.getElementById('nav-actions');
  if (!actions) return;
  actions.innerHTML = `
    <a href="admin.html" class="btn btn-cyan btn-sm">⚡ Super Admin</a>
    <button onclick="doLogout()" class="btn btn-danger btn-sm">↩ Logout</button>
  `;
}

function renderNavbarGuest() {
  const actions = document.getElementById('nav-actions');
  if (!actions) return;
  actions.innerHTML = `
    <a href="login.html" class="btn btn-primary btn-sm">🔐 Login</a>
  `;
}

// ── PAGE HANDLERS ──
function onUserLoggedIn(user, userData) {
  if (PAGE === 'home') {
    initHomeLoggedIn(userData?.name || user.displayName || 'Squad Member', userData, user);
  } else if (PAGE === 'admin') {
    if (userData?.role === 'superadmin') {
      initAdminPanel();
    } else {
      showDenied();
    }
  }
}

function onUserGuest() {
  if (PAGE === 'home') initHomeGuest();
}

// ── HOME ──
function initHomeLoggedIn(name, userData, user) {
  const guestSection = document.getElementById('hero-guest');
  const welcomeSection = document.getElementById('hero-welcome');
  const nameEl = document.getElementById('welcome-name');
  if (guestSection) guestSection.style.display = 'none';
  if (welcomeSection) welcomeSection.style.display = 'block';
  if (nameEl) nameEl.textContent = name;
  // Start real-time members listener
  if (typeof startMembersListener === 'function') startMembersListener();
  // Start chat
  if (typeof startChat === 'function' && userData && user) {
    startChat(user.uid, userData.name || name, userData.role || 'member');
  }
}

function initHomeGuest() {
  const guestSection = document.getElementById('hero-guest');
  const welcomeSection = document.getElementById('hero-welcome');
  if (guestSection) guestSection.style.display = 'flex';
  if (welcomeSection) welcomeSection.style.display = 'none';
  // Start real-time members listener (also visible to guests)
  if (typeof startMembersListener === 'function') startMembersListener();
  // Show chat guest banner
  if (typeof showChatGuest === 'function') showChatGuest();
}

// ── LOGOUT ──
function doLogout() {
  navbarRendered = false;
  lastRenderedUID = null;
  auth.signOut().then(() => {
    window.location.href = 'index.html';
  });
}

// ── LOGIN ──
function initLoginPage() {
  const form = document.getElementById('login-form');
  const alertEl = document.getElementById('login-alert');
  const btn = document.getElementById('login-btn');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert(alertEl);

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if (!email || !password) {
      showAlert(alertEl, 'error', 'Isi semua field.');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'AUTHENTICATING...';

    try {
      await auth.signInWithEmailAndPassword(email, password);
      // onAuthStateChanged will fire → detects login page → redirects to index.html
    } catch (err) {
      btn.disabled = false;
      btn.textContent = '🔐 INITIATE LOGIN';
      let msg = 'Login gagal.';
      if (err.code === 'auth/user-not-found') msg = 'Akun tidak ditemukan.';
      else if (err.code === 'auth/wrong-password') msg = 'Password salah.';
      else if (err.code === 'auth/invalid-email') msg = 'Format email tidak valid.';
      else if (err.code === 'auth/invalid-credential') msg = 'Email atau password salah.';
      else if (err.code === 'auth/too-many-requests') msg = 'Terlalu banyak percobaan. Coba lagi nanti.';
      showAlert(alertEl, 'error', msg);
    }
  });
}

// ── REGISTER ──
function initRegisterPage() {
  const form = document.getElementById('register-form');
  const alertEl = document.getElementById('register-alert');
  const btn = document.getElementById('register-btn');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert(alertEl);

    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;

    if (!name || !email || !password || !confirm) {
      showAlert(alertEl, 'error', 'Semua field wajib diisi.');
      return;
    }
    if (password !== confirm) {
      showAlert(alertEl, 'error', 'Password tidak cocok.');
      return;
    }
    if (password.length < 6) {
      showAlert(alertEl, 'error', 'Password minimal 6 karakter.');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'REGISTERING...';

    try {
      const cred = await auth.createUserWithEmailAndPassword(email, password);
      const uid = cred.user.uid;
      const isAdmin = email === SUPERADMIN_EMAIL;
      await db.collection('users').doc(uid).set({
        name,
        email,
        role: isAdmin ? 'superadmin' : 'member',
        jabatan: isAdmin ? 'Leader' : '-'
      });
      showAlert(alertEl, 'success', 'Registrasi berhasil! Mengalihkan...');
      // onAuthStateChanged fires → detects register page → redirects to index.html
    } catch (err) {
      btn.disabled = false;
      btn.textContent = '⚡ JOIN THE SQUAD';
      let msg = 'Registrasi gagal.';
      if (err.code === 'auth/email-already-in-use') msg = 'Email sudah digunakan.';
      else if (err.code === 'auth/invalid-email') msg = 'Format email tidak valid.';
      else if (err.code === 'auth/weak-password') msg = 'Password terlalu lemah.';
      showAlert(alertEl, 'error', msg);
    }
  });
}

// ── ADMIN ──
function initAdminPanel() {
  const content = document.getElementById('admin-content');
  const denied = document.getElementById('denied-content');
  if (content) content.style.display = 'block';
  if (denied) denied.style.display = 'none';
  loadUsers();
}

function showDenied() {
  const content = document.getElementById('admin-content');
  const denied = document.getElementById('denied-content');
  if (content) content.style.display = 'none';
  if (denied) denied.style.display = 'flex';
}

async function loadUsers() {
  const tbody = document.getElementById('users-tbody');
  const countEl = document.getElementById('user-count');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-dim);padding:32px;font-family:'Share Tech Mono',monospace;letter-spacing:2px;">LOADING DATA...</td></tr>`;

  try {
    const snapshot = await db.collection('users').get();
    const count = snapshot.size;
    if (countEl) countEl.textContent = `${count} RECORD${count !== 1 ? 'S' : ''}`;

    if (count === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-dim);padding:32px;">No users found.</td></tr>`;
      return;
    }

    let html = '';
    snapshot.forEach(doc => {
      const d = doc.data();
      const uid = doc.id;
      const roleClass = d.role === 'superadmin' ? 'role-superadmin' : 'role-member';
      const initial = (d.name || '?').charAt(0).toUpperCase();
      html += `
        <tr>
          <td>
            <div style="display:flex;align-items:center;gap:12px;">
              <div class="member-avatar" style="width:36px;height:36px;font-size:0.85rem;">${initial}</div>
              <span>${escapeHtml(d.name || '-')}</span>
            </div>
          </td>
          <td class="td-email">${escapeHtml(d.email || '-')}</td>
          <td><span class="role-badge ${roleClass}">${d.role || 'member'}</span></td>
          <td>
            <select class="table-select" id="role-${uid}">
              <option value="member" ${d.role === 'member' ? 'selected' : ''}>member</option>
              <option value="superadmin" ${d.role === 'superadmin' ? 'selected' : ''}>superadmin</option>
            </select>
          </td>
          <td>
            <input class="table-input" id="jabatan-${uid}" type="text" value="${escapeHtml(d.jabatan || '-')}" />
          </td>
          <td>
            <button class="btn btn-success btn-sm" onclick="updateUser('${uid}')">✔ Update</button>
          </td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--danger);padding:32px;">Error: ${err.message}</td></tr>`;
  }
}

async function updateUser(uid) {
  const roleEl = document.getElementById(`role-${uid}`);
  const jabatanEl = document.getElementById(`jabatan-${uid}`);
  if (!roleEl || !jabatanEl) return;
  const role = roleEl.value;
  const jabatan = jabatanEl.value.trim() || '-';
  try {
    await db.collection('users').doc(uid).update({ role, jabatan });
    showToast('User updated successfully!', 'success');
    loadUsers();
  } catch (err) {
    showToast('Update failed: ' + err.message, 'error');
  }
}

// ── TOAST ──
function showToast(msg, type = 'success') {
  let toast = document.getElementById('global-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'global-toast';
    toast.style.cssText = `
      position:fixed;bottom:32px;right:32px;
      padding:14px 22px;border-radius:8px;
      font-family:'Rajdhani',sans-serif;font-weight:600;
      font-size:0.95rem;z-index:9999;
      transition:all 0.3s ease;
      transform:translateY(20px);opacity:0;
    `;
    document.body.appendChild(toast);
  }
  if (type === 'success') {
    toast.style.background = 'rgba(0,255,136,0.1)';
    toast.style.border = '1px solid rgba(0,255,136,0.4)';
    toast.style.color = '#00ff88';
  } else {
    toast.style.background = 'rgba(255,45,85,0.1)';
    toast.style.border = '1px solid rgba(255,45,85,0.4)';
    toast.style.color = '#ff6b88';
  }
  toast.textContent = msg;
  requestAnimationFrame(() => {
    toast.style.transform = 'translateY(0)';
    toast.style.opacity = '1';
  });
  setTimeout(() => {
    toast.style.transform = 'translateY(20px)';
    toast.style.opacity = '0';
  }, 3000);
}

// ── ALERT HELPERS ──
function showAlert(el, type, msg) {
  if (!el) return;
  el.textContent = msg;
  el.className = `alert alert-${type} show`;
}

function hideAlert(el) {
  if (!el) return;
  el.className = 'alert';
}

// ── ESCAPE HTML ──
function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(String(str)));
  return div.innerHTML;
}

// ── INIT ──
document.addEventListener('DOMContentLoaded', () => {
  if (PAGE === 'login') initLoginPage();
  if (PAGE === 'register') initRegisterPage();
});
