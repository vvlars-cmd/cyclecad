/**
 * @file widgets/admin-outreach-pro.js
 * @description Admin · OutreachPro console — surfaces Sachin's self-hosted
 *   B2B cold-email platform (normally on Express :3000) inside the cycleCAD
 *   Suite admin shell. 10 tabs mirror the OutreachPro UI: Pipeline · Campaigns ·
 *   Composer · Unibox · Leads · Scrapers · AI · Integrations · Analytics ·
 *   Settings.
 *
 *   Server bridge: prefers `window.CYCLECAD_CONFIG.outreachBase`, then the
 *   admin proxy at `/api/outreach/*`, then in-widget demo data — so the widget
 *   always renders something credible.
 *
 * @author  Sachin Kumar
 * @license MIT
 */

const BRAND_ORANGE = '#FF6B2B';
const PALETTE = {
  ink:     '#1A1A1A',
  muted:   '#6B7280',
  rule:    '#e5e7eb',
  bg:      '#F9FAFB',
  card:    '#ffffff',
  sky:     '#3B82F6',
  emerald: '#10B981',
  purple:  '#7C3AED',
  gold:    '#D4A843',
  rose:    '#E11D48',
  orange:  BRAND_ORANGE,
};

const KANBAN_COLUMNS = [
  { id: 'prospect',    label: 'Prospect',    color: PALETTE.muted   },
  { id: 'outreached',  label: 'Outreached',  color: PALETTE.sky     },
  { id: 'replied',     label: 'Replied',     color: PALETTE.purple  },
  { id: 'demo',        label: 'Demo Booked', color: PALETTE.orange  },
  { id: 'trial',       label: 'Trial',       color: PALETTE.gold    },
  { id: 'won',         label: 'Won',         color: PALETTE.emerald },
  { id: 'lost',        label: 'Lost',        color: PALETTE.rose    },
];

const TABS = [
  { id: 'pipeline',     label: 'Pipeline',     icon: 'P' },
  { id: 'campaigns',    label: 'Campaigns',    icon: 'C' },
  { id: 'composer',     label: 'Composer',     icon: 'E' },
  { id: 'unibox',       label: 'Unibox',       icon: 'U' },
  { id: 'leads',        label: 'Leads',        icon: 'L' },
  { id: 'scrapers',     label: 'Scrapers',     icon: 'S' },
  { id: 'ai',           label: 'AI Copilot',   icon: 'A' },
  { id: 'integrations', label: 'Integrations', icon: 'I' },
  { id: 'analytics',    label: 'Analytics',    icon: 'D' },
  { id: 'settings',     label: 'Settings',     icon: 'G' },
];

const REPLY_LABELS = ['Interested', 'Not now', 'Meeting booked', 'Auto-reply', 'Out of office', 'Decline'];

const REPLY_LABEL_COLOR = {
  'Interested':     PALETTE.emerald,
  'Not now':        PALETTE.gold,
  'Meeting booked': PALETTE.purple,
  'Auto-reply':     PALETTE.muted,
  'Out of office':  PALETTE.sky,
  'Decline':        PALETTE.rose,
};

/* ----------------------------------------------------------------- demo data */

const DEMO_LEADS = [
  { id: 'l1',  name: 'Stadtrad Berlin',         contact: 'Martin Becker',   email: 'm.becker@stadtrad.de',          phone: '+49 30 1234567',  category: 'Bike shop',     rating: 4.7, reviews: 312, city: 'Berlin',     status: 'prospect'   },
  { id: 'l2',  name: 'Kölner Fahrradkurier',    contact: 'Lena Schmitz',    email: 'lena@koelnkurier.de',           phone: '+49 221 998877',  category: 'Courier fleet', rating: 4.5, reviews: 89,  city: 'Köln',       status: 'outreached' },
  { id: 'l3',  name: 'Bikepark Hamburg',        contact: 'Jonas Vogel',     email: 'jonas@bikepark-hh.de',          phone: '+49 40 776655',   category: 'Rental',        rating: 4.8, reviews: 540, city: 'Hamburg',    status: 'replied'    },
  { id: 'l4',  name: 'La Bicicletta Roma',      contact: 'Marco Esposito',  email: 'marco@labicicletta.it',         phone: '+39 06 555111',   category: 'Bike shop',     rating: 4.6, reviews: 221, city: 'Roma',       status: 'demo'       },
  { id: 'l5',  name: 'Fietswinkel Amsterdam',   contact: 'Sanne de Vries',  email: 'sanne@fietsamsterdam.nl',       phone: '+31 20 444333',   category: 'Bike shop',     rating: 4.9, reviews: 612, city: 'Amsterdam',  status: 'trial'      },
  { id: 'l6',  name: 'Vélo Lyonnais',           contact: 'Camille Dubois',  email: 'camille@velolyon.fr',           phone: '+33 4 7280 1100', category: 'Bike shop',     rating: 4.3, reviews: 145, city: 'Lyon',       status: 'won'        },
  { id: 'l7',  name: 'Bicicletas Madrid',       contact: 'Pablo García',    email: 'pablo@bicimadrid.es',           phone: '+34 91 778899',   category: 'Bike shop',     rating: 4.4, reviews: 178, city: 'Madrid',     status: 'lost'       },
  { id: 'l8',  name: 'Wiener Radhaus',          contact: 'Klaus Huber',     email: 'klaus@radhaus.at',              phone: '+43 1 332211',    category: 'Bike shop',     rating: 4.6, reviews: 256, city: 'Wien',       status: 'prospect'   },
  { id: 'l9',  name: 'Bike Republic Praha',     contact: 'Tomáš Novák',     email: 'tomas@bikerepublic.cz',         phone: '+420 222 111000', category: 'Rental',        rating: 4.5, reviews: 198, city: 'Praha',      status: 'outreached' },
  { id: 'l10', name: 'Cykelhandlare Stockholm', contact: 'Astrid Lundberg', email: 'astrid@cykelsthlm.se',          phone: '+46 8 555000',    category: 'Bike shop',     rating: 4.7, reviews: 287, city: 'Stockholm',  status: 'outreached' },
  { id: 'l11', name: 'Brussels Bike Hub',       contact: 'Lucas Janssens',  email: 'lucas@bxlbike.be',              phone: '+32 2 555444',    category: 'Courier fleet', rating: 4.2, reviews: 76,  city: 'Brussels',   status: 'prospect'   },
  { id: 'l12', name: 'Helsinki Pyörä',          contact: 'Eero Korhonen',   email: 'eero@helsinkipyora.fi',         phone: '+358 9 1234',     category: 'Bike shop',     rating: 4.8, reviews: 332, city: 'Helsinki',   status: 'replied'    },
  { id: 'l13', name: 'Lisbon Cyclery',          contact: 'Sofia Almeida',   email: 'sofia@lisboncyclery.pt',        phone: '+351 21 999888',  category: 'Rental',        rating: 4.6, reviews: 410, city: 'Lisboa',     status: 'demo'       },
  { id: 'l14', name: 'Munich e-Bike Werks',     contact: 'Heinz Müller',    email: 'heinz@muc-ebikes.de',           phone: '+49 89 220011',   category: 'E-bike OEM',    rating: 4.9, reviews: 188, city: 'München',    status: 'trial'      },
  { id: 'l15', name: 'Zürich Velohaus',         contact: 'Pascal Meier',    email: 'pascal@velohaus.ch',            phone: '+41 44 777666',   category: 'Bike shop',     rating: 4.7, reviews: 264, city: 'Zürich',     status: 'prospect'   },
  { id: 'l16', name: 'Dublin Bike Co.',         contact: 'Aoife Murphy',    email: 'aoife@dublinbike.ie',           phone: '+353 1 222111',   category: 'Bike shop',     rating: 4.4, reviews: 132, city: 'Dublin',     status: 'outreached' },
  { id: 'l17', name: 'Barcelona Bicis',         contact: 'Núria Puig',      email: 'nuria@bcnbicis.es',             phone: '+34 93 666555',   category: 'Rental',        rating: 4.5, reviews: 502, city: 'Barcelona',  status: 'replied'    },
  { id: 'l18', name: 'København Cykler',        contact: 'Mads Sørensen',   email: 'mads@kbhcykler.dk',             phone: '+45 33 998877',   category: 'Bike shop',     rating: 4.8, reviews: 356, city: 'København',  status: 'won'        },
  { id: 'l19', name: 'Oslo Sykkelverksted',     contact: 'Ingrid Hansen',   email: 'ingrid@oslosykkel.no',          phone: '+47 22 555000',   category: 'Bike shop',     rating: 4.6, reviews: 211, city: 'Oslo',       status: 'prospect'   },
  { id: 'l20', name: 'Warszawa Rowery',         contact: 'Anna Kowalski',   email: 'anna@warsawrowery.pl',          phone: '+48 22 444333',   category: 'Bike shop',     rating: 4.3, reviews: 167, city: 'Warszawa',   status: 'lost'       },
  { id: 'l21', name: 'Athens Velo',             contact: 'Nikos Papas',     email: 'nikos@athensvelo.gr',           phone: '+30 21 0888777',  category: 'Rental',        rating: 4.5, reviews: 222, city: 'Athens',     status: 'prospect'   },
  { id: 'l22', name: 'Tallinn Jalgrattad',      contact: 'Kerli Tamm',      email: 'kerli@tallinnjr.ee',            phone: '+372 666 5544',   category: 'Bike shop',     rating: 4.4, reviews: 98,  city: 'Tallinn',    status: 'outreached' },
  { id: 'l23', name: 'Riga Velo Centrs',        contact: 'Janis Berzins',   email: 'janis@rigavelo.lv',             phone: '+371 67 22 11',   category: 'Bike shop',     rating: 4.2, reviews: 73,  city: 'Riga',       status: 'prospect'   },
  { id: 'l24', name: 'Sofia Bike Studio',       contact: 'Petar Ivanov',    email: 'petar@sofiabike.bg',            phone: '+359 2 999000',   category: 'Bike shop',     rating: 4.6, reviews: 154, city: 'Sofia',      status: 'replied'    },
  { id: 'l25', name: 'Budapest Kerékpár',       contact: 'Eszter Nagy',     email: 'eszter@bpkerekpar.hu',          phone: '+36 1 555111',    category: 'Rental',        rating: 4.7, reviews: 289, city: 'Budapest',   status: 'demo'       },
];

