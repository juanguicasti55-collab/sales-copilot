import { getAll } from './api.js';

function extract(actions, type) {
  if (!actions) return 0;
  const a = actions.find(x => x.action_type === type || x.action_type === 'omni_' + type);
  return a ? Number(a.value) : 0;
}

function extractCost(cpa, type) {
  if (!cpa) return null;
  const a = cpa.find(x => x.action_type === type || x.action_type === 'omni_' + type);
  return a ? Number(a.value) : null;
}

function fmt(n) {
  return n != null ? Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-';
}

const campaigns = [
  { id: '120243313100610626', name: 'PC- Leads-Trading Pro-USA-13/3' },
  { id: '120243312528290626', name: 'PC- Leads-Trading Pro-Latam-13/3' },
];

for (const camp of campaigns) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`CAMPAIGN: ${camp.name}`);
  console.log('='.repeat(80));

  // Ad-level insights
  const ads = await getAll(`/${camp.id}/insights`, {
    fields: 'ad_id,ad_name,adset_id,spend,impressions,clicks,ctr,actions,cost_per_action_type,purchase_roas',
    level: 'ad',
    time_range: JSON.stringify({ since: '2025-01-01', until: '2026-03-15' }),
    limit: 100,
  });

  console.log(`\n--- Ad Performance ---`);
  console.log(`${'Ad'.padEnd(30)} ${'Spend'.padStart(10)} ${'Clicks'.padStart(7)} ${'CTR'.padStart(7)} ${'Leads'.padStart(6)} ${'Purch'.padStart(6)} ${'CPA'.padStart(10)} ${'CPL'.padStart(10)} ${'ROAS'.padStart(8)}`);
  console.log('-'.repeat(100));

  const sorted = ads.sort((a, b) => Number(b.spend) - Number(a.spend));
  for (const r of sorted) {
    const purchases = extract(r.actions, 'purchase');
    const leads = extract(r.actions, 'lead');
    const cpa = extractCost(r.cost_per_action_type, 'purchase');
    const cpl = extractCost(r.cost_per_action_type, 'lead');
    const roas = r.purchase_roas?.[0]?.value ? Number(r.purchase_roas[0].value) : 0;
    console.log(
      `${r.ad_name.slice(0, 29).padEnd(30)} $${fmt(Number(r.spend)).padStart(9)} ${r.clicks.toString().padStart(7)} ${Number(r.ctr).toFixed(2).padStart(6)}% ${leads.toString().padStart(6)} ${purchases.toString().padStart(6)} $${cpa ? fmt(cpa).padStart(9) : '        -'} $${cpl ? fmt(cpl).padStart(9) : '        -'} ${roas ? fmt(roas).padStart(8) : '       -'}`
    );
  }

  // Country breakdown
  const countries = await getAll(`/${camp.id}/insights`, {
    fields: 'spend,impressions,clicks,actions,cost_per_action_type',
    breakdowns: 'country',
    time_range: JSON.stringify({ since: '2025-01-01', until: '2026-03-15' }),
    limit: 100,
  });

  console.log(`\n--- Country Breakdown ---`);
  console.log(`${'Country'.padEnd(8)} ${'Spend'.padStart(10)} ${'Clicks'.padStart(7)} ${'Leads'.padStart(6)} ${'Purch'.padStart(6)} ${'CPA'.padStart(10)}`);
  console.log('-'.repeat(50));

  for (const r of countries.sort((a, b) => Number(b.spend) - Number(a.spend))) {
    const purchases = extract(r.actions, 'purchase');
    const leads = extract(r.actions, 'lead');
    const spend = Number(r.spend);
    const cpa = purchases > 0 ? spend / purchases : null;
    console.log(
      `${r.country.padEnd(8)} $${fmt(spend).padStart(9)} ${r.clicks.toString().padStart(7)} ${leads.toString().padStart(6)} ${purchases.toString().padStart(6)} $${cpa ? fmt(cpa).padStart(9) : '        -'}`
    );
  }

  // Age/Gender breakdown
  const demo = await getAll(`/${camp.id}/insights`, {
    fields: 'spend,impressions,clicks,actions,cost_per_action_type',
    breakdowns: 'age,gender',
    time_range: JSON.stringify({ since: '2025-01-01', until: '2026-03-15' }),
    limit: 100,
  });

  console.log(`\n--- Age/Gender Breakdown ---`);
  console.log(`${'Demo'.padEnd(12)} ${'Spend'.padStart(10)} ${'Clicks'.padStart(7)} ${'Leads'.padStart(6)} ${'Purch'.padStart(6)}`);
  console.log('-'.repeat(45));

  for (const r of demo.sort((a, b) => Number(b.spend) - Number(a.spend)).slice(0, 15)) {
    const purchases = extract(r.actions, 'purchase');
    const leads = extract(r.actions, 'lead');
    console.log(
      `${(r.gender + ' ' + r.age).padEnd(12)} $${fmt(Number(r.spend)).padStart(9)} ${r.clicks.toString().padStart(7)} ${leads.toString().padStart(6)} ${purchases.toString().padStart(6)}`
    );
  }
}
