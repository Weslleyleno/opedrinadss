let sb;
var currentSession = null;
var currentProfile = null;
var __selectedAvatarId = 'crown';
var __rankingFiltersTouched = false;
var __rankingFiltersInitialized = false;
var __opsFiltersTouched = false;
var __opsFiltersInitialized = false;
var __presenceChannel = null;
var __onlineUserIds = new Set();
var __presenceStatus = 'OFF';
var __lastRankingData = [];
var __lastRankingYm = '';
var __lastCreativeStatuses = [];
var __creativeStatusColorMap = {};
var __supabaseInitPromise = null;
var __genRows = [];
var __viaCepCache = new Map();
var __genStorageKey = 'opedrin_data_gen_v1';
var __themeStorageKey = 'opedrin_theme_v1';

var __addressPool = [
  { cep: '65095683', rua: 'Rua Vinícius de Aquino', bairro: 'Cidade Olímpica' },
  { cep: '01001000', rua: 'Praça da Sé', bairro: 'Sé' },
  { cep: '01310930', rua: 'Avenida Paulista', bairro: 'Bela Vista' },
  { cep: '30140071', rua: 'Rua dos Aimorés', bairro: 'Boa Viagem' },
  { cep: '20040002', rua: 'Rua da Assembleia', bairro: 'Centro' },
  { cep: '40010000', rua: 'Avenida Sete de Setembro', bairro: 'Centro' },
  { cep: '70040900', rua: 'Praça dos Três Poderes', bairro: 'Zona Cívico-Administrativa' },
  { cep: '80010000', rua: 'Rua XV de Novembro', bairro: 'Centro' },
  { cep: '60060000', rua: 'Rua Barão do Rio Branco', bairro: 'Centro' },
  { cep: '69005010', rua: 'Avenida Eduardo Ribeiro', bairro: 'Centro' },
  { cep: '88010001', rua: 'Rua Felipe Schmidt', bairro: 'Centro' },
  { cep: '64000010', rua: 'Rua Coelho Rodrigues', bairro: 'Centro' },
  { cep: '59010000', rua: 'Avenida Deodoro da Fonseca', bairro: 'Cidade Alta' },
  { cep: '30110921', rua: 'Avenida Afonso Pena', bairro: 'Centro' },
  { cep: '04547006', rua: 'Rua Funchal', bairro: 'Vila Olímpia' },
  { cep: '20710041', rua: 'Rua José Loureiro', bairro: 'Centro' },
  { cep: '29101403', rua: 'Rua Santa Luzia', bairro: 'Praia da Costa' },
  { cep: '50010010', rua: 'Rua do Imperador Dom Pedro II', bairro: 'Santo Antônio' },
  { cep: '40020000', rua: 'Rua Chile', bairro: 'Centro' },
  { cep: '88015000', rua: 'Rua Bocaiúva', bairro: 'Centro' }
];

// Anti-spam para evitar rate limit (429) no Supabase Auth
var __lastSignupAttemptAt = 0;
var __signupCooldownMs = 60 * 1000;

// Travas para evitar cliques múltiplos / corrida com onAuthStateChange
var __authInFlight = false;
var __handlingSessionUserId = '';
var __loginInFlight = false;
var __authedUserId = '';

const el = (id) => document.getElementById(id);

async function initSupabaseFromServer() {
  if (sb) return sb;
  if (__supabaseInitPromise) return __supabaseInitPromise;

  __supabaseInitPromise = (async () => {
    const res = await fetch('/api/config', { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error || 'Falha ao carregar /api/config');
    }

    const supabaseUrl = String(data?.supabaseUrl || '').trim();
    const supabaseAnonKey = String(data?.supabaseAnonKey || '').trim();
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Config inválida do Supabase');
    }

    const factory = window?.supabase?.createClient;
    if (typeof factory !== 'function') {
      throw new Error('Supabase JS não carregou (window.supabase.createClient)');
    }

    sb = factory(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });

    return sb;
  })();

  try {
    return await __supabaseInitPromise;
  } finally {
    __supabaseInitPromise = null;
  }
}

window.addEventListener('error', (ev) => {
  try {
    const msg = ev?.error?.message || ev?.message || 'Erro inesperado';
    showAlert('authAlert', msg);
  } catch {
    // ignore
  }
});

window.addEventListener('unhandledrejection', (ev) => {
  try {
    const msg = ev?.reason?.message || String(ev?.reason || 'Promise rejeitada');
    showAlert('authAlert', msg);
  } catch {
    // ignore
  }
});

const AVATARS = [
  { id: 'p_01' },
  { id: 'p_02' },
  { id: 'p_03' },
  { id: 'p_04' },
  { id: 'p_05' },
  { id: 'p_06' },
  { id: 'p_07' },
  { id: 'p_08' },
  { id: 'p_09' },
  { id: 'p_10' },
  { id: 'p_11' },
  { id: 'p_12' },
  { id: 'p_13' },
  { id: 'p_14' },
  { id: 'p_15' },
  { id: 'p_16' },
  { id: 'p_17' },
  { id: 'p_18' },
  { id: 'p_19' },
  { id: 'p_20' },
  { id: 'p_21' },
  { id: 'p_22' },
  { id: 'p_23' },
  { id: 'p_24' }
];

function avatarIdOrDefault(id) {
  const found = AVATARS.find(a => a.id === id);
  return (found ? found.id : AVATARS[0].id);
}

function avatarUrlById(id) {
  const seed = avatarIdOrDefault(id);
  return `https://api.dicebear.com/8.x/bottts/svg?seed=${encodeURIComponent(seed)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf&radius=50&size=200`;
}

function normalizeUsername(raw) {
  const s = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9_.-]/g, '');
  return s.slice(0, 24);
}

function showAlert(targetId, message) {
  const box = el(targetId);
  if (!box) return;
  box.textContent = message;
  box.style.display = 'block';
}

function setHint(targetId, message) {
  const box = el(targetId);
  if (!box) return;
  box.textContent = message || '';
}

function hideAlert(targetId) {
  const box = el(targetId);
  if (!box) return;
  box.style.display = 'none';
  box.textContent = '';
}

