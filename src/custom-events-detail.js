import { getAll } from './api.js';

const campaignId = '120243313100610626'; // USA 13/3

// Ad-level breakdown of custom events
const adLevel = await getAll(`/${campaignId}/insights`, {
  fields: 'ad_id,ad_name,actions,action_values',
  level: 'ad',
  time_range: JSON.stringify({ since: '2025-03-13', until: '2026-03-15' }),
  limit: 100,
});

console.log('=== USA 13/3 - Custom Events per Ad ===\n');
console.log(`${'Ad'.padEnd(15)} ${'custom'.padStart(8)} ${'lead'.padStart(8)} ${'purch'.padStart(8)} ${'lpv'.padStart(8)} ${'clicks'.padStart(8)}`);
console.log('-'.repeat(55));

for (const r of adLevel) {
  const find = (type) => {
    if (!r.actions) return 0;
    const a = r.actions.find(x => x.action_type === type);
    return a ? Number(a.value) : 0;
  };
  const custom = find('offsite_conversion.fb_pixel_custom');
  const lead = find('offsite_conversion.fb_pixel_lead');
  const purchase = find('offsite_conversion.fb_pixel_purchase');
  const lpv = find('landing_page_view');
  const clicks = find('link_click');
  console.log(`${r.ad_name.padEnd(15)} ${custom.toString().padStart(8)} ${lead.toString().padStart(8)} ${purchase.toString().padStart(8)} ${lpv.toString().padStart(8)} ${clicks.toString().padStart(8)}`);
}

// Day-by-day breakdown
console.log('\n=== USA 13/3 - Day by Day ===\n');
const daily = await getAll(`/${campaignId}/insights`, {
  fields: 'date_start,actions,spend',
  time_increment: 1,
  time_range: JSON.stringify({ since: '2025-03-13', until: '2026-03-15' }),
  limit: 100,
});

console.log(`${'Date'.padEnd(12)} ${'Spend'.padStart(8)} ${'custom'.padStart(8)} ${'lead'.padStart(8)} ${'purch'.padStart(8)}`);
console.log('-'.repeat(48));

let totalCustom = 0;
let totalLead = 0;
for (const r of daily) {
  const find = (type) => {
    if (!r.actions) return 0;
    const a = r.actions.find(x => x.action_type === type);
    return a ? Number(a.value) : 0;
  };
  const custom = find('offsite_conversion.fb_pixel_custom');
  const lead = find('offsite_conversion.fb_pixel_lead');
  const purchase = find('offsite_conversion.fb_pixel_purchase');
  totalCustom += custom;
  totalLead += lead;
  console.log(`${r.date_start.padEnd(12)} $${Number(r.spend).toFixed(2).padStart(7)} ${custom.toString().padStart(8)} ${lead.toString().padStart(8)} ${purchase.toString().padStart(8)}`);
}
console.log('-'.repeat(48));
console.log(`TOTAL${' '.repeat(7)} ${' '.repeat(8)} ${totalCustom.toString().padStart(8)} ${totalLead.toString().padStart(8)}`);

// Check action breakdowns - 1d click vs 7d click vs 1d view
console.log('\n=== Attribution Windows ===\n');
const attrData = await getAll(`/${campaignId}/insights`, {
  fields: 'actions',
  time_range: JSON.stringify({ since: '2025-03-13', until: '2026-03-15' }),
  action_attribution_windows: JSON.stringify(['1d_click', '7d_click', '1d_view']),
  limit: 10,
});

if (attrData.length && attrData[0].actions) {
  for (const a of attrData[0].actions) {
    if (a.action_type.includes('custom') || a.action_type.includes('lead') || a.action_type.includes('purchase')) {
      console.log(`  ${a.action_type}`);
      console.log(`    1d_click: ${a['1d_click'] || '-'} | 7d_click: ${a['7d_click'] || '-'} | 1d_view: ${a['1d_view'] || '-'} | value: ${a.value}`);
    }
  }
}
