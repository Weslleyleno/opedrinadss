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

function qp(event, key) {
  const q = event.queryStringParameters || {};
  const v = q[key];
  return typeof v === 'string' ? v.trim() : '';
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

  if (requesterErr) return json(500, { error: requesterErr.message });
  if (!requesterProfile || requesterProfile.is_admin !== true) return json(403, { error: 'Not authorized' });

  let parsed = {};
  if (event.httpMethod !== 'GET') {
    try {
      parsed = event.body ? JSON.parse(event.body) : {};
    } catch {
      return json(400, { error: 'Invalid JSON body' });
    }
  }

  const targetUserId = (event.httpMethod === 'GET' ? qp(event, 'target_user_id') : (typeof parsed.target_user_id === 'string' ? parsed.target_user_id.trim() : ''));
  if (!targetUserId) return json(400, { error: 'target_user_id is required' });

  if (event.httpMethod === 'GET') {
    const from = qp(event, 'from');
    const to = qp(event, 'to');

    try {
      let query = admin
        .from('operations')
        .select('id, user_id, op_date, profit, operational_cost, result, note, created_at')
        .eq('user_id', targetUserId)
        .order('op_date', { ascending: true });

      if (from) query = query.gte('op_date', from);
      if (to) query = query.lte('op_date', to);

      const { data, error } = await query;
      if (error) return json(500, { error: error.message });
      return json(200, { rows: data || [] });
    } catch (e) {
      return json(500, { error: e?.message || 'Server error' });
    }
  }

  if (event.httpMethod === 'POST') {
    const op_date = typeof parsed.op_date === 'string' ? parsed.op_date.trim() : '';
    const profit = parsed.profit;
    const operational_cost = parsed.operational_cost;
    const result = parsed.result;
    const note = typeof parsed.note === 'string' ? parsed.note : '';

    if (!op_date) return json(400, { error: 'op_date is required' });

    try {
      const { data, error } = await admin
        .from('operations')
        .insert({
          user_id: targetUserId,
          op_date,
          profit,
          operational_cost,
          result,
          note
        })
        .select('id, user_id, op_date, profit, operational_cost, result, note, created_at')
        .single();

      if (error) return json(500, { error: error.message });
      return json(200, { ok: true, row: data });
    } catch (e) {
      return json(500, { error: e?.message || 'Server error' });
    }
  }

  if (event.httpMethod === 'PUT') {
    const id = typeof parsed.id === 'string' ? parsed.id.trim() : '';
    const op_date = typeof parsed.op_date === 'string' ? parsed.op_date.trim() : '';
    const profit = parsed.profit;
    const operational_cost = parsed.operational_cost;
    const result = parsed.result;
    const note = typeof parsed.note === 'string' ? parsed.note : '';

    if (!id) return json(400, { error: 'id is required' });
    if (!op_date) return json(400, { error: 'op_date is required' });

    try {
      const { data: existing, error: exErr } = await admin
        .from('operations')
        .select('id, user_id')
        .eq('id', id)
        .maybeSingle();

      if (exErr) return json(500, { error: exErr.message });
      if (!existing) return json(404, { error: 'Operation not found' });
      if (String(existing.user_id) !== String(targetUserId)) return json(400, { error: 'Operation does not belong to target_user_id' });

      const { data, error } = await admin
        .from('operations')
        .update({ op_date, profit, operational_cost, result, note })
        .eq('id', id)
        .select('id, user_id, op_date, profit, operational_cost, result, note, created_at')
        .single();

      if (error) return json(500, { error: error.message });
      return json(200, { ok: true, row: data });
    } catch (e) {
      return json(500, { error: e?.message || 'Server error' });
    }
  }

  if (event.httpMethod === 'DELETE') {
    const id = typeof parsed.id === 'string' ? parsed.id.trim() : '';
    if (!id) return json(400, { error: 'id is required' });

    try {
      const { data: existing, error: exErr } = await admin
        .from('operations')
        .select('id, user_id')
        .eq('id', id)
        .maybeSingle();

      if (exErr) return json(500, { error: exErr.message });
      if (!existing) return json(404, { error: 'Operation not found' });
      if (String(existing.user_id) !== String(targetUserId)) return json(400, { error: 'Operation does not belong to target_user_id' });

      const { error } = await admin
        .from('operations')
        .delete()
        .eq('id', id);

      if (error) return json(500, { error: error.message });
      return json(200, { ok: true });
    } catch (e) {
      return json(500, { error: e?.message || 'Server error' });
    }
  }

  return json(405, { error: 'Method not allowed' });
};
