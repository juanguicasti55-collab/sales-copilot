import {
  listAccounts,
  listCampaigns,
  getCampaignInsights,
  listAdSets,
  getAdSetInsights,
  listAds,
  getAdInsights,
  getAccountInsights,
  updateStatus,
  updateBudget,
} from './campaigns.js';
import { analyzeCountries } from './analyze-countries.js';
import { analyzeAds } from './analyze-ads.js';

const [command, ...args] = process.argv.slice(2);

function fmt(n) {
  return n != null ? Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-';
}

function fmtBudget(cents) {
  return cents ? fmt(cents / 100) : '-';
}

function extractPurchases(actions) {
  if (!actions) return 0;
  const purchase = actions.find(a => a.action_type === 'purchase' || a.action_type === 'omni_purchase');
  return purchase ? Number(purchase.value) : 0;
}

function extractCPA(costPerAction) {
  if (!costPerAction) return null;
  const purchase = costPerAction.find(a => a.action_type === 'purchase' || a.action_type === 'omni_purchase');
  return purchase ? Number(purchase.value) : null;
}

const STATUS_LABELS = {
  1: 'ACTIVE', 2: 'DISABLED', 3: 'UNSETTLED', 7: 'PENDING_RISK_REVIEW',
  8: 'PENDING_SETTLEMENT', 9: 'IN_GRACE_PERIOD', 100: 'PENDING_CLOSURE', 101: 'CLOSED',
};

