import { getAll } from './api.js';

function extractPurchases(actions) {
  if (!actions) return 0;
  const p = actions.find(a => a.action_type === 'purchase' || a.action_type === 'omni_purchase');
  return p ? Number(p.value) : 0;
}

function fmt(n) {
  return n != null ? Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-';
}

export async function analyzeCountries(accountId, datePreset = 'last_30d') {
  const insights = await getAll(`/${accountId}/insights`, {
    fields: 'spend,impressions,clicks,actions,cost_per_action_type,purchase_roas',
    breakdowns: 'country',
    date_preset: datePreset,
    limit: 500,
  });

  if (!insights.length) {
    console.log('\nNo data found for this period.\n');
    return;
  }

  // Aggregate by country
  const byCountry = {};
  for (const row of insights) {
    const country = row.country;
    if (!byCountry[country]) {
      byCountry[country] = { spend: 0, impressions: 0, clicks: 0, purchases: 0 };
    }
    byCountry[country].spend += Number(row.spend || 0);
    byCountry[country].impressions += Number(row.impressions || 0);
    byCountry[country].clicks += Number(row.clicks || 0);
    byCountry[country].purchases += extractPurchases(row.actions);
  }

  // Calculate CPA and sort best -> worst
  const sorted = Object.entries(byCountry)
    .map(([country, d]) => ({
      country,
      ...d,
      cpa: d.purchases > 0 ? d.spend / d.purchases : Infinity,
      ctr: d.impressions > 0 ? (d.clicks / d.impressions * 100) : 0,
    }))
    .sort((a, b) => a.cpa - b.cpa);

  const totalSpend = sorted.reduce((s, r) => s + r.spend, 0);
  const totalPurchases = sorted.reduce((s, r) => s + r.purchases, 0);

  console.log(`\nCountry Analysis (${datePreset}) - Best to Worst CPA\n`);
  console.log(`${'Country'.padEnd(8)} ${'Spend'.padStart(12)} ${'Imp'.padStart(10)} ${'Clicks'.padStart(8)} ${'Purch'.padStart(7)} ${'CPA'.padStart(10)} ${'CTR'.padStart(7)} ${'% Spend'.padStart(9)}`);
  console.log('-'.repeat(75));

  for (const r of sorted) {
    const pctSpend = totalSpend > 0 ? (r.spend / totalSpend * 100).toFixed(1) : '0';
    console.log(
      `${r.country.padEnd(8)} $${fmt(r.spend).padStart(11)} ${Number(r.impressions).toLocaleString().padStart(10)} ${r.clicks.toString().padStart(8)} ${r.purchases.toString().padStart(7)} $${r.cpa === Infinity ? '      N/A' : fmt(r.cpa).padStart(9)} ${r.ctr.toFixed(2).padStart(6)}% ${(pctSpend + '%').padStart(9)}`
    );
  }

  console.log('-'.repeat(75));
  console.log(`${'TOTAL'.padEnd(8)} $${fmt(totalSpend).padStart(11)} ${' '.repeat(10)} ${' '.repeat(8)} ${totalPurchases.toString().padStart(7)} $${totalPurchases > 0 ? fmt(totalSpend / totalPurchases).padStart(9) : '      N/A'}`);
  console.log();
}
