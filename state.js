// js/state.js
// Centralised app state - single source of truth

export const state = {
  // Auth
  user: null,
  isAuthLoading: true,

  // Current session
  session: {
    id: null,
    problemTag: null,
    posSystem: null,
    shareToken: null,
    key: getOrCreateSessionKey(),
  },

  // Swipe state
  swipe: {
    vendors: [],
    currentIndex: 0,
    liked: [],
    history: [], // for undo
  },

  // UI
  activePage: 'discover',
  activeScreen: 'problem', // within discover flow

  // Operator profile (loaded after auth)
  profile: null,

  // History
  sessions: [],
};

// ─────────────────────────────────────────
// SESSION KEY (anonymous sessions)
// ─────────────────────────────────────────

function getOrCreateSessionKey() {
  let key = localStorage.getItem('sm_session_key');
  if (!key) {
    key = 'sk_' + crypto.randomUUID().split('-')[0];
    localStorage.setItem('sm_session_key', key);
  }
  return key;
}

// ─────────────────────────────────────────
// LISTENERS
// ─────────────────────────────────────────

const listeners = new Map();

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event).delete(fn);
}

export function emit(event, data) {
  listeners.get(event)?.forEach(fn => fn(data));
}

// ─────────────────────────────────────────
// STATE MUTATIONS
// ─────────────────────────────────────────

export function setUser(user) {
  state.user = user;
  state.isAuthLoading = false;
  emit('auth', user);
}

export function setProfile(profile) {
  state.profile = profile;
  emit('profile', profile);
}

export function setActivePage(page) {
  state.activePage = page;
  emit('navigate', { page });
}

export function setActiveScreen(screen) {
  state.activeScreen = screen;
  emit('screen', { screen });
}

export function startSession({ problemTag, posSystem }) {
  state.session.problemTag = problemTag;
  state.session.posSystem  = posSystem;
  state.swipe = { vendors: [], currentIndex: 0, liked: [], history: [] };
  emit('session:start', state.session);
}

export function setVendors(vendors) {
  state.swipe.vendors = vendors;
  emit('vendors:loaded', vendors);
}

export function setSessionId(id, shareToken) {
  state.session.id = id;
  state.session.shareToken = shareToken;
}

export function recordSwipeLocal(vendor, direction) {
  state.swipe.history.push({ vendor, direction, index: state.swipe.currentIndex });
  if (direction === 'right') state.swipe.liked.push(vendor);
  state.swipe.currentIndex++;
  emit('swipe', { vendor, direction });
}

export function undoLastSwipe() {
  if (state.swipe.history.length === 0) return false;
  const last = state.swipe.history.pop();
  if (last.direction === 'right') {
    state.swipe.liked = state.swipe.liked.filter(v => v.id !== last.vendor.id);
  }
  state.swipe.currentIndex = last.index;
  emit('undo', last);
  return true;
}

export function setSessions(sessions) {
  state.sessions = sessions;
  emit('history:loaded', sessions);
}

// ─────────────────────────────────────────
// PERSIST session between page refreshes
// ─────────────────────────────────────────

export function saveSessionToStorage() {
  if (state.session.id) {
    localStorage.setItem('sm_last_session', JSON.stringify({
      id: state.session.id,
      problemTag: state.session.problemTag,
      posSystem: state.session.posSystem,
      shareToken: state.session.shareToken,
      liked: state.swipe.liked.map(v => v.id),
    }));
  }
}

export function loadSessionFromStorage() {
  try {
    const raw = localStorage.getItem('sm_last_session');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
