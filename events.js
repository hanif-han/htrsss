// ══════════════════════════════════════════
//  HTRS EVENT / RAID MANAGEMENT SYSTEM
//  events.js — modular, non-destructive
// ══════════════════════════════════════════

// ── GLOBAL STATE ──
let _eventsListener = null;
let _currentUserRole = null;
let _editingEventId = null;

// ── SET USER ROLE (called from script.js hooks) ──
function setEventsUserRole(role) {
  _currentUserRole = role;
}

// ══════════════════════════════════════════
//  PUBLIC EVENT DISPLAY (Homepage)
// ══════════════════════════════════════════

function startEventsListener() {
  if (_eventsListener) return;

  const container = document.getElementById('events-container');
  if (!container) return;

  container.innerHTML = `
    <div class="events-loading">
      <div class="events-loading-dot"></div>
      <div class="events-loading-dot"></div>
      <div class="events-loading-dot"></div>
      <span>LOADING EVENTS...</span>
    </div>
  `;

  _eventsListener = db.collection('events')
    .orderBy('eventDate', 'asc')
    .onSnapshot((snapshot) => {
      if (snapshot.empty) {
        container.innerHTML = `
          <div class="events-empty">
            <div class="events-empty-icon">📡</div>
            <div>NO EVENTS SCHEDULED</div>
            <div style="font-size:0.78rem;margin-top:6px;opacity:0.6;">Pantau terus untuk update event HTRS</div>
          </div>
        `;
        updateEventsCount(0);
        return;
      }

      updateEventsCount(snapshot.size);

      // Diff update
      const existingIds = new Set([...container.querySelectorAll('[data-event-id]')].map(el => el.dataset.eventId));
      const incomingIds = new Set();

      const docsArr = [];
      snapshot.forEach(doc => {
        docsArr.push({ id: doc.id, data: doc.data() });
        incomingIds.add(doc.id);
      });

      // Sort by eventDate ascending already via query
      // Remove deleted
      existingIds.forEach(id => {
        if (!incomingIds.has(id)) {
          const el = container.querySelector(`[data-event-id="${id}"]`);
          if (el) el.remove();
        }
      });

      // Remove loading
      const loading = container.querySelector('.events-loading, .events-empty');
      if (loading) loading.remove();

      docsArr.forEach(({ id, data }) => {
        if (existingIds.has(id)) {
          // Update existing card
          const el = container.querySelector(`[data-event-id="${id}"]`);
          if (el) el.replaceWith(buildEventCard(id, data));
        } else {
          // Add new card
          const card = buildEventCard(id, data);
          container.appendChild(card);
          requestAnimationFrame(() => card.classList.add('event-card-visible'));
        }
      });

    }, (err) => {
      console.error('Events listener error:', err);
      container.innerHTML = `<div class="events-empty" style="color:var(--danger);">Error loading events: ${err.message}</div>`;
    });
}

function updateEventsCount(count) {
  const el = document.getElementById('events-count-badge');
  if (el) el.textContent = `${count} EVENT${count !== 1 ? 'S' : ''}`;
}

function buildEventCard(id, data) {
  const card = document.createElement('div');
  card.className = 'event-card';
  card.dataset.eventId = id;

  const dateStr = data.eventDate ? formatEventDate(data.eventDate) : '—';
  const isUpcoming = data.eventDate ? new Date(data.eventDate) >= new Date() : false;
  const statusBadge = isUpcoming
    ? `<span class="event-status-badge upcoming">⚡ UPCOMING</span>`
    : `<span class="event-status-badge past">✓ PAST</span>`;

  const shortDesc = (data.description || '').length > 100
    ? (data.description || '').substring(0, 100) + '...'
    : (data.description || '');

  const imgSection = data.imageUrl
    ? `<div class="event-card-img-wrap"><img src="${escapeHtmlEv(data.imageUrl)}" alt="${escapeHtmlEv(data.title)}" loading="lazy" /></div>`
    : `<div class="event-card-img-placeholder"><span>🎮</span></div>`;

  card.innerHTML = `
    ${imgSection}
    <div class="event-card-body">
      <div class="event-card-meta">
        <span class="event-card-date">📅 ${dateStr}</span>
        ${statusBadge}
      </div>
      <div class="event-card-title">${escapeHtmlEv(data.title || 'Untitled Event')}</div>
      <div class="event-card-desc">${escapeHtmlEv(shortDesc)}</div>
      <button class="btn btn-cyan btn-sm event-detail-btn" onclick="openEventModal('${id}')">
        View Details →
      </button>
    </div>
    <div class="event-card-glow-line"></div>
  `;

  return card;
}

