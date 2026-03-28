// js/app.js
// Main application orchestrator

import { supabase, getUser, signInWithEmail, signOut,
         getVendors, createSession, recordSwipe, getShortlist,
         getSessionByShareToken, getOperatorHistory, submitIntroRequest,
         getMyVendor, updateVendorListing, getMyIntroRequests } from './supabase.js';

import { state, on, emit, setUser, setProfile, setActivePage,
         setActiveScreen, startSession, setVendors, setSessionId,
         recordSwipeLocal, undoLastSwipe, setSessions,
         saveSessionToStorage } from './state.js';

import { SwipeEngine } from './swipe.js';

// ─────────────────────────────────────────
// PROBLEM CONFIG
// ─────────────────────────────────────────

const PROBLEMS = [
  { id: 'labour',   icon: '👥', title: 'Labour & rota chaos',    desc: 'Too many hours, wrong people, wrong shifts' },
  { id: 'waste',    icon: '🗑️', title: 'Food waste & margins',   desc: "Can't see where the money's going" },
  { id: 'bookings', icon: '📅', title: 'No-shows & covers',      desc: 'Reservations all over the place' },
  { id: 'loyalty',  icon: '💳', title: 'Guest loyalty & CRM',    desc: 'No idea who your regulars actually are' },
  { id: 'ops',      icon: '📋', title: 'Ops & compliance',       desc: 'Checklists, food safety, team comms' },
  { id: 'data',     icon: '📊', title: 'No visibility on data',  desc: 'Flying blind without real numbers' },
];

const POS_SYSTEMS = [
  { id: 'lightspeed', label: 'Lightspeed',              sub: 'Full-service & QSR',          bg: '#1A3A5C', text: 'LS' },
  { id: 'square',     label: 'Square for Restaurants',  sub: 'SME, cafés, QSR',             bg: '#1A1A1A', text: '◼' },
  { id: 'zonal',      label: 'Zonal',                   sub: 'Pubs, casual dining',          bg: '#7A1A1A', text: 'ZN' },
  { id: 'oracle',     label: 'Oracle Simphony',          sub: 'Hotels, enterprise F&B',      bg: '#8B3A00', text: 'OR' },
  { id: 'vita',       label: 'Vita Mojo',                sub: 'QSR, digital-first concepts', bg: '#1A3A1A', text: 'VM' },
  { id: 'other',      label: 'Something else',           sub: 'Toast, Tevalis, others',      bg: '#2A2A2A', text: '?' },
];

const PROBLEM_LABELS = Object.fromEntries(PROBLEMS.map(p => [p.id, p.title]));
const POS_LABELS     = Object.fromEntries(POS_SYSTEMS.map(p => [p.id, p.label]));

// ─────────────────────────────────────────
// DOM REFS
// ─────────────────────────────────────────

const $ = id => document.getElementById(id);

// ─────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────

function showToast(msg, duration = 2400) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), duration);
}

// ─────────────────────────────────────────
// PAGE / SCREEN NAVIGATION
// ─────────────────────────────────────────

function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById('page-' + pageId);
  if (page) page.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.page === pageId);
  });

  state.activePage = pageId;
}

