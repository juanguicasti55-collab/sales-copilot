import { get, post, getAll } from './api.js';

// ─── Ad Accounts ────────────────────────────────────────────────────────────

export async function listAccounts() {
  const data = await get('/me/adaccounts', {
    fields: 'id,name,account_status,currency,balance,amount_spent',
    limit: 100,
  });
  return data.data || [];
}

// ─── Campaigns ──────────────────────────────────────────────────────────────

export async function listCampaigns(accountId, statusFilter) {
  const params = {
    fields: 'id,name,status,effective_status,objective,daily_budget,lifetime_budget,budget_remaining,start_time,updated_time',
    limit: 500,
  };
  if (statusFilter) {
    params.filtering = [{ field: 'effective_status', operator: 'IN', value: statusFilter }];
  }
  return getAll(`/${accountId}/campaigns`, params);
}

export async function getCampaignInsights(campaignId, datePreset = 'last_7d') {
  const data = await get(`/${campaignId}/insights`, {
    fields: 'campaign_name,spend,impressions,clicks,ctr,cpc,cpm,actions,cost_per_action_type,conversions,purchase_roas',
    date_preset: datePreset,
  });
  return data.data?.[0] || null;
}

// ─── Ad Sets ────────────────────────────────────────────────────────────────

export async function listAdSets(accountId, campaignId) {
  const parent = campaignId || accountId;
  const params = {
    fields: 'id,name,status,daily_budget,lifetime_budget,budget_remaining,targeting,optimization_goal,billing_event,start_time',
    limit: 500,
  };
  return getAll(`/${parent}/adsets`, params);
}

export async function getAdSetInsights(adSetId, datePreset = 'last_7d') {
  const data = await get(`/${adSetId}/insights`, {
    fields: 'adset_name,spend,impressions,clicks,ctr,cpc,cpm,actions,cost_per_action_type,purchase_roas',
    date_preset: datePreset,
  });
  return data.data?.[0] || null;
}

// ─── Ads ────────────────────────────────────────────────────────────────────

export async function listAds(accountId, adSetId) {
  const parent = adSetId || accountId;
  const params = {
    fields: 'id,name,status,creative{id,name,thumbnail_url},adset_id,campaign_id',
    limit: 500,
  };
  return getAll(`/${parent}/ads`, params);
}

export async function getAdInsights(adId, datePreset = 'last_7d') {
  const data = await get(`/${adId}/insights`, {
    fields: 'ad_name,spend,impressions,clicks,ctr,cpc,cpm,actions,cost_per_action_type,purchase_roas',
    date_preset: datePreset,
  });
  return data.data?.[0] || null;
}

// ─── Account-level Insights ─────────────────────────────────────────────────

export async function getAccountInsights(accountId, datePreset = 'last_7d', breakdowns) {
  const params = {
    fields: 'account_name,spend,impressions,clicks,ctr,cpc,cpm,actions,cost_per_action_type,purchase_roas',
    date_preset: datePreset,
  };
  if (breakdowns) params.breakdowns = breakdowns;
  return getAll(`/${accountId}/insights`, params);
}

// ─── Actions: Pause / Activate / Budget ─────────────────────────────────────

export async function updateStatus(objectId, status) {
  return post(`/${objectId}`, { status });
}

export async function updateBudget(objectId, { dailyBudget, lifetimeBudget }) {
  const body = {};
  if (dailyBudget != null) body.daily_budget = Math.round(dailyBudget * 100);
  if (lifetimeBudget != null) body.lifetime_budget = Math.round(lifetimeBudget * 100);
  return post(`/${objectId}`, body);
}
