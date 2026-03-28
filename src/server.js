import 'dotenv/config';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listAccounts, listCampaigns, getCampaignInsights, listAdSets, getAdSetInsights, listAds, getAdInsights, getAccountInsights, updateStatus, updateBudget } from './campaigns.js';
import { get, getAll } from './api.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC = join(__dirname, '..', 'public');
const PORT = process.env.PORT || 3000;

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
};

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// ─── Metric Extractors ──────────────────────────────────────────────────────
function xAction(actions, ...types) {
  if (!actions) return 0;
  for (const t of types) { const a = actions.find(a => a.action_type === t); if (a) return Number(a.value); }
  return 0;
}
function xCost(cpa, ...types) {
  if (!cpa) return null;
  for (const t of types) { const a = cpa.find(a => a.action_type === t); if (a) return Number(a.value); }
  return null;
}
function xVideo(arr) {
  if (!arr) return 0;
  const a = arr.find(v => v.action_type === 'video_view');
  return a ? Number(a.value) : 0;
}

function enrichRow(row) {
  const spend = Number(row.spend || 0);
  const impressions = Number(row.impressions || 0);
  const clicks = Number(row.clicks || 0);
  const ctr = Number(row.ctr || 0);
  const cpc = Number(row.cpc || 0);
  const cpm = Number(row.cpm || 0);
  const frequency = Number(row.frequency || 0);
  const roas = row.purchase_roas?.[0]?.value ? Number(row.purchase_roas[0].value) : 0;

  // All possible result types
  const purchases = xAction(row.actions, 'purchase', 'omni_purchase');
  const leads = xAction(row.actions, 'lead', 'onsite_conversion.lead_grouped');
  const linkClicks = xAction(row.actions, 'link_click');
  const lpViews = xAction(row.actions, 'landing_page_view');
  const addToCart = xAction(row.actions, 'add_to_cart', 'omni_add_to_cart');
  const checkout = xAction(row.actions, 'initiate_checkout', 'omni_initiated_checkout');
  const pageEngagement = xAction(row.actions, 'page_engagement');
  const postEngagement = xAction(row.actions, 'post_engagement');
  const pageLikes = xAction(row.actions, 'like', 'page_like');
  const videoViews = xAction(row.actions, 'video_view');
  const thruPlays = xAction(row.actions, 'video_view'); // thruplay counted via dedicated field
  const messaging = xAction(row.actions, 'onsite_conversion.messaging_conversation_started_7d', 'onsite_conversion.messaging_first_reply');
  const appInstalls = xAction(row.actions, 'app_install', 'omni_app_install');

  // Cost per result types
  const cpa = xCost(row.cost_per_action_type, 'purchase', 'omni_purchase');
  const cpl = xCost(row.cost_per_action_type, 'lead', 'onsite_conversion.lead_grouped');
  const costPerClick = xCost(row.cost_per_action_type, 'link_click');
  const costPerLike = xCost(row.cost_per_action_type, 'like', 'page_like');
  const costPerMsg = xCost(row.cost_per_action_type, 'onsite_conversion.messaging_conversation_started_7d');
  const costPerVideoView = xCost(row.cost_per_action_type, 'video_view');

  // Smart result detection — pick the most relevant result
  let resultType = 'clicks';
  let results = clicks;
  let costPerResult = cpc;

  if (purchases > 0) { resultType = 'compras'; results = purchases; costPerResult = cpa; }
  else if (leads > 0) { resultType = 'leads'; results = leads; costPerResult = cpl; }
  else if (messaging > 0) { resultType = 'mensajes'; results = messaging; costPerResult = costPerMsg; }
  else if (appInstalls > 0) { resultType = 'installs'; results = appInstalls; costPerResult = spend > 0 && appInstalls > 0 ? spend / appInstalls : null; }
  else if (pageLikes > 0) { resultType = 'seguidores'; results = pageLikes; costPerResult = costPerLike; }
  else if (linkClicks > 0) { resultType = 'link clicks'; results = linkClicks; costPerResult = costPerClick; }
  else if (videoViews > 0) { resultType = 'video views'; results = videoViews; costPerResult = costPerVideoView; }
  else if (postEngagement > 0) { resultType = 'engagement'; results = postEngagement; costPerResult = spend > 0 && postEngagement > 0 ? spend / postEngagement : null; }

  // Video metrics from dedicated fields (v21.0 compatible)
  const videoPlays = xVideo(row.video_play_actions);
  const videoAvg = xVideo(row.video_avg_time_watched_actions);
  const videoP25 = xVideo(row.video_p25_watched_actions);
  const videoP50 = xVideo(row.video_p50_watched_actions);
  const videoP75 = xVideo(row.video_p75_watched_actions);
  const videoP100 = xVideo(row.video_p100_watched_actions);
  // Hook Rate = plays / impressions (how many start watching)
  const hookRate = impressions > 0 && videoPlays > 0 ? (videoPlays / impressions * 100) : null;
  // Hold Rate = p50 / plays (how many stay to half)
  const holdRate = videoPlays > 0 && videoP50 > 0 ? (videoP50 / videoPlays * 100) : null;

  return {
    spend, impressions, clicks, ctr, cpc, cpm, frequency, roas,
    purchases, leads, linkClicks, lpViews, addToCart, checkout,
    pageEngagement, postEngagement, pageLikes, videoViews, messaging,
    cpa, cpl, costPerClick, costPerLike,
    resultType, results, costPerResult,
    videoPlays, videoAvg, videoP25, videoP50, videoP75, videoP100,
    hookRate, holdRate,
  };
}

