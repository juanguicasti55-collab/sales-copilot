import { get, getAll } from './api.js';

console.log('========================================');
console.log('  VERIFICACIÓN FINAL - SAC EVERGREEN');
console.log('========================================\n');

// Campaigns
const campaigns = ['120243509758410626', '120243509758540626'];
for (const id of campaigns) {
  const c = await get('/' + id, { fields: 'name,status,objective,buying_type,bid_strategy,daily_budget,special_ad_categories' });
  console.log('📢 CAMPAÑA: ' + c.name);
  console.log('   Status: ' + c.status);
  console.log('   Objetivo: ' + c.objective);
  console.log('   Buying type: ' + c.buying_type);
  console.log('   Bid strategy: ' + (c.bid_strategy || 'default'));
  console.log('   Special ad categories: ' + JSON.stringify(c.special_ad_categories));
  console.log('');
}

// Ad Sets
const adsets = ['120243509758680626', '120243509759080626'];
for (const id of adsets) {
  const a = await get('/' + id, { fields: 'name,status,targeting,optimization_goal,billing_event,daily_budget,promoted_object,destination_type,start_time' });
  console.log('📋 AD SET: ' + a.name);
  console.log('   Status: ' + a.status);
  console.log('   Budget: $' + (a.daily_budget / 100) + '/day');
  console.log('   Optimization: ' + a.optimization_goal);
  console.log('   Billing: ' + a.billing_event);
  console.log('   Destination: ' + (a.destination_type || 'N/A'));
  console.log('   Promoted object: ' + JSON.stringify(a.promoted_object));
  console.log('   Start time: ' + a.start_time);
  console.log('   Targeting:');
  console.log('     Geo: ' + JSON.stringify(a.targeting.geo_locations?.countries));
  console.log('     Age: ' + a.targeting.age_min + '-' + a.targeting.age_max);
  console.log('     Platforms: ' + JSON.stringify(a.targeting.publisher_platforms));
  console.log('     FB positions: ' + JSON.stringify(a.targeting.facebook_positions));
  console.log('     IG positions: ' + JSON.stringify(a.targeting.instagram_positions));
  console.log('     Device: ' + JSON.stringify(a.targeting.device_platforms));
  console.log('     Advantage audience: ' + JSON.stringify(a.targeting.targeting_automation));
  console.log('');

  // Ads
  const ads = await getAll('/' + id + '/ads', { fields: 'id,name,status,creative{id,object_story_spec,url_tags}' });
  console.log('   🎬 ADS (' + ads.length + '):');
  for (const ad of ads) {
    const vd = ad.creative?.object_story_spec?.video_data;
    const hasIG = ad.creative?.object_story_spec?.instagram_actor_id;
    const utms = ad.creative?.url_tags;
    const url = vd?.call_to_action?.value?.link || 'N/A';
    const hasUtms = utms && utms.length > 0;
    console.log('     ' + (ad.status === 'ACTIVE' ? '✅' : '⏸️') + ' ' + ad.name);
    console.log('        URL: ' + url);
    console.log('        UTMs: ' + (hasUtms ? '✅ ' + utms : '❌ SIN UTMs'));
    console.log('        IG vinculado: ' + (hasIG ? '✅ ' + hasIG : '❌ No'));
    console.log('        Video ID: ' + (vd?.video_id || 'N/A'));
  }
  console.log('');
}

// Check pixel/promoted object
console.log('========================================');
console.log('  CHECKLIST FINAL');
console.log('========================================\n');

const checks = [];
for (const id of adsets) {
  const a = await get('/' + id, { fields: 'name,optimization_goal,promoted_object,daily_budget,targeting,status' });

  // Check optimization goal
  checks.push({
    item: a.name + ' - Optimization = OFFSITE_CONVERSIONS',
    ok: a.optimization_goal === 'OFFSITE_CONVERSIONS'
  });

  // Check pixel
  checks.push({
    item: a.name + ' - Pixel configurado',
    ok: !!a.promoted_object?.pixel_id
  });

  // Check custom event
  checks.push({
    item: a.name + ' - Evento = CompleteRegistration',
    ok: a.promoted_object?.custom_event_type === 'COMPLETE_REGISTRATION'
  });

  // Check budget
  checks.push({
    item: a.name + ' - Budget = $10/day',
    ok: a.daily_budget === '1000'
  });

  // Check mobile only
  checks.push({
    item: a.name + ' - Solo mobile',
    ok: JSON.stringify(a.targeting.device_platforms) === '["mobile"]'
  });

  // Check vertical placements
  const hasIGReels = a.targeting.instagram_positions?.includes('reels');
  const hasIGStory = a.targeting.instagram_positions?.includes('story');
  checks.push({
    item: a.name + ' - Placements verticales (IG Reels + Stories)',
    ok: hasIGReels && hasIGStory
  });
}

// Check ads have UTMs
for (const id of adsets) {
  const ads = await getAll('/' + id + '/ads', { fields: 'name,creative{url_tags,object_story_spec}' });
  const allHaveUtms = ads.every(a => a.creative?.url_tags && a.creative.url_tags.includes('utm_source'));
  const allCleanUrl = ads.every(a => {
    const url = a.creative?.object_story_spec?.video_data?.call_to_action?.value?.link;
    return url && !url.includes('fbclid');
  });
  const adsetName = id === '120243509758680626' ? 'USA' : 'LATAM';
  checks.push({ item: adsetName + ' - Todos los ads con UTMs', ok: allHaveUtms });
  checks.push({ item: adsetName + ' - URLs limpias (sin fbclid)', ok: allCleanUrl });
}

let passed = 0;
let failed = 0;
for (const c of checks) {
  const icon = c.ok ? '✅' : '❌';
  console.log(icon + ' ' + c.item);
  if (c.ok) passed++;
  else failed++;
}

console.log('\n' + '='.repeat(40));
console.log('RESULTADO: ' + passed + '/' + (passed + failed) + ' checks passed');
if (failed === 0) {
  console.log('🚀 CAMPAÑA LISTA PARA LANZAR');
} else {
  console.log('⚠️  ' + failed + ' items necesitan atención');
}