const DEMO_CAMPAIGNS = [
  { id: 'c1', name: 'EU bike-shop intro · Q2', status: 'running', sent: 412, opens: 198, replies: 47, clicks: 88,  variant: 'A', sequence: 4 },
  { id: 'c2', name: 'Courier fleet upsell',     status: 'paused',  sent: 156, opens: 71,  replies: 12, clicks: 22,  variant: 'B', sequence: 3 },
  { id: 'c3', name: 'E-bike OEM partnership',   status: 'draft',   sent: 0,   opens: 0,   replies: 0,  clicks: 0,   variant: 'A', sequence: 5 },
  { id: 'c4', name: 'Re-engage stale leads',    status: 'done',    sent: 220, opens: 64,  replies: 8,  clicks: 12,  variant: 'B', sequence: 2 },
];

const DEMO_THREADS = [
  { id: 't1', from: 'Jonas Vogel <jonas@bikepark-hh.de>',     subject: 'Re: cycleCAD design pipeline',     label: 'Interested',     ts: '2026-04-26T09:14:00Z', body: 'Hi Sachin — yes, this looks very interesting. We currently use Solidworks but the licence costs are killing us. Can you walk me through pricing? Also: do you support DXF round-trips with our Stadtrad partner shops?' },
  { id: 't2', from: 'Lena Schmitz <lena@koelnkurier.de>',     subject: 'Re: Quick question for your fleet', label: 'Not now',        ts: '2026-04-26T08:02:00Z', body: 'Thanks for reaching out. We are mid-rollout of a new dispatch tool, so tooling reviews are frozen until July. Please ping me again in Q3.' },
  { id: 't3', from: 'Marco Esposito <marco@labicicletta.it>', subject: 'Re: Demo on Thursday?',             label: 'Meeting booked', ts: '2026-04-25T16:48:00Z', body: 'Perfect, Thursday 15:00 CET works. I have invited my CTO Giulia. Send the Meet link to both addresses please.' },
  { id: 't4', from: 'noreply@helpscout.io',                   subject: 'Out of office: Pablo García',      label: 'Out of office',  ts: '2026-04-25T11:30:00Z', body: 'I am out of office until 5 May. For urgent matters contact carla@bicimadrid.es.' },
  { id: 't5', from: 'Anna Kowalski <anna@warsawrowery.pl>',   subject: 'Re: cycleCAD pilot',                label: 'Decline',        ts: '2026-04-24T14:20:00Z', body: 'Thanks but we just signed with a competitor on a 2-year contract. Good luck.' },
  { id: 't6', from: 'mailer-daemon@gmail.com',                subject: 'Delivery Status Notification',     label: 'Auto-reply',     ts: '2026-04-24T09:00:00Z', body: 'Your message could not be delivered to one or more recipients (550 5.1.1).' },
];

const DEMO_INTEGRATIONS = [
  { kind: 'gmail',    label: 'Gmail',           connected: true,  scope: 'send/read', lastUsed: '2026-04-26T09:14:00Z' },
  { kind: 'apify',    label: 'Apify',           connected: true,  scope: 'maps/web',  lastUsed: '2026-04-26T07:30:00Z' },
  { kind: 'calendar', label: 'Google Calendar', connected: true,  scope: 'events.rw', lastUsed: '2026-04-25T16:48:00Z' },
  { kind: 'zapier',   label: 'Zapier',          connected: false, scope: '—',         lastUsed: null },
];

/* ---------------------------------------------------------------- helpers */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

const fmtTs = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString();
};

/**
 * Resolve the OutreachPro server base URL.
 * @returns {string} base path (e.g. 'https://outreach.cyclecad.com' or '/api/outreach')
 */
function resolveBase() {
  try {
    const cfg = (typeof window !== 'undefined' && window.CYCLECAD_CONFIG) || {};
    if (cfg.outreachBase) return String(cfg.outreachBase).replace(/\/+$/, '');
  } catch { /* swallow */ }
  return '/api/outreach';
}

/**
 * Fetch JSON from the resolved server, falling back to a provided demo value
 * on any non-2xx or network error.
 * @template T
 * @param {string} path  endpoint suffix (e.g. '/leads/list')
 * @param {RequestInit} init
 * @param {T} demo  fallback payload returned when the server is unreachable
 * @returns {Promise<{ source: 'server'|'demo', data: T }>}
 */
async function fetchOrDemo(path, init, demo) {
  const base = resolveBase();
  try {
    const r = await fetch(base + path, {
      ...init,
      headers: { 'content-type': 'application/json', ...((init && init.headers) || {}) },
    });
    if (!r.ok) return { source: 'demo', data: demo };
    const j = await r.json();
    return { source: 'server', data: j };
  } catch {
    return { source: 'demo', data: demo };
  }
}

/* ===================================================================== init */

/**
 * Initialise the admin-outreach-pro widget.
 *
 * @param {Object} opts
 * @param {string|HTMLElement} opts.mount  CSS selector or element to mount into.
 * @param {string} [opts.app]              Hosting app key (e.g. 'admin').
 * @param {Object} [opts.meter]            Pre-flighted meter client; if absent, charges become no-ops.
 * @param {Object} [opts.params]           Optional widget config.
 * @returns {Promise<{ api: Object, on: Function, destroy: Function }>}
 */
