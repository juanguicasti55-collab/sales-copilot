import { get, getAll } from './api.js';

const campaigns = [
  { id: '120243509758410626', name: 'USA' },
  { id: '120243509758540626', name: 'Latam' },
];

for (const c of campaigns) {
  const camp = await get(`/${c.id}`, { fields: 'name,status,objective' });
  console.log(`\n📦 ${camp.name}`);
  console.log(`   Status: ${camp.status} | Objetivo: ${camp.objective}`);

  const adsets = await getAll(`/${c.id}/adsets`, {
    fields: 'name,status,daily_budget,optimization_goal,targeting,promoted_object',
  });

  for (const as of adsets) {
    const countries = as.targeting?.geo_locations?.countries?.join(', ') || '?';
    console.log(`   └─ Ad Set: ${as.name}`);
    console.log(`      Budget: $${(as.daily_budget / 100).toFixed(0)}/day | Opt: ${as.optimization_goal} | Geo: ${countries}`);
    console.log(`      Pixel: ${as.promoted_object?.pixel_id} | Event: ${as.promoted_object?.custom_event_type}`);

    const ads = await getAll(`/${as.id}/ads`, { fields: 'name,status,creative{name}' });
    for (const ad of ads) {
      console.log(`      ├─ ${ad.name} (${ad.status})`);
    }
  }
}
console.log('\n✅ Verificación completa');
