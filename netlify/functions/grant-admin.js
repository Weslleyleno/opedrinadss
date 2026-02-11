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

  const email = typeof parsed.email === 'string' ? parsed.email.trim() : '';
  const requesterUserId = typeof parsed.requesterUserId === 'string' ? parsed.requesterUserId.trim() : '';

  if (!email) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Email is required' }) };
  }

  if (!requesterUserId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing requesterUserId' }) };
  }

  const admin = createClient(url, serviceRoleKey);

  try {
    const { data: requesterProfile, error: requesterErr } = await admin
      .from('profiles')
      .select('id, is_admin')
      .eq('id', requesterUserId)
      .maybeSingle();

    if (requesterErr) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: requesterErr.message }) };
    }

    if (!requesterProfile || requesterProfile.is_admin !== true) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Not authorized' }) };
    }

    const { data: usersList, error: findUserErr } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200
    });

    if (findUserErr) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: findUserErr.message }) };
    }

    const found = (usersList?.users || []).find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
    if (!found) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Usuário não encontrado no Auth' }) };
    }

    const { error: upErr } = await admin
      .from('profiles')
      .upsert({ id: found.id, username: found.email.split('@')[0], is_admin: true }, { onConflict: 'id' });

    if (upErr) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: upErr.message }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e?.message || 'Server error' }) };
  }
};