// ─── Field Sets ─────────────────────────────────────────────────────────────
const BASE = 'spend,impressions,clicks,ctr,cpc,cpm,frequency,actions,cost_per_action_type,purchase_roas';
const VIDEO_FIELDS = 'video_play_actions,video_avg_time_watched_actions,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions';

// Fetch video metrics per-ad (more reliable than bulk)
async function fetchVideoMetrics(adIds, datePreset) {
  const videoData = {};
  for (let i = 0; i < adIds.length; i += 10) {
    await Promise.all(adIds.slice(i, i + 10).map(async id => {
      try {
        const data = await get(`/${id}/insights`, {
          fields: VIDEO_FIELDS,
          date_preset: datePreset,
        });
        const row = data.data?.[0] || data;
        videoData[id] = {
          video_play_actions: row.video_play_actions,
          video_avg_time_watched_actions: row.video_avg_time_watched_actions,
          video_p25_watched_actions: row.video_p25_watched_actions,
          video_p50_watched_actions: row.video_p50_watched_actions,
          video_p75_watched_actions: row.video_p75_watched_actions,
          video_p100_watched_actions: row.video_p100_watched_actions,
        };
      } catch { videoData[id] = {}; }
    }));
  }
  return videoData;
}

// ─── Routes ─────────────────────────────────────────────────────────────────
async function handleAPI(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  const p = Object.fromEntries(url.searchParams);

  try {
    if (path === '/api/accounts') {
      return json(res, await listAccounts());
    }

    if (path === '/api/campaigns') {
      const { account, date_preset = 'last_7d' } = p;
      if (!account) return json(res, { error: 'account required' }, 400);
      const campaigns = await listCampaigns(account);
      const enriched = await Promise.all(campaigns.map(async c => {
        try {
          const ins = await getCampaignInsights(c.id, date_preset);
          return { ...c, ...enrichRow(ins || {}) };
        } catch { return { ...c, ...enrichRow({}) }; }
      }));
      return json(res, enriched);
    }

    if (path === '/api/adsets') {
      const { account, campaign, date_preset = 'last_7d' } = p;
      const adsets = await listAdSets(account || null, campaign || null);
      const enriched = await Promise.all(adsets.map(async s => {
        try {
          const ins = await getAdSetInsights(s.id, date_preset);
          return { ...s, ...enrichRow(ins || {}) };
        } catch { return { ...s, ...enrichRow({}) }; }
      }));
      return json(res, enriched);
    }

    if (path === '/api/ads') {
      const { account, adset, date_preset = 'last_7d' } = p;
      const ads = await listAds(account || null, adset || null);
      const enriched = await Promise.all(ads.map(async ad => {
        try {
          const ins = await getAdInsights(ad.id, date_preset);
          return { ...ad, ...enrichRow(ins || {}) };
        } catch { return { ...ad, ...enrichRow({}) }; }
      }));
      return json(res, enriched);
    }

    if (path === '/api/insights') {
      const { account, date_preset = 'last_7d' } = p;
      if (!account) return json(res, { error: 'account required' }, 400);
      const insights = await getAll(`/${account}/insights`, { fields: BASE, date_preset });
      return json(res, insights.map(r => enrichRow(r)));
    }

    // Top ads — creative performance with video metrics fetched per-ad
    if (path === '/api/top-ads') {
      const { account, date_preset = 'last_7d' } = p;
      if (!account) return json(res, { error: 'account required' }, 400);

      // Step 1: Get base insights (bulk, fast)
      const adFields = 'ad_id,ad_name,adset_name,campaign_name,' + BASE;
      const insights = await getAll(`/${account}/insights`, {
        fields: adFields, level: 'ad', date_preset, limit: 500,
      });

      const adIds = [...new Set(insights.map(r => r.ad_id))];

      // Step 2: Fetch video metrics + thumbnails per-ad in parallel
      const [videoData, thumbs] = await Promise.all([
        fetchVideoMetrics(adIds, date_preset),
        (async () => {
          const t = {};
          for (let i = 0; i < adIds.length; i += 15) {
            await Promise.all(adIds.slice(i, i + 15).map(async id => {
              try {
                const d = await get(`/${id}`, { fields: 'creative{thumbnail_url,image_url}' });
                t[id] = d.creative?.thumbnail_url || d.creative?.image_url || null;
              } catch { t[id] = null; }
            }));
          }
          return t;
        })(),
      ]);

      return json(res, insights.map(row => {
        // Merge video data into row
        const vid = videoData[row.ad_id] || {};
        const merged = { ...row, ...vid };
        return {
          id: row.ad_id, name: row.ad_name, adset: row.adset_name, campaign: row.campaign_name,
          thumbnail: thumbs[row.ad_id] || null,
          ...enrichRow(merged),
        };
      }));
    }

    if (path === '/api/countries') {
      const { account, date_preset = 'last_30d' } = p;
      if (!account) return json(res, { error: 'account required' }, 400);
      const insights = await getAll(`/${account}/insights`, {
        fields: 'spend,impressions,clicks,actions,cost_per_action_type,purchase_roas',
        breakdowns: 'country', date_preset, limit: 500,
      });
      const map = {};
      for (const r of insights) {
        const c = r.country;
        if (!map[c]) map[c] = { country: c, spend: 0, impressions: 0, clicks: 0, purchases: 0, leads: 0, linkClicks: 0 };
        map[c].spend += Number(r.spend || 0);
        map[c].impressions += Number(r.impressions || 0);
        map[c].clicks += Number(r.clicks || 0);
        map[c].purchases += xAction(r.actions, 'purchase', 'omni_purchase');
        map[c].leads += xAction(r.actions, 'lead', 'onsite_conversion.lead_grouped');
        map[c].linkClicks += xAction(r.actions, 'link_click');
      }
      const sorted = Object.values(map)
        .map(d => {
          const results = d.purchases || d.leads || d.linkClicks;
          return { ...d, results, cpa: results > 0 ? d.spend / results : null, ctr: d.impressions > 0 ? (d.clicks / d.impressions * 100) : 0 };
        })
        .sort((a, b) => (a.cpa ?? Infinity) - (b.cpa ?? Infinity));
      return json(res, sorted);
    }

    if (path === '/api/funnel') {
      const { account, date_preset = 'last_7d' } = p;
      if (!account) return json(res, { error: 'account required' }, 400);
      const ins = await getAll(`/${account}/insights`, { fields: 'spend,impressions,clicks,actions,cost_per_action_type', date_preset });
      const r = ins[0] || {};
      return json(res, {
        spend: Number(r.spend || 0), impressions: Number(r.impressions || 0), clicks: Number(r.clicks || 0),
        linkClicks: xAction(r.actions, 'link_click'), lpViews: xAction(r.actions, 'landing_page_view'),
        addToCart: xAction(r.actions, 'add_to_cart', 'omni_add_to_cart'),
        checkout: xAction(r.actions, 'initiate_checkout', 'omni_initiated_checkout'),
        purchases: xAction(r.actions, 'purchase', 'omni_purchase'),
        leads: xAction(r.actions, 'lead', 'onsite_conversion.lead_grouped'),
        pageLikes: xAction(r.actions, 'like', 'page_like'),
        videoViews: xAction(r.actions, 'video_view'),
        messaging: xAction(r.actions, 'onsite_conversion.messaging_conversation_started_7d'),
        postEngagement: xAction(r.actions, 'post_engagement'),
      });
    }

    if (path === '/api/pause' && req.method === 'POST') {
      const b = await readBody(req); await updateStatus(b.id, 'PAUSED');
      return json(res, { success: true, id: b.id, status: 'PAUSED' });
    }
    if (path === '/api/activate' && req.method === 'POST') {
      const b = await readBody(req); await updateStatus(b.id, 'ACTIVE');
      return json(res, { success: true, id: b.id, status: 'ACTIVE' });
    }
    if (path === '/api/budget' && req.method === 'POST') {
      const b = await readBody(req);
      const opts = b.type === 'lifetime' ? { lifetimeBudget: b.amount } : { dailyBudget: b.amount };
      await updateBudget(b.id, opts);
      return json(res, { success: true, id: b.id, budget: b.amount, type: b.type || 'daily' });
    }

    return null;
  } catch (err) {
    return json(res, { error: err.message }, 500);
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => data += c);
    req.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (req.url.startsWith('/api/')) { const h = await handleAPI(req, res); if (h !== null) return; }
  let fp = join(PUBLIC, req.url === '/' ? 'index.html' : req.url);
  try { const c = await readFile(fp); res.writeHead(200, { 'Content-Type': MIME[extname(fp)] || 'application/octet-stream' }); res.end(c); }
  catch { res.writeHead(404); res.end('Not found'); }
});

server.listen(PORT, () => console.log(`\n  ADS CLAUDE Dashboard\n  http://localhost:${PORT}\n`));
