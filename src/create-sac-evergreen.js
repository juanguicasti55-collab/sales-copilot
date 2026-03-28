import 'dotenv/config';
import fs from 'fs';
import path from 'path';

const TOKEN = process.env.META_ACCESS_TOKEN;
const VERSION = process.env.META_API_VERSION || 'v21.0';
const BASE = `https://graph.facebook.com/${VERSION}`;
const ACCOUNT_ID = 'act_419589875530964';
const PIXEL_ID = '446244309456102';
const CUSTOM_CONVERSION_ID = '442320113237603';
const PAGE_URL = 'https://ninjatrader.sactraders.com/';

// --- Config ---
const VIDEO_DIR = '/Users/juangonzalez/Downloads/ADS CLAUDE/videos-sac-clases';
const COPIES = [
  {
    name: 'Pain Point',
    primary: `¿Sigues perdiendo dinero adivinando hacia dónde va el mercado?\n\nEn esta masterclass EN VIVO te enseñamos a leer el volumen institucional y operar con la metodología validada por +500 traders.\n\nSin señales mágicas. Sin indicadores que confunden. Solo precio y volumen real.\n\nRegístrate GRATIS → Cupos limitados`,
    headline: 'Masterclass Gratis: Trading Profesional',
    description: 'Aprende a operar como los institucionales',
  },
  {
    name: 'Aspiracional',
    primary: `Los traders profesionales no usan 15 indicadores. Usan el precio y el volumen.\n\nAprende su metodología en una masterclass gratuita EN VIVO con NinjaTrader.\n\n✅ Cómo ver el dinero institucional\n✅ Ejecución en el milisegundo exacto\n✅ El sistema validado por +500 traders\n\nCupos limitados → Regístrate ahora`,
    headline: 'Clase EN VIVO: Trading con NinjaTrader',
    description: 'La metodología de +500 traders profesionales',
  },
];

// --- Helpers ---
async function apiPost(endpoint, body) {
  const url = `${BASE}${endpoint}?access_token=${TOKEN}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.error) throw new Error(`API Error: ${data.error.message} | ${JSON.stringify(data.error)}`);
  return data;
}

async function uploadVideo(filePath, title) {
  const url = `${BASE}/${ACCOUNT_ID}/advideos`;
  const fileStream = fs.readFileSync(filePath);
  const formData = new FormData();
  formData.append('access_token', TOKEN);
  formData.append('title', title);
  formData.append('source', new Blob([fileStream]), path.basename(filePath));

  console.log(`  Subiendo ${title} (${(fs.statSync(filePath).size / 1024 / 1024).toFixed(1)}MB)...`);
  const res = await fetch(url, { method: 'POST', body: formData });
  const data = await res.json();
  if (data.error) throw new Error(`Upload Error: ${data.error.message}`);
  console.log(`  ✅ ${title} -> video_id: ${data.id}`);
  return data.id;
}

async function waitForVideoReady(videoId, maxWait = 120000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const url = `${BASE}/${videoId}?fields=status&access_token=${TOKEN}`;
    const res = await fetch(url);
    const data = await res.json();
    const status = data.status?.video_status;
    if (status === 'ready') return true;
    if (status === 'error') throw new Error(`Video ${videoId} failed processing`);
    console.log(`  ⏳ Video ${videoId} status: ${status}, esperando...`);
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error(`Video ${videoId} timeout after ${maxWait/1000}s`);
}

// --- Get page ID ---
async function getPageId() {
  const url = `${BASE}/${ACCOUNT_ID}/promote_pages?access_token=${TOKEN}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(`Page Error: ${data.error.message}`);
  console.log(`\n📄 Páginas disponibles:`);
  for (const p of data.data) {
    console.log(`  - ${p.name} (${p.id})`);
  }
  return data.data[0]?.id;
}