export async function init(opts) {
  const root = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
  if (!root) throw new Error('admin-outreach-pro: mount not found');

  const meter = opts && opts.meter;
  const tracked = []; // { type: 'listener'|'interval'|'observer', target, ev, fn, id }
  let destroyed = false;
  let locale = 'en';

  /** Track an addEventListener so destroy() can remove it. */
  const track = (target, ev, fn, options) => {
    target.addEventListener(ev, fn, options);
    tracked.push({ type: 'listener', target, ev, fn, options });
  };

  /** Track an interval so destroy() can clear it. */
  const trackInterval = (fn, ms) => {
    const id = setInterval(fn, ms);
    tracked.push({ type: 'interval', id });
    return id;
  };

  /** Internal pub/sub. */
  const listeners = {
    tabChange: [], leadUpdate: [], campaignStart: [], campaignPause: [],
    scrapeStart: [], scrapeProgress: [], draftComposed: [], replySent: [],
    integrationConnected: [], change: [], error: [],
  };
  const emit = (ev, p) => (listeners[ev] || []).forEach((fn) => { try { fn(p); } catch { /* swallow */ } });

  /* ---------- state */
  /** @type {{ activeTab: string, leads: any[], campaigns: any[], threads: any[], integrations: any[], serverSource: Record<string, 'server'|'demo'> }} */
  const state = {
    activeTab: 'pipeline',
    leads: DEMO_LEADS.map((l) => ({ ...l })),
    campaigns: DEMO_CAMPAIGNS.map((c) => ({ ...c })),
    threads: DEMO_THREADS.map((t) => ({ ...t })),
    integrations: DEMO_INTEGRATIONS.map((i) => ({ ...i })),
    activeThreadId: DEMO_THREADS[0].id,
    composer: { campaignId: 'c1', leadId: 'l1', html: '<h1>Hello {{firstName}}</h1>\n<p>Quick note about {{company}}…</p>' },
    scrape: { running: false, progress: 0, found: 0 },
    serverSource: {},
  };

  /* ---------- DOM build */

  const wrap = document.createElement('div');
  wrap.className = 'pt-admin-outreach-pro';
  wrap.style.cssText = `
    font: 13px/1.5 Inter, -apple-system, sans-serif; color: ${PALETTE.ink};
    background: ${PALETTE.card}; border: 1px solid ${PALETTE.rule};
    border-radius: 6px; max-width: 1280px; min-height: 720px;
    display: grid; grid-template-columns: 200px 1fr; overflow: hidden;
  `;
  wrap.innerHTML = renderShell();
  root.appendChild(wrap);

  function renderShell() {
    return `
      <aside data-tabs style="background:#0E1117;color:#fff;padding:16px 8px;display:flex;flex-direction:column;gap:2px">
        <div style="font:700 11px Inter;color:${BRAND_ORANGE};letter-spacing:3px;padding:6px 10px 12px">OUTREACH·PRO</div>
        ${TABS.map((t) => `
          <a data-tab="${t.id}" style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:4px;cursor:pointer;color:#cbd2dc;font-size:12.5px;text-decoration:none">
            <span style="display:inline-block;width:18px;height:18px;background:#1a2230;border-radius:3px;text-align:center;line-height:18px;font:700 10px Inter;color:${BRAND_ORANGE}">${t.icon}</span>
            <span data-tab-label>${esc(t.label)}</span>
          </a>`).join('')}
        <div style="margin-top:auto;padding:8px 10px;font:10px Menlo,monospace;color:#64748B" data-server-status>server: …</div>
      </aside>
      <main data-panel style="padding:18px 22px;overflow-y:auto;max-height:760px;background:${PALETTE.bg}"></main>
    `;
  }

  const $tabs   = wrap.querySelector('[data-tabs]');
  const $panel  = wrap.querySelector('[data-panel]');
  const $status = wrap.querySelector('[data-server-status]');

  /* ---------- tab routing */

  function setActiveTab(name) {
    if (!TABS.find((t) => t.id === name)) name = 'pipeline';
    state.activeTab = name;
    wrap.querySelectorAll('[data-tab]').forEach((el) => {
      const active = el.getAttribute('data-tab') === name;
      el.style.background = active ? BRAND_ORANGE : 'transparent';
      el.style.color      = active ? '#fff' : '#cbd2dc';
    });
    renderPanel();
    emit('tabChange', { tab: name });
    emit('change', { kind: 'tabChange', tab: name });
  }

  function renderPanel() {
    const fn = TAB_RENDERERS[state.activeTab] || renderPipeline;
    $panel.innerHTML = fn();
    bindPanelHandlers();
  }

  /* ---------- panel renderers */

  function header(title, subtitle) {
    return `
      <div style="display:flex;align-items:end;justify-content:space-between;margin-bottom:14px">
        <div>
          <div style="font:600 10px Inter;color:${BRAND_ORANGE};letter-spacing:3px">OUTREACH · PRO</div>
          <div style="font:600 22px Georgia;margin-top:2px">${esc(title)}</div>
          ${subtitle ? `<div style="color:${PALETTE.muted};font:italic 12px Inter;margin-top:2px">${esc(subtitle)}</div>` : ''}
        </div>
      </div>`;
  }

  function kpi(label, value, color) {
    return `
      <div style="background:${PALETTE.card};border:1px solid ${PALETTE.rule};border-top:4px solid ${color};border-radius:6px;padding:14px 18px">
        <div style="font:600 10px Inter;color:${PALETTE.muted};letter-spacing:2px;text-transform:uppercase">${esc(label)}</div>
        <div style="font:700 24px Georgia;color:${PALETTE.ink};margin-top:4px">${esc(value)}</div>
      </div>`;
  }

  /* Tab 1 — Pipeline (kanban) */
  function renderPipeline() {
    const counts = Object.fromEntries(KANBAN_COLUMNS.map((c) => [c.id, 0]));
    state.leads.forEach((l) => { if (counts[l.status] != null) counts[l.status]++; });
    const totalSent     = state.campaigns.reduce((a, c) => a + c.sent, 0);
    const totalReplies  = state.campaigns.reduce((a, c) => a + c.replies, 0);
    const replyRate     = totalSent ? Math.round((totalReplies / totalSent) * 100) : 0;

    return `
      ${header('Pipeline', 'leads × stage · drag cards between columns')}
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px">
        ${kpi('Leads',          state.leads.length.toLocaleString(),     PALETTE.sky)}
        ${kpi('Campaigns',      state.campaigns.length.toLocaleString(), PALETTE.purple)}
        ${kpi('Sent',           totalSent.toLocaleString(),              BRAND_ORANGE)}
        ${kpi('Reply rate',     replyRate + ' %',                        PALETTE.emerald)}
      </div>
      <div style="display:grid;grid-template-columns:repeat(${KANBAN_COLUMNS.length},minmax(180px,1fr));gap:10px;overflow-x:auto;padding-bottom:6px" data-kanban>
        ${KANBAN_COLUMNS.map((col) => `
          <div data-column="${col.id}" style="background:${PALETTE.card};border:1px solid ${PALETTE.rule};border-top:4px solid ${col.color};border-radius:6px;padding:8px;min-height:340px">
            <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 4px 8px">
              <span style="font:600 11px Inter;letter-spacing:1.5px;text-transform:uppercase">${esc(col.label)}</span>
              <span style="font:600 10px Menlo,monospace;color:${col.color}">${counts[col.id]}</span>
            </div>
            <div data-dropzone="${col.id}" style="display:flex;flex-direction:column;gap:6px;min-height:280px">
              ${state.leads.filter((l) => l.status === col.id).map((l) => `
                <div draggable="true" data-card="${l.id}" style="background:${PALETTE.bg};border:1px solid ${PALETTE.rule};border-left:3px solid ${col.color};border-radius:4px;padding:8px 10px;cursor:grab">
                  <div style="font:600 12px Inter">${esc(l.name)}</div>
                  <div style="font:11px Inter;color:${PALETTE.muted}">${esc(l.contact)} · ${esc(l.city)}</div>
                  <div style="font:10px Menlo,monospace;color:${PALETTE.muted};margin-top:3px">★ ${l.rating} · ${l.reviews} rev</div>
                </div>`).join('')}
            </div>
          </div>`).join('')}
      </div>`;
  }

  /* Tab 2 — Campaigns */
  function renderCampaigns() {
    return `
      ${header('Campaigns', 'sequence status · open / reply / click rates · A/B variant')}
      <table style="width:100%;border-collapse:collapse;background:${PALETTE.card};border:1px solid ${PALETTE.rule};border-radius:6px">
        <thead><tr style="text-align:left;color:${PALETTE.muted};font:10px Inter;text-transform:uppercase;letter-spacing:1px">
          <th style="padding:10px">name</th><th>status</th><th>seq</th><th>variant</th>
          <th style="text-align:right">sent</th><th style="text-align:right">open %</th>
          <th style="text-align:right">reply %</th><th style="text-align:right">click %</th>
          <th style="text-align:right;padding-right:10px">actions</th>
        </tr></thead>
        <tbody>
          ${state.campaigns.map((c) => {
            const openPct  = c.sent ? Math.round((c.opens / c.sent) * 100)   : 0;
            const replyPct = c.sent ? Math.round((c.replies / c.sent) * 100) : 0;
            const clickPct = c.sent ? Math.round((c.clicks / c.sent) * 100)  : 0;
            const statusColor = { running: PALETTE.emerald, paused: PALETTE.gold, draft: PALETTE.muted, done: PALETTE.sky }[c.status] || PALETTE.ink;
            return `
              <tr style="border-top:1px solid ${PALETTE.rule}">
                <td style="padding:10px;font:600 12px Inter">${esc(c.name)}</td>
                <td><span style="display:inline-block;padding:2px 8px;border-radius:10px;background:${statusColor}22;color:${statusColor};font:600 10px Inter;letter-spacing:1px;text-transform:uppercase">${esc(c.status)}</span></td>
                <td style="font:11px Menlo,monospace">${c.sequence} steps</td>
                <td>
                  <select data-variant="${c.id}" style="padding:3px 6px;font:11px Inter;border:1px solid ${PALETTE.rule};border-radius:3px">
                    <option ${c.variant==='A'?'selected':''}>A</option>
                    <option ${c.variant==='B'?'selected':''}>B</option>
                  </select>
                </td>
                <td style="text-align:right;font:11px Menlo,monospace">${c.sent}</td>
                <td style="text-align:right;font:11px Menlo,monospace">${openPct}%</td>
                <td style="text-align:right;font:11px Menlo,monospace;color:${PALETTE.emerald}">${replyPct}%</td>
                <td style="text-align:right;font:11px Menlo,monospace">${clickPct}%</td>
                <td style="text-align:right;padding-right:10px">
                  ${c.status === 'running'
                    ? `<button data-pause="${c.id}" style="background:${PALETTE.gold};color:#fff;border:none;padding:5px 10px;border-radius:3px;font:600 10px Inter;cursor:pointer">PAUSE</button>`
                    : `<button data-start="${c.id}" style="background:${PALETTE.emerald};color:#fff;border:none;padding:5px 10px;border-radius:3px;font:600 10px Inter;cursor:pointer">START</button>`}
                </td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  }

  /* Tab 3 — Composer */
  function renderComposer() {
    const blocks = ['heading', 'text', 'button', 'image', 'signature', 'footer'];
    const variables = ['{{firstName}}', '{{company}}', '{{personalisedOpening}}', '{{senderName}}', '{{calendarLink}}'];
    return `
      ${header('HTML Composer', 'AI draft assist · variable autocomplete · live preview')}
      <div style="display:flex;gap:10px;margin-bottom:10px">
        <select data-tpl style="padding:6px 8px;font:12px Inter;border:1px solid ${PALETTE.rule};border-radius:3px">
          <option>Cold intro · short</option><option>Cold intro · long</option><option>Follow-up · day 3</option><option>Follow-up · day 7</option>
        </select>
        <button data-ai-draft style="background:${BRAND_ORANGE};color:#fff;border:none;padding:6px 12px;border-radius:4px;font:600 11px Inter;cursor:pointer">AI DRAFT</button>
        <span data-ai-status style="font:11px Menlo,monospace;color:${PALETTE.muted};align-self:center"></span>
      </div>
      <div style="display:grid;grid-template-columns:160px 1fr 1fr;gap:10px">
        <div style="background:${PALETTE.card};border:1px solid ${PALETTE.rule};border-radius:6px;padding:10px">
          <div style="font:600 10px Inter;color:${PALETTE.muted};letter-spacing:1.5px;margin-bottom:6px">BLOCKS</div>
          ${blocks.map((b) => `<button data-block="${b}" style="display:block;width:100%;text-align:left;background:${PALETTE.bg};border:1px solid ${PALETTE.rule};margin:3px 0;padding:6px 8px;border-radius:3px;font:11px Inter;cursor:pointer">+ ${esc(b)}</button>`).join('')}
          <div style="font:600 10px Inter;color:${PALETTE.muted};letter-spacing:1.5px;margin:10px 0 6px">VARS</div>
          ${variables.map((v) => `<button data-var="${v}" style="display:block;width:100%;text-align:left;background:#fff7ee;border:1px solid #ffd9bd;margin:2px 0;padding:4px 6px;border-radius:3px;font:10px Menlo,monospace;color:${BRAND_ORANGE};cursor:pointer">${esc(v)}</button>`).join('')}
        </div>
        <textarea data-html style="background:${PALETTE.card};border:1px solid ${PALETTE.rule};border-radius:6px;padding:10px;font:12px Menlo,monospace;resize:vertical;min-height:340px">${esc(state.composer.html)}</textarea>
        <div style="background:${PALETTE.card};border:1px solid ${PALETTE.rule};border-radius:6px;padding:14px;min-height:340px;overflow:auto">
          <div style="font:600 10px Inter;color:${PALETTE.muted};letter-spacing:1.5px;margin-bottom:8px">PREVIEW</div>
          <div data-preview style="font:13px/1.55 Inter;color:${PALETTE.ink}">${state.composer.html}</div>
        </div>
      </div>`;
  }

  /* Tab 4 — Unibox */
  function renderUnibox() {
    const active = state.threads.find((t) => t.id === state.activeThreadId) || state.threads[0];
    return `
      ${header('Unibox', 'reply inbox · AI-labelled threads · win/lost actions')}
      <div style="display:grid;grid-template-columns:300px 1fr;gap:10px;background:${PALETTE.card};border:1px solid ${PALETTE.rule};border-radius:6px;overflow:hidden;min-height:480px">
        <div style="border-right:1px solid ${PALETTE.rule};max-height:540px;overflow-y:auto">
          ${state.threads.map((t) => {
            const sel = t.id === state.activeThreadId;
            const c   = REPLY_LABEL_COLOR[t.label] || PALETTE.muted;
            return `
              <div data-thread="${t.id}" style="padding:10px 12px;border-bottom:1px solid ${PALETTE.rule};cursor:pointer;background:${sel ? '#fff7ee' : PALETTE.card}">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">
                  <span style="font:600 12px Inter">${esc(t.from.split('<')[0].trim())}</span>
                  <span style="display:inline-block;padding:1px 6px;border-radius:8px;background:${c}22;color:${c};font:600 9px Inter;letter-spacing:0.8px;text-transform:uppercase">${esc(t.label)}</span>
                </div>
                <div style="font:11px Inter;color:${PALETTE.muted}">${esc(t.subject)}</div>
              </div>`;
          }).join('')}
        </div>
        <div style="padding:16px 18px;display:flex;flex-direction:column;max-height:540px">
          <div style="font:600 14px Georgia;margin-bottom:2px">${esc(active.subject)}</div>
          <div style="font:11px Menlo,monospace;color:${PALETTE.muted};margin-bottom:2px">from ${esc(active.from)}</div>
          <div style="font:10px Menlo,monospace;color:${PALETTE.muted};margin-bottom:14px">${fmtTs(active.ts)}</div>
          <div style="font:13px/1.6 Inter;color:${PALETTE.ink};white-space:pre-wrap;flex:1;overflow:auto">${esc(active.body)}</div>
          <div style="display:flex;gap:8px;margin-top:12px;padding-top:10px;border-top:1px solid ${PALETTE.rule}">
            <button data-mark="won"  style="background:${PALETTE.emerald};color:#fff;border:none;padding:6px 12px;border-radius:3px;font:600 11px Inter;cursor:pointer">MARK WON</button>
            <button data-mark="lost" style="background:${PALETTE.rose};color:#fff;border:none;padding:6px 12px;border-radius:3px;font:600 11px Inter;cursor:pointer">MARK LOST</button>
            <button data-auto-reply  style="background:${BRAND_ORANGE};color:#fff;border:none;padding:6px 12px;border-radius:3px;font:600 11px Inter;cursor:pointer">AUTO-REPLY</button>
            <input data-reply-body type=text placeholder="quick reply…" style="flex:1;padding:6px 8px;border:1px solid ${PALETTE.rule};border-radius:3px;font:12px Inter">
            <button data-send-reply style="background:${PALETTE.purple};color:#fff;border:none;padding:6px 12px;border-radius:3px;font:600 11px Inter;cursor:pointer">SEND</button>
          </div>
        </div>
      </div>`;
  }

  /* Tab 5 — Leads */
  function renderLeads() {
    return `
      ${header('Leads', 'scraped · enrichable · bulk-actionable')}
      <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">
        <input data-leads-search type=text placeholder="search name / city / category…" style="flex:1;min-width:200px;padding:6px 10px;border:1px solid ${PALETTE.rule};border-radius:3px;font:12px Inter">
        <button data-bulk="campaign" style="background:${PALETTE.purple};color:#fff;border:none;padding:6px 12px;border-radius:3px;font:600 11px Inter;cursor:pointer">ASSIGN CAMPAIGN</button>
        <button data-bulk="export-xlsx" style="background:${PALETTE.emerald};color:#fff;border:none;padding:6px 12px;border-radius:3px;font:600 11px Inter;cursor:pointer">EXPORT XLSX</button>
        <button data-bulk="export-csv"  style="background:${PALETTE.sky};color:#fff;border:none;padding:6px 12px;border-radius:3px;font:600 11px Inter;cursor:pointer">EXPORT CSV</button>
        <button data-bulk="stale"       style="background:${PALETTE.gold};color:#fff;border:none;padding:6px 12px;border-radius:3px;font:600 11px Inter;cursor:pointer">MARK STALE</button>
        <button data-bulk="verify"      style="background:${BRAND_ORANGE};color:#fff;border:none;padding:6px 12px;border-radius:3px;font:600 11px Inter;cursor:pointer">VERIFY EMAILS</button>
      </div>
      <div style="background:${PALETTE.card};border:1px solid ${PALETTE.rule};border-radius:6px;overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="text-align:left;color:${PALETTE.muted};font:10px Inter;text-transform:uppercase;letter-spacing:1px;background:${PALETTE.bg}">
            <th style="padding:8px"><input type=checkbox data-select-all></th>
            <th>name</th><th>company</th><th>email</th><th>phone</th><th>category</th>
            <th>rating</th><th>reviews</th><th>city</th><th>status</th>
          </tr></thead>
          <tbody data-leads-body>
            ${state.leads.map((l) => `
              <tr style="border-top:1px solid ${PALETTE.rule}" data-lead-row="${l.id}">
                <td style="padding:8px"><input type=checkbox data-lead-pick="${l.id}"></td>
                <td>${esc(l.contact)}</td>
                <td style="font:600 12px Inter">${esc(l.name)}</td>
                <td style="font:11px Menlo,monospace">${esc(l.email)}</td>
                <td style="font:11px Menlo,monospace">${esc(l.phone)}</td>
                <td>${esc(l.category)}</td>
                <td style="font:11px Menlo,monospace">★ ${l.rating}</td>
                <td style="font:11px Menlo,monospace">${l.reviews}</td>
                <td>${esc(l.city)}</td>
                <td><span style="font:10px Menlo,monospace;color:${PALETTE.muted}">${esc(l.status)}</span></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  /* Tab 6 — Scrapers */
  function renderScrapers() {
    return `
      ${header('Scrapers', 'Apify Maps · Gmail Unibox harvest · live SSE progress')}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div style="background:${PALETTE.card};border:1px solid ${PALETTE.rule};border-radius:6px;padding:14px">
          <div style="font:600 12px Inter;color:${BRAND_ORANGE};letter-spacing:2px;margin-bottom:8px">APIFY MAPS</div>
          <label style="display:block;font-size:11px;color:${PALETTE.muted}">query
            <input data-scrape-q type=text value="bike shop" style="width:100%;padding:6px 8px;font:12px Inter;border:1px solid ${PALETTE.rule};border-radius:3px;margin-top:2px">
          </label>
          <label style="display:block;font-size:11px;color:${PALETTE.muted};margin-top:6px">location
            <input data-scrape-loc type=text value="Berlin, Germany" style="width:100%;padding:6px 8px;font:12px Inter;border:1px solid ${PALETTE.rule};border-radius:3px;margin-top:2px">
          </label>
          <label style="display:block;font-size:11px;color:${PALETTE.muted};margin-top:6px">fields (csv)
            <input data-scrape-fields type=text value="name,email,phone,rating,reviews" style="width:100%;padding:6px 8px;font:11px Menlo,monospace;border:1px solid ${PALETTE.rule};border-radius:3px;margin-top:2px">
          </label>
          <button data-run-scrape style="margin-top:10px;background:${BRAND_ORANGE};color:#fff;border:none;padding:8px 14px;border-radius:4px;font:600 12px Inter;cursor:pointer">RUN APIFY SCRAPE</button>
          <div data-scrape-log style="margin-top:10px;font:11px Menlo,monospace;color:${PALETTE.muted};min-height:48px">idle.</div>
          <div style="margin-top:8px;background:${PALETTE.bg};height:8px;border-radius:4px;overflow:hidden">
            <div data-scrape-bar style="height:100%;width:0;background:${BRAND_ORANGE};transition:width .3s"></div>
          </div>
        </div>
        <div style="background:${PALETTE.card};border:1px solid ${PALETTE.rule};border-radius:6px;padding:14px">
          <div style="font:600 12px Inter;color:${PALETTE.purple};letter-spacing:2px;margin-bottom:8px">GMAIL UNIBOX HARVEST</div>
          <p style="font:12px Inter;color:${PALETTE.muted}">Pull replies from the connected Gmail mailbox, AI-label them, and dedupe against existing threads.</p>
          <button data-run-harvest style="background:${PALETTE.purple};color:#fff;border:none;padding:8px 14px;border-radius:4px;font:600 12px Inter;cursor:pointer">HARVEST UNIBOX</button>
          <div data-harvest-log style="margin-top:10px;font:11px Menlo,monospace;color:${PALETTE.muted};min-height:48px">idle.</div>
        </div>
      </div>`;
  }

  /* Tab 7 — AI Copilot */
  function renderAi() {
    return `
      ${header('AI Copilot', 'natural-language commands · WARP mode · per-lead personalisation preview')}
      <div style="background:${PALETTE.card};border:1px solid ${PALETTE.rule};border-radius:6px;padding:14px;margin-bottom:14px">
        <div style="display:flex;gap:8px">
          <input data-ai-prompt type=text value="Find me 50 bike shops in Berlin and draft an intro" style="flex:1;padding:8px 10px;font:13px Inter;border:1px solid ${PALETTE.rule};border-radius:4px">
          <button data-ai-run style="background:${BRAND_ORANGE};color:#fff;border:none;padding:8px 16px;border-radius:4px;font:600 12px Inter;cursor:pointer">ASK</button>
        </div>
        <div data-ai-out style="margin-top:10px;font:12px Menlo,monospace;color:${PALETTE.muted};min-height:40px">copilot output will appear here.</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div style="background:${PALETTE.card};border:1px solid ${PALETTE.rule};border-top:4px solid ${PALETTE.rose};border-radius:6px;padding:14px">
          <div style="font:600 11px Inter;color:${PALETTE.rose};letter-spacing:2px">WARP MODE</div>
          <div style="font:13px Inter;color:${PALETTE.muted};margin:6px 0 10px">Full-auto: scrape → personalise → draft → schedule. Uses your daily send budget.</div>
          <label style="display:flex;gap:8px;align-items:center;font:12px Inter">
            <input type=checkbox data-warp> <span>Enable WARP mode</span>
          </label>
        </div>
        <div style="background:${PALETTE.card};border:1px solid ${PALETTE.rule};border-radius:6px;padding:14px">
          <div style="font:600 11px Inter;color:${PALETTE.muted};letter-spacing:2px">PERSONALISATION PREVIEW</div>
          <div style="font:11px Menlo,monospace;color:${PALETTE.ink};margin-top:6px">lead: <strong>${esc(state.leads[0].name)}</strong></div>
          <div style="margin-top:6px;font:13px/1.55 Georgia;font-style:italic;color:${PALETTE.ink}">"Hi ${esc(state.leads[0].contact.split(' ')[0])} — saw ${esc(state.leads[0].name)} has ${state.leads[0].reviews}+ reviews in ${esc(state.leads[0].city)}. Quick question about your fleet sizing process…"</div>
        </div>
      </div>`;
  }

  /* Tab 8 — Integrations */
  function renderIntegrations() {
    return `
      ${header('Integrations', 'OAuth + MCP · scopes · last-used')}
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px">
        ${state.integrations.map((i) => `
          <div style="background:${PALETTE.card};border:1px solid ${PALETTE.rule};border-radius:6px;padding:14px;display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font:600 14px Georgia">${esc(i.label)}</div>
              <div style="font:11px Menlo,monospace;color:${PALETTE.muted};margin-top:3px">scope: ${esc(i.scope)}</div>
              <div style="font:10px Menlo,monospace;color:${PALETTE.muted};margin-top:2px">last used: ${fmtTs(i.lastUsed)}</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
              <span style="display:inline-block;padding:2px 8px;border-radius:10px;background:${i.connected ? PALETTE.emerald + '22' : PALETTE.rose + '22'};color:${i.connected ? PALETTE.emerald : PALETTE.rose};font:600 10px Inter;letter-spacing:1px;text-transform:uppercase">${i.connected ? 'connected' : 'disconnected'}</span>
              <button data-int="${i.kind}" style="background:${i.connected ? PALETTE.rose : BRAND_ORANGE};color:#fff;border:none;padding:5px 12px;border-radius:3px;font:600 10px Inter;cursor:pointer">${i.connected ? 'DISCONNECT' : 'CONNECT'}</button>
            </div>
          </div>`).join('')}
      </div>`;
  }

  /* Tab 9 — Analytics */
  function renderAnalytics() {
    /* tiny inline SVG line chart, no external deps */
    const days = 14;
    const sent     = Array.from({ length: days }, (_, i) => 8 + Math.round(20 * Math.sin(i / 2) + i * 1.2));
    const opens    = sent.map((s) => Math.round(s * 0.48));
    const replies  = sent.map((s) => Math.round(s * 0.11));
    const W = 600, H = 180, pad = 24;
    const max = Math.max(...sent);
    const xy = (arr) => arr.map((v, i) => `${pad + (i / (days - 1)) * (W - 2 * pad)},${H - pad - (v / max) * (H - 2 * pad)}`).join(' ');
    const totalSent     = state.campaigns.reduce((a, c) => a + c.sent,    0);
    const totalReplies  = state.campaigns.reduce((a, c) => a + c.replies, 0);
    const totalDemos    = state.leads.filter((l) => l.status === 'demo').length;
    const totalWon      = state.leads.filter((l) => l.status === 'won').length;
    const cycleSpend    = totalSent * 3 + totalReplies * 8;

    return `
      ${header('Analytics', 'sent · opened · replied per day · funnel · $CYCLE spend')}
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:14px">
        ${kpi('Sent · 14d',    totalSent.toLocaleString(),     PALETTE.sky)}
        ${kpi('Replies · 14d', totalReplies.toLocaleString(),  PALETTE.emerald)}
        ${kpi('Demos booked',  totalDemos.toLocaleString(),    BRAND_ORANGE)}
        ${kpi('$CYCLE spent',  cycleSpend.toLocaleString(),    PALETTE.purple)}
      </div>
      <div style="background:${PALETTE.card};border:1px solid ${PALETTE.rule};border-radius:6px;padding:14px;margin-bottom:14px">
        <div style="font:600 11px Inter;color:${PALETTE.muted};letter-spacing:2px;margin-bottom:8px">SENT · OPENED · REPLIED · 14d</div>
        <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px">
          <polyline points="${xy(sent)}"    fill="none" stroke="${PALETTE.sky}"     stroke-width="2"/>
          <polyline points="${xy(opens)}"   fill="none" stroke="${PALETTE.purple}"  stroke-width="2"/>
          <polyline points="${xy(replies)}" fill="none" stroke="${PALETTE.emerald}" stroke-width="2"/>
        </svg>
        <div style="font:10px Menlo,monospace;color:${PALETTE.muted};display:flex;gap:14px">
          <span style="color:${PALETTE.sky}">▬ sent</span>
          <span style="color:${PALETTE.purple}">▬ opened</span>
          <span style="color:${PALETTE.emerald}">▬ replied</span>
        </div>
      </div>
      <div style="background:${PALETTE.card};border:1px solid ${PALETTE.rule};border-radius:6px;padding:14px">
        <div style="font:600 11px Inter;color:${PALETTE.muted};letter-spacing:2px;margin-bottom:8px">FUNNEL · PROSPECT → WON</div>
        ${KANBAN_COLUMNS.map((col) => {
          const n = state.leads.filter((l) => l.status === col.id).length;
          const pct = state.leads.length ? Math.round((n / state.leads.length) * 100) : 0;
          return `
            <div style="display:flex;align-items:center;gap:10px;margin:4px 0;font:12px Inter">
              <span style="width:120px">${esc(col.label)}</span>
              <div style="flex:1;height:14px;background:${PALETTE.bg};border-radius:4px;overflow:hidden">
                <div style="height:100%;width:${pct}%;background:${col.color}"></div>
              </div>
              <span style="font:11px Menlo,monospace;color:${PALETTE.muted};width:60px;text-align:right">${n} · ${pct}%</span>
            </div>`;
        }).join('')}
      </div>`;
  }

  /* Tab 10 — Settings */
  function renderSettings() {
    return `
      ${header('Settings', 'sender reputation · verification · daily limits · signature · sending hours')}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div style="background:${PALETTE.card};border:1px solid ${PALETTE.rule};border-radius:6px;padding:14px">
          <div style="font:600 11px Inter;color:${PALETTE.emerald};letter-spacing:2px;margin-bottom:8px">SENDER REPUTATION</div>
          <div style="font:13px Inter;margin:4px 0">warmup status: <strong style="color:${PALETTE.emerald}">healthy (94 / 100)</strong></div>
          <div style="font:13px Inter;margin:4px 0">deliverability score: <strong>9.1 / 10</strong></div>
          <div style="font:13px Inter;margin:4px 0">network: <strong>148 inboxes</strong></div>
        </div>
        <div style="background:${PALETTE.card};border:1px solid ${PALETTE.rule};border-radius:6px;padding:14px">
          <div style="font:600 11px Inter;color:${PALETTE.purple};letter-spacing:2px;margin-bottom:8px">EMAIL VERIFICATION</div>
          <label style="display:block;font-size:11px;color:${PALETTE.muted}">provider
            <select data-verify-provider style="width:100%;margin-top:2px;padding:6px 8px;font:12px Inter;border:1px solid ${PALETTE.rule};border-radius:3px">
              <option>Apify Email Verifier</option><option>NeverBounce</option><option>ZeroBounce</option><option>internal SMTP probe</option>
            </select>
          </label>
        </div>
        <div style="background:${PALETTE.card};border:1px solid ${PALETTE.rule};border-radius:6px;padding:14px">
          <div style="font:600 11px Inter;color:${BRAND_ORANGE};letter-spacing:2px;margin-bottom:8px">SENDING LIMITS</div>
          <label style="display:block;font-size:11px;color:${PALETTE.muted}">daily limit
            <input data-daily-limit type=number value="200" min="1" style="width:100%;margin-top:2px;padding:6px 8px;font:12px Menlo,monospace;border:1px solid ${PALETTE.rule};border-radius:3px">
          </label>
          <label style="display:block;font-size:11px;color:${PALETTE.muted};margin-top:8px">sending hours
            <input data-hours type=text value="09:00 – 17:00 (Mon–Fri, sender TZ)" style="width:100%;margin-top:2px;padding:6px 8px;font:12px Inter;border:1px solid ${PALETTE.rule};border-radius:3px">
          </label>
        </div>
        <div style="background:${PALETTE.card};border:1px solid ${PALETTE.rule};border-radius:6px;padding:14px">
          <div style="font:600 11px Inter;color:${PALETTE.muted};letter-spacing:2px;margin-bottom:8px">SIGNATURE</div>
          <textarea data-signature style="width:100%;min-height:120px;padding:6px 8px;font:12px Inter;border:1px solid ${PALETTE.rule};border-radius:3px;resize:vertical">— Sachin Kumar
cycleCAD Suite · https://cyclecad.com
+44 20 1234 5678</textarea>
        </div>
      </div>`;
  }

  const TAB_RENDERERS = {
    pipeline:     renderPipeline,
    campaigns:    renderCampaigns,
    composer:     renderComposer,
    unibox:       renderUnibox,
    leads:        renderLeads,
    scrapers:     renderScrapers,
    ai:           renderAi,
    integrations: renderIntegrations,
    analytics:    renderAnalytics,
    settings:     renderSettings,
  };

  /* ---------- panel-specific event wiring */

  function bindPanelHandlers() {
    /* pipeline kanban DnD */
    if (state.activeTab === 'pipeline') {
      $panel.querySelectorAll('[data-card]').forEach((card) => {
        track(card, 'dragstart', (e) => { e.dataTransfer?.setData('text/plain', card.getAttribute('data-card')); });
      });
      $panel.querySelectorAll('[data-dropzone]').forEach((zone) => {
        track(zone, 'dragover',  (e) => { e.preventDefault(); });
        track(zone, 'drop', (e) => {
          e.preventDefault();
          const id = e.dataTransfer?.getData('text/plain');
          const status = zone.getAttribute('data-dropzone');
          if (id && status) markLead(id, status);
        });
      });
    }

    /* campaigns */
    if (state.activeTab === 'campaigns') {
      $panel.querySelectorAll('[data-start]').forEach((b) => track(b, 'click', () => startCampaign(b.getAttribute('data-start'))));
      $panel.querySelectorAll('[data-pause]').forEach((b) => track(b, 'click', () => pauseCampaign(b.getAttribute('data-pause'))));
      $panel.querySelectorAll('[data-variant]').forEach((sel) => track(sel, 'change', () => {
        const id = sel.getAttribute('data-variant');
        const c = state.campaigns.find((x) => x.id === id);
        if (c) { c.variant = sel.value; emit('change', { kind: 'campaignVariant', id, variant: c.variant }); }
      }));
    }

    /* composer */
    if (state.activeTab === 'composer') {
      const textarea = $panel.querySelector('[data-html]');
      const preview  = $panel.querySelector('[data-preview]');
      track(textarea, 'input', () => { state.composer.html = textarea.value; preview.innerHTML = textarea.value; });
      $panel.querySelectorAll('[data-block]').forEach((b) => track(b, 'click', () => {
        const k = b.getAttribute('data-block');
        const snippet = blockSnippet(k);
        textarea.value += '\n' + snippet;
        state.composer.html = textarea.value;
        preview.innerHTML = textarea.value;
      }));
      $panel.querySelectorAll('[data-var]').forEach((b) => track(b, 'click', () => {
        const v = b.getAttribute('data-var');
        textarea.value += ' ' + v;
        state.composer.html = textarea.value;
        preview.innerHTML = textarea.value;
      }));
      const $ai = $panel.querySelector('[data-ai-draft]');
      if ($ai) track($ai, 'click', () => composeDraft({ campaignId: state.composer.campaignId, leadId: state.composer.leadId, prompt: 'short cold intro' }));
    }

    /* unibox */
    if (state.activeTab === 'unibox') {
      $panel.querySelectorAll('[data-thread]').forEach((row) => track(row, 'click', () => {
        state.activeThreadId = row.getAttribute('data-thread');
        renderPanel();
      }));
      const sendBtn = $panel.querySelector('[data-send-reply]');
      const body    = $panel.querySelector('[data-reply-body]');
      if (sendBtn) track(sendBtn, 'click', () => replyToThread(state.activeThreadId, body?.value || ''));
      $panel.querySelectorAll('[data-mark]').forEach((b) => track(b, 'click', () => {
        const t = state.threads.find((x) => x.id === state.activeThreadId);
        if (!t) return;
        const lead = state.leads.find((l) => t.from.toLowerCase().includes(l.email.toLowerCase()));
        if (lead) markLead(lead.id, b.getAttribute('data-mark'));
      }));
      const ar = $panel.querySelector('[data-auto-reply]');
      if (ar) track(ar, 'click', () => replyToThread(state.activeThreadId, '[ai] Thanks for the quick response — booking a slot via {{calendarLink}}.'));
    }

    /* leads */
    if (state.activeTab === 'leads') {
      const search = $panel.querySelector('[data-leads-search]');
      if (search) track(search, 'input', () => {
        const q = search.value.toLowerCase().trim();
        $panel.querySelectorAll('[data-lead-row]').forEach((row) => {
          const id = row.getAttribute('data-lead-row');
          const l = state.leads.find((x) => x.id === id);
          row.style.display = !q || (l && [l.name, l.contact, l.city, l.category, l.email].some((s) => String(s).toLowerCase().includes(q))) ? '' : 'none';
        });
      });
      const all = $panel.querySelector('[data-select-all]');
      if (all) track(all, 'change', () => $panel.querySelectorAll('[data-lead-pick]').forEach((cb) => { cb.checked = all.checked; }));
      $panel.querySelectorAll('[data-bulk]').forEach((b) => track(b, 'click', () => bulkAction(b.getAttribute('data-bulk'))));
    }

    /* scrapers */
    if (state.activeTab === 'scrapers') {
      const run = $panel.querySelector('[data-run-scrape]');
      if (run) track(run, 'click', () => runScrape({
        source:  'apify-maps',
        query:    $panel.querySelector('[data-scrape-q]')?.value || '',
        location: $panel.querySelector('[data-scrape-loc]')?.value || '',
        fields:  ($panel.querySelector('[data-scrape-fields]')?.value || '').split(',').map((s) => s.trim()).filter(Boolean),
      }));
      const harvest = $panel.querySelector('[data-run-harvest]');
      if (harvest) track(harvest, 'click', () => runScrape({ source: 'gmail-unibox' }));
    }

    /* ai */
    if (state.activeTab === 'ai') {
      const ask = $panel.querySelector('[data-ai-run]');
      if (ask) track(ask, 'click', () => composeDraft({ prompt: $panel.querySelector('[data-ai-prompt]')?.value || '' }));
    }

    /* integrations */
    if (state.activeTab === 'integrations') {
      $panel.querySelectorAll('[data-int]').forEach((b) => track(b, 'click', () => connectIntegration(b.getAttribute('data-int'))));
    }
  }

  function blockSnippet(kind) {
    switch (kind) {
      case 'heading':   return '<h2>Quick intro</h2>';
      case 'text':      return '<p>I noticed {{company}} runs an impressive operation in {{city}}.</p>';
      case 'button':    return '<a href="{{calendarLink}}" style="display:inline-block;background:#FF6B2B;color:#fff;padding:8px 16px;border-radius:4px;text-decoration:none">Book a 15-min call</a>';
      case 'image':     return '<img src="https://cyclecad.com/banner.png" alt="cycleCAD" style="max-width:100%">';
      case 'signature': return '<p>— {{senderName}}<br>cycleCAD Suite</p>';
      case 'footer':    return '<p style="font-size:11px;color:#888">cycleCAD · Berlin · <a href="{{unsubscribe}}">unsubscribe</a></p>';
      default:          return '';
    }
  }

  /* ---------- API methods (every method JSDoc'd) */

  /**
   * Charge the meter if available; quietly succeed otherwise.
   * @param {string} method
   * @param {Object} [payload]
   * @returns {Promise<void>}
   */
  async function charge(method, payload) {
    if (!meter || typeof meter.charge !== 'function') return;
    try { await meter.charge('admin-outreach-pro', method, payload || {}); }
    catch (e) { emit('error', { method, error: String(e.message || e) }); }
  }

  /**
   * Switch the visible tab.
   * @param {string} name
   * @returns {string} the resolved active tab
   */
  function setActiveTabApi(name) {
    setActiveTab(name);
    return state.activeTab;
  }

  /**
   * Refresh the leads list. Tries the server first, falls back to demo data.
   * @param {Object} [filters]  optional server-side filters
   * @returns {Promise<{ source: 'server'|'demo', leads: any[] }>}
   */
  async function refreshLeads(filters) {
    await charge('refreshLeads', { tier: 'haiku', filters: filters || {} });
    const { source, data } = await fetchOrDemo('/leads/list', {
      method: 'POST', body: JSON.stringify(filters || {}),
    }, { leads: state.leads });
    state.serverSource.leads = source;
    if (data && Array.isArray(data.leads) && data.leads.length) state.leads = data.leads;
    if (state.activeTab === 'leads' || state.activeTab === 'pipeline') renderPanel();
    paintStatus();
    emit('change', { kind: 'leadsRefreshed', source, count: state.leads.length });
    return { source, leads: state.leads };
  }

  /**
   * Run a scraper (Apify Maps or Gmail Unibox harvest).
   * @param {Object} opt
   * @param {string} opt.source  'apify-maps' | 'gmail-unibox'
   * @param {string} [opt.query]
   * @param {string} [opt.location]
   * @param {string[]} [opt.fields]
   * @returns {Promise<{ source: 'server'|'demo', found: number }>}
   */
  async function runScrape(opt) {
    await charge('runScrape', { tier: 'sonnet', ...opt });
    state.scrape = { running: true, progress: 0, found: 0 };
    emit('scrapeStart', { ...opt });

    /* simulated progress for demo fallback */
    const log = $panel.querySelector('[data-scrape-log]') || $panel.querySelector('[data-harvest-log]');
    const bar = $panel.querySelector('[data-scrape-bar]');
    let step = 0;
    const ticker = trackInterval(() => {
      if (destroyed || step >= 5) { clearInterval(ticker); return; }
      step++;
      state.scrape.progress = step * 20;
      state.scrape.found    = step * 7;
      if (log) log.textContent = `step ${step}/5 · found ${state.scrape.found} candidates`;
      if (bar) bar.style.width = state.scrape.progress + '%';
      emit('scrapeProgress', { ...state.scrape, source: opt.source });
    }, 300);

    const { source, data } = await fetchOrDemo('/scrape/run', {
      method: 'POST', body: JSON.stringify(opt),
    }, { found: 35 });
    state.serverSource.scrape = source;
    state.scrape.running = false;
    paintStatus();
    emit('change', { kind: 'scrapeComplete', source, found: data?.found || state.scrape.found });
    return { source, found: data?.found || state.scrape.found };
  }

  /**
   * Compose a draft with AI (per-lead personalisation).
   * @param {Object} opt
   * @param {string} [opt.campaignId]
   * @param {string} [opt.leadId]
   * @param {string} [opt.prompt]
   * @returns {Promise<{ source: 'server'|'demo', html: string }>}
   */
  async function composeDraft(opt) {
    await charge('composeDraft', { tier: 'sonnet', ...opt });
    const lead = state.leads.find((l) => l.id === (opt && opt.leadId)) || state.leads[0];
    const draft = `<h2>Hi ${esc(lead.contact.split(' ')[0])} —</h2>\n<p>Saw ${esc(lead.name)} has ${lead.reviews}+ reviews in ${esc(lead.city)}. Quick question about your fleet sizing process — open to a 15-min call this week?</p>\n<p>— Sachin</p>`;
    const { source, data } = await fetchOrDemo('/compose/draft', {
      method: 'POST', body: JSON.stringify(opt || {}),
    }, { html: draft });
    state.serverSource.draft = source;
    state.composer.html = (data && data.html) || draft;
    if (state.activeTab === 'composer') renderPanel();
    if (state.activeTab === 'ai') {
      const out = $panel.querySelector('[data-ai-out]');
      if (out) out.innerHTML = `<div style="color:${PALETTE.ink};white-space:pre-wrap">${state.composer.html}</div>`;
    }
    paintStatus();
    emit('draftComposed', { source, html: state.composer.html });
    emit('change', { kind: 'draftComposed', source });
    return { source, html: state.composer.html };
  }

  /**
   * Start a campaign sequence.
   * @param {string} campaignId
   * @returns {Promise<{ ok: boolean, status: string }>}
   */
  async function startCampaign(campaignId) {
    await charge('startCampaign', { tier: 'haiku', campaignId });
    const c = state.campaigns.find((x) => x.id === campaignId);
    if (!c) return { ok: false, status: 'not-found' };
    c.status = 'running';
    if (state.activeTab === 'campaigns') renderPanel();
    emit('campaignStart', { campaignId });
    emit('change', { kind: 'campaignStart', campaignId });
    return { ok: true, status: c.status };
  }

  /**
   * Pause a campaign sequence.
   * @param {string} campaignId
   * @returns {Promise<{ ok: boolean, status: string }>}
   */
  async function pauseCampaign(campaignId) {
    await charge('pauseCampaign', { tier: 'haiku', campaignId });
    const c = state.campaigns.find((x) => x.id === campaignId);
    if (!c) return { ok: false, status: 'not-found' };
    c.status = 'paused';
    if (state.activeTab === 'campaigns') renderPanel();
    emit('campaignPause', { campaignId });
    emit('change', { kind: 'campaignPause', campaignId });
    return { ok: true, status: c.status };
  }

  /**
   * Mark a lead with a Kanban status / disposition.
   * @param {string} leadId
   * @param {string} label  one of the kanban column ids ('won', 'lost', etc.)
   * @returns {{ ok: boolean }}
   */
  function markLead(leadId, label) {
    const l = state.leads.find((x) => x.id === leadId);
    if (!l) return { ok: false };
    l.status = label;
    if (state.activeTab === 'pipeline' || state.activeTab === 'leads') renderPanel();
    emit('leadUpdate', { leadId, label });
    emit('change', { kind: 'leadUpdate', leadId, label });
    return { ok: true };
  }

  /**
   * Send a reply to a thread.
   * @param {string} threadId
   * @param {string} body
   * @returns {Promise<{ ok: boolean, source: 'server'|'demo' }>}
   */
  async function replyToThread(threadId, body) {
    await charge('replyToThread', { tier: 'haiku', threadId });
    const { source } = await fetchOrDemo('/threads/reply', {
      method: 'POST', body: JSON.stringify({ threadId, body }),
    }, { ok: true });
    emit('replySent', { threadId, body, source });
    emit('change', { kind: 'replySent', threadId, source });
    return { ok: true, source };
  }

  /**
   * Export leads in the chosen format.
   * @param {'xlsx'|'csv'|'json'} format
   * @returns {{ ok: boolean, format: string, count: number }}
   */
  function exportLeads(format) {
    const fmt = ['xlsx', 'csv', 'json'].includes(format) ? format : 'csv';
    /* synthesize a download in-browser so demo mode still produces a file */
    let content = '';
    let mime    = 'text/plain';
    if (fmt === 'json') { content = JSON.stringify(state.leads, null, 2); mime = 'application/json'; }
    else if (fmt === 'csv') {
      const head = ['name','contact','email','phone','category','rating','reviews','city','status'];
      content = head.join(',') + '\n' + state.leads.map((l) => head.map((k) => `"${String(l[k]||'').replace(/"/g,'""')}"`).join(',')).join('\n');
      mime = 'text/csv';
    } else {
      /* fake xlsx blob — server would return real one */
      content = JSON.stringify(state.leads);
      mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }
    try {
      const blob = new Blob([content], { type: mime });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `leads.${fmt}`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { /* non-browser env */ }
    emit('change', { kind: 'export', format: fmt, count: state.leads.length });
    return { ok: true, format: fmt, count: state.leads.length };
  }

  /**
   * KPI snapshot — used by the Pipeline tab and external callers.
   * @returns {{ leads: number, campaigns: number, sent: number, replyRate: number, won: number, demo: number }}
   */
  function getStats() {
    const sent     = state.campaigns.reduce((a, c) => a + c.sent,    0);
    const replies  = state.campaigns.reduce((a, c) => a + c.replies, 0);
    return {
      leads:     state.leads.length,
      campaigns: state.campaigns.length,
      sent,
      replyRate: sent ? Math.round((replies / sent) * 100) : 0,
      won:       state.leads.filter((l) => l.status === 'won').length,
      demo:      state.leads.filter((l) => l.status === 'demo').length,
    };
  }

  /**
   * Connect (or disconnect) a third-party integration.
   * @param {'gmail'|'apify'|'calendar'|'zapier'} kind
   * @returns {{ ok: boolean, connected: boolean }}
   */
  function connectIntegration(kind) {
    const i = state.integrations.find((x) => x.kind === kind);
    if (!i) return { ok: false, connected: false };
    i.connected = !i.connected;
    i.lastUsed  = i.connected ? new Date().toISOString() : i.lastUsed;
    if (state.activeTab === 'integrations') renderPanel();
    emit('integrationConnected', { kind, connected: i.connected });
    emit('change', { kind: 'integrationConnected', integration: kind, connected: i.connected });
    return { ok: true, connected: i.connected };
  }

  /**
   * Apply a bulk action over the selected leads.
   * @param {string} action  one of 'campaign' | 'export-xlsx' | 'export-csv' | 'stale' | 'verify'
   * @returns {{ ok: boolean, count: number }}
   */
  function bulkAction(action) {
    const picked = Array.from($panel.querySelectorAll('[data-lead-pick]:checked')).map((cb) => cb.getAttribute('data-lead-pick'));
    const ids = picked.length ? picked : state.leads.map((l) => l.id);
    if (action === 'export-xlsx') return exportLeads('xlsx');
    if (action === 'export-csv')  return exportLeads('csv');
    if (action === 'stale') {
      ids.forEach((id) => { const l = state.leads.find((x) => x.id === id); if (l) l.status = 'lost'; });
      renderPanel();
      emit('change', { kind: 'bulkStale', count: ids.length });
    }
    if (action === 'verify')   emit('change', { kind: 'bulkVerify',   count: ids.length });
    if (action === 'campaign') emit('change', { kind: 'bulkCampaign', count: ids.length });
    return { ok: true, count: ids.length };
  }

  /**
   * Stub for future i18n. Currently only 'en' is implemented.
   * @param {string} code
   * @returns {string} the active locale
   */
  function setLocale(code) {
    locale = String(code || 'en').slice(0, 5);
    emit('change', { kind: 'locale', code: locale });
    return locale;
  }

  /* ---------- server-status painter */

  function paintStatus() {
    const sources = Object.values(state.serverSource);
    const live    = sources.filter((s) => s === 'server').length;
    const demo    = sources.filter((s) => s === 'demo').length;
    if (!sources.length) {
      $status.textContent = 'server: not yet probed';
    } else if (live === sources.length) {
      $status.innerHTML = `<span style="color:${PALETTE.emerald}">server: ${live}/${sources.length} live</span>`;
    } else if (live === 0) {
      $status.innerHTML = `<span style="color:${PALETTE.gold}">server: demo (${demo})</span>`;
    } else {
      $status.innerHTML = `<span style="color:${PALETTE.sky}">server: mixed ${live}/${sources.length}</span>`;
    }
  }

  /* ---------- top-level wiring */

  wrap.querySelectorAll('[data-tab]').forEach((el) => {
    track(el, 'click', () => setActiveTab(el.getAttribute('data-tab')));
  });

  setActiveTab('pipeline');
  paintStatus();

  /* ---------- destroy */

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    for (const t of tracked) {
      if (t.type === 'listener') {
        try { t.target.removeEventListener(t.ev, t.fn, t.options); } catch { /* swallow */ }
      } else if (t.type === 'interval') {
        try { clearInterval(t.id); } catch { /* swallow */ }
      }
    }
    tracked.length = 0;
    /* invalidate listener buckets so late events don't fire */
    Object.keys(listeners).forEach((k) => { listeners[k] = []; });
    try { wrap.remove(); } catch { /* swallow */ }
  }

  /* ---------- handle */

  return {
    api: {
      setActiveTab:        setActiveTabApi,
      refreshLeads,
      runScrape,
      composeDraft,
      startCampaign,
      pauseCampaign,
      markLead,
      replyToThread,
      exportLeads,
      getStats,
      connectIntegration,
      setLocale,
      /** @returns {string} */
      getActiveTab() { return state.activeTab; },
      /** @returns {Object} a structured snapshot of internal state (read-only-ish copy) */
      getState() { return JSON.parse(JSON.stringify({
        activeTab: state.activeTab, leads: state.leads, campaigns: state.campaigns,
        threads: state.threads, integrations: state.integrations,
        scrape: state.scrape, serverSource: state.serverSource,
      })); },
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy,
  };
}
