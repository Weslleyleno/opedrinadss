const { createClient } = require('@supabase/supabase-js');

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment' })
    };
  }

  let parsed = {};
  try {
    parsed = event.body ? JSON.parse(event.body) : {};
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const requesterUserId = typeof parsed.requesterUserId === 'string' ? parsed.requesterUserId.trim() : '';
  if (!requesterUserId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing requesterUserId' }) };
  }

  const admin = createClient(url, serviceRoleKey);

  try {
    const { data: anyAdmin, error: anyAdminErr } = await admin
      .from('profiles')
      .select('id')
      .eq('is_admin', true)
      .limit(1);

    if (anyAdminErr) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: anyAdminErr.message }) };
    }

    if (anyAdmin && anyAdmin.length > 0) {
      return { statusCode: 409, headers, body: JSON.stringify({ error: 'Já existe um admin configurado.' }) };
    }

    const { data: userRes, error: userErr } = await admin.auth.admin.getUserById(requesterUserId);
    if (userErr) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: userErr.message }) };
    }

    const email = (userRes?.user?.email || '').trim();
    const usernameFromEmail = email ? email.split('@')[0] : 'admin';

    const { data: existingProfile, error: profErr } = await admin
      .from('profiles')
      .select('id, username, chart_mode')
      .eq('id', requesterUserId)
      .maybeSingle();

    if (profErr) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: profErr.message }) };
    }

    const payload = {
      id: requesterUserId,
      username: existingProfile?.username || usernameFromEmail,
      is_admin: true,
      chart_mode: existingProfile?.chart_mode || 'combo'
    };

    const { error: upErr } = await admin.from('profiles').upsert(payload, { onConflict: 'id' });

    if (upErr) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: upErr.message }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e?.message || 'Server error' }) };
  }
};
