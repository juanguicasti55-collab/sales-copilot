import { getAll } from './api.js';

function extractPurchases(actions) {
  if (!actions) return 0;
  const p = actions.find(a => a.action_type === 'purchase' || a.action_type === 'omni_purchase');
  return p ? Number(p.value) : 0;
}

function fmt(n) {
  return n != null ? Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-';
}

export async function analyzeAds(accountId, datePreset = 'last_7d') {
  const insights = await getAll(`/${accountId}/insights`, {
    fields: 'ad_id,ad_name,adset_name,campaign_name,spend,impressions,clicks,ctr,actions,cost_per_action_type,purchase_roas',
    level: 'ad',
    date_preset: datePreset,
    limit: 500,
  });

  if (!insights.length) {
    console.log('\nNo ad data found for this period.\n');
    return;
  }

  const ads = insights.map(row => {
    const purchases = extractPurchases(row.actions);
    const spend = Number(row.spend || 0);
    return {
      id: row.ad_id,
      name: row.ad_name,
      adset: row.adset_name,
      campaign: row.campaign_name,
      spend,
      impressions: Number(row.impressions || 0),
      clicks: Number(row.clicks || 0),
      ctr: Number(row.ctr || 0),
      purchases,
      cpa: purchases > 0 ? spend / purchases : Infinity,
      roas: row.purchase_roas?.[0]?.value ? Number(row.purchase_roas[0].value) : 0,
    };
  });

  // Top by Purchases
  const byPurchases = ads.filter(a => a.purchases > 0).sort((a, b) => b.purchases - a.purchases);

  console.log(`\nTop Ads by PURCHASES (${datePreset})\n`);
  if (byPurchases.length) {
    console.log(`${'#'.padStart(3)} ${'Ad Name'.padEnd(40)} ${'Campaign'.padEnd(25)} ${'Spend'.padStart(10)} ${'Purch'.padStart(7)} ${'CPA'.padStart(10)} ${'ROAS'.padStart(7)}`);
    console.log('-'.repeat(105));

    byPurchases.slice(0, 20).forEach((a, i) => {
      console.log(
        `${(i + 1 + '.').padStart(3)} ${a.name.slice(0, 39).padEnd(40)} ${(a.campaign || '').slice(0, 24).padEnd(25)} $${fmt(a.spend).padStart(9)} ${a.purchases.toString().padStart(7)} $${a.cpa === Infinity ? '      N/A' : fmt(a.cpa).padStart(9)} ${a.roas ? fmt(a.roas).padStart(7) : '      -'}`
      );
    });
  } else {
    console.log('  No ads with purchases in this period.');
  }

  // Top by CPA (best = lowest)
  const byCPA = ads.filter(a => a.purchases > 0).sort((a, b) => a.cpa - b.cpa);

  console.log(`\nTop Ads by CPA - Best to Worst (${datePreset})\n`);
  if (byCPA.length) {
    console.log(`${'#'.padStart(3)} ${'Ad Name'.padEnd(40)} ${'Campaign'.padEnd(25)} ${'Spend'.padStart(10)} ${'Purch'.padStart(7)} ${'CPA'.padStart(10)} ${'ROAS'.padStart(7)}`);
    console.log('-'.repeat(105));

    byCPA.slice(0, 20).forEach((a, i) => {
      console.log(
        `${(i + 1 + '.').padStart(3)} ${a.name.slice(0, 39).padEnd(40)} ${(a.campaign || '').slice(0, 24).padEnd(25)} $${fmt(a.spend).padStart(9)} ${a.purchases.toString().padStart(7)} $${fmt(a.cpa).padStart(9)} ${a.roas ? fmt(a.roas).padStart(7) : '      -'}`
      );
    });
  } else {
    console.log('  No ads with purchases in this period.');
  }

  // Worst performers (spending without conversions)
  const noConversions = ads.filter(a => a.purchases === 0 && a.spend > 0).sort((a, b) => b.spend - a.spend);

  if (noConversions.length) {
    console.log(`\nAds Spending WITHOUT Purchases (${datePreset})\n`);
    console.log(`${'#'.padStart(3)} ${'Ad Name'.padEnd(40)} ${'Campaign'.padEnd(25)} ${'Spend'.padStart(10)} ${'Clicks'.padStart(8)} ${'CTR'.padStart(7)}`);
    console.log('-'.repeat(96));

    noConversions.slice(0, 15).forEach((a, i) => {
      console.log(
        `${(i + 1 + '.').padStart(3)} ${a.name.slice(0, 39).padEnd(40)} ${(a.campaign || '').slice(0, 24).padEnd(25)} $${fmt(a.spend).padStart(9)} ${a.clicks.toString().padStart(8)} ${a.ctr.toFixed(2).padStart(6)}%`
      );
    });

    const wastedSpend = noConversions.reduce((s, a) => s + a.spend, 0);
    console.log(`\n  Total spend without purchases: $${fmt(wastedSpend)}`);
  }

  console.log();
}