// ── EVENT DETAIL MODAL ──
function openEventModal(id) {
  db.collection('events').doc(id).get().then(doc => {
    if (!doc.exists) return;
    const data = doc.data();

    const modal = document.getElementById('event-modal');
    if (!modal) return;

    const dateStr = data.eventDate ? formatEventDate(data.eventDate) : '—';
    const isUpcoming = data.eventDate ? new Date(data.eventDate) >= new Date() : false;

    document.getElementById('event-modal-img').innerHTML = data.imageUrl
      ? `<img src="${escapeHtmlEv(data.imageUrl)}" alt="${escapeHtmlEv(data.title)}" />`
      : `<div class="event-modal-placeholder">🎮</div>`;

    document.getElementById('event-modal-title').textContent = data.title || 'Untitled Event';
    document.getElementById('event-modal-date').textContent = `📅 ${dateStr}`;
    document.getElementById('event-modal-status').innerHTML = isUpcoming
      ? `<span class="event-status-badge upcoming">⚡ UPCOMING</span>`
      : `<span class="event-status-badge past">✓ PAST</span>`;
    document.getElementById('event-modal-desc').textContent = data.description || '—';
    document.getElementById('event-modal-created').textContent = data.createdBy ? `dibuat oleh ${data.createdBy}` : '';

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }).catch(err => console.error('Event fetch error:', err));
}

