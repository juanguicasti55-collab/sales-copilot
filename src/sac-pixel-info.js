import { getAll } from './api.js';

const ACCOUNT_ID = 'act_419589875530964';
const ACCOUNT_NAME = 'SAC Traders';

async function main() {
  console.log(`\n===== PIXEL INFO - ${ACCOUNT_NAME} (${ACCOUNT_ID}) =====\n`);

  // 1. Get all pixels
  console.log('--- PIXELS ---');
  const pixels = await getAll(`/${ACCOUNT_ID}/adspixels`, {
    fields: 'id,name,last_fired_time',
  });

  if (pixels.length === 0) {
    console.log('No se encontraron pixels.\n');
  } else {
    for (const px of pixels) {
      console.log(`  Pixel ID: ${px.id}`);
      console.log(`  Nombre:   ${px.name}`);
      console.log(`  Último disparo: ${px.last_fired_time || 'Nunca'}`);
      console.log();
    }
  }

  // 2. For each pixel, try to get custom conversions
  console.log('--- CUSTOM CONVERSIONS POR PIXEL ---');
  for (const px of pixels) {
    console.log(`\n  Pixel: ${px.name} (${px.id})`);
    try {
      const convs = await getAll(`/${px.id}/customconversions`, {
        fields: 'id,name,pixel_rule,custom_event_type,default_conversion_value',
      });

      if (convs.length === 0) {
        console.log('    Sin custom conversions.');
      } else {
        for (const c of convs) {
          console.log(`    - ${c.name} (ID: ${c.id})`);
          console.log(`      Evento: ${c.custom_event_type || 'N/A'}`);
          console.log(`      Regla:  ${JSON.stringify(c.pixel_rule)}`);
          console.log(`      Valor:  ${c.default_conversion_value ?? 'N/A'}`);
        }
      }
    } catch (err) {
      console.log(`    (No disponible: ${err.message})`);
    }
  }

  // 3. Account-level custom conversions
  console.log('\n--- CUSTOM CONVERSIONS DE LA CUENTA ---');
  const accountConvs = await getAll(`/${ACCOUNT_ID}/customconversions`, {
    fields: 'id,name,pixel_rule,custom_event_type,default_conversion_value',
  });

  if (accountConvs.length === 0) {
    console.log('  Sin custom conversions a nivel de cuenta.\n');
  } else {
    for (const c of accountConvs) {
      console.log(`  - ${c.name} (ID: ${c.id})`);
      console.log(`    Evento: ${c.custom_event_type || 'N/A'}`);
      console.log(`    Regla:  ${JSON.stringify(c.pixel_rule)}`);
      console.log(`    Valor:  ${c.default_conversion_value ?? 'N/A'}`);
    }
  }

  console.log('\n===== FIN =====\n');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