function safeUrl(u) {
  const s = String(u || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}

function escapeHtml(raw) {
  return String(raw ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function loadResources() {
  const { data, error } = await sb
    .from('resources')
    .select('id, title, url, description, updated_at')
    .order('updated_at', { ascending: false });

  if (error) {
    const status = Number(error.status || 0);
    const msg = String(error.message || '');
    // Se a tabela não existe (404), não quebra a aplicação.
    if (status === 404 || /not found/i.test(msg)) {
      return [];
    }
    throw error;
  }
  return data || [];
}

function renderResources(rows) {
  const root = el('resourcesList');
  if (!root) return;
  const items = (rows || []).map((r) => {
    const title = String(r.title || '').trim();
    const desc = String(r.description || '').trim();
    const url = String(r.url || '').trim();
    const link = url ? `<a class="res-link" href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer">Abrir link</a>` : '';
    return `
      <div class="res-row">
        <div class="res-left">
          <div class="res-title">${escapeHtml(title)}</div>
          <div class="res-desc">${escapeHtml(desc)}</div>
          ${link}
        </div>
        <div class="res-actions">
          <button class="btn btn-ghost" data-res-action="edit" data-res-id="${r.id}" type="button">Editar</button>
          <button class="btn btn-ghost" data-res-action="del" data-res-id="${r.id}" type="button">Excluir</button>
        </div>
      </div>
    `;
  }).join('');
  root.innerHTML = items || '<div class="muted">Sem recursos ainda.</div>';
}

function clearResourceForm() {
  const idEl = el('resEditingId');
  const t = el('resTitle');
  const u = el('resUrl');
  const d = el('resDesc');
  if (idEl) idEl.value = '';
  if (t) t.value = '';
  if (u) u.value = '';
  if (d) d.value = '';
  setHint('resHint', '');
}

async function refreshResources() {
  const rows = await loadResources();
  renderResources(rows);
  return rows;
}

async function loadCreativeStatuses() {
  const { data, error } = await sb
    .from('creative_statuses')
    .select('id, name, color, sort_order, updated_at')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  return data || [];
}

function renderCreativeStatuses(rows) {
  const root = el('creativeStatusesList');
  if (!root) return;

  const canEdit = Boolean(currentProfile?.is_admin);

  const header = `
    <div class="table-row header">
      <div>Status</div>
      <div>Cor</div>
      ${canEdit ? '<div>Ações</div>' : ''}
    </div>
  `;

  const body = (rows || []).map((r) => {
    const name = String(r.name || '').trim();
    const color = String(r.color || '#22c55e').trim();
    const swatch = `<span class="badge" style="background:${color}; border-color:${color};">${escapeHtml(color)}</span>`;

    const actions = canEdit
      ? `
        <div class="row">
          <button class="btn btn-ghost" data-cs-action="edit" data-cs-id="${r.id}" type="button">Editar</button>
          <button class="btn btn-ghost" data-cs-action="del" data-cs-id="${r.id}" type="button">Excluir</button>
        </div>
      `
      : '';

    return `
      <div class="table-row">
        <div>${escapeHtml(name)}</div>
        <div>${swatch}</div>
        ${actions}
      </div>
    `;
  }).join('');

  root.innerHTML = header + (body || '<div class="muted" style="padding:10px 0;">Sem status ainda.</div>');
}

function populateCreativeStatusSelect(rows) {
  const sel = el('creativeStatus');
  if (!sel) return;
  const items = (rows || [])
    .map((r) => ({
      name: String(r.name || '').trim(),
      color: String(r.color || '').trim()
    }))
    .filter((x) => x.name);

  const unique = [];
  const seen = new Set();
  for (const x of items) {
    const key = x.name;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(x);
  }

  const opts = unique.length
    ? unique.map((x) => `<option value="${escapeHtml(x.name)}" data-color="${escapeHtml(x.color || '')}">${escapeHtml(x.name)}</option>`).join('')
    : `<option value="Disponível" data-color="#22c55e">Disponível</option>`;
  sel.innerHTML = opts;
  updateCreativeStatusSelectUI();
}

function statusColorByName(name) {
  const key = String(name || '').trim();
  const c = __creativeStatusColorMap?.[key];
  return String(c || '').trim() || '';
}

function updateCreativeStatusSelectUI() {
  const sel = el('creativeStatus');
  if (!sel) return;
  const opt = sel.options?.[sel.selectedIndex];
  const color = opt?.getAttribute?.('data-color') || statusColorByName(sel.value) || '';
  const c = String(color || '').trim();
  sel.style.borderLeft = c ? `10px solid ${c}` : '';
  sel.style.paddingLeft = c ? '10px' : '';
}

async function refreshCreativeStatuses() {
  try {
    const rows = await loadCreativeStatuses();
    __lastCreativeStatuses = rows || [];
    __creativeStatusColorMap = (rows || []).reduce((acc, r) => {
      const n = String(r?.name || '').trim();
      const c = String(r?.color || '').trim();
      if (n) acc[n] = c;
      return acc;
    }, {});
    renderCreativeStatuses(rows);
    populateCreativeStatusSelect(rows);
    try {
      if (Array.isArray(window.__lastCreativesRows) && window.__lastCreativesRows.length) {
        renderCreatives(window.__lastCreativesRows);
      }
    } catch {
      // ignore
    }
    return rows;
  } catch (e) {
    __lastCreativeStatuses = [];
    __creativeStatusColorMap = {};
    renderCreativeStatuses([]);
    populateCreativeStatusSelect([]);
    setHint('creativeStatusHint', e?.message || 'Erro ao carregar status.');
    return [];
  }
}

function clearCreativeStatusForm() {
  const idEl = el('creativeStatusEditingId');
  const n = el('creativeStatusName');
  const c = el('creativeStatusColor');
  if (idEl) idEl.value = '';
  if (n) n.value = '';
  if (c) c.value = '#22c55e';
  setHint('creativeStatusHint', '');
}

async function loadCreatives() {
  const { data, error } = await sb
    .from('creatives')
    .select('id, token, status, description, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function loadProxies() {
  const { data, error } = await sb
    .from('proxies')
    .select('id, name, proxy, updated_at')
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false });
  if (error) throw error;
  return data || [];
}

function renderProxies(rows) {
  const root = el('proxiesList');
  if (!root) return;

  const header = `
    <div class="table-row header">
      <div>Nome</div>
      <div>Proxy</div>
      <div>Ações</div>
    </div>
  `;

  const body = (rows || []).map((r) => {
    const name = String(r.name || '').trim();
    const proxy = String(r.proxy || '').trim();
    return `
      <div class="table-row">
        <div>${escapeHtml(name)}</div>
        <div class="muted" style="word-break: break-word;">${escapeHtml(proxy)}</div>
        <div class="row">
          <button class="btn btn-secondary" data-proxy-action="edit" data-proxy-id="${r.id}" type="button">Editar</button>
          <button class="btn" data-proxy-action="del" data-proxy-id="${r.id}" type="button">Excluir</button>
        </div>
      </div>
    `;
  }).join('');

  root.innerHTML = header + (body || '<div class="muted" style="padding:10px 0;">Sem proxies ainda.</div>');
}

async function refreshProxies() {
  try {
    const rows = await loadProxies();
    renderProxies(rows);
    return rows;
  } catch (e) {
    renderProxies([]);
    setHint('proxyHint', e?.message || 'Erro ao carregar proxies.');
    return [];
  }
}

function clearProxyForm() {
  const idEl = el('proxyEditingId');
  const n = el('proxyName');
  const p = el('proxyValue');
  if (idEl) idEl.value = '';
  if (n) n.value = '';
  if (p) p.value = '';
  setHint('proxyHint', '');
}

function randomItem(arr) {
  const a = arr || [];
  if (!a.length) return '';
  return a[Math.floor(Math.random() * a.length)];
}

function onlyDigits(s) {
  return String(s || '').replace(/\D+/g, '');
}

function cpfCheckDigit(nums, factor) {
  let sum = 0;
  for (let i = 0; i < nums.length; i++) {
    sum += nums[i] * (factor - i);
  }
  const mod = sum % 11;
  return mod < 2 ? 0 : 11 - mod;
}

function generateCPF() {
  const base = [];
  for (let i = 0; i < 9; i++) base.push(Math.floor(Math.random() * 10));
  const d1 = cpfCheckDigit(base, 10);
  const d2 = cpfCheckDigit([...base, d1], 11);
  return [...base, d1, d2].join('');
}

function formatCPF(cpfDigits) {
  const d = onlyDigits(cpfDigits);
  if (d.length !== 11) return String(cpfDigits || '');
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

function formatCEP(cepDigits) {
  const d = onlyDigits(cepDigits);
  if (d.length !== 8) return String(cepDigits || '');
  return `${d.slice(0, 5)}-${d.slice(5, 8)}`;
}

function normalizeForEmail(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '');
}

function generateEmailFromName(name) {
  const domains = ['unifesp.br', 'gmail.com', 'outlook.com', 'hotmail.com'];
  const local = normalizeForEmail(name) || 'user';
  return `${local}${Math.floor(Math.random() * 900 + 100)}@${randomItem(domains)}`;
}

function generateName() {
  const first = [
    'Ana', 'Beatriz', 'Bruna', 'Camila', 'Carla', 'Daniela', 'Eduarda', 'Fernanda', 'Gabriela', 'Helena',
    'Isabela', 'Julia', 'Larissa', 'Leticia', 'Luana', 'Mariana', 'Natalia', 'Patricia', 'Rafaela', 'Sofia',
    'Andre', 'Bruno', 'Caio', 'Carlos', 'Diego', 'Eduardo', 'Felipe', 'Gabriel', 'Gustavo', 'Henrique',
    'Igor', 'Joao', 'Lucas', 'Mateus', 'Pedro', 'Rafael', 'Rodrigo', 'Thiago', 'Vitor', 'William'
  ];
  const last = [
    'Silva', 'Santos', 'Oliveira', 'Souza', 'Lima', 'Pereira', 'Ferreira', 'Almeida', 'Costa', 'Gomes',
    'Ribeiro', 'Carvalho', 'Lopes', 'Barbosa', 'Rocha', 'Dias', 'Martins', 'Araujo', 'Melo', 'Cardoso'
  ];
  const a = randomItem(first);
  const b = randomItem(last);
  const c = Math.random() < 0.45 ? randomItem(last) : '';
  return [a, b, c].filter(Boolean).join(' ');
}

async function viaCepLookup(cep) {
  const digits = onlyDigits(cep);
  if (digits.length !== 8) return null;
  if (__viaCepCache.has(digits)) return __viaCepCache.get(digits);
  const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`, { cache: 'no-store' });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!data || data.erro) return null;
  const out = {
    cep: digits,
    rua: String(data.logradouro || '').trim(),
    bairro: String(data.bairro || '').trim(),
    cidade: String(data.localidade || '').trim(),
    uf: String(data.uf || '').trim()
  };
  __viaCepCache.set(digits, out);
  return out;
}

async function generateAddress() {
  const pick = randomItem(__addressPool);
  if (pick?.cep && pick?.rua && pick?.bairro) return { ...pick };
  throw new Error('ENDERECO_POOL_VAZIO');
}

async function generateDataRow() {
  const nome = generateName();
  const cpf = generateCPF();
  const email = generateEmailFromName(nome);
  const addr = await generateAddress();
  return {
    nome,
    cpf,
    email,
    cep: addr.cep,
    rua: addr.rua,
    bairro: addr.bairro
  };
}

function renderDataGenTable(rows) {
  const root = el('dataGenTable');
  if (!root) return;

  const header = `
    <div class="table-row header">
      <div>N°</div>
      <div>Nome</div>
      <div>CPF</div>
      <div>Email</div>
      <div>CEP</div>
      <div>Rua</div>
      <div>Bairro</div>
      <div>Ações</div>
    </div>
  `;

  const body = (rows || []).map((r, idx) => {
    const cpfFmt = formatCPF(r.cpf);
    const cepFmt = formatCEP(r.cep);
    const line = [r.nome, cpfFmt, r.email, cepFmt, r.rua, r.bairro].join(' | ');
    return `
      <div class="table-row" data-gen-idx="${idx}">
        <div class="muted">${idx + 1}</div>
        <div class="cell-copy" data-copy="${escapeHtml(r.nome || '')}">${escapeHtml(r.nome || '')}</div>
        <div class="muted cell-copy" data-copy="${escapeHtml(cpfFmt || '')}">${escapeHtml(cpfFmt || '')}</div>
        <div class="muted cell-copy" data-copy="${escapeHtml(r.email || '')}" style="word-break: break-word;">${escapeHtml(r.email || '')}</div>
        <div class="muted cell-copy" data-copy="${escapeHtml(cepFmt || '')}">${escapeHtml(cepFmt || '')}</div>
        <div class="muted cell-copy" data-copy="${escapeHtml(r.rua || '')}" style="word-break: break-word;">${escapeHtml(r.rua || '')}</div>
        <div class="muted cell-copy" data-copy="${escapeHtml(r.bairro || '')}">${escapeHtml(r.bairro || '')}</div>
        <div class="row">
          <button class="btn btn-secondary" data-gen-action="copy" data-gen-line="${escapeHtml(line)}" type="button">Copiar</button>
        </div>
      </div>
    `;
  }).join('');

  root.innerHTML = header + (body || '<div class="muted" style="padding:10px 0;">Sem dados ainda.</div>');
}

function downloadText(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function exportGenCsv(rows) {
  const safe = (v) => {
    const s = String(v ?? '');
    if (/[\n",;]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
    return s;
  };
  const header = ['nome', 'cpf', 'email', 'cep', 'rua', 'bairro'];
  const lines = [header.join(',')];
  for (const r of (rows || [])) {
    lines.push([
      safe(r.nome),
      safe(formatCPF(r.cpf)),
      safe(r.email),
      safe(formatCEP(r.cep)),
      safe(r.rua),
      safe(r.bairro)
    ].join(','));
  }
  downloadText('dados.csv', lines.join('\n'));
}

function saveGenToStorage() {
  try {
    const payload = {
      v: 1,
      qty: Number(el('genQty')?.value) || 2,
      rows: __genRows || [],
      savedAt: Date.now()
    };
    localStorage.setItem(__genStorageKey, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

function loadGenFromStorage() {
  try {
    const raw = localStorage.getItem(__genStorageKey);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1) return;
    const qty = Number(data.qty) || 2;
    const rows = Array.isArray(data.rows) ? data.rows : [];
    __genRows = rows;
    if (el('genQty')) el('genQty').value = String(qty);
  } catch {
    // ignore
  }
}

function clearGenStorage() {
  try {
    localStorage.removeItem(__genStorageKey);
  } catch {
    // ignore
  }
}

async function mapWithConcurrency(items, limit, mapper) {
  const arr = items || [];
  const out = new Array(arr.length);
  let idx = 0;
  const workers = new Array(Math.max(1, Math.min(limit || 4, arr.length))).fill(0).map(async () => {
    while (idx < arr.length) {
      const i = idx++;
      out[i] = await mapper(arr[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

async function copyToClipboard(text) {
  const t = String(text ?? '');
  if (!t) return;
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(t);
      return;
    }
  } catch {
    // ignore
  }

  try {
    const ta = document.createElement('textarea');
    ta.value = t;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  } catch {
    // ignore
  }
}

function renderCreatives(rows) {
  const root = el('creativesList');
  if (!root) return;

  const header = `
    <div class="table-row header">
      <div>Token</div>
      <div>Status</div>
      <div>Descrição</div>
      <div>Ações</div>
    </div>
  `;

  const body = (rows || []).map((r) => {
    const token = String(r.token || '').trim();
    const status = String(r.status || '').trim();
    const desc = String(r.description || '').trim();

    const c = statusColorByName(status);
    const statusHtml = c
      ? `<span class="badge" style="background:${c}; border-color:${c};">${escapeHtml(status)}</span>`
      : `${escapeHtml(status)}`;
    return `
      <div class="table-row">
        <div class="muted" style="word-break: break-word;">${escapeHtml(token)}</div>
        <div>${statusHtml}</div>
        <div class="muted">${escapeHtml(desc)}</div>
        <div class="row">
          <button class="btn btn-secondary" data-creative-action="edit" data-creative-id="${r.id}" type="button">Editar</button>
          <button class="btn" data-creative-action="del" data-creative-id="${r.id}" type="button">Excluir</button>
        </div>
      </div>
    `;
  }).join('');

  root.innerHTML = header + (body || '<div class="muted" style="padding:10px 0;">Sem criativos ainda.</div>');
}

async function refreshCreatives() {
  try {
    const rows = await loadCreatives();
    try { window.__lastCreativesRows = rows || []; } catch {}
    renderCreatives(rows);
    return rows;
  } catch (e) {
    try { window.__lastCreativesRows = []; } catch {}
    renderCreatives([]);
    setHint('creativeHint', e?.message || 'Erro ao carregar criativos.');
    return [];
  }
}

function clearCreativeForm() {
  const idEl = el('creativeEditingId');
  const t = el('creativeToken');
  const s = el('creativeStatus');
  const d = el('creativeDesc');
  if (idEl) idEl.value = '';
  if (t) t.value = '';
  if (s) s.value = (s.options?.[0]?.value || 'Disponível');
  if (d) d.value = '';
  setHint('creativeHint', '');
}

function brl(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'R$ 0,00';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function monthRange(yyyyMm) {
  const raw = String(yyyyMm || '').trim();
  const m = raw.match(/^([0-9]{4})-([0-9]{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || mo < 1 || mo > 12) return null;
  const start = new Date(y, mo - 1, 1);
  const end = new Date(y, mo, 0);
  const toISO = (d) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };
  return { start: toISO(start), end: toISO(end) };
}

function isoFromYmd(y, m1to12, d) {
  const yyyy = String(y);
  const mm = String(m1to12).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function daysInMonth(y, m1to12) {
  return new Date(y, m1to12, 0).getDate();
}

function monthLabelPt(m1to12) {
  const labels = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  return labels[(Number(m1to12) || 1) - 1] || String(m1to12);
}

function selectedOpsRange() {
  const y = Number(el('opsYear')?.value);
  const m = Number(el('opsMonth')?.value);
  const dayRaw = (el('opsDay')?.value || '').trim();
  if (!y || !m) return null;

  if (!dayRaw || dayRaw === 'all') {
    const r = monthStartEndISO(new Date(y, m - 1, 1));
    return { start: r.start, end: r.end, y, m, day: null };
  }

  const d = Number(dayRaw);
  if (!d) return null;
  const iso = isoFromYmd(y, m, d);
  return { start: iso, end: iso, y, m, day: d };
}

function refreshOpsDayOptions() {
  const daySel = el('opsDay');
  const y = Number(el('opsYear')?.value);
  const m = Number(el('opsMonth')?.value);
  if (!daySel || !y || !m) return;

  const prev = (daySel.value || 'all').trim() || 'all';
  const count = daysInMonth(y, m);
  const opts = [`<option value="all">Todos os dias</option>`];
  for (let d = 1; d <= count; d++) opts.push(`<option value="${d}">${String(d).padStart(2, '0')}</option>`);
  daySel.innerHTML = opts.join('');

  if (prev === 'all') daySel.value = 'all';
  else {
    const pd = Number(prev);
    daySel.value = pd && pd <= count ? String(pd) : 'all';
  }
}

function populateOpsFilters() {
  const yearSel = el('opsYear');
  const monthSel = el('opsMonth');
  const daySel = el('opsDay');
  if (!yearSel || !monthSel || !daySel) return;

  const now = new Date();
  const yNow = now.getFullYear();
  const mNow = now.getMonth() + 1;

  if (!yearSel.options.length) {
    const years = [];
    for (let y = yNow - 2; y <= yNow + 1; y++) years.push(y);
    yearSel.innerHTML = years.map((y) => `<option value="${y}">${y}</option>`).join('');
  }
  if (!monthSel.options.length) {
    const months = [];
    for (let m = 1; m <= 12; m++) months.push(`<option value="${m}">${monthLabelPt(m)}</option>`);
    monthSel.innerHTML = months.join('');
  }

  if (!__opsFiltersInitialized) {
    yearSel.value = String(yNow);
    monthSel.value = String(mNow);
    refreshOpsDayOptions();
    daySel.value = String(now.getDate());
    __opsFiltersInitialized = true;
  } else {
    if (!yearSel.value) yearSel.value = String(yNow);
    if (!monthSel.value) monthSel.value = String(mNow);
    refreshOpsDayOptions();
    if (!daySel.value) daySel.value = 'all';
  }
}

function setOpsFiltersToNow() {
  const yearSel = el('opsYear');
  const monthSel = el('opsMonth');
  const daySel = el('opsDay');
  if (!yearSel || !monthSel || !daySel) return;

  const now = new Date();
  yearSel.value = String(now.getFullYear());
  monthSel.value = String(now.getMonth() + 1);
  refreshOpsDayOptions();
  daySel.value = String(now.getDate());
}

function syncHiddenOpsRangeInputs() {
  const r = selectedOpsRange();
  const fromEl = el('filterFrom');
  const toEl = el('filterTo');
  if (!fromEl || !toEl) return;

  if (!r) {
    const today = todayISO();
    fromEl.value = today;
    toEl.value = today;
    return;
  }

  fromEl.value = r.start;
  toEl.value = r.end;
}

function sumNums(arr, key) {
  return (arr || []).reduce((acc, x) => acc + toNumber(x?.[key]), 0);
}

function clamp01(n) {
  return Math.max(0, Math.min(1, Number(n) || 0));
}

function setText(id, txt) {
  const node = el(id);
  if (node) node.textContent = txt;
}

function selectedRankingRange() {
  const y = Number(el('rankingYear')?.value);
  const m = Number(el('rankingMonth')?.value);
  const dayRaw = (el('rankingDay')?.value || '').trim();
  if (!y || !m) return null;

  if (!dayRaw || dayRaw === 'all') {
    const r = monthStartEndISO(new Date(y, m - 1, 1));
    return { start: r.start, end: r.end, y, m, day: null, isSingleDay: false };
  }

  const d = Number(dayRaw);
  if (!d) return null;
  const iso = isoFromYmd(y, m, d);
  return { start: iso, end: iso, y, m, day: d, isSingleDay: true };
}

function refreshRankingDayOptions() {
  const daySel = el('rankingDay');
  const y = Number(el('rankingYear')?.value);
  const m = Number(el('rankingMonth')?.value);
  if (!daySel || !y || !m) return;

  const prev = (daySel.value || 'all').trim() || 'all';
  const count = daysInMonth(y, m);

  const opts = [`<option value="all">Todos os dias</option>`];
  for (let d = 1; d <= count; d++) {
    opts.push(`<option value="${d}">${String(d).padStart(2, '0')}</option>`);
  }
  daySel.innerHTML = opts.join('');

  if (prev === 'all') {
    daySel.value = 'all';
  } else {
    const pd = Number(prev);
    daySel.value = pd && pd <= count ? String(pd) : 'all';
  }
}

function populateRankingFilters() {
  const yearSel = el('rankingYear');
  const monthSel = el('rankingMonth');
  const daySel = el('rankingDay');
  if (!yearSel || !monthSel || !daySel) return;

  const now = new Date();
  const yNow = now.getFullYear();
  const mNow = now.getMonth() + 1;

  if (!yearSel.options.length) {
    const years = [];
    for (let y = yNow - 2; y <= yNow + 1; y++) years.push(y);
    yearSel.innerHTML = years.map((y) => `<option value="${y}">${y}</option>`).join('');
  }

  if (!monthSel.options.length) {
    const months = [];
    for (let m = 1; m <= 12; m++) {
      months.push(`<option value="${m}">${monthLabelPt(m)}</option>`);
    }
    monthSel.innerHTML = months.join('');
  }

  if (!__rankingFiltersInitialized) {
    yearSel.value = String(yNow);
    monthSel.value = String(mNow);
    __rankingFiltersInitialized = true;
  } else {
    if (!yearSel.value) yearSel.value = String(yNow);
    if (!monthSel.value) monthSel.value = String(mNow);
  }

  refreshRankingDayOptions();
  if (!daySel.value) daySel.value = 'all';
}

function setRankingFiltersToNow() {
  const yearSel = el('rankingYear');
  const monthSel = el('rankingMonth');
  const daySel = el('rankingDay');
  if (!yearSel || !monthSel || !daySel) return;

  const now = new Date();
  yearSel.value = String(now.getFullYear());
  monthSel.value = String(now.getMonth() + 1);
  refreshRankingDayOptions();
  daySel.value = 'all';
}

async function loadMonthlyRewardSetting() {
  try {
    const { data, error } = await sb
      .from('app_settings')
      .select('key, value')
      .eq('key', 'monthly_reward')
      .maybeSingle();
    if (error) return '';
    return (data?.value || '').trim();
  } catch (_) {
    return '';
  }
}

async function loadAppSetting(key) {
  try {
    const k = String(key || '').trim();
    if (!k) return '';
    const { data, error } = await sb
      .from('app_settings')
      .select('key, value')
      .eq('key', k)
      .maybeSingle();
    if (error) return '';
    return (data?.value || '').trim();
  } catch (_) {
    return '';
  }
}

function setAuthedUI(isAuthed) {
  const authCard = el('authCard');
  const dash = el('dashboard');
  const pill = el('userPill');
  if (authCard) authCard.style.display = isAuthed ? 'none' : 'block';
  if (dash) dash.style.display = isAuthed ? 'block' : 'none';
  if (pill) pill.style.display = isAuthed ? 'flex' : 'none';
}

function setUserLabel() {
  const label = el('userLabel');
  if (!label) return;
  label.textContent = currentProfile?.username || currentSession?.user?.email || '';
}

function setUserAvatar() {
  const box = el('userAvatar');
  if (!box) return;
  const url = currentProfile?.avatar_url || avatarUrlById(currentProfile?.avatar_id || AVATARS[0].id);
  box.innerHTML = `<img src="${url}" alt="avatar" />`;
}

function getGreetingByHour(date) {
  const h = (date || new Date()).getHours();
  if (h >= 5 && h < 12) return 'Bom dia';
  if (h >= 12 && h < 18) return 'Boa tarde';
  return 'Boa noite';
}

function updateGreeting() {
  const root = el('greeting');
  const text = el('greetingText');
  const nameEl = el('greetingName');
  const userLabel = el('userLabel');
  if (!root || !text) return;

  const username = currentProfile?.username || '';
  if (!currentSession || !username) {
    root.style.display = 'none';
    text.textContent = '';
    if (nameEl) nameEl.textContent = '';
    if (userLabel) userLabel.style.display = 'block';
    return;
  }

  const greet = getGreetingByHour(new Date());
  text.textContent = `${greet},`;
  if (nameEl) nameEl.textContent = username;
  if (userLabel) userLabel.style.display = 'none';
  root.style.display = 'inline-flex';
}

function setChartModeUI(mode) {
  const m = (mode || 'combo').trim();
  const a = el('chartMode');
  if (a) a.value = m;
}

function setProfileUIFromCurrent() {
  const u = el('profileUsername');
  if (u) u.value = currentProfile?.username || '';
  setChartModeUI(currentProfile?.chart_mode || 'combo');

  const mg = el('profileMonthlyGoal');
  if (mg) mg.value = String(currentProfile?.monthly_goal ?? '');

  const email = el('profileEmail');
  if (email) email.value = '';
  const pass = el('profilePassword');
  if (pass) pass.value = '';

  __selectedAvatarId = avatarIdOrDefault(currentProfile?.avatar_id || AVATARS[0].id);
  renderAvatarGrid();
}

function renderAvatarGrid() {
  const root = el('avatarGrid');
  if (!root) return;

  root.innerHTML = AVATARS.map(a => {
    const active = a.id === __selectedAvatarId ? 'active' : '';
    const url = avatarUrlById(a.id);
    return `<button class="avatar-btn ${active}" data-avatar="${a.id}" type="button"><img src="${url}" alt="avatar" /></button>`;
  }).join('');

  root.querySelectorAll('button[data-avatar]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-avatar') || 'crown';
      __selectedAvatarId = id;
      renderAvatarGrid();

      try {
        const hint = el('profileHint');
        if (hint) hint.textContent = '';
        if (!sb?.from || !currentSession?.user?.id) {
          if (hint) hint.textContent = 'Faça login para salvar.';
          return;
        }

        if (hint) hint.textContent = 'Salvando avatar...';
        const avatarId = avatarIdOrDefault(id);
        const { data, error } = await sb
          .from('profiles')
          .update({ avatar_id: avatarId, avatar_url: null })
          .eq('id', currentSession.user.id)
          .select('id, username, is_admin, chart_mode, avatar_id, avatar_url, monthly_goal')
          .single();

        if (error) {
          if (hint) hint.textContent = error.message;
          return;
        }

        currentProfile = data;
        setUserAvatar();
        if (hint) hint.textContent = 'Avatar salvo!';
        await refreshRankingIfOpen();
      } catch (e) {
        const hint = el('profileHint');
        if (hint) hint.textContent = e?.message || 'Erro ao salvar avatar.';
      }
    });
  });
}

function setActiveNav(page) {
  document.querySelectorAll('.nav-item').forEach((x) => x.classList.remove('active'));
  const btn = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (btn) btn.classList.add('active');
}

function showPage(page) {
  el('tab-ops').style.display = page === 'ops' ? 'block' : 'none';
  el('tab-charts').style.display = page === 'charts' ? 'block' : 'none';
  el('tab-ranking').style.display = page === 'ranking' ? 'block' : 'none';
  el('tab-central').style.display = page === 'central' ? 'block' : 'none';
  el('tab-profile').style.display = page === 'profile' ? 'block' : 'none';
  el('tab-admin').style.display = page === 'admin' ? 'block' : 'none';
}

function getCurrentPage() {
  if (el('tab-ops')?.style.display !== 'none') return 'ops';
  if (el('tab-charts')?.style.display !== 'none') return 'charts';
  if (el('tab-ranking')?.style.display !== 'none') return 'ranking';
  if (el('tab-central')?.style.display !== 'none') return 'central';
  if (el('tab-profile')?.style.display !== 'none') return 'profile';
  if (el('tab-admin')?.style.display !== 'none') return 'admin';
  return 'ops';
}

function setCentralTab(tab) {
  const t = (tab || 'criativos').trim();
  const a = el('central-criativos');
  const b = el('central-proxy');
  const c = el('central-gerador');
  if (a) a.style.display = t === 'criativos' ? 'block' : 'none';
  if (b) b.style.display = t === 'proxy' ? 'block' : 'none';
  if (c) c.style.display = t === 'gerador' ? 'block' : 'none';

  try {
    document.querySelectorAll('#centralSubnav [data-central-tab]').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-central-tab') === t);
    });
  } catch {
    // ignore
  }
}

async function refreshRankingIfOpen() {
  if (getCurrentPage() === 'ranking') {
    try {
      await loadRanking();
    } catch {
      // ignore
    }
  }
}

function setupAuthTabs() {
  const tabLogin = el('authTabLogin');
  const panelLogin = el('authPanelLogin');

  if (tabLogin && panelLogin) {
    tabLogin.addEventListener('click', () => {
      tabLogin.classList.add('active');
      panelLogin.style.display = 'block';
      hideAlert('authAlert');
    });
  }

  const genBtn = el('genBtn');
  if (genBtn) {
    genBtn.addEventListener('click', async () => {
      const hint = el('genHint');
      if (hint) hint.textContent = '';

      const qtyRaw = Number(el('genQty')?.value);
      const qty = Math.max(1, Math.min(50, Number.isFinite(qtyRaw) ? qtyRaw : 1));
      if (el('genQty')) el('genQty').value = String(qty);

      if (hint) hint.textContent = 'Gerando...';

      try {
        const tasks = new Array(qty).fill(0);
        const out = await mapWithConcurrency(tasks, 10, async () => {
          return await generateDataRow();
        });
        __genRows = out;
        saveGenToStorage();
        renderDataGenTable(__genRows);
        if (hint) hint.textContent = `Gerado: ${out.length}`;
      } catch (e) {
        __genRows = [];
        saveGenToStorage();
        renderDataGenTable([]);
        if (hint) hint.textContent = e?.message || 'Erro ao gerar.';
      }
    });
  }

  const genExportBtn = el('genExportBtn');
  if (genExportBtn) {
    genExportBtn.addEventListener('click', () => {
      const hint = el('genHint');
      if (!(__genRows || []).length) {
        if (hint) hint.textContent = 'Nada para exportar.';
        return;
      }
      exportGenCsv(__genRows);
      if (hint) hint.textContent = 'Exportado!';
    });
  }

  const genResetBtn = el('genResetBtn');
  if (genResetBtn) {
    genResetBtn.addEventListener('click', () => {
      __genRows = [];
      clearGenStorage();
      renderDataGenTable([]);
      const hint = el('genHint');
      if (hint) hint.textContent = '';
    });
  }

  const dataGenTable = el('dataGenTable');
  if (dataGenTable) {
    dataGenTable.addEventListener('click', async (ev) => {
      const cell = ev.target?.closest?.('[data-copy]');
      if (cell) {
        const txt = cell.getAttribute('data-copy') || '';
        await copyToClipboard(txt);
        const hint = el('genHint');
        if (hint) hint.textContent = 'Copiado!';
        return;
      }

      const btn = ev.target?.closest?.('button[data-gen-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-gen-action');
      if (action !== 'copy') return;
      const line = btn.getAttribute('data-gen-line') || '';
      await copyToClipboard(line);
      const hint = el('genHint');
      if (hint) hint.textContent = 'Copiado!';
    });
  }
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function daysAgoISO(days) {
  const d = new Date();
  d.setDate(d.getDate() - (Number(days) || 0));
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function monthStartEndISO(date) {
  const d = date || new Date();
  const y = d.getFullYear();
  const m = d.getMonth();
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 0);
  const toISO = (x) => {
    const yyyy = x.getFullYear();
    const mm = String(x.getMonth() + 1).padStart(2, '0');
    const dd = String(x.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };
  return { start: toISO(start), end: toISO(end) };
}

function calcResult() {
  const profit = toNumber(el('opProfit')?.value);
  const cost = toNumber(el('opCost')?.value);
  const result = profit - cost;
  const out = el('opResult');
  if (out) out.value = brl(result);
  return result;
}

async function loadOperations(from, to) {
  if (!currentSession) return [];

  // Admin mode: permite ver/editar operações de outro usuário via Netlify Function (service role)
  try {
    if (isOpsAdminMode()) {
      const targetUserId = getOpsTargetUserId();
      const data = await adminOperationsApi('GET', null, { target_user_id: targetUserId, from: from || '', to: to || '' });
      const rows = data?.rows || [];
      try { window.__lastOpsRows = rows; } catch {}
      return rows;
    }
  } catch (e) {
    throw new Error(e?.message || 'Erro ao carregar operações (admin).');
  }

  let query = sb
    .from('operations')
    .select('id, op_date, profit, operational_cost, result, note, created_at')
    .order('op_date', { ascending: true });

  if (from) query = query.gte('op_date', from);
  if (to) query = query.lte('op_date', to);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

function renderOpsTable(rows) {
  const root = el('opsTable');
  if (!root) return;

  const total = (rows || []).reduce((acc, r) => acc + toNumber(r.result), 0);
  const totalProfit = (rows || []).reduce((acc, r) => acc + toNumber(r.profit), 0);
  const totalCost = (rows || []).reduce((acc, r) => acc + toNumber(r.operational_cost), 0);
  const totalEl = el('opsTotalResult');
  if (totalEl) totalEl.textContent = brl(total);

  const periodTotal = el('opsPeriodTotal');
  if (periodTotal) periodTotal.textContent = brl(total);

  const kCount = el('opsKpiCount');
  const kProfit = el('opsKpiProfit');
  const kCost = el('opsKpiCost');
  const kRes = el('opsKpiResult');
  if (kCount) kCount.textContent = String((rows || []).length);
  if (kProfit) kProfit.textContent = brl(totalProfit);
  if (kCost) kCost.textContent = brl(totalCost);
  if (kRes) kRes.textContent = brl(total);

  const header = `
    <div class="table-row header">
      <div>N°</div>
      <div>Data</div>
      <div>Lucro</div>
      <div>Gasto Op.</div>
      <div>Resultado</div>
      <div>Ações</div>
    </div>
  `;

  const body = (rows || []).map((r, idx) => {
    const badgeClass = Number(r.result) >= 0 ? 'positive' : 'negative';
    const note = r.note ? String(r.note) : '';
    return `
      <div class="table-row">
        <div class="muted">${idx + 1}</div>
        <div class="muted">${r.op_date}</div>
        <div>${brl(r.profit)}</div>
        <div>${brl(r.operational_cost)}</div>
        <div><span class="badge ${badgeClass}">${brl(r.result)}</span></div>
        <div class="row">
          <button class="btn btn-secondary" data-action="edit" data-id="${r.id}">Editar</button>
          <button class="btn" data-action="delete" data-id="${r.id}">Excluir</button>
          <span class="muted">${note}</span>
        </div>
      </div>
    `;
  }).join('');

  root.innerHTML = header + body;

  root.querySelectorAll('button[data-action]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      const action = btn.getAttribute('data-action');
      if (!id || !action) return;

      if (action === 'edit') {
        const row = (rows || []).find((x) => String(x.id) === String(id));
        if (!row) return;
        setOpsFormOpen(true);
        el('editingId').value = row.id;
        el('opDate').value = row.op_date;
        el('opProfit').value = row.profit;
        el('opCost').value = row.operational_cost;
        el('opNote').value = row.note || '';
        calcResult();
        hideAlert('opAlert');
        const card = el('opsFormCard');
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      if (action === 'delete') {
        hideAlert('opAlert');
        const ok = window.confirm('Tem certeza que deseja excluir esta operação?');
        if (!ok) return;

        if (isOpsAdminMode()) {
          try {
            const targetUserId = getOpsTargetUserId();
            await adminOperationsApi('DELETE', { id, target_user_id: targetUserId });
          } catch (e) {
            showAlert('opAlert', `Erro ao excluir: ${e?.message || 'Falha ao excluir.'}`);
            return;
          }
        } else {
          const { error } = await sb.from('operations').delete().eq('id', id);
          if (error) {
            showAlert('opAlert', `Erro ao excluir: ${error.message}`);
            return;
          }
        }
        await refreshOpsTable();
        await refreshChart();
      }
    });
  });
}

function renderChart(rows) {
  if (window.OpedrinCharts && typeof window.OpedrinCharts.renderOperationsChart === 'function') {
    const mode = el('chartMode')?.value || currentProfile?.chart_mode || 'combo';
    window.OpedrinCharts.renderOperationsChart(rows, mode, 'opsChart');
  }
}

async function refreshOpsTable() {
  try {
    hideAlert('opAlert');
    syncHiddenOpsRangeInputs();
    const from = el('filterFrom')?.value || null;
    const to = el('filterTo')?.value || null;
    const rows = await loadOperations(from, to);
    renderOpsTable(rows);
    return rows;
  } catch (e) {
    showAlert('opAlert', e?.message || 'Erro ao carregar operações.');
    try { console.error('[ops] refreshOpsTable error', e); } catch {}
    try { renderOpsTable([]); } catch {}
    return [];
  }
}

async function refreshChart() {
  try {
    const from = el('chartFrom')?.value || null;
    const to = el('chartTo')?.value || null;
    const rows = await loadOperations(from, to);
    renderChart(rows);
    return rows;
  } catch (e) {
    showAlert('opAlert', e?.message || 'Erro ao carregar gráfico.');
    try { console.error('[charts] refreshChart error', e); } catch {}
    try { renderChart([]); } catch {}
    return [];
  }
}

async function saveOperation() {
  hideAlert('opAlert');

  const opDate = el('opDate').value;
  if (!opDate) {
    showAlert('opAlert', 'Preencha a data.');
    return;
  }

  if (!currentSession?.user?.id) {
    showAlert('opAlert', 'Sessão inválida. Faça login novamente.');
    return;
  }

  const profit = toNumber(el('opProfit').value);
  const operationalCost = toNumber(el('opCost').value);
  const result = profit - operationalCost;
  const note = (el('opNote').value || '').trim();
  const editingId = (el('editingId').value || '').trim();

  el('dupHint').textContent = '';

  if (editingId) {
    if (isOpsAdminMode()) {
      try {
        const targetUserId = getOpsTargetUserId();
        await adminOperationsApi('PUT', {
          id: editingId,
          target_user_id: targetUserId,
          op_date: opDate,
          profit,
          operational_cost: operationalCost,
          result,
          note
        });
      } catch (e) {
        showAlert('opAlert', `Erro ao atualizar: ${e?.message || 'Falha ao atualizar.'}`);
        return;
      }
    } else {
      const { error } = await sb
        .from('operations')
        .update({ op_date: opDate, profit, operational_cost: operationalCost, result, note })
        .eq('id', editingId);

      if (error) {
        showAlert('opAlert', `Erro ao atualizar: ${error.message}`);
        return;
      }
    }
  } else {
    if (isOpsAdminMode()) {
      try {
        const targetUserId = getOpsTargetUserId();
        await adminOperationsApi('POST', {
          target_user_id: targetUserId,
          op_date: opDate,
          profit,
          operational_cost: operationalCost,
          result,
          note
        });
      } catch (e) {
        showAlert('opAlert', `Erro ao salvar: ${e?.message || 'Falha ao salvar.'}`);
        return;
      }
    } else {
      const { error } = await sb
        .from('operations')
        .insert({ user_id: currentSession.user.id, op_date: opDate, profit, operational_cost: operationalCost, result, note });

      if (error) {
        showAlert('opAlert', `Erro ao salvar: ${error.message}`);
        return;
      }
    }
  }

  clearOperationForm();
  setOpsFormOpen(false);
  await refreshOpsTable();
  await refreshChart();
}

function clearOperationForm() {
  el('editingId').value = '';
  el('opDate').value = todayISO();
  el('opProfit').value = '';
  el('opCost').value = '';
  el('opNote').value = '';
  el('opResult').value = brl(0);
  el('dupHint').textContent = '';
}

function setOpsFormOpen(open) {
  const card = el('opsFormCard');
  if (!card) return;
  card.style.display = open ? 'block' : 'none';
}

function updateOnlineUI() {
  const pill = el('onlinePill');
  const count = el('onlineCount');
  if (count) count.textContent = String(__onlineUserIds.size);
  if (pill) pill.style.display = currentProfile?.is_admin ? 'inline-flex' : 'none';

  try {
    if (pill) {
      if (__presenceStatus !== 'SUBSCRIBED') {
        pill.style.borderColor = 'rgba(239,68,68,0.35)';
        pill.style.background = 'rgba(239,68,68,0.10)';
        pill.style.color = 'rgba(239,68,68,0.95)';
        pill.innerHTML = `Online: <span id="onlineCount">${String(__onlineUserIds.size)}</span> (${__presenceStatus})`;
      } else {
        pill.style.borderColor = '';
        pill.style.background = '';
        pill.style.color = '';
        pill.innerHTML = `Online: <span id="onlineCount">${String(__onlineUserIds.size)}</span>`;
      }
    }
  } catch {
    // ignore
  }

  try {
    document.querySelectorAll('[data-ranking-user-id]').forEach((node) => {
      const uid = node.getAttribute('data-ranking-user-id');
      if (!uid) return;
      let dot = node.querySelector('.presence-dot');
      if (!dot) {
        dot = document.createElement('span');
        dot.className = 'presence-dot';
        node.appendChild(dot);
      }

      const isOn = __onlineUserIds.has(uid);
      dot.classList.toggle('is-online', isOn);
      dot.classList.toggle('is-offline', !isOn);
    });
  } catch {
    // ignore
  }
}

async function startPresence() {
  if (!currentSession?.user?.id) return;
  if (__presenceChannel) return;

  const hasRealtime = (typeof sb?.channel === 'function') || (typeof sb?.realtime?.channel === 'function');
  if (!hasRealtime) {
    __presenceStatus = 'NO_REALTIME';
    updateOnlineUI();
    return;
  }

  const channelFactory = (name, opts) => {
    if (typeof sb?.channel === 'function') return sb.channel(name, opts);
    if (typeof sb?.realtime?.channel === 'function') return sb.realtime.channel(name, opts);
    return null;
  };

  __presenceStatus = 'CONNECTING';
  updateOnlineUI();
  try { console.log('[Presence] starting...'); } catch {}

  try {
    __presenceChannel = channelFactory('online-users', {
      config: {
        presence: { key: currentSession.user.id }
      }
    });

    if (!__presenceChannel) {
      __presenceStatus = 'NO_CHANNEL';
      updateOnlineUI();
      return;
    }

    __presenceChannel.on('presence', { event: 'join' }, ({ key }) => {
      try {
        if (key) __onlineUserIds.add(String(key));
        updateOnlineUI();
      } catch {
        // ignore
      }
    });

    __presenceChannel.on('presence', { event: 'leave' }, ({ key }) => {
      try {
        if (key) __onlineUserIds.delete(String(key));
        updateOnlineUI();
      } catch {
        // ignore
      }
    });

    __presenceChannel.on('presence', { event: 'sync' }, () => {
      try {
        const state = __presenceChannel.presenceState();
        const ids = Object.keys(state || {});
        __onlineUserIds = new Set(ids);
        if (currentSession?.user?.id) __onlineUserIds.add(String(currentSession.user.id));
        updateOnlineUI();
      } catch {
        // ignore
      }
    });

    __presenceChannel.subscribe(async (status) => {
      __presenceStatus = String(status || 'UNKNOWN');
      try { console.log('[Presence] status:', status); } catch {}
      updateOnlineUI();
      if (status !== 'SUBSCRIBED') return;
      try {
        if (currentSession?.user?.id) __onlineUserIds.add(String(currentSession.user.id));
        updateOnlineUI();
        await __presenceChannel.track({ online_at: new Date().toISOString() });
      } catch {
        // ignore
      }
    });
  } catch {
    __presenceStatus = 'ERROR';
    __presenceChannel = null;
    updateOnlineUI();
  }
}

async function stopPresence() {
  try {
    if (__presenceChannel) {
      await __presenceChannel.unsubscribe();
    }
  } catch {
    // ignore
  }
  __presenceChannel = null;
  __onlineUserIds = new Set();
  __presenceStatus = 'OFF';
  updateOnlineUI();
}

async function loadRanking() {
  try {
    await startPresence();
  } catch {
    // ignore
  }
  populateRankingFilters();
  let range = selectedRankingRange();
  if (!range) {
    const r = monthStartEndISO(new Date());
    range = { start: r.start, end: r.end, y: new Date().getFullYear(), m: new Date().getMonth() + 1, day: null, isSingleDay: false };
  }
  const from = range?.start || '';
  const to = range?.end || '';
  let data;
  if (!from || !to) {
    data = [];
  } else {
    const res = await sb
      .rpc('get_ranking_monthly', { month_start: from, month_end: to });
    if (res.error) throw res.error;
    data = res.data || [];
  }

  try {
    console.log('[Ranking] range', { from, to, year: range?.y, month: range?.m, day: range?.day });
    if (currentSession?.user?.id && from && to) {
      const { count } = await sb
        .from('operations')
        .select('id', { count: 'exact', head: true })
        .gte('op_date', from)
        .lte('op_date', to);
      console.log('[Ranking] ops count (me) in range:', count);

      const { data: lastOps } = await sb
        .from('operations')
        .select('op_date, result')
        .order('op_date', { ascending: false })
        .limit(5);
      console.log('[Ranking] last ops (me):', lastOps || []);
    }
  } catch {
    // ignore
  }

  const list = el('rankingList');
  if (!list) return;

  const ym = range ? `${String(range.y)}-${String(range.m).padStart(2, '0')}` : '';
  __lastRankingYm = ym;

  const now = new Date();
  const nowYm = `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const isCurrentYm = ym && (ym === nowYm);

  // Premiação é mensal: só mostra se existir registro em monthly_awards para o mês filtrado.
  let monthlyReward = '';
  let monthlyRewardImageUrl = '';
  let winnerUserId = '';
  let winnerUsername = '';
  let winnerAvatarUrl = '';

  if (ym) {
    try {
      const { data: awardRow } = await sb
        .from('monthly_awards')
        .select('ym, reward, reward_image, winner_user_id, winner_username, winner_avatar_url')
        .eq('ym', ym)
        .maybeSingle();
      if (awardRow) {
        monthlyReward = (awardRow.reward || '').trim();
        monthlyRewardImageUrl = (awardRow.reward_image || '').trim();
        winnerUserId = awardRow.winner_user_id ? String(awardRow.winner_user_id) : '';
        winnerUsername = (awardRow.winner_username || '').trim();
        winnerAvatarUrl = (awardRow.winner_avatar_url || '').trim();
      }
    } catch {
      // ignore
    }
  }

  const prizeSpotlight = el('prizeSpotlight');
  const prizeSpotlightName = el('prizeSpotlightName');
  const prizeSpotlightImg = el('prizeSpotlightImg');
  if (prizeSpotlight) prizeSpotlight.style.display = 'block';
  if (prizeSpotlightName) prizeSpotlightName.textContent = monthlyReward || '-';
  if (prizeSpotlightImg) {
    if (monthlyRewardImageUrl) {
      prizeSpotlightImg.src = monthlyRewardImageUrl;
      prizeSpotlightImg.style.display = 'block';
    } else {
      prizeSpotlightImg.removeAttribute('src');
      prizeSpotlightImg.style.display = 'none';
    }
  }

  const meUserId = currentSession?.user?.id ? String(currentSession.user.id) : '';
  const meRow = (data || []).find((x) => String(x.user_id || '') === meUserId) || null;
  const totalGoal = toNumber(meRow?.monthly_goal ?? currentProfile?.monthly_goal);
  const totalAchieved = toNumber(meRow?.total_result);
  const remaining = Math.max(0, totalGoal - totalAchieved);
  const pct = totalGoal > 0 ? clamp01(totalAchieved / totalGoal) : 0;
  const pctLabel = `${Math.round(pct * 1000) / 10}%`;

  setText('rankingMetaPct', pctLabel);
  const bar = el('rankingMetaBar');
  if (bar) bar.style.width = `${Math.round(pct * 100)}%`;
  setText('rankingAchievedMonthly', brl(totalAchieved));
  setText('rankingRemainingMonthly', brl(remaining));

  const dim = range ? daysInMonth(range.y, range.m) : 0;
  const dailyGoal = dim > 0 ? (totalGoal / dim) : 0;
  setText('rankingGoalDaily', dailyGoal ? brl(dailyGoal) : '-');

  __lastRankingData = data || [];

  const body = (data || []).map((r, idx) => {
    const avatarUrl = r.avatar_url || avatarUrlById(r.avatar_id || AVATARS[0].id);
    const userId = r.user_id ? String(r.user_id) : '';
    const total = toNumber(r.total_result);
    const goal = toNumber(r.monthly_goal);
    const roi = goal > 0 ? Math.round((total / goal) * 1000) / 10 : 0;

    let rankIcon = `${idx + 1}`;
    if (idx === 0) rankIcon = `<span class="rank-icon crown"><i class="fa-solid fa-trophy"></i></span>`;
    if (idx === 1) rankIcon = `<span class="rank-icon silver"><i class="fa-solid fa-award"></i></span>`;
    if (idx === 2) rankIcon = `<span class="rank-icon bronze"><i class="fa-solid fa-award"></i></span>`;

    const cls = idx === 0 ? 'top1' : idx === 1 ? 'top2' : idx === 2 ? 'top3' : '';
    const roiText = goal > 0 ? `+${roi}% ROI` : '';

    const prizeLabel = isCurrentYm ? 'Tá faturando o prêmio' : 'Faturou o prêmio';
    const top1PrizeInline = idx === 0 ? `
      <span class="ranking-name-prize">
        ${monthlyRewardImageUrl ? `<img class="ranking-name-prize-img" src="${monthlyRewardImageUrl}" alt="premio" />` : ''}
        <span class="ranking-name-prize-text">${prizeLabel}</span>
        <button class="btn btn-secondary ranking-name-prize-btn" type="button" disabled>${monthlyReward || '-'}</button>
      </span>
    ` : '';

    const dotClass = userId && __onlineUserIds.has(userId) ? 'presence-dot is-online' : 'presence-dot is-offline';

    return `
      <div class="ranking-card ${cls}">
        <div class="ranking-card-row">
          <div class="muted">${rankIcon}</div>
          <div class="muted"><img src="${avatarUrl}" alt="avatar" style="width:34px;height:34px;border-radius:999px;" /></div>
          <div class="ranking-user">
            <div class="ranking-user-name" data-ranking-user-id="${userId}">${r.username}${top1PrizeInline}<span class="${dotClass}"></span></div>
            <div class="ranking-user-sub"></div>
          </div>
          <div class="ranking-right">
            <div class="ranking-total">${brl(total)}</div>
            <div class="ranking-roi">${roiText}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  list.innerHTML = body;
  updateOnlineUI();

  try {
    await refreshResources();
  } catch {
    // ignore
  }
}

async function checkAdmin() {
  const isAdmin = Boolean(currentProfile?.is_admin);
  const btn = el('adminTab');
  if (btn) btn.style.display = isAdmin ? 'inline-flex' : 'none';

  const opsAdminControls = el('opsAdminControls');
  if (opsAdminControls) opsAdminControls.style.display = isAdmin ? '' : 'none';

  if (isAdmin) {
    try {
      await refreshOpsAdminUsersSelect();
    } catch {
      // ignore
    }
  }

  const csName = el('creativeStatusName');
  const csColor = el('creativeStatusColor');
  const csSave = el('creativeStatusSaveBtn');
  const csClear = el('creativeStatusClearBtn');
  const csEditing = el('creativeStatusEditingId');
  const csList = el('creativeStatusesList');
  const csHint = el('creativeStatusHint');

  const show = isAdmin ? '' : 'none';
  if (csName) csName.closest('.field') ? (csName.closest('.field').style.display = show) : (csName.style.display = show);
  if (csColor) csColor.closest('.field') ? (csColor.closest('.field').style.display = show) : (csColor.style.display = show);
  if (csSave) csSave.style.display = show;
  if (csClear) csClear.style.display = show;
  if (csEditing) csEditing.style.display = show;
  if (csList) csList.style.display = show;
  if (csHint) csHint.style.display = show;

  try {
    renderCreativeStatuses(__lastCreativeStatuses || []);
  } catch {
    // ignore
  }
}

async function ensureProfile(session, usernameForUpsert) {
  if (!session?.user?.id) throw new Error('Sessão inválida.');
  if (!sb) {
    try {
      await initSupabaseFromServer();
    } catch (e) {
      throw new Error(e?.message || 'Supabase não inicializou.');
    }
  }
  if (!sb?.from) throw new Error('Supabase não inicializou.');

  const userId = session.user.id;
  const email = String(session.user.email || '').trim();
  const fallbackUsername = (usernameForUpsert || '').trim() || (email ? email.split('@')[0] : '');

  // 1) Tenta carregar perfil existente
  let prof = null;
  {
    const { data, error } = await sb
      .from('profiles')
      .select('id, username, is_admin, chart_mode, avatar_id, avatar_url, monthly_goal')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message || 'Erro ao carregar perfil.');
    }
    prof = data || null;
  }

  // 2) Se não existe, cria
  if (!prof) {
    const insertPayload = {
      id: userId,
      username: fallbackUsername || null,
      is_admin: false
    };

    const { data, error } = await sb
      .from('profiles')
      .insert(insertPayload)
      .select('id, username, is_admin, chart_mode, avatar_id, avatar_url, monthly_goal')
      .single();

    if (error) {
      throw new Error(error.message || 'Erro ao criar perfil.');
    }
    prof = data || null;
  }

  // 3) Se existe mas está sem username, tenta completar
  if (prof && !String(prof.username || '').trim() && fallbackUsername) {
    const { data, error } = await sb
      .from('profiles')
      .update({ username: fallbackUsername })
      .eq('id', userId)
      .select('id, username, is_admin, chart_mode, avatar_id, avatar_url, monthly_goal')
      .single();

    if (!error && data) prof = data;
  }

  currentProfile = prof;
  return prof;
}

async function grantAdmin() {
  hideAlert('adminAlert');
  const email = (el('adminEmail').value || '').trim();
  if (!email) {
    showAlert('adminAlert', 'Digite o email do usuário.');
    return;
  }

  if (!currentSession?.user?.id) {
    showAlert('adminAlert', 'Sessão inválida. Faça login novamente.');
    return;
  }

  const res = await fetch('/api/grant-admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, requesterUserId: currentSession.user.id })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    showAlert('adminAlert', data.error || 'Erro ao conceder admin.');
    return;
  }

  showAlert('adminAlert', 'Admin concedido com sucesso.');
}

async function adminUsersApi(method, payload) {
  const token = currentSession?.access_token || '';
  if (!token) throw new Error('Sessão inválida. Faça login novamente.');

  const res = await fetch('/api/admin-users', {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: payload ? JSON.stringify(payload) : undefined
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || 'Erro ao comunicar com admin-users.');
  }
  return data;
}

async function adminOperationsApi(method, payload, query) {
  const token = currentSession?.access_token || '';
  if (!token) throw new Error('Sessão inválida. Faça login novamente.');

  let url = '/api/admin-operations';
  if (method === 'GET' && query && typeof query === 'object') {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v === null || typeof v === 'undefined') return;
      const s = String(v).trim();
      if (!s) return;
      params.set(k, s);
    });
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: method === 'GET' ? undefined : (payload ? JSON.stringify(payload) : undefined)
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Erro ao comunicar com admin-operations.');
  return data;
}

function isOpsAdminMode() {
  return Boolean(currentProfile?.is_admin) && Boolean(el('opsAdminMode')?.checked);
}

function getOpsTargetUserId() {
  const id = String(el('opsAdminUser')?.value || '').trim();
  if (!id) throw new Error('Selecione um usuário para editar.');
  return id;
}

async function refreshOpsAdminUsersSelect() {
  const sel = el('opsAdminUser');
  if (!sel) return;
  if (!currentProfile?.is_admin) return;

  const users = Array.isArray(window.__lastAdminUsers) ? window.__lastAdminUsers : await refreshAdminUsers();
  const opts = (users || []).map((u) => {
    const id = String(u?.id || '').trim();
    const email = String(u?.email || '').trim();
    if (!id) return '';
    return `<option value="${escapeHtml(id)}">${escapeHtml(email || id)}</option>`;
  }).join('');
  sel.innerHTML = opts || '<option value="">Sem usuários</option>';

  if (!sel.value && currentSession?.user?.id) {
    // default: selecionar o próprio usuário para facilitar
    sel.value = String(currentSession.user.id);
  }
}

function clearAdminUserForm() {
  const id = el('adminUserEditingId');
  const email = el('adminUserEmail');
  const pass = el('adminUserPassword');
  const isAdmin = el('adminUserIsAdmin');
  if (id) id.value = '';
  if (email) email.value = '';
  if (pass) pass.value = '';
  if (isAdmin) isAdmin.checked = false;
  const hint = el('adminUsersHint');
  if (hint) {
    hint.style.display = 'none';
    hint.textContent = '';
  }
}

function renderAdminUsersList(users) {
  const root = el('adminUsersList');
  if (!root) return;

  const header = `
    <div class="table-row header">
      <div>Email</div>
      <div>Admin</div>
      <div>Ações</div>
    </div>
  `;

  const body = (users || []).map((u) => {
    const id = String(u.id || '');
    const email = String(u.email || '').trim();
    const admin = Boolean(u.is_admin);
    return `
      <div class="table-row" data-admin-user-id="${escapeHtml(id)}">
        <div class="muted" style="word-break: break-word;">${escapeHtml(email)}</div>
        <div>${admin ? '<span class="badge">SIM</span>' : '<span class="muted">NÃO</span>'}</div>
        <div class="row">
          <button class="btn btn-secondary" type="button" data-admin-users-action="edit" data-admin-users-id="${escapeHtml(id)}">Editar</button>
          <button class="btn" type="button" data-admin-users-action="del" data-admin-users-id="${escapeHtml(id)}">Excluir</button>
        </div>
      </div>
    `;
  }).join('');

  root.innerHTML = header + (body || '<div class="muted" style="padding:10px 0;">Sem usuários.</div>');
}

async function refreshAdminUsers() {
  const hint = el('adminUsersHint');
  if (hint) {
    hint.style.display = 'none';
    hint.textContent = '';
  }

  const data = await adminUsersApi('GET');
  renderAdminUsersList(data?.users || []);
  try { window.__lastAdminUsers = data?.users || []; } catch {}
  return data?.users || [];
}

function setupTabs() {
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.nav-item').forEach((x) => x.classList.remove('active'));
      btn.classList.add('active');

      const tab = btn.getAttribute('data-page');

      if (tab === 'admin' && !Boolean(currentProfile?.is_admin)) {
        const fallback = document.querySelector('.nav-item[data-page="ops"]');
        if (fallback) fallback.click();
        return;
      }

      showPage(tab);

      if (tab === 'ops') {
        if (!__opsFiltersTouched) {
          populateOpsFilters();
          setOpsFiltersToNow();
          syncHiddenOpsRangeInputs();
          try {
            await refreshOpsTable();
          } catch {
            // ignore
          }
        }
      }

      if (tab === 'ranking') {
        try {
          await startPresence();
        } catch {
          // ignore
        }
        if (!__rankingFiltersTouched) {
          setRankingFiltersToNow();
        }
        try {
          await loadRanking();
        } catch (e) {
          showAlert('opAlert', `Erro ao carregar ranking: ${e.message}`);
        }
      }

      if (tab === 'admin') {
        const input = el('monthlyRewardInput');
        if (input) {
          const v = await loadAppSetting('monthly_reward');
          input.value = v;
        }

        if (currentProfile?.is_admin) {
          try {
            await refreshAdminUsers();
          } catch (e) {
            const hint = el('adminUsersHint');
            if (hint) {
              hint.style.display = 'block';
              hint.textContent = e?.message || 'Erro ao carregar usuários.';
            }
          }
        }
      }

      if (tab === 'charts') {
        try {
          await refreshChart();
        } catch (e) {
          showAlert('opAlert', `Erro ao carregar gráfico: ${e.message}`);
        }
      }

      if (tab === 'profile') {
        setProfileUIFromCurrent();
      }
    });
  });
}

async function onAuthed(session, usernameForUpsert) {
  if (!session?.user?.id) return;
  if (__authedUserId === session.user.id) return;
  if (__authInFlight && __handlingSessionUserId === session.user.id) return;

  const withTimeout = async (p, ms, label) => {
    let t;
    try {
      return await Promise.race([
        p,
        new Promise((_, rej) => {
          t = setTimeout(() => rej(new Error(`${label} timeout`)), ms);
        })
      ]);
    } finally {
      try { clearTimeout(t); } catch {}
    }
  };

  __authInFlight = true;
  __handlingSessionUserId = session.user.id;
  __authedUserId = session.user.id;

  currentSession = session;

  // Mostra o dashboard imediatamente para não parecer que "não logou"
  setAuthedUI(true);
  setActiveNav('ops');
  showPage('ops');

  try {
    await startPresence();
  } catch {
    // ignore
  }

  try { console.log('[auth] onAuthed start'); } catch {}

  // Carrega o perfil e o restante em background para não atrasar a entrada
  withTimeout(ensureProfile(session, usernameForUpsert), 12000, 'ensureProfile')
    .then(async () => {
      try { console.log('[auth] profile ok'); } catch {}

      setUserLabel();
      setUserAvatar();
      updateGreeting();
      await checkAdmin();

      setOpsFormOpen(false);
      setActiveNav('ops');
      showPage('ops');

      setChartModeUI(currentProfile?.chart_mode || 'combo');
      const hint = el('chartModeHint');
      if (hint) hint.textContent = '';

      setProfileUIFromCurrent();

      clearOperationForm();
      setOpsFormOpen(false);

      populateOpsFilters();
      if (!__opsFiltersTouched) {
        setOpsFiltersToNow();
      }
      syncHiddenOpsRangeInputs();

      setTimeout(() => {
        refreshOpsTable();
      }, 0);

      populateRankingFilters();
    })
    .catch((e) => {
      showAlert('authAlert', e?.message || 'Erro ao carregar perfil.');
    })
    .finally(() => {
      __authInFlight = false;
    });
}

async function boot() {
  if (typeof window !== 'undefined') {
    if (window.__opedrinBooted) return;
    window.__opedrinBooted = true;
  }
  try { console.log('[boot] start'); } catch {}
  const loginBtn = el('loginBtn');

  const opsAdminMode = el('opsAdminMode');
  if (opsAdminMode) {
    opsAdminMode.addEventListener('change', async () => {
      if (!await ensureSupabaseReady()) return;
      try {
        await refreshOpsTable();
        await refreshChart();
      } catch (e) {
        showAlert('opAlert', e?.message || 'Erro ao recarregar operações.');
      }
    });
  }

  const opsAdminUser = el('opsAdminUser');
  if (opsAdminUser) {
    opsAdminUser.addEventListener('change', async () => {
      if (!await ensureSupabaseReady()) return;
      if (!isOpsAdminMode()) return;
      try {
        await refreshOpsTable();
        await refreshChart();
      } catch (e) {
        showAlert('opAlert', e?.message || 'Erro ao recarregar operações.');
      }
    });
  }

  if (!loginBtn) {
    try { console.warn('[boot] loginBtn não encontrado'); } catch {}
    showAlert('authAlert', 'Botão de login não encontrado. Recarregue a página (Ctrl+F5).');
    return;
  }
  function setAuthLoading(loading) {
    if (loginBtn) loginBtn.disabled = loading;
  }
  setupAuthTabs();

  function applyTheme(mode) {
    const m = (mode || 'modern').trim();
    document.body.classList.toggle('theme-black', m === 'black');
    const btn = el('themeToggleBtn');
    if (btn) btn.textContent = m === 'black' ? 'Tema: Black' : 'Tema: Moderno';
  }

  try {
    const saved = localStorage.getItem(__themeStorageKey) || 'modern';
    applyTheme(saved);
  } catch {
    applyTheme('modern');
  }

  const themeBtn = el('themeToggleBtn');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const isBlack = document.body.classList.contains('theme-black');
      const next = isBlack ? 'modern' : 'black';
      applyTheme(next);
      try { localStorage.setItem(__themeStorageKey, next); } catch {}
    });
  }

  loadGenFromStorage();
  try {
    renderDataGenTable(__genRows || []);
  } catch {
    // ignore
  }

  async function ensureSupabaseReady() {
    if (sb) return true;
    try {
      try { console.log('[supabase] ensure ready...'); } catch {}
      await initSupabaseFromServer();
      if (!sb?.auth) {
        showAlert('authAlert', 'Supabase Auth não carregou (verifique o script @supabase/supabase-js e /api/config).');
        return false;
      }
      try { console.log('[supabase] ready'); } catch {}
      return true;
    } catch (e) {
      try { console.error('[supabase] ensure ready error', e); } catch {}
      showAlert('authAlert', `Config Supabase: ${e.message}`);
      return false;
    }
  }

  const today = todayISO();
  const filterFrom = el('filterFrom');
  const filterTo = el('filterTo');
  if (filterFrom && !filterFrom.value) filterFrom.value = today;
  if (filterTo && !filterTo.value) filterTo.value = today;

  const chartFrom = el('chartFrom');
  const chartTo = el('chartTo');
  const monthRange = monthStartEndISO(new Date());
  if (chartFrom && !chartFrom.value) chartFrom.value = monthRange.start;
  if (chartTo && !chartTo.value) chartTo.value = monthRange.end;

  populateOpsFilters();
  syncHiddenOpsRangeInputs();

  const opsYear = el('opsYear');
  const opsMonth = el('opsMonth');
  const opsDay = el('opsDay');

  if (opsYear) {
    opsYear.addEventListener('change', () => {
      __opsFiltersTouched = true;
      refreshOpsDayOptions();
      syncHiddenOpsRangeInputs();
    });
  }
  if (opsMonth) {
    opsMonth.addEventListener('change', () => {
      __opsFiltersTouched = true;
      refreshOpsDayOptions();
      syncHiddenOpsRangeInputs();
    });
  }
  if (opsDay) {
    opsDay.addEventListener('change', () => {
      __opsFiltersTouched = true;
      syncHiddenOpsRangeInputs();
    });
  }

  const opsAddBtn = el('opsAddBtn');
  if (opsAddBtn) {
    opsAddBtn.addEventListener('click', () => {
      setOpsFormOpen(true);
      const card = document.querySelector('#tab-ops .card');
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const dateEl = el('opDate');
      if (dateEl) dateEl.focus();
    });
  }

  populateRankingFilters();

  const rankingYear = el('rankingYear');
  const rankingMonth = el('rankingMonth');
  const rankingDay = el('rankingDay');

  if (rankingYear) {
    rankingYear.addEventListener('change', async () => {
      __rankingFiltersTouched = true;
      refreshRankingDayOptions();
      if (!await ensureSupabaseReady()) return;
      await loadRanking();
    });
  }
  if (rankingMonth) {
    rankingMonth.addEventListener('change', async () => {
      __rankingFiltersTouched = true;
      refreshRankingDayOptions();
      if (!await ensureSupabaseReady()) return;
      await loadRanking();
    });
  }
  if (rankingDay) {
    rankingDay.addEventListener('change', async () => {
      __rankingFiltersTouched = true;
      if (!await ensureSupabaseReady()) return;
      await loadRanking();
    });
  }

  el('opProfit').addEventListener('input', calcResult);
  el('opCost').addEventListener('input', calcResult);
  el('applyFilterBtn').addEventListener('click', async () => {
    if (!await ensureSupabaseReady()) return;
    await refreshOpsTable();
  });

  const applyChartFilterBtn = el('applyChartFilterBtn');
  if (applyChartFilterBtn) {
    applyChartFilterBtn.addEventListener('click', async () => {
      if (!await ensureSupabaseReady()) return;
      await refreshChart();
    });
  }

  const centralSubnav = el('centralSubnav');
  if (centralSubnav) {
    centralSubnav.querySelectorAll('[data-central-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        setCentralTab(btn.getAttribute('data-central-tab') || 'criativos');
        const tab = btn.getAttribute('data-central-tab') || 'criativos';
        if (tab === 'criativos') {
          ensureSupabaseReady().then(async (ok) => {
            if (!ok) return;
            try { await refreshCreativeStatuses(); } catch {}
            try { await refreshCreatives(); } catch {}
          });
        }
        if (tab === 'proxy') {
          ensureSupabaseReady().then((ok) => {
            if (!ok) return;
            refreshProxies().catch(() => {});
          });
        }
        if (tab === 'gerador') {
          try {
            renderDataGenTable(__genRows || []);
          } catch {
            // ignore
          }
        }
      });
    });
    setCentralTab('criativos');
    ensureSupabaseReady().then(async (ok) => {
      if (!ok) return;
      try { await refreshCreativeStatuses(); } catch {}
      try { await refreshCreatives(); } catch {}
    });
  }

  const proxyClearBtn = el('proxyClearBtn');
  if (proxyClearBtn) {
    proxyClearBtn.addEventListener('click', () => {
      clearProxyForm();
    });
  }

  const proxySaveBtn = el('proxySaveBtn');
  if (proxySaveBtn) {
    proxySaveBtn.addEventListener('click', async () => {
      if (!await ensureSupabaseReady()) return;
      setHint('proxyHint', '');
      if (!currentSession?.user?.id) return;

      const name = (el('proxyName')?.value || '').trim();
      const proxy = (el('proxyValue')?.value || '').trim();
      const editingId = (el('proxyEditingId')?.value || '').trim();

      if (!name || !proxy) {
        setHint('proxyHint', 'Preencha nome e proxy.');
        return;
      }

      setHint('proxyHint', 'Salvando...');
      if (editingId) {
        const { error } = await sb
          .from('proxies')
          .update({ name, proxy, updated_at: new Date().toISOString(), updated_by: currentSession.user.id })
          .eq('id', editingId);
        if (error) {
          setHint('proxyHint', error.message);
          return;
        }
      } else {
        const { error } = await sb
          .from('proxies')
          .insert({ name, proxy, created_by: currentSession.user.id, updated_by: currentSession.user.id });
        if (error) {
          setHint('proxyHint', error.message);
          return;
        }
      }

      clearProxyForm();
      await refreshProxies();
      setHint('proxyHint', 'Salvo!');
    });
  }

  const proxiesList = el('proxiesList');
  if (proxiesList) {
    proxiesList.addEventListener('click', async (ev) => {
      const btn = ev.target?.closest?.('button[data-proxy-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-proxy-action');
      const id = btn.getAttribute('data-proxy-id');
      if (!action || !id) return;
      if (!await ensureSupabaseReady()) return;

      if (action === 'edit') {
        const { data, error } = await sb
          .from('proxies')
          .select('id, name, proxy')
          .eq('id', id)
          .maybeSingle();
        if (error || !data) {
          setHint('proxyHint', error?.message || 'Não encontrado.');
          return;
        }
        el('proxyEditingId').value = String(data.id);
        el('proxyName').value = data.name || '';
        el('proxyValue').value = data.proxy || '';
        setHint('proxyHint', 'Editando...');
      }

      if (action === 'del') {
        const ok = window.confirm('Excluir este proxy?');
        if (!ok) return;
        const { error } = await sb.from('proxies').delete().eq('id', id);
        if (error) {
          setHint('proxyHint', error.message);
          return;
        }
        await refreshProxies();
      }
    });
  }

  const csClearBtn = el('creativeStatusClearBtn');
  if (csClearBtn) {
    csClearBtn.addEventListener('click', () => {
      clearCreativeStatusForm();
    });
  }

  const csSaveBtn = el('creativeStatusSaveBtn');
  if (csSaveBtn) {
    csSaveBtn.addEventListener('click', async () => {
      if (!await ensureSupabaseReady()) return;
      setHint('creativeStatusHint', '');
      if (!currentSession?.user?.id) return;
      if (!currentProfile?.is_admin) {
        setHint('creativeStatusHint', 'Apenas admin pode editar status.');
        return;
      }

      const name = (el('creativeStatusName')?.value || '').trim();
      const color = (el('creativeStatusColor')?.value || '#22c55e').trim();
      const editingId = (el('creativeStatusEditingId')?.value || '').trim();

      if (!name) {
        setHint('creativeStatusHint', 'Digite o status.');
        return;
      }

      setHint('creativeStatusHint', 'Salvando...');
      if (editingId) {
        const { error } = await sb
          .from('creative_statuses')
          .update({ name, color, updated_at: new Date().toISOString(), updated_by: currentSession.user.id })
          .eq('id', editingId);
        if (error) {
          setHint('creativeStatusHint', error.message);
          return;
        }
      } else {
        const { error } = await sb
          .from('creative_statuses')
          .insert({ name, color, updated_by: currentSession.user.id });
        if (error) {
          setHint('creativeStatusHint', error.message);
          return;
        }
      }

      clearCreativeStatusForm();
      await refreshCreativeStatuses();
      await refreshCreatives();
      setHint('creativeStatusHint', 'Salvo!');
    });
  }

  const csList = el('creativeStatusesList');
  if (csList) {
    csList.addEventListener('click', async (ev) => {
      const btn = ev.target?.closest?.('button[data-cs-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-cs-action');
      const id = btn.getAttribute('data-cs-id');
      if (!action || !id) return;
      if (!await ensureSupabaseReady()) return;
      if (!currentProfile?.is_admin) return;

      if (action === 'edit') {
        const { data, error } = await sb
          .from('creative_statuses')
          .select('id, name, color')
          .eq('id', id)
          .maybeSingle();
        if (error || !data) {
          setHint('creativeStatusHint', error?.message || 'Não encontrado.');
          return;
        }
        el('creativeStatusEditingId').value = String(data.id);
        el('creativeStatusName').value = data.name || '';
        el('creativeStatusColor').value = data.color || '#22c55e';
        setHint('creativeStatusHint', 'Editando...');
      }

      if (action === 'del') {
        const ok = window.confirm('Excluir este status?');
        if (!ok) return;
        const { error } = await sb.from('creative_statuses').delete().eq('id', id);
        if (error) {
          setHint('creativeStatusHint', error.message);
          return;
        }
        await refreshCreativeStatuses();
        await refreshCreatives();
      }
    });
  }

  const creativeClearBtn = el('creativeClearBtn');
  if (creativeClearBtn) {
    creativeClearBtn.addEventListener('click', () => {
      clearCreativeForm();
    });
  }

  const creativeSaveBtn = el('creativeSaveBtn');
  if (creativeSaveBtn) {
    creativeSaveBtn.addEventListener('click', async () => {
      if (!await ensureSupabaseReady()) return;
      setHint('creativeHint', '');
      if (!currentSession?.user?.id) return;

      const token = (el('creativeToken')?.value || '').trim();
      const status = (el('creativeStatus')?.value || 'Disponível').trim();
      const description = (el('creativeDesc')?.value || '').trim();
      const editingId = (el('creativeEditingId')?.value || '').trim();

      if (!token) {
        setHint('creativeHint', 'Digite o token.');
        return;
      }

      setHint('creativeHint', 'Salvando...');
      if (editingId) {
        const { error } = await sb
          .from('creatives')
          .update({ token, status, description, updated_at: new Date().toISOString() })
          .eq('id', editingId);
        if (error) {
          setHint('creativeHint', error.message);
          return;
        }
      } else {
        const { error } = await sb
          .from('creatives')
          .insert({ token, status, description, created_by: currentSession.user.id });
        if (error) {
          setHint('creativeHint', error.message);
          return;
        }
      }

      clearCreativeForm();
      await refreshCreatives();
      setHint('creativeHint', 'Salvo!');
    });
  }

  const creativeStatusSel = el('creativeStatus');
  if (creativeStatusSel) {
    creativeStatusSel.addEventListener('change', () => {
      try {
        updateCreativeStatusSelectUI();
      } catch {
        // ignore
      }
    });
  }

  const creativesList = el('creativesList');
  if (creativesList) {
    creativesList.addEventListener('click', async (ev) => {
      const btn = ev.target?.closest?.('button[data-creative-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-creative-action');
      const id = btn.getAttribute('data-creative-id');
      if (!action || !id) return;
      if (!await ensureSupabaseReady()) return;

      if (action === 'edit') {
        const { data, error } = await sb
          .from('creatives')
          .select('id, token, status, description')
          .eq('id', id)
          .maybeSingle();
        if (error || !data) {
          setHint('creativeHint', error?.message || 'Não encontrado.');
          return;
        }
        el('creativeEditingId').value = String(data.id);
        el('creativeToken').value = data.token || '';
        el('creativeStatus').value = data.status || 'Disponível';
        el('creativeDesc').value = data.description || '';
        setHint('creativeHint', 'Editando...');
      }

      if (action === 'del') {
        const ok = window.confirm('Excluir este criativo?');
        if (!ok) return;
        const { error } = await sb.from('creatives').delete().eq('id', id);
        if (error) {
          setHint('creativeHint', error.message);
          return;
        }
        await refreshCreatives();
      }
    });
  }
  el('saveOpBtn').addEventListener('click', async () => {
    if (!await ensureSupabaseReady()) return;
    await saveOperation();
  });
  el('clearOpBtn').addEventListener('click', () => {
    clearOperationForm();
    setOpsFormOpen(false);
  });
  el('logoutBtn').addEventListener('click', async () => {
    if (!await ensureSupabaseReady()) return;
    await stopPresence();
    await sb.auth.signOut();
    currentSession = null;
    currentProfile = null;
    setAuthedUI(false);
    updateGreeting();
    setActiveNav('ops');
    showPage('ops');
  });

  el('grantAdminBtn').addEventListener('click', async () => {
    if (!await ensureSupabaseReady()) return;
    await grantAdmin();
  });

  const saveMonthlyRewardBtn = el('saveMonthlyRewardBtn');
  if (saveMonthlyRewardBtn) {
    saveMonthlyRewardBtn.addEventListener('click', async () => {
      if (!await ensureSupabaseReady()) return;
      const hint = el('adminAlert');
      if (hint) hint.style.display = 'none';
      if (!currentSession?.user?.id) return;

      const v = (el('monthlyRewardInput')?.value || '').trim();
      const { error } = await sb
        .from('app_settings')
        .upsert(
          [
            { key: 'monthly_reward', value: v }
          ],
          { onConflict: 'key' }
        );

      if (error) {
        showAlert('adminAlert', error.message);
        return;
      }

      // Também salva no mês atual para aparecer no Ranking (premiação mensal)
      try {
        const now = new Date();
        const ym = `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        const { data: existing } = await sb
          .from('monthly_awards')
          .select('winner_user_id, winner_username, winner_avatar_url')
          .eq('ym', ym)
          .maybeSingle();

        await sb
          .from('monthly_awards')
          .upsert(
            {
              ym,
              reward: v,
              reward_image: '',
              winner_user_id: existing?.winner_user_id || null,
              winner_username: existing?.winner_username || null,
              winner_avatar_url: existing?.winner_avatar_url || null,
              updated_at: new Date().toISOString()
            },
            { onConflict: 'ym' }
          );
      } catch {
        // ignore
      }

      showAlert('adminAlert', 'Premiação salva!');
    });
  }

  const saveMonthlyPrizeBtn = el('saveMonthlyPrizeBtn');
  if (saveMonthlyPrizeBtn) {
    saveMonthlyPrizeBtn.addEventListener('click', async () => {
      if (!await ensureSupabaseReady()) return;
      if (!currentProfile?.is_admin) return;
      const ym = __lastRankingYm;
      if (!ym) return;

      const reward = (el('prizeAdminName')?.value || '').trim();
      const rewardImg = (el('prizeAdminImage')?.value || '').trim();

      const { data: existing } = await sb
        .from('monthly_awards')
        .select('winner_user_id, winner_username, winner_avatar_url')
        .eq('ym', ym)
        .maybeSingle();

      const { error } = await sb
        .from('monthly_awards')
        .upsert(
          {
            ym,
            reward,
            reward_image: rewardImg,
            winner_user_id: existing?.winner_user_id || null,
            winner_username: existing?.winner_username || null,
            winner_avatar_url: existing?.winner_avatar_url || null,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'ym' }
        );

      if (error) {
        showAlert('opAlert', `Erro ao salvar prêmio: ${error.message}`);
        return;
      }

      showAlert('opAlert', 'Prêmio salvo para este mês.');
      await loadRanking();
    });
  }

  const saveMonthlyAwardBtn = el('saveMonthlyAwardBtn');
  if (saveMonthlyAwardBtn) {
    saveMonthlyAwardBtn.addEventListener('click', async () => {
      if (!await ensureSupabaseReady()) return;
      if (!currentProfile?.is_admin) return;
      const ym = __lastRankingYm;
      if (!ym) return;

      const top1 = (__lastRankingData || [])[0];
      if (!top1?.username) return;

      const reward = (el('prizeAdminName')?.value || '').trim();
      const rewardImg = (el('prizeAdminImage')?.value || '').trim();
      const winnerUserId = top1.user_id ? String(top1.user_id) : null;
      const winnerUsername = String(top1.username);
      const winnerAvatarUrl = top1.avatar_url || avatarUrlById(top1.avatar_id || AVATARS[0].id);

      const { error } = await sb
        .from('monthly_awards')
        .upsert(
          {
            ym,
            reward,
            reward_image: rewardImg,
            winner_user_id: winnerUserId,
            winner_username: winnerUsername,
            winner_avatar_url: winnerAvatarUrl,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'ym' }
        );

      if (error) {
        showAlert('opAlert', `Erro ao salvar premiação: ${error.message}`);
        return;
      }

      showAlert('opAlert', 'Premiação salva para este mês.');
      await loadRanking();
    });
  }

  const saveModeBtn = el('saveChartModeBtn');
  if (saveModeBtn) {
    saveModeBtn.addEventListener('click', async () => {
      if (!await ensureSupabaseReady()) return;
      const mode = el('chartMode')?.value || 'combo';
      const hint = el('chartModeHint');
      if (!currentSession?.user?.id) return;
      const { error } = await sb
        .from('profiles')
        .update({ chart_mode: mode })
        .eq('id', currentSession.user.id);

      if (hint) hint.textContent = error ? 'Erro ao salvar.' : 'Salvo!';
      if (!error) {
        currentProfile = { ...currentProfile, chart_mode: mode };
        setChartModeUI(mode);
        await refreshChart();
      }
    });
  }

  const chartModeSel = el('chartMode');
  if (chartModeSel) {
    chartModeSel.addEventListener('change', async () => {
      setChartModeUI(chartModeSel.value);
      await refreshChart();
    });
  }

  const saveProfileBtn = el('saveProfileBtn');
  if (saveProfileBtn) {
    saveProfileBtn.addEventListener('click', async () => {
      if (!await ensureSupabaseReady()) return;
      const hint = el('profileHint');
      if (hint) hint.textContent = '';
      if (!currentSession?.user?.id) return;

      const rawUsername = (el('profileUsername')?.value || '').trim();
      const username = normalizeUsername(rawUsername);
      const mode = el('chartMode')?.value || 'combo';
      const email = (el('profileEmail')?.value || '').trim();
      const password = (el('profilePassword')?.value || '');
      const avatarId = avatarIdOrDefault(__selectedAvatarId || AVATARS[0].id);
      const monthlyGoal = toNumber(el('profileMonthlyGoal')?.value);

      if (!username) {
        if (hint) hint.textContent = 'Username inválido.';
        return;
      }

      const { data, error } = await sb
        .from('profiles')
        .update({ username, chart_mode: mode, avatar_id: avatarId, monthly_goal: monthlyGoal })
        .eq('id', currentSession.user.id)
        .select('id, username, is_admin, chart_mode, avatar_id, avatar_url, monthly_goal')
        .single();

      if (error) {
        if (hint) hint.textContent = error.message;
        return;
      }

      currentProfile = data;
      setUserLabel();
      setUserAvatar();
      updateGreeting();
      setChartModeUI(currentProfile.chart_mode || 'combo');
      if (hint) hint.textContent = 'Salvo!';
      await checkAdmin();
      await refreshChart();

      if (email) {
        const { error: eErr } = await sb.auth.updateUser({ email });
        if (eErr) {
          if (hint) hint.textContent = `Perfil salvo, mas email: ${eErr.message}`;
        } else {
          if (hint) hint.textContent = 'Perfil salvo. Confirme o novo email na caixa de entrada.';
        }
      }

      if (password) {
        const { error: pErr } = await sb.auth.updateUser({ password });
        if (pErr) {
          if (hint) hint.textContent = `Perfil salvo, mas senha: ${pErr.message}`;
        } else {
          if (hint) hint.textContent = 'Perfil salvo e senha alterada.';
        }
      }

      await refreshRankingIfOpen();
    });
  }

  const toggleAvatarBtn = el('toggleAvatarBtn');
  if (toggleAvatarBtn) {
    toggleAvatarBtn.addEventListener('click', () => {
      const grid = el('avatarGrid');
      if (!grid) return;
      grid.style.display = grid.style.display === 'none' ? 'grid' : 'none';
      renderAvatarGrid();
    });
  }

  const uploadAvatarBtn = el('uploadAvatarBtn');
  if (uploadAvatarBtn) {
    uploadAvatarBtn.addEventListener('click', async () => {
      if (!await ensureSupabaseReady()) return;
      const hint = el('profileHint');
      if (hint) hint.textContent = '';
      if (!currentSession?.user?.id) return;

      const input = el('avatarFile');
      const file = input?.files?.[0];
      if (!file) {
        if (hint) hint.textContent = 'Escolha uma foto.';
        return;
      }

      const ext = (file.name.split('.').pop() || 'png').toLowerCase();
      const safeExt = ['png', 'jpg', 'jpeg', 'webp'].includes(ext) ? ext : 'png';
      const path = `${currentSession.user.id}/${Date.now()}.${safeExt}`;

      if (hint) hint.textContent = 'Enviando avatar...';

      const { error: upErr } = await sb
        .storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type || undefined });

      if (upErr) {
        if (hint) hint.textContent = upErr.message;
        return;
      }

      const { data: pub } = sb.storage.from('avatars').getPublicUrl(path);
      const avatarUrl = pub?.publicUrl || '';
      if (!avatarUrl) {
        if (hint) hint.textContent = 'Falha ao gerar URL pública.';
        return;
      }

      const { data: prof, error: pErr } = await sb
        .from('profiles')
        .update({ avatar_url: avatarUrl })
        .eq('id', currentSession.user.id)
        .select('id, username, is_admin, chart_mode, avatar_id, avatar_url')
        .single();

      if (pErr) {
        if (hint) hint.textContent = pErr.message;
        return;
      }

      currentProfile = prof;
      setUserAvatar();
      if (hint) hint.textContent = 'Avatar atualizado!';
      await refreshRankingIfOpen();
    });
  }

  setupTabs();

  setAuthedUI(false);
  el('opDate').value = todayISO();
  el('filterFrom').value = '';
  el('filterTo').value = '';

  async function handleLogin(usernameIfFirstAccess) {
    hideAlert('authAlert');
    const email = (el('authEmail').value || '').trim();
    const password = el('authPassword').value || '';

    if (!email || !password) {
      showAlert('authAlert', 'Preencha email e senha.');
      return;
    }

    if (__loginInFlight) {
      showAlert('authAlert', 'Aguarde... login em andamento.');
      return;
    }

    try { console.log('[auth] attempting login', { email: email ? '***' : '' }); } catch {}

    showAlert('authAlert', 'Entrando...');
    setAuthLoading(true);
    __loginInFlight = true;
    try {
      if (!await ensureSupabaseReady()) return;
      try { console.log('[auth] calling signInWithPassword'); } catch {}
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      try { console.log('[auth] signIn result', { hasSession: Boolean(data?.session), error: error?.message || '' }); } catch {}
      if (error) {
        if (error.status === 429) {
          showAlert('authAlert', 'Muitas tentativas. Aguarde 1-2 minutos e tente novamente.');
          return;
        }
        showAlert('authAlert', error.message);
        return;
      }

      if (data?.session) {
        try {
          try { console.log('[auth] calling onAuthed from login'); } catch {}
          await onAuthed(data.session, usernameIfFirstAccess || '');
        } catch (e) {
          showAlert('authAlert', e?.message || 'Erro ao entrar.');
        }
        return;
      }

      if (!data?.session) {
        if (sb?.auth?.getSession) {
          const { data: s } = await sb.auth.getSession();
          if (s?.session) {
            await onAuthed(s.session, usernameIfFirstAccess || '');
          }
        }
      }
    } finally {
      __loginInFlight = false;
      setAuthLoading(false);
    }
  }

  if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
      try { console.log('[auth] click login'); } catch {}
      await handleLogin('');
    });
  }

  const adminUserSaveBtn = el('adminUserSaveBtn');
  if (adminUserSaveBtn) {
    adminUserSaveBtn.addEventListener('click', async () => {
      const hint = el('adminUsersHint');
      if (hint) {
        hint.style.display = 'none';
        hint.textContent = '';
      }

      if (!currentProfile?.is_admin) return;
      const id = (el('adminUserEditingId')?.value || '').trim();
      const email = (el('adminUserEmail')?.value || '').trim();
      const password = (el('adminUserPassword')?.value || '');
      const isAdmin = Boolean(el('adminUserIsAdmin')?.checked);

      try {
        if (!email) throw new Error('Digite o email.');
        if (!id && !password) throw new Error('Defina uma senha para criar o usuário.');

        if (!id) {
          await adminUsersApi('POST', { email, password, is_admin: isAdmin });
        } else {
          await adminUsersApi('PUT', { id, email, password: password || undefined, is_admin: isAdmin });
        }

        clearAdminUserForm();
        await refreshAdminUsers();
      } catch (e) {
        if (hint) {
          hint.style.display = 'block';
          hint.textContent = e?.message || 'Erro ao salvar usuário.';
        }
      }
    });
  }

  const adminUserClearBtn = el('adminUserClearBtn');
  if (adminUserClearBtn) {
    adminUserClearBtn.addEventListener('click', () => {
      clearAdminUserForm();
    });
  }

  const adminUsersRefreshBtn = el('adminUsersRefreshBtn');
  if (adminUsersRefreshBtn) {
    adminUsersRefreshBtn.addEventListener('click', async () => {
      if (!currentProfile?.is_admin) return;
      try {
        await refreshAdminUsers();
      } catch (e) {
        const hint = el('adminUsersHint');
        if (hint) {
          hint.style.display = 'block';
          hint.textContent = e?.message || 'Erro ao carregar usuários.';
        }
      }
    });
  }

  const adminUsersList = el('adminUsersList');
  if (adminUsersList) {
    adminUsersList.addEventListener('click', async (ev) => {
      if (!currentProfile?.is_admin) return;
      const btn = ev.target?.closest?.('[data-admin-users-action]');
      if (!btn) return;

      const action = btn.getAttribute('data-admin-users-action');
      const id = (btn.getAttribute('data-admin-users-id') || '').trim();
      if (!action || !id) return;

      const hint = el('adminUsersHint');
      if (hint) {
        hint.style.display = 'none';
        hint.textContent = '';
      }

      try {
        const last = Array.isArray(window.__lastAdminUsers) ? window.__lastAdminUsers : [];
        const row = last.find((x) => String(x?.id || '') === id) || null;

        if (action === 'edit') {
          if (el('adminUserEditingId')) el('adminUserEditingId').value = id;
          if (el('adminUserEmail')) el('adminUserEmail').value = row?.email || '';
          if (el('adminUserPassword')) el('adminUserPassword').value = '';
          if (el('adminUserIsAdmin')) el('adminUserIsAdmin').checked = Boolean(row?.is_admin);
          return;
        }

        if (action === 'del') {
          const ok = confirm('Excluir este usuário?');
          if (!ok) return;
          await adminUsersApi('DELETE', { id });
          clearAdminUserForm();
          await refreshAdminUsers();
        }
      } catch (e) {
        if (hint) {
          hint.style.display = 'block';
          hint.textContent = e?.message || 'Erro ao executar ação.';
        }
      }
    });
  }

  if (await ensureSupabaseReady()) {
    if (!sb?.auth?.onAuthStateChange) {
      showAlert('authAlert', 'Supabase Auth não inicializou. Recarregue a página (Ctrl+F5).');
      return;
    }

    sb.auth.onAuthStateChange(async (_event, session) => {
      if (!session) {
        currentSession = null;
        currentProfile = null;
        setAuthedUI(false);
        updateGreeting();
        setActiveNav('ops');
        showPage('ops');
        return;
      }

      try {
        await onAuthed(session, '');
      } catch (e) {
        showAlert('authAlert', e.message);
      }
    });
  }
}

boot();
