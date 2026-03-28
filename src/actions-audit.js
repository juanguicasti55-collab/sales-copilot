import { getAll } from './api.js';

const campaigns = [
  { id: '120243313100610626', name: 'USA-13/3' },
  { id: '120243312528290626', name: 'Latam-13/3' },
  { id: '120243224295200626', name: 'USA-11/3 (PAUSED)' },
  { id: '120243222538940626', name: 'Latam-11/3 (PAUSED)' },
];

for (const camp of campaigns) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`CAMPAIGN: ${camp.name}`);
  console.log('='.repeat(70));

  try {
    const data = await getAll(`/${camp.id}/insights`, {
      fields: 'actions,cost_per_action_type,action_values',
      time_range: JSON.stringify({ since: '2025-01-01', until: '2026-03-15' }),
      limit: 10,
    });

    if (!data.length) {
      console.log('  No data');
      continue;
    }

    const row = data[0];

    if (row.actions) {
      console.log('\n--- ALL Actions ---');
      for (const a of row.actions.sort((x, y) => Number(y.value) - Number(x.value))) {
        console.log(`  ${a.action_type.padEnd(45)} = ${a.value}`);
      }
    }

    if (row.cost_per_action_type) {
      console.log('\n--- Cost Per Action ---');
      for (const a of row.cost_per_action_type.sort((x, y) => Number(x.value) - Number(y.value))) {
        console.log(`  ${a.action_type.padEnd(45)} = $${Number(a.value).toFixed(2)}`);
      }
    }

    if (row.action_values) {
      console.log('\n--- Action Values (Revenue) ---');
      for (const a of row.action_values) {
        console.log(`  ${a.action_type.padEnd(45)} = $${Number(a.value).toFixed(2)}`);
      }
    }
  } catch (e) {
    console.log(`  Error: ${e.message}`);
  }
}