// --- Main ---
async function main() {
  console.log('🚀 Creando campañas Evergreen SAC Traders - Masterclass NinjaTrader\n');

  // Step 0: Get Facebook Page ID
  console.log('📄 Obteniendo Page ID...');
  const pageId = await getPageId();
  if (!pageId) throw new Error('No se encontró página de Facebook para esta cuenta');
  console.log(`  Usando page: ${pageId}\n`);

  // Videos ya subidos previamente
  const videoIds = [
    { id: '952017937358987', index: 1 },
    { id: '1248971726844237', index: 2 },
    { id: '927327876722456', index: 3 },
    { id: '1472413777561417', index: 4 },
    { id: '1602687687647797', index: 5 },
  ];
  console.log('📹 Videos ya subidos (5 videos)');

  // Get thumbnails for each video
  console.log('🖼️  Obteniendo thumbnails...\n');
  for (const v of videoIds) {
    const url = `${BASE}/${v.id}?fields=thumbnails,picture&access_token=${TOKEN}`;
    const res = await fetch(url);
    const data = await res.json();
    v.imageUrl = data.picture || data.thumbnails?.data?.[0]?.uri || null;
    console.log(`  Video ${v.index}: ${v.imageUrl ? '✅' : '❌'}`);
  }
  console.log('');

  // Step 4: Create campaigns
  console.log('\n📦 PASO 4: Creando campañas...\n');

  const campaignUSA = await apiPost(`/${ACCOUNT_ID}/campaigns`, {
    name: 'SAC Evergreen - Masterclass NinjaTrader - USA',
    objective: 'OUTCOME_LEADS',
    status: 'PAUSED',
    special_ad_categories: [],
    is_adset_budget_sharing_enabled: false,
  });
  console.log(`  ✅ Campaña USA: ${campaignUSA.id}`);

  const campaignLatam = await apiPost(`/${ACCOUNT_ID}/campaigns`, {
    name: 'SAC Evergreen - Masterclass NinjaTrader - Latam',
    objective: 'OUTCOME_LEADS',
    status: 'PAUSED',
    special_ad_categories: [],
    is_adset_budget_sharing_enabled: false,
  });
  console.log(`  ✅ Campaña Latam: ${campaignLatam.id}`);

  // Step 5: Create ad sets
  console.log('\n📋 PASO 5: Creando ad sets...\n');

  const adsetBase = {
    billing_event: 'IMPRESSIONS',
    optimization_goal: 'OFFSITE_CONVERSIONS',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    daily_budget: 1000, // $10.00 in cents
    status: 'PAUSED',
    promoted_object: {
      pixel_id: PIXEL_ID,
      custom_event_type: 'COMPLETE_REGISTRATION',
    },
  };

  const adsetUSA = await apiPost(`/${ACCOUNT_ID}/adsets`, {
    ...adsetBase,
    name: 'Broad USA - Complete Registration',
    campaign_id: campaignUSA.id,
    targeting: {
      age_min: 18,
      age_max: 65,
      geo_locations: {
        countries: ['US'],
        location_types: ['home', 'recent'],
      },
    },
  });
  console.log(`  ✅ Ad Set USA: ${adsetUSA.id}`);

  const adsetLatam = await apiPost(`/${ACCOUNT_ID}/adsets`, {
    ...adsetBase,
    name: 'Broad Latam - Complete Registration',
    campaign_id: campaignLatam.id,
    targeting: {
      age_min: 18,
      age_max: 65,
      geo_locations: {
        countries: ['MX', 'CO', 'AR', 'CL', 'PE', 'EC'],
        location_types: ['home', 'recent'],
      },
    },
  });
  console.log(`  ✅ Ad Set Latam: ${adsetLatam.id}`);

  // Step 6: Create ads (5 videos x 2 copies = alternate copies per video)
  console.log('\n🎨 PASO 6: Creando ads...\n');

  for (const geo of ['USA', 'Latam']) {
    const adsetId = geo === 'USA' ? adsetUSA.id : adsetLatam.id;

    for (let i = 0; i < videoIds.length; i++) {
      const v = videoIds[i];
      const copy = COPIES[i % COPIES.length]; // Alternate between 2 copies

      const videoData = {
        video_id: v.id,
        message: copy.primary,
        title: copy.headline,
        link_description: copy.description,
        call_to_action: {
          type: 'SIGN_UP',
          value: { link: PAGE_URL },
        },
      };
      if (v.imageUrl) videoData.image_url = v.imageUrl;

      const creative = await apiPost(`/${ACCOUNT_ID}/adcreatives`, {
        name: `SAC Evergreen ${geo} - Video ${v.index} - ${copy.name}`,
        object_story_spec: {
          page_id: pageId,
          video_data: videoData,
        },
      });

      const ad = await apiPost(`/${ACCOUNT_ID}/ads`, {
        name: `Video ${v.index} - ${copy.name}`,
        adset_id: adsetId,
        creative: { creative_id: creative.id },
        status: 'PAUSED',
      });

      console.log(`  ✅ ${geo} - Video ${v.index} (${copy.name}): ad ${ad.id}`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('🎉 RESUMEN - TODO CREADO EXITOSAMENTE');
  console.log('='.repeat(60));
  console.log(`\n📦 Campaña USA: ${campaignUSA.id}`);
  console.log(`   └─ Ad Set: ${adsetUSA.id} ($10/day, Broad US)`);
  console.log(`      └─ 5 ads con videos`);
  console.log(`\n📦 Campaña Latam: ${campaignLatam.id}`);
  console.log(`   └─ Ad Set: ${adsetLatam.id} ($10/day, MX+CO+AR+CL+PE+EC)`);
  console.log(`      └─ 5 ads con videos`);
  console.log(`\n⚠️  AMBAS CAMPAÑAS ESTÁN EN PAUSED`);
  console.log(`   Revísalas en Ads Manager y actívalas cuando estés listo.`);
  console.log('='.repeat(60));
}

main().catch(err => {
  console.error('\n❌ ERROR:', err.message);
  process.exit(1);
});