function closeEventModal() {
  const modal = document.getElementById('event-modal');
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

// ══════════════════════════════════════════
//  ADMIN EVENT MANAGEMENT
// ══════════════════════════════════════════

function initAdminEvents() {
  startAdminEventsListener();
}

function startAdminEventsListener() {
  if (window._adminEventsListenerStarted) return;
  window._adminEventsListenerStarted = true;

  const listEl = document.getElementById('admin-events-list');
  if (!listEl) return;

  db.collection('events')
    .orderBy('createdAt', 'desc')
    .onSnapshot((snapshot) => {
      if (snapshot.empty) {
        listEl.innerHTML = `<div class="admin-events-empty">Belum ada event. Tambahkan event pertama!</div>`;
        return;
      }

      let html = '';
      snapshot.forEach(doc => {
        const d = doc.data();
        const dateStr = d.eventDate ? formatEventDate(d.eventDate) : '—';
        const thumb = d.imageUrl
          ? `<img src="${escapeHtmlEv(d.imageUrl)}" class="admin-event-thumb" alt="thumb" />`
          : `<div class="admin-event-thumb-placeholder">🎮</div>`;

        html += `
          <div class="admin-event-item" data-id="${doc.id}">
            ${thumb}
            <div class="admin-event-item-info">
              <div class="admin-event-item-title">${escapeHtmlEv(d.title || 'Untitled')}</div>
              <div class="admin-event-item-date">📅 ${dateStr}</div>
              <div class="admin-event-item-desc">${escapeHtmlEv((d.description || '').substring(0, 80))}${(d.description || '').length > 80 ? '…' : ''}</div>
            </div>
            <div class="admin-event-item-actions">
              <button class="btn btn-cyan btn-sm" onclick="openEditEventModal('${doc.id}')">✏ Edit</button>
              <button class="btn btn-danger btn-sm" onclick="deleteEvent('${doc.id}', '${escapeAttrEv(d.title || 'event')}')">🗑 Hapus</button>
            </div>
          </div>
        `;
      });

      listEl.innerHTML = html;
    }, err => {
      console.error('Admin events listener error:', err);
      if (listEl) listEl.innerHTML = `<div style="color:var(--danger);padding:20px;">Error: ${err.message}</div>`;
    });
}

// ── ADD EVENT ──
async function addEvent() {
  const titleEl   = document.getElementById('event-title');
  const descEl    = document.getElementById('event-description');
  const dateEl    = document.getElementById('event-date');
  const imageEl   = document.getElementById('event-image');
  const alertEl   = document.getElementById('event-form-alert');
  const btn       = document.getElementById('event-add-btn');

  const title       = titleEl ? titleEl.value.trim() : '';
  const description = descEl  ? descEl.value.trim()  : '';
  const eventDate   = dateEl  ? dateEl.value          : '';

  hideEventAlert(alertEl);

  if (!title) { showEventAlert(alertEl, 'error', 'Title tidak boleh kosong.'); return; }
  if (!eventDate) { showEventAlert(alertEl, 'error', 'Tanggal event wajib diisi.'); return; }

  if (btn) { btn.disabled = true; btn.textContent = 'UPLOADING...'; }

  try {
    let imageUrl = '';
    if (imageEl && imageEl.files && imageEl.files[0]) {
      imageUrl = await uploadEventImage(imageEl.files[0]);
    }

    const currentUser = firebase.auth().currentUser;
    await db.collection('events').add({
      title,
      description,
      imageUrl,
      eventDate,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: currentUser ? (currentUser.displayName || currentUser.email || 'Admin') : 'Admin'
    });

    showEventAlert(alertEl, 'success', '✅ Event berhasil ditambahkan!');
    if (titleEl) titleEl.value = '';
    if (descEl)  descEl.value  = '';
    if (dateEl)  dateEl.value  = '';
    if (imageEl) imageEl.value = '';
    document.getElementById('event-image-preview-wrap') && (document.getElementById('event-image-preview-wrap').style.display = 'none');

  } catch (err) {
    console.error('Add event error:', err);
    showEventAlert(alertEl, 'error', 'Gagal tambah event: ' + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '⚡ ADD EVENT'; }
  }
}

// ── UPLOAD IMAGE ──
async function uploadEventImage(file) {
  const storageRef = firebase.storage().ref();
  const fileName   = `events/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const ref        = storageRef.child(fileName);
  const snapshot   = await ref.put(file);
  return await snapshot.ref.getDownloadURL();
}

// ── DELETE EVENT ──
async function deleteEvent(id, name) {
  if (!confirm(`Hapus event "${name}"?\n\nTindakan ini tidak dapat dibatalkan.`)) return;
  try {
    await db.collection('events').doc(id).delete();
    showToast(`Event "${name}" dihapus.`, 'success');
  } catch (err) {
    showToast('Gagal hapus event: ' + err.message, 'error');
  }
}

// ── EDIT EVENT MODAL ──
function openEditEventModal(id) {
  db.collection('events').doc(id).get().then(doc => {
    if (!doc.exists) return;
    const d = doc.data();
    _editingEventId = id;

    const modal = document.getElementById('edit-event-modal');
    if (!modal) return;

    document.getElementById('edit-event-title').value       = d.title || '';
    document.getElementById('edit-event-description').value = d.description || '';
    document.getElementById('edit-event-date').value        = d.eventDate || '';

    const preview = document.getElementById('edit-event-current-img');
    if (preview) {
      if (d.imageUrl) {
        preview.innerHTML = `<img src="${escapeHtmlEv(d.imageUrl)}" style="max-width:100%;border-radius:6px;max-height:120px;object-fit:cover;" />`;
        preview.style.display = 'block';
      } else {
        preview.innerHTML = '';
        preview.style.display = 'none';
      }
    }

    hideEventAlert(document.getElementById('edit-event-alert'));
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  });
}

function closeEditEventModal() {
  const modal = document.getElementById('edit-event-modal');
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
    _editingEventId = null;
  }
}

async function saveEditEvent() {
  if (!_editingEventId) return;

  const titleEl  = document.getElementById('edit-event-title');
  const descEl   = document.getElementById('edit-event-description');
  const dateEl   = document.getElementById('edit-event-date');
  const imageEl  = document.getElementById('edit-event-image');
  const alertEl  = document.getElementById('edit-event-alert');
  const btn      = document.getElementById('edit-event-save-btn');

  const title       = titleEl ? titleEl.value.trim() : '';
  const description = descEl  ? descEl.value.trim()  : '';
  const eventDate   = dateEl  ? dateEl.value          : '';

  hideEventAlert(alertEl);
  if (!title) { showEventAlert(alertEl, 'error', 'Title tidak boleh kosong.'); return; }

  if (btn) { btn.disabled = true; btn.textContent = 'SAVING...'; }

  try {
    const updateData = { title, description, eventDate };

    if (imageEl && imageEl.files && imageEl.files[0]) {
      updateData.imageUrl = await uploadEventImage(imageEl.files[0]);
    }

    await db.collection('events').doc(_editingEventId).update(updateData);
    showEventAlert(alertEl, 'success', '✅ Event berhasil diperbarui!');
    showToast('Event diperbarui!', 'success');
    setTimeout(() => closeEditEventModal(), 1200);

  } catch (err) {
    console.error('Edit event error:', err);
    showEventAlert(alertEl, 'error', 'Gagal update: ' + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 SAVE CHANGES'; }
  }
}

// ── IMAGE PREVIEW ──
function previewEventImage(inputId, previewWrapId, previewImgId) {
  const input    = document.getElementById(inputId);
  const wrap     = document.getElementById(previewWrapId);
  const preview  = document.getElementById(previewImgId);
  if (!input || !input.files || !input.files[0]) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    if (preview) preview.src = e.target.result;
    if (wrap)    wrap.style.display = 'block';
  };
  reader.readAsDataURL(input.files[0]);
}

// ── HELPERS ──
function formatEventDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  } catch { return dateStr; }
}

function showEventAlert(el, type, msg) {
  if (!el) return;
  el.textContent = msg;
  el.className = `alert alert-${type} show`;
}

function hideEventAlert(el) {
  if (!el) return;
  el.className = 'alert';
}

function escapeHtmlEv(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(String(str)));
  return div.innerHTML;
}

function escapeAttrEv(str) {
  return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
