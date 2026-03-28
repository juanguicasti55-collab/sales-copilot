import { get, getAll } from './api.js';

function fmt(n) {
  return n != null ? Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-';
}

const campaignIds = process.argv.slice(2);
if (!campaignIds.length) {
  console.error('Usage: node src/deep-ads.js <campaign_id> [campaign_id2 ...]');
  process.exit(1);
}

for (const campId of campaignIds) {
  const campData = await get(`/${campId}`, { fields: 'name,status,objective' });
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📋 ${campData.name} [${campData.status}]`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const adsets = await getAll(`/${campId}/adsets`, {
    fields: 'id,name,status,daily_budget,targeting',
    limit: 100,
  });

  for (const adset of adsets) {
    console.log('');
    const budget = adset.daily_budget ? `$${(adset.daily_budget / 100).toFixed(2)}/day` : 'CBO';
    console.log(`  🎯 AdSet: ${adset.name} [${adset.status}]`);
    console.log(`     ID: ${adset.id} | Budget: ${budget}`);

    const countries = adset.targeting?.geo_locations?.countries;
    if (countries) console.log(`     Countries: ${countries.join(', ')}`);

    const ads = await getAll(`/${adset.id}/ads`, { fields: 'id,name,status', limit: 100 });
    const adsData = [];

    for (const ad of ads) {
      try {
        const ins = await get(`/${ad.id}/insights`, {
          fields: 'ad_name,spend,impressions,clicks,ctr,cpc,cpm,actions,cost_per_action_type,purchase_roas',
          date_preset: 'last_7d',
        });
        const d = ins.data?.[0];
        if (d) {
          const findAction = (arr, type) => {
            if (!arr) return 0;
            const found = arr.find(a => a.action_type === type || a.action_type === `omni_${type}`);
            return found ? Number(found.value) : 0;
          };
          const findCost = (arr, type) => {
            if (!arr) return null;
            const found = arr.find(a => a.action_type === type || a.action_type === `omni_${type}`);
            return found ? Number(found.value) : null;
          };

          adsData.push({
            name: ad.name,
            id: ad.id,
            status: ad.status,
            spend: Number(d.spend || 0),
            impressions: Number(d.impressions || 0),
            clicks: Number(d.clicks || 0),
            ctr: Number(d.ctr || 0),
            cpc: Number(d.cpc || 0),
            cpm: Number(d.cpm || 0),
            purchases: findAction(d.actions, 'purchase'),
            cpa: findCost(d.cost_per_action_type, 'purchase'),
            addToCart: findAction(d.actions, 'add_to_cart'),
            initCheckout: findAction(d.actions, 'initiate_checkout'),
            viewContent: findAction(d.actions, 'view_content'),
            landing: findAction(d.actions, 'landing_page_view'),
            roas: d.purchase_roas?.[0]?.value ? Number(d.purchase_roas[0].value) : 0,
          });
        }
      } catch {
        // no insights
      }
    }

    adsData.sort((a, b) => b.purchases - a.purchases || a.cpc - b.cpc);

    for (const a of adsData) {
      console.log('');
      console.log(`     📌 ${a.name} [${a.status}]`);
      console.log(`        Spend: $${fmt(a.spend)} | Imp: ${a.impressions.toLocaleString()} | Clicks: ${a.clicks} | CTR: ${a.ctr.toFixed(2)}%`);
      console.log(`        CPC: $${fmt(a.cpc)} | CPM: $${fmt(a.cpm)}`);
      console.log(`        🔻 Funnel: Landing: ${a.landing} → ViewContent: ${a.viewContent} → ATC: ${a.addToCart} → IC: ${a.initCheckout} → Purchase: ${a.purchases}`);
      if (a.purchases > 0) {
        console.log(`        💰 CPA: $${fmt(a.cpa)} | ROAS: ${fmt(a.roas)}`);
      }
    }

    if (!adsData.length) {
      console.log('     (No ads with data)');
    }
  }
}
console.log('');
