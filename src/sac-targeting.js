import 'dotenv/config';
import { get, getAll } from './api.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function printSection(title) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  ${title}`);
  console.log('═'.repeat(70));
}

function printSubSection(title) {
  console.log(`\n  ── ${title} ${'─'.repeat(Math.max(0, 60 - title.length))}`);
}

function fmtBudget(cents) {
  return cents ? `$${(cents / 100).toFixed(2)}` : '-';
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  // 1. Find SAC Traders ad account
  console.log('Buscando cuenta SAC Traders...\n');

  const accountsData = await get('/me/adaccounts', {
    fields: 'id,name,account_status',
    limit: 100,
  });

  const accounts = accountsData.data || [];
  const sacAccount = accounts.find(a => /sac/i.test(a.name));

  if (!sacAccount) {
    console.log('Cuentas disponibles:');
    for (const a of accounts) {
      console.log(`  ${a.id} | ${a.name} | status: ${a.account_status}`);
    }
    console.error('\nNo se encontró una cuenta con "SAC" en el nombre.');
    console.error('Ajusta el filtro o usa uno de los IDs de arriba.');
    process.exit(1);
  }

  const accountId = sacAccount.id;
  printSection(`CUENTA: ${sacAccount.name} (${accountId})`);

  // 2. Get ACTIVE campaigns
  console.log('\nObteniendo campañas ACTIVE...');

  const campaigns = await getAll(`/${accountId}/campaigns`, {
    fields: 'id,name,status,effective_status,objective,daily_budget,lifetime_budget',
    filtering: [{ field: 'effective_status', operator: 'IN', value: ['ACTIVE'] }],
    limit: 500,
  });

  if (campaigns.length === 0) {
    console.log('\nNo hay campañas ACTIVE en esta cuenta.');
    process.exit(0);
  }

  console.log(`\nCampañas ACTIVE encontradas: ${campaigns.length}\n`);

  // 3. For each campaign, get ad sets with targeting
  for (const campaign of campaigns) {
    const budget = campaign.daily_budget
      ? `${fmtBudget(campaign.daily_budget)}/día`
      : campaign.lifetime_budget
        ? `${fmtBudget(campaign.lifetime_budget)} lifetime`
        : 'Sin presupuesto directo (CBO)';

    printSection(`CAMPAÑA: ${campaign.name}`);
    console.log(`  ID:        ${campaign.id}`);
    console.log(`  Status:    ${campaign.effective_status}`);
    console.log(`  Objetivo:  ${campaign.objective || '-'}`);
    console.log(`  Budget:    ${budget}`);

    const adsets = await getAll(`/${campaign.id}/adsets`, {
      fields: 'id,name,status,targeting,optimization_goal,billing_event,bid_strategy,daily_budget',
      limit: 500,
    });

    if (adsets.length === 0) {
      console.log('\n  (Sin ad sets)');
      continue;
    }

    for (const adset of adsets) {
      const t = adset.targeting || {};

      printSubSection(`AD SET: ${adset.name}`);
      console.log(`    ID:                ${adset.id}`);
      console.log(`    Status:            ${adset.status}`);
      console.log(`    Daily Budget:      ${fmtBudget(adset.daily_budget)}`);
      console.log(`    Optimization Goal: ${adset.optimization_goal || '-'}`);
      console.log(`    Billing Event:     ${adset.billing_event || '-'}`);
      console.log(`    Bid Strategy:      ${adset.bid_strategy || '-'}`);

      // Age & Gender
      console.log(`\n    DEMOGRAFÍA:`);
      console.log(`      Edad:    ${t.age_min || '?'} - ${t.age_max || '?'}`);
      const genderMap = { 0: 'Todos', 1: 'Hombres', 2: 'Mujeres' };
      const genders = (t.genders || []).map(g => genderMap[g] || g).join(', ') || 'Todos';
      console.log(`      Género:  ${genders}`);

      // Geo
      console.log(`\n    GEO LOCATIONS:`);
      const geo = t.geo_locations || {};
      if (geo.countries?.length) {
        console.log(`      Países:       ${geo.countries.join(', ')}`);
      }
      if (geo.regions?.length) {
        console.log(`      Regiones:     ${geo.regions.map(r => r.name || r.key).join(', ')}`);
      }
      if (geo.cities?.length) {
        console.log(`      Ciudades:     ${geo.cities.map(c => c.name || c.key).join(', ')}`);
      }
      if (geo.zips?.length) {
        console.log(`      Zips:         ${geo.zips.map(z => z.key).join(', ')}`);
      }
      if (geo.location_types?.length) {
        console.log(`      Tipo:         ${geo.location_types.join(', ')}`);
      }
      if (!geo.countries?.length && !geo.regions?.length && !geo.cities?.length) {
        console.log(`      (Sin geo_locations definidas)`);
      }

      // Custom Audiences
      console.log(`\n    CUSTOM AUDIENCES:`);
      if (t.custom_audiences?.length) {
        for (const ca of t.custom_audiences) {
          console.log(`      - ${ca.name || ca.id} (ID: ${ca.id})`);
        }
      } else {
        console.log(`      (Ninguna)`);
      }

      // Excluded Custom Audiences
      if (t.excluded_custom_audiences?.length) {
        console.log(`\n    EXCLUDED CUSTOM AUDIENCES:`);
        for (const ca of t.excluded_custom_audiences) {
          console.log(`      - ${ca.name || ca.id} (ID: ${ca.id})`);
        }
      }

      // Lookalike / Flexible spec (interests, behaviors)
      console.log(`\n    INTERESES & COMPORTAMIENTOS:`);
      const flexSpecs = t.flexible_spec || [];
      if (flexSpecs.length > 0) {
        for (const spec of flexSpecs) {
          if (spec.interests?.length) {
            console.log(`      Intereses:`);
            for (const i of spec.interests) {
              console.log(`        - ${i.name} (ID: ${i.id})`);
            }
          }
          if (spec.behaviors?.length) {
            console.log(`      Comportamientos:`);
            for (const b of spec.behaviors) {
              console.log(`        - ${b.name} (ID: ${b.id})`);
            }
          }
          // Other flexible_spec keys
          const otherKeys = Object.keys(spec).filter(k => !['interests', 'behaviors'].includes(k));
          for (const key of otherKeys) {
            if (Array.isArray(spec[key]) && spec[key].length) {
              console.log(`      ${key}:`);
              for (const item of spec[key]) {
                console.log(`        - ${item.name || item.id || JSON.stringify(item)}`);
              }
            }
          }
        }
      } else {
        // Check top-level interests/behaviors (older targeting format)
        if (t.interests?.length) {
          console.log(`      Intereses:`);
          for (const i of t.interests) {
            console.log(`        - ${i.name} (ID: ${i.id})`);
          }
        }
        if (t.behaviors?.length) {
          console.log(`      Comportamientos:`);
          for (const b of t.behaviors) {
            console.log(`        - ${b.name} (ID: ${b.id})`);
          }
        }
        if (!t.interests?.length && !t.behaviors?.length) {
          console.log(`      (Ninguno - posible Advantage+ / broad targeting)`);
        }
      }

      // Exclusions
      if (t.exclusions) {
        console.log(`\n    EXCLUSIONES:`);
        const ex = t.exclusions;
        if (ex.interests?.length) {
          console.log(`      Intereses excluidos:`);
          for (const i of ex.interests) {
            console.log(`        - ${i.name} (ID: ${i.id})`);
          }
        }
        if (ex.behaviors?.length) {
          console.log(`      Comportamientos excluidos:`);
          for (const b of ex.behaviors) {
            console.log(`        - ${b.name} (ID: ${b.id})`);
          }
        }
      }

      // Publisher platforms
      if (t.publisher_platforms?.length) {
        console.log(`\n    PLATAFORMAS: ${t.publisher_platforms.join(', ')}`);
      }
      if (t.facebook_positions?.length) {
        console.log(`    POSICIONES FB: ${t.facebook_positions.join(', ')}`);
      }
      if (t.instagram_positions?.length) {
        console.log(`    POSICIONES IG: ${t.instagram_positions.join(', ')}`);
      }
    }
  }

  console.log(`\n${'═'.repeat(70)}`);
  console.log('  Análisis de targeting completado.');
  console.log('═'.repeat(70) + '\n');
}

main().catch(err => {
  console.error(`\nError: ${err.message}`);
  process.exit(1);
});
