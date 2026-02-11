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

  const requesterUserId = typeof parsed.requesterUserId === 'string' ? parsed.requesterUserId.trim() : '';
  if (!requesterUserId) {
    res.status(400).json({ error: 'Missing requesterUserId' });
    return;
  }

  const admin = createClient(url, serviceRoleKey);

  try {
    const { data: anyAdmin, error: anyAdminErr } = await admin
      .from('profiles')
      .select('id')
      .eq('is_admin', true)
      .limit(1);

    if (anyAdminErr) {
      res.status(500).json({ error: anyAdminErr.message });
      return;
    }

    if (anyAdmin && anyAdmin.length > 0) {
      res.status(409).json({ error: 'Já existe um admin configurado.' });
      return;
    }

    const { data: userRes, error: userErr } = await admin.auth.admin.getUserById(requesterUserId);
    if (userErr) {
      res.status(500).json({ error: userErr.message });
      return;
    }

    const email = (userRes?.user?.email || '').trim();
    const usernameFromEmail = email ? email.split('@')[0] : 'admin';

    const { data: existingProfile, error: profErr } = await admin
      .from('profiles')
      .select('id, username, chart_mode')
      .eq('id', requesterUserId)
      .maybeSingle();

    if (profErr) {
      res.status(500).json({ error: profErr.message });
      return;
    }

    const payload = {
      id: requesterUserId,
      username: existingProfile?.username || usernameFromEmail,
      is_admin: true,
      chart_mode: existingProfile?.chart_mode || 'combo'
    };

    const { error: upErr } = await admin
      .from('profiles')
      .upsert(payload, { onConflict: 'id' });

    if (upErr) {
      res.status(500).json({ error: upErr.message });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Server error' });
  }
};
