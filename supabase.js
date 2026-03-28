// js/supabase.js
// Supabase client initialisation
// Replace SUPABASE_URL and SUPABASE_ANON_KEY with your project values

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL  = 'https://vyqaehtcefeqbkrylezj.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ5cWFlaHRjZWZlcWJrcnlsZXpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2ODY2NzgsImV4cCI6MjA5MDI2MjY3OH0.MLTSRAPAG075Vfw9RrnhDQbY2hPLkCiSvGuv_HqTuFQ';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  }
});

// ─────────────────────────────────────────
// AUTH HELPERS
// ─────────────────────────────────────────

export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function signInWithEmail(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin }
  });
  return { error };
}

export async function signOut() {
  await supabase.auth.signOut();
}

// ─────────────────────────────────────────
// VENDOR QUERIES
// ─────────────────────────────────────────

export async function getVendors({ problemTag, posSystem }) {
  let q = supabase
    .from('vendors')
    .select('*')
    .eq('is_active', true);

  if (problemTag) {
    q = q.contains('problem_tags', [problemTag]);
  }

  if (posSystem && posSystem !== 'other') {
    // Return vendors that support this POS or support 'other' (universal)
    q = q.or(`pos_integrations.cs.{${posSystem}},pos_integrations.cs.{other}`);
  }

  const { data, error } = await q.order('is_verified', { ascending: false });
  if (error) { console.error('getVendors:', error); return []; }
  return data || [];
}

export async function getVendorBySlug(slug) {
  const { data, error } = await supabase
    .from('vendors')
    .select('*')
    .eq('slug', slug)
    .single();
  if (error) return null;
  return data;
}

// ─────────────────────────────────────────
// SESSION QUERIES
// ─────────────────────────────────────────

export async function createSession({ operatorId, sessionKey, problemTag, posSystem }) {
  const { data, error } = await supabase
    .from('swipe_sessions')
    .insert({
      operator_id: operatorId || null,
      session_key: sessionKey,
      problem_tag: problemTag,
      pos_system: posSystem
    })
    .select()
    .single();

  if (error) { console.error('createSession:', error); return null; }
  return data;
}

export async function recordSwipe({ sessionId, vendorId, direction }) {
  const { error } = await supabase
    .from('swipes')
    .insert({ session_id: sessionId, vendor_id: vendorId, direction });

  if (!error && direction === 'right') {
    await supabase
      .from('shortlists')
      .insert({ session_id: sessionId, vendor_id: vendorId })
      .on('conflict', 'do nothing');
  }
}

export async function getShortlist(sessionId) {
  const { data, error } = await supabase
    .from('shortlists')
    .select('vendor_id, vendors(*)')
    .eq('session_id', sessionId);

  if (error) return [];
  return data?.map(r => r.vendors) || [];
}

export async function getSessionByShareToken(token) {
  const { data, error } = await supabase
    .from('swipe_sessions')
    .select('*, shortlists(vendor_id, vendors(*))')
    .eq('share_token', token)
    .single();

  if (error) return null;
  return data;
}

export async function getOperatorHistory(operatorId) {
  const { data, error } = await supabase
    .from('swipe_sessions')
    .select('*, shortlists(vendor_id, vendors(name, category, color))')
    .eq('operator_id', operatorId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) return [];
  return data || [];
}

// ─────────────────────────────────────────
// INTRO REQUESTS
// ─────────────────────────────────────────

export async function submitIntroRequest({ operatorId, vendorId, sessionId, email, name, venueName, message }) {
  const { data, error } = await supabase
    .from('intro_requests')
    .insert({
      operator_id: operatorId || null,
      vendor_id: vendorId,
      session_id: sessionId,
      operator_email: email,
      operator_name: name,
      venue_name: venueName,
      message
    })
    .select()
    .single();

  if (error) { console.error('submitIntroRequest:', error); return { error }; }
  return { data };
}

// ─────────────────────────────────────────
// VENDOR PORTAL QUERIES
// ─────────────────────────────────────────

export async function getMyVendor(userId) {
  const { data, error } = await supabase
    .from('vendor_users')
    .select('vendor_id, vendors(*)')
    .eq('user_id', userId)
    .single();

  if (error) return null;
  return data?.vendors || null;
}

export async function updateVendorListing(vendorId, updates) {
  const { error } = await supabase
    .from('vendors')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', vendorId);

  return { error };
}

export async function getMyIntroRequests(vendorId) {
  const { data, error } = await supabase
    .from('intro_requests')
    .select('*')
    .eq('vendor_id', vendorId)
    .order('created_at', { ascending: false });

  if (error) return [];
  return data || [];
}
