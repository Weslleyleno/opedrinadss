const { createClient } = require('@supabase/supabase-js');

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
};

function json(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body ?? {}) };
}

function getBearerToken(event) {
  const raw = event.headers?.authorization || event.headers?.Authorization || '';
  const m = String(raw).match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return json(500, { error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment' });
  }

  const token = getBearerToken(event);
  if (!token) {
    return json(401, { error: 'Missing Authorization token' });
  }

  const admin = createClient(url, serviceRoleKey);

  let requesterId = '';
  try {
    const { data, error } = await admin.auth.getUser(token);
    if (error) return json(401, { error: error.message || 'Invalid token' });
    requesterId = data?.user?.id ? String(data.user.id) : '';
  } catch (e) {
    return json(401, { error: e?.message || 'Invalid token' });
  }

  if (!requesterId) {
    return json(401, { error: 'Invalid session' });
  }

  const { data: requesterProfile, error: requesterErr } = await admin
    .from('profiles')
    .select('id, is_admin')
    .eq('id', requesterId)
    .maybeSingle();

  if (requesterErr) {
    return json(500, { error: requesterErr.message });
  }

  if (!requesterProfile || requesterProfile.is_admin !== true) {
    return json(403, { error: 'Not authorized' });
  }

  if (event.httpMethod === 'GET') {
    try {
      const { data: usersList, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      if (listErr) return json(500, { error: listErr.message });

      const users = usersList?.users || [];
      const ids = users.map((u) => u.id).filter(Boolean);

      const { data: profs, error: profErr } = await admin
        .from('profiles')
        .select('id, username, is_admin')
        .in('id', ids);

      if (profErr) return json(500, { error: profErr.message });

      const profMap = new Map((profs || []).map((p) => [String(p.id), p]));

      const out = users
        .map((u) => {
          const id = String(u.id);
          const p = profMap.get(id);
          return {
            id,
            email: u.email || '',
            username: p?.username || (u.email ? String(u.email).split('@')[0] : ''),
            is_admin: Boolean(p?.is_admin),
            created_at: u.created_at || null,
            last_sign_in_at: u.last_sign_in_at || null
          };
        })
        .sort((a, b) => a.email.localeCompare(b.email));

      return json(200, { users: out });
    } catch (e) {
      return json(500, { error: e?.message || 'Server error' });
    }
  }

  let parsed = {};
  try {
    parsed = event.body ? JSON.parse(event.body) : {};
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }

  if (event.httpMethod === 'POST') {
    const email = typeof parsed.email === 'string' ? parsed.email.trim() : '';
    const password = typeof parsed.password === 'string' ? parsed.password : '';
    const isAdmin = parsed.is_admin === true;

    if (!email) return json(400, { error: 'Email is required' });
    if (!password) return json(400, { error: 'Password is required' });

    try {
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      });
      if (cErr) return json(500, { error: cErr.message });

      const userId = created?.user?.id ? String(created.user.id) : '';
      if (!userId) return json(500, { error: 'Failed to create user' });

      const username = email.includes('@') ? email.split('@')[0] : email;
      const { error: upErr } = await admin
        .from('profiles')
        .upsert({ id: userId, username, is_admin: isAdmin }, { onConflict: 'id' });

      if (upErr) return json(500, { error: upErr.message });

      return json(200, { ok: true, id: userId });
    } catch (e) {
      return json(500, { error: e?.message || 'Server error' });
    }
  }

  if (event.httpMethod === 'PUT') {
    const id = typeof parsed.id === 'string' ? parsed.id.trim() : '';
    const email = typeof parsed.email === 'string' ? parsed.email.trim() : '';
    const password = typeof parsed.password === 'string' ? parsed.password : '';
    const isAdmin = parsed.is_admin === true;

    if (!id) return json(400, { error: 'id is required' });
    if (id === requesterId && isAdmin === false) return json(400, { error: 'Você não pode remover seu próprio admin.' });

    try {
      const updatePayload = {};
      if (email) updatePayload.email = email;
      if (password) updatePayload.password = password;

      if (Object.keys(updatePayload).length) {
        const { error: uErr } = await admin.auth.admin.updateUserById(id, updatePayload);
        if (uErr) return json(500, { error: uErr.message });
      }

      if (email || typeof parsed.is_admin === 'boolean') {
        const username = email ? (email.includes('@') ? email.split('@')[0] : email) : undefined;
        const profilePatch = { id, is_admin: isAdmin };
        if (username) profilePatch.username = username;

        const { error: pErr } = await admin
          .from('profiles')
          .upsert(profilePatch, { onConflict: 'id' });

        if (pErr) return json(500, { error: pErr.message });
      }

      return json(200, { ok: true });
    } catch (e) {
      return json(500, { error: e?.message || 'Server error' });
    }
  }

  if (event.httpMethod === 'DELETE') {
    const id = typeof parsed.id === 'string' ? parsed.id.trim() : '';
    if (!id) return json(400, { error: 'id is required' });
    if (id === requesterId) return json(400, { error: 'Você não pode excluir seu próprio usuário.' });

    try {
      const { error: dErr } = await admin.auth.admin.deleteUser(id);
      if (dErr) return json(500, { error: dErr.message });
      return json(200, { ok: true });
    } catch (e) {
      return json(500, { error: e?.message || 'Server error' });
    }
  }

  return json(405, { error: 'Method not allowed' });
};