function showScreen(screenId) {
  document.querySelectorAll('.discover-screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById('screen-' + screenId);
  if (screen) screen.classList.add('active');
  state.activeScreen = screenId;
  updateProgressDots(screenId);
}

function updateProgressDots(screen) {
  const map = { problem: 0, pos: 1, swipe: 2, results: 2 };
  const step = map[screen] ?? 0;
  document.querySelectorAll('.dot').forEach((dot, i) => {
    dot.classList.toggle('done',   i < step);
    dot.classList.toggle('active', i === step);
  });
}

// ─────────────────────────────────────────
// BUILD PROBLEM SCREEN
// ─────────────────────────────────────────

function renderProblemScreen() {
  const grid = $('problem-grid');
  grid.innerHTML = PROBLEMS.map(p => `
    <div class="problem-card" data-id="${p.id}" onclick="selectProblem('${p.id}', this)">
      <span class="problem-icon">${p.icon}</span>
      <div class="problem-title">${p.title}</div>
      <div class="problem-desc">${p.desc}</div>
    </div>
  `).join('');
}

window.selectProblem = function(id, el) {
  document.querySelectorAll('.problem-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  state.session.problemTag = id;
  $('btn-to-pos').disabled = false;
};

// ─────────────────────────────────────────
// BUILD POS SCREEN
// ─────────────────────────────────────────

function renderPosScreen() {
  const list = $('pos-list');
  list.innerHTML = POS_SYSTEMS.map(p => `
    <div class="pos-item" data-id="${p.id}" onclick="selectPos('${p.id}', this)">
      <div class="pos-logo" style="background:${p.bg}">${p.text}</div>
      <div class="pos-info">
        <div class="pos-name">${p.label}</div>
        <div class="pos-type">${p.sub}</div>
      </div>
      <div class="pos-radio"></div>
    </div>
  `).join('');
}

window.selectPos = function(id, el) {
  document.querySelectorAll('.pos-item').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  state.session.posSystem = id;
  $('btn-to-swipe').disabled = false;
};

// ─────────────────────────────────────────
// SWIPE SCREEN
// ─────────────────────────────────────────

let swipeEngine = null;

async function initSwipeScreen() {
  showScreen('swipe');

  const { problemTag, posSystem } = state.session;
  $('swipe-context-label').textContent = `${PROBLEM_LABELS[problemTag]} · ${POS_LABELS[posSystem]}`;

  // Load vendors
  $('swipe-arena').innerHTML = `<div class="empty"><div class="spinner"></div></div>`;
  const vendors = await getVendors({ problemTag, posSystem });

  if (vendors.length === 0) {
    $('swipe-arena').innerHTML = `
      <div class="empty">
        <span class="empty-icon">🤔</span>
        <p class="t-body">No tools found for this combination yet.</p>
        <button class="btn-ghost mt-16" style="width:auto;padding:10px 20px;" onclick="showScreen('problem')">Try another problem</button>
      </div>`;
    return;
  }

  // Create DB session
  const session = await createSession({
    operatorId: state.user?.id || null,
    sessionKey: state.session.key,
    problemTag,
    posSystem,
  });

  if (session) setSessionId(session.id, session.share_token);

  startSession({ problemTag, posSystem });
  setVendors(vendors);

  // Update counter
  function updateCounter() {
    const total = state.swipe.vendors.length;
    const curr  = state.swipe.currentIndex + 1;
    $('swipe-counter').textContent = curr <= total
      ? `${curr} of ${total}`
      : 'Done!';
  }

  // Render engine
  swipeEngine = new SwipeEngine({
    arena: $('swipe-arena'),
    onSwipe: async (vendor, direction) => {
      recordSwipeLocal(vendor, direction);
      updateCounter();
      if (state.session.id) {
        await recordSwipe({ sessionId: state.session.id, vendorId: vendor.id, direction });
      }
      saveSessionToStorage();

      // Check if done
      if (state.swipe.currentIndex >= state.swipe.vendors.length) {
        setTimeout(() => showResultsScreen(), 400);
      }
    },
    onEmpty: () => {
      setTimeout(() => showResultsScreen(), 300);
    },
  });

  swipeEngine.render(vendors);
  updateCounter();
}

window.swipeLeft  = () => swipeEngine?.swipe('left');
window.swipeRight = () => swipeEngine?.swipe('right');
window.swipeUndo  = () => {
  const ok = undoLastSwipe();
  if (ok && swipeEngine) {
    const last = state.swipe.history[state.swipe.history.length] || state.swipe.history.at(-1);
    const vendor = state.swipe.vendors[state.swipe.currentIndex];
    if (vendor) swipeEngine.undoLast(vendor);
    const total = state.swipe.vendors.length;
    $('swipe-counter').textContent = `${state.swipe.currentIndex + 1} of ${total}`;
  } else {
    showToast('Nothing to undo');
  }
};

// ─────────────────────────────────────────
// RESULTS SCREEN
// ─────────────────────────────────────────

async function showResultsScreen() {
  showScreen('results');
  const liked = state.swipe.liked;

  if (liked.length === 0) {
    $('results-icon').textContent = '🤔';
    $('results-title').textContent = 'Tough crowd';
    $('results-sub').textContent = 'Nothing caught your eye — want to try a different problem?';
    $('results-list').innerHTML = `
      <button class="btn-ghost" onclick="goBackToProblem()">Start again with a different problem</button>`;
    return;
  }

  $('results-icon').textContent  = liked.length >= 3 ? '🔥' : '🎯';
  $('results-title').textContent = `${liked.length} tool${liked.length !== 1 ? 's' : ''} worth exploring`;
  $('results-sub').textContent   = 'Matched to your problem and your EPOS';

  $('results-list').innerHTML = liked.map(v => `
    <div class="result-item">
      <div class="result-bar" style="background:${v.color}"></div>
      <div class="result-info">
        <div class="result-name">${v.name}</div>
        <div class="result-cat">${v.category}</div>
      </div>
      <div class="result-actions">
        <button class="pill pill-green" onclick="openIntroModal('${v.id}','${v.name}')">Intro</button>
      </div>
    </div>
  `).join('');

  // Share URL
  if (state.session.shareToken) {
    const url = `${location.origin}?share=${state.session.shareToken}`;
    $('share-url-display').textContent = url;
    $('share-section').classList.remove('hidden');
  }
}

window.goBackToProblem = () => {
  document.querySelectorAll('.problem-card').forEach(c => c.classList.remove('selected'));
  document.querySelectorAll('.pos-item').forEach(c => c.classList.remove('selected'));
  $('btn-to-pos').disabled  = true;
  $('btn-to-swipe').disabled = true;
  state.session.problemTag = null;
  state.session.posSystem  = null;
  showScreen('problem');
};

window.copyShareLink = async () => {
  const url = `${location.origin}?share=${state.session.shareToken}`;
  try {
    await navigator.clipboard.writeText(url);
    showToast('Link copied to clipboard 👌');
  } catch {
    showToast('Copy: ' + url);
  }
};

window.nativeShare = async () => {
  const liked = state.swipe.liked.map(v => v.name).join(', ');
  const url   = `${location.origin}?share=${state.session.shareToken}`;
  if (navigator.share) {
    await navigator.share({ title: 'My StackMatch shortlist', text: `My tech stack: ${liked}`, url });
  } else {
    window.copyShareLink();
  }
};

// ─────────────────────────────────────────
// SHARED STACK VIEW
// ─────────────────────────────────────────

async function loadSharedStack(token) {
  const session = await getSessionByShareToken(token);
  if (!session) {
    showToast("That link doesn't exist or has expired");
    showPage('discover');
    return;
  }

  const vendors = (session.shortlists || []).map(s => s.vendors);
  const problemLabel = PROBLEM_LABELS[session.problem_tag] || session.problem_tag;
  const posLabel     = POS_LABELS[session.pos_system]      || session.pos_system;

  $('shared-problem').textContent = problemLabel;
  $('shared-pos').textContent     = posLabel;
  $('shared-list').innerHTML = vendors.length
    ? vendors.map(v => `
        <div class="result-item">
          <div class="result-bar" style="background:${v.color}"></div>
          <div class="result-info">
            <div class="result-name">${v.name}</div>
            <div class="result-cat">${v.category}</div>
          </div>
          <span class="pill pill-green">Shortlisted</span>
        </div>`).join('')
    : `<p class="t-body">This stack has no saved tools.</p>`;

  showPage('shared');
}

// ─────────────────────────────────────────
// INTRO MODAL
// ─────────────────────────────────────────

window.openIntroModal = function(vendorId, vendorName) {
  $('intro-vendor-name').textContent = vendorName;
  $('intro-vendor-id').value = vendorId;

  // Pre-fill if logged in
  if (state.user) {
    $('intro-email').value = state.user.email || '';
    $('intro-name').value  = state.profile?.name || '';
    $('intro-venue').value = state.profile?.venue_name || '';
  }

  $('intro-modal').classList.add('open');
};

window.closeIntroModal = () => $('intro-modal').classList.remove('open');

window.submitIntro = async () => {
  const vendorId  = $('intro-vendor-id').value;
  const email     = $('intro-email').value.trim();
  const name      = $('intro-name').value.trim();
  const venueName = $('intro-venue').value.trim();
  const message   = $('intro-message').value.trim();

  if (!email) { showToast('Your email is required'); return; }

  $('btn-submit-intro').disabled = true;
  $('btn-submit-intro').textContent = 'Sending…';

  const { error } = await submitIntroRequest({
    operatorId: state.user?.id || null,
    vendorId,
    sessionId: state.session.id,
    email,
    name,
    venueName,
    message,
  });

  if (error) {
    showToast('Something went wrong — try again');
  } else {
    showToast('Intro request sent 🎉');
    closeIntroModal();
    // Clear form
    ['intro-email','intro-name','intro-venue','intro-message'].forEach(id => { $(id).value = ''; });
  }

  $('btn-submit-intro').disabled = false;
  $('btn-submit-intro').textContent = 'Send intro request';
};

// ─────────────────────────────────────────
// AUTH MODAL
// ─────────────────────────────────────────

window.openAuthModal = () => $('auth-modal').classList.add('open');
window.closeAuthModal = () => $('auth-modal').classList.remove('open');

window.submitAuth = async () => {
  const email = $('auth-email').value.trim();
  if (!email) { showToast('Enter your email first'); return; }

  $('btn-auth').disabled = true;
  $('btn-auth').textContent = 'Sending magic link…';

  const { error } = await signInWithEmail(email);
  if (error) {
    showToast('Could not send link — try again');
    $('btn-auth').disabled = false;
    $('btn-auth').textContent = 'Send magic link';
  } else {
    $('auth-form-area').innerHTML = `
      <div class="empty" style="padding:24px 0;">
        <span class="empty-icon">📬</span>
        <p class="t-body text-center">Check your inbox.<br>Click the link to sign in.</p>
      </div>`;
  }
};

window.handleSignOut = async () => {
  await signOut();
  setUser(null);
  setProfile(null);
  renderAccountPage();
  showToast('Signed out');
};

// ─────────────────────────────────────────
// HISTORY PAGE
// ─────────────────────────────────────────

async function loadHistory() {
  if (!state.user) {
    $('history-content').innerHTML = `
      <div class="empty">
        <span class="empty-icon">🔒</span>
        <p class="t-body text-center">Sign in to see your match history across sessions.</p>
        <button class="btn mt-16" onclick="openAuthModal()">Sign in</button>
      </div>`;
    return;
  }

  $('history-content').innerHTML = `<div class="empty"><div class="spinner"></div></div>`;
  const sessions = await getOperatorHistory(state.user.id);
  setSessions(sessions);

  if (!sessions.length) {
    $('history-content').innerHTML = `
      <div class="empty">
        <span class="empty-icon">🃏</span>
        <p class="t-body text-center">No matches yet. Go swipe some stacks.</p>
      </div>`;
    return;
  }

  $('history-content').innerHTML = sessions.map(s => {
    const liked = (s.shortlists || []).map(sl => sl.vendors?.name).filter(Boolean);
    const date  = new Date(s.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    return `
      <div class="history-item" onclick="replaySession('${s.id}')">
        <div class="history-meta">
          <span class="history-problem">${PROBLEM_LABELS[s.problem_tag] || s.problem_tag}</span>
          <span class="history-date">${date}</span>
        </div>
        <div class="history-pos">${POS_LABELS[s.pos_system] || s.pos_system}</div>
        <div class="history-count">
          ${liked.length > 0 ? '✓ ' + liked.join(', ') : 'No matches saved'}
        </div>
      </div>`;
  }).join('');
}

window.replaySession = async (sessionId) => {
  // Load shortlist for a past session and show results
  const vendors = await getShortlist(sessionId);
  state.swipe.liked = vendors;
  state.session.id = sessionId;
  showPage('discover');
  await showResultsScreen();
  showScreen('results');
};

// ─────────────────────────────────────────
// ACCOUNT PAGE
// ─────────────────────────────────────────

function renderAccountPage() {
  const el = $('account-content');
  if (!state.user) {
    el.innerHTML = `
      <div class="empty" style="padding:40px 0;">
        <span class="empty-icon">👤</span>
        <p class="t-body text-center">Create an account to save your stack and request intros.</p>
        <button class="btn mt-16" onclick="openAuthModal()">Sign in with email</button>
      </div>`;
  } else {
    const p = state.profile;
    el.innerHTML = `
      <div class="mt-24">
        <p class="t-label mb-8">Signed in as</p>
        <p class="t-title">${state.user.email}</p>
        ${p?.venue_name ? `<p class="t-small mt-4">${p.venue_name}</p>` : ''}
        <button class="btn-ghost mt-24" onclick="handleSignOut()">Sign out</button>
      </div>`;
  }
}

// ─────────────────────────────────────────
// VENDOR PORTAL
// ─────────────────────────────────────────

const POS_OPTIONS     = POS_SYSTEMS.map(p => p.id);
const PROBLEM_OPTIONS = PROBLEMS.map(p => p.id);
const VENUE_OPTIONS   = ['pub','restaurant','hotel','cafe','qsr','casual-dining','enterprise','bar'];

function renderCheckboxGroup(containerId, options, selectedValues = []) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = options.map(opt => `
    <span class="checkbox-chip ${selectedValues.includes(opt) ? 'checked' : ''}"
          data-val="${opt}"
          onclick="toggleChip(this)">
      ${opt.replace('-', ' ')}
    </span>`).join('');
}

window.toggleChip = function(el) {
  el.classList.toggle('checked');
};

function getCheckedValues(containerId) {
  return [...document.querySelectorAll(`#${containerId} .chip.checked`)]
    .map(el => el.dataset.val);
}

async function loadVendorPortal() {
  if (!state.user) {
    $('vendor-portal-content').innerHTML = `
      <div class="empty">
        <span class="empty-icon">🔒</span>
        <p class="t-body text-center">Sign in with your vendor account to manage your listing.</p>
        <button class="btn mt-16" onclick="openAuthModal()">Sign in</button>
      </div>`;
    return;
  }

  $('vendor-portal-content').innerHTML = `<div class="empty"><div class="spinner"></div></div>`;
  const vendor = await getMyVendor(state.user.id);

  if (!vendor) {
    $('vendor-portal-content').innerHTML = `
      <div class="empty">
        <span class="empty-icon">🏢</span>
        <p class="t-body text-center">No vendor account found for this email. Contact us to get listed.</p>
        <a href="mailto:hello@stackmatch.io" class="btn mt-16" style="text-decoration:none;">Get in touch</a>
      </div>`;
    return;
  }

  state.currentVendor = vendor;
  renderVendorForm(vendor);
  const intros = await getMyIntroRequests(vendor.id);
  renderIntroRequests(intros);
}

function renderVendorForm(vendor) {
  $('vendor-portal-content').innerHTML = `
    <h2 class="t-heading mt-24 mb-8">Your listing</h2>
    <p class="t-small mb-24">Changes go live immediately after saving.</p>

    <div class="vendor-form">
      <div class="field">
        <label>Tagline</label>
        <textarea id="vf-tagline" rows="3">${vendor.tagline || ''}</textarea>
      </div>
      <div class="field">
        <label>Operator hook</label>
        <input type="text" id="vf-hook" value="${vendor.hook || ''}" placeholder="One punchy line an operator will remember">
      </div>
      <div class="field">
        <label>Website URL</label>
        <input type="url" id="vf-website" value="${vendor.website_url || ''}">
      </div>
      <div class="field">
        <label>Book a demo URL</label>
        <input type="url" id="vf-demo" value="${vendor.demo_url || ''}">
      </div>

      <div class="field">
        <label>Stat 1 — value</label>
        <input type="text" id="vf-s1v" value="${vendor.stat_1_val || ''}" placeholder="e.g. 30%">
      </div>
      <div class="field">
        <label>Stat 1 — label</label>
        <input type="text" id="vf-s1l" value="${vendor.stat_1_lbl || ''}" placeholder="e.g. labour cost reduction">
      </div>
      <div class="field">
        <label>Stat 2 — value</label>
        <input type="text" id="vf-s2v" value="${vendor.stat_2_val || ''}">
      </div>
      <div class="field">
        <label>Stat 2 — label</label>
        <input type="text" id="vf-s2l" value="${vendor.stat_2_lbl || ''}">
      </div>
      <div class="field">
        <label>Stat 3 — value</label>
        <input type="text" id="vf-s3v" value="${vendor.stat_3_val || ''}">
      </div>
      <div class="field">
        <label>Stat 3 — label</label>
        <input type="text" id="vf-s3l" value="${vendor.stat_3_lbl || ''}">
      </div>

      <div class="field">
        <label>EPOS integrations</label>
        <div class="checkbox-group" id="vf-pos"></div>
      </div>
      <div class="field">
        <label>Problem areas you solve</label>
        <div class="checkbox-group" id="vf-problems"></div>
      </div>
      <div class="field">
        <label>Best fit venue types</label>
        <div class="checkbox-group" id="vf-venues"></div>
      </div>

      <button class="btn" onclick="saveVendorListing()">Save listing</button>
    </div>

    <h2 class="t-heading mt-32 mb-16">Intro requests</h2>
    <div id="intro-requests-list"></div>
  `;

  renderCheckboxGroup('vf-pos',      POS_OPTIONS,    vendor.pos_integrations || []);
  renderCheckboxGroup('vf-problems', PROBLEM_OPTIONS, vendor.problem_tags      || []);
  renderCheckboxGroup('vf-venues',   VENUE_OPTIONS,   vendor.venue_types       || []);
}

function renderIntroRequests(intros) {
  const el = $('intro-requests-list');
  if (!el) return;
  if (!intros.length) {
    el.innerHTML = `<p class="t-small">No intro requests yet.</p>`;
    return;
  }
  el.innerHTML = intros.map(r => `
    <div class="history-item">
      <div class="history-meta">
        <span class="history-problem">${r.operator_email}</span>
        <span class="history-date">${new Date(r.created_at).toLocaleDateString('en-GB')}</span>
      </div>
      <div class="history-pos">${r.operator_name || 'Unnamed'} — ${r.venue_name || 'No venue'}</div>
      ${r.message ? `<p class="t-small mt-4">"${r.message}"</p>` : ''}
    </div>`).join('');
}

window.saveVendorListing = async () => {
  const btn = document.querySelector('[onclick="saveVendorListing()"]');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  const pos      = [...document.querySelectorAll('#vf-pos .checkbox-chip.checked')].map(e => e.dataset.val);
  const problems = [...document.querySelectorAll('#vf-problems .checkbox-chip.checked')].map(e => e.dataset.val);
  const venues   = [...document.querySelectorAll('#vf-venues .checkbox-chip.checked')].map(e => e.dataset.val);

  const updates = {
    tagline:          $('vf-tagline')?.value.trim(),
    hook:             $('vf-hook')?.value.trim(),
    website_url:      $('vf-website')?.value.trim(),
    demo_url:         $('vf-demo')?.value.trim(),
    stat_1_val:       $('vf-s1v')?.value.trim(),
    stat_1_lbl:       $('vf-s1l')?.value.trim(),
    stat_2_val:       $('vf-s2v')?.value.trim(),
    stat_2_lbl:       $('vf-s2l')?.value.trim(),
    stat_3_val:       $('vf-s3v')?.value.trim(),
    stat_3_lbl:       $('vf-s3l')?.value.trim(),
    pos_integrations: pos,
    problem_tags:     problems,
    venue_types:      venues,
  };

  const { error } = await updateVendorListing(state.currentVendor.id, updates);
  if (error) {
    showToast('Save failed — try again');
  } else {
    showToast('Listing updated ✓');
  }

  btn.disabled = false;
  btn.textContent = 'Save listing';
};

// ─────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────

window.navigateTo = function(page) {
  showPage(page);
  if (page === 'history') loadHistory();
  if (page === 'account') renderAccountPage();
  if (page === 'vendor')  loadVendorPortal();
};

window.goToPos = () => { if (state.session.problemTag) showScreen('pos'); };
window.goToSwipe = () => { if (state.session.posSystem) initSwipeScreen(); };
window.backToDiscover = () => showPage('discover');

// ─────────────────────────────────────────
// INIT
// ─────────────────────────────────────────

async function init() {
  // Check for shared stack in URL
  const params = new URLSearchParams(location.search);
  const shareToken = params.get('share');
  if (shareToken) {
    await loadSharedStack(shareToken);
    return;
  }

  // Auth state
  supabase.auth.onAuthStateChange(async (event, session) => {
    const user = session?.user || null;
    setUser(user);
    if (user) {
      const { data: profile } = await supabase
        .from('operator_profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      setProfile(profile);
    }
    if (state.activePage === 'account') renderAccountPage();
  });

  // Render initial screens
  renderProblemScreen();
  renderPosScreen();
  showScreen('problem');
  showPage('discover');
}

init();