async function main() {
  try {
    switch (command) {

      case 'accounts': {
        const accounts = await listAccounts();
        console.log(`\nAd Accounts (${accounts.length}):\n`);
        for (const a of accounts) {
          const status = STATUS_LABELS[a.account_status] || a.account_status;
          console.log(`  ${a.id} | ${a.name} | ${status} | ${a.currency} | Spent: $${fmt(a.amount_spent / 100)}`);
        }
        break;
      }

      case 'campaigns': {
        const accountId = args[0];
        if (!accountId) { console.error('Usage: campaigns <account_id> [date_preset]'); process.exit(1); }
        const datePreset = args[1] || 'last_7d';
        const campaigns = await listCampaigns(accountId);
        console.log(`\nCampaigns for ${accountId} (${campaigns.length}):\n`);

        for (const c of campaigns) {
          const budget = c.daily_budget ? `$${fmtBudget(c.daily_budget)}/day` : c.lifetime_budget ? `$${fmtBudget(c.lifetime_budget)} lifetime` : 'No budget set';
          console.log(`  [${c.effective_status}] ${c.name}`);
          console.log(`    ID: ${c.id} | Budget: ${budget} | Objective: ${c.objective || '-'}`);

          try {
            const ins = await getCampaignInsights(c.id, datePreset);
            if (ins) {
              const purchases = extractPurchases(ins.actions);
              const cpa = extractCPA(ins.cost_per_action_type);
              console.log(`    Spend: $${fmt(ins.spend)} | Imp: ${Number(ins.impressions).toLocaleString()} | Clicks: ${ins.clicks} | CTR: ${ins.ctr}%`);
              console.log(`    Purchases: ${purchases} | CPA: $${cpa ? fmt(cpa) : '-'} | ROAS: ${ins.purchase_roas?.[0]?.value || '-'}`);
            }
          } catch { /* no insights */ }
          console.log();
        }
        break;
      }

      case 'insights': {
        const accountId = args[0];
        if (!accountId) { console.error('Usage: insights <account_id> [date_preset]'); process.exit(1); }
        const datePreset = args[1] || 'last_7d';
        const insights = await getAccountInsights(accountId, datePreset);
        console.log(`\nAccount Insights (${datePreset}):\n`);
        for (const ins of insights) {
          const purchases = extractPurchases(ins.actions);
          const cpa = extractCPA(ins.cost_per_action_type);
          console.log(`  Account: ${ins.account_name || accountId}`);
          console.log(`  Spend: $${fmt(ins.spend)} | Imp: ${Number(ins.impressions).toLocaleString()} | Clicks: ${ins.clicks}`);
          console.log(`  CTR: ${ins.ctr}% | CPC: $${fmt(ins.cpc)} | CPM: $${fmt(ins.cpm)}`);
          console.log(`  Purchases: ${purchases} | CPA: $${cpa ? fmt(cpa) : '-'} | ROAS: ${ins.purchase_roas?.[0]?.value || '-'}`);
        }
        break;
      }

      case 'adsets': {
        const parentId = args[0];
        if (!parentId) { console.error('Usage: adsets <account_id|campaign_id> [date_preset]'); process.exit(1); }
        const datePreset = args[1] || 'last_7d';
        const isCampaign = !parentId.startsWith('act_');
        const adsets = await listAdSets(isCampaign ? null : parentId, isCampaign ? parentId : null);
        console.log(`\nAd Sets (${adsets.length}):\n`);

        for (const s of adsets) {
          const budget = s.daily_budget ? `$${fmtBudget(s.daily_budget)}/day` : s.lifetime_budget ? `$${fmtBudget(s.lifetime_budget)} lifetime` : 'CBO';
          console.log(`  [${s.status}] ${s.name}`);
          console.log(`    ID: ${s.id} | Budget: ${budget} | Goal: ${s.optimization_goal || '-'}`);

          try {
            const ins = await getAdSetInsights(s.id, datePreset);
            if (ins) {
              const purchases = extractPurchases(ins.actions);
              const cpa = extractCPA(ins.cost_per_action_type);
              console.log(`    Spend: $${fmt(ins.spend)} | Clicks: ${ins.clicks} | Purchases: ${purchases} | CPA: $${cpa ? fmt(cpa) : '-'}`);
            }
          } catch { /* no insights */ }
          console.log();
        }
        break;
      }

      case 'ads': {
        const parentId = args[0];
        if (!parentId) { console.error('Usage: ads <account_id|adset_id> [date_preset]'); process.exit(1); }
        const datePreset = args[1] || 'last_7d';
        const isAdSet = !parentId.startsWith('act_');
        const ads = await listAds(isAdSet ? null : parentId, isAdSet ? parentId : null);
        console.log(`\nAds (${ads.length}):\n`);

        for (const ad of ads) {
          console.log(`  [${ad.status}] ${ad.name}`);
          console.log(`    ID: ${ad.id} | Campaign: ${ad.campaign_id} | AdSet: ${ad.adset_id}`);

          try {
            const ins = await getAdInsights(ad.id, datePreset);
            if (ins) {
              const purchases = extractPurchases(ins.actions);
              const cpa = extractCPA(ins.cost_per_action_type);
              console.log(`    Spend: $${fmt(ins.spend)} | Clicks: ${ins.clicks} | Purchases: ${purchases} | CPA: $${cpa ? fmt(cpa) : '-'}`);
            }
          } catch { /* no insights */ }
          console.log();
        }
        break;
      }

      case 'pause': {
        const objectId = args[0];
        if (!objectId) { console.error('Usage: pause <campaign_id|adset_id|ad_id>'); process.exit(1); }
        await updateStatus(objectId, 'PAUSED');
        console.log(`${objectId} -> PAUSED`);
        break;
      }

      case 'activate': {
        const objectId = args[0];
        if (!objectId) { console.error('Usage: activate <campaign_id|adset_id|ad_id>'); process.exit(1); }
        await updateStatus(objectId, 'ACTIVE');
        console.log(`${objectId} -> ACTIVE`);
        break;
      }

      case 'budget': {
        const objectId = args[0];
        const amount = parseFloat(args[1]);
        const type = args[2] || 'daily';
        if (!objectId || isNaN(amount)) {
          console.error('Usage: budget <campaign_id|adset_id> <amount_usd> [daily|lifetime]');
          process.exit(1);
        }
        const opts = type === 'lifetime' ? { lifetimeBudget: amount } : { dailyBudget: amount };
        await updateBudget(objectId, opts);
        console.log(`${objectId} -> ${type} budget: $${fmt(amount)}`);
        break;
      }

      case 'countries': {
        const accountId = args[0];
        if (!accountId) { console.error('Usage: countries <account_id> [date_preset]'); process.exit(1); }
        const datePreset = args[1] || 'last_30d';
        await analyzeCountries(accountId, datePreset);
        break;
      }

      case 'top-ads': {
        const accountId = args[0];
        if (!accountId) { console.error('Usage: top-ads <account_id> [date_preset]'); process.exit(1); }
        const datePreset = args[1] || 'last_7d';
        await analyzeAds(accountId, datePreset);
        break;
      }

      default:
        console.log(`
ADS CLAUDE - Meta Ads Manager CLI v2.0

Commands:
  accounts                                   List ad accounts
  campaigns  <account_id> [date_preset]      List campaigns + insights
  insights   <account_id> [date_preset]      Account-level insights
  adsets     <account_id|campaign_id> [date]  List ad sets + insights
  ads        <account_id|adset_id> [date]     List ads + insights
  pause      <id>                             Pause campaign/adset/ad
  activate   <id>                             Activate campaign/adset/ad
  budget     <id> <amount> [daily|lifetime]   Update budget (USD)
  countries  <account_id> [date_preset]       Analyze spend by country
  top-ads    <account_id> [date_preset]       Top performing ads

Date presets: today, yesterday, last_3d, last_7d, last_14d, last_30d, last_90d, this_month, last_month
        `);
    }
  } catch (err) {
    console.error(`\nError: ${err.message}`);
    process.exit(1);
  }
}

main();
