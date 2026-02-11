const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    res.status(500).json({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment' });
    return;
  }

  let body = '';
  try {
    body = await new Promise((resolve, reject) => {
      let raw = '';
      req.on('data', (chunk) => {
        raw += chunk;
      });
      req.on('end', () => resolve(raw));
      req.on('error', reject);
    });
  } catch {
    res.status(400).json({ error: 'Invalid request body' });
    return;
  }

  let parsed;
  try {
    parsed = body ? JSON.parse(body) : {};
  } catch {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }

  const email = typeof parsed.email === 'string' ? parsed.email.trim() : '';
  const requesterUserId = typeof parsed.requesterUserId === 'string' ? parsed.requesterUserId.trim() : '';

  if (!email) {
    res.status(400).json({ error: 'Email is required' });
    return;
  }

  if (!requesterUserId) {
    res.status(400).json({ error: 'Missing requesterUserId' });
    return;
  }

  const admin = createClient(url, serviceRoleKey);

  try {
    const { data: requesterProfile, error: requesterErr } = await admin
      .from('profiles')
      .select('id, is_admin')
      .eq('id', requesterUserId)
      .maybeSingle();

    if (requesterErr) {
      res.status(500).json({ error: requesterErr.message });
      return;
    }

    if (!requesterProfile || requesterProfile.is_admin !== true) {
      res.status(403).json({ error: 'Not authorized' });
      return;
    }

    const { data: usersList, error: findUserErr } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200
    });

    if (findUserErr) {
      res.status(500).json({ error: findUserErr.message });
      return;
    }

    const found = (usersList?.users || []).find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
    if (!found) {
      res.status(404).json({ error: 'Usuário não encontrado no Auth' });
      return;
    }

    const { error: upErr } = await admin
      .from('profiles')
      .upsert({ id: found.id, username: found.email.split('@')[0], is_admin: true }, { onConflict: 'id' });

    if (upErr) {
      res.status(500).json({ error: upErr.message });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Server error' });
  }
};
