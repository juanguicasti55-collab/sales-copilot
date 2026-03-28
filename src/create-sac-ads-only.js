import 'dotenv/config';

const TOKEN = process.env.META_ACCESS_TOKEN;
const VERSION = process.env.META_API_VERSION || 'v21.0';
const BASE = `https://graph.facebook.com/${VERSION}`;
const ACCOUNT_ID = 'act_419589875530964';
const PAGE_ID = '764963230548074';
const PAGE_URL = 'https://ninjatrader.sactraders.com/';

// Already created
const ADSET_USA = '120243509758680626';
const ADSET_LATAM = '120243509759080626';

const videoIds = [
  { id: '952017937358987', index: 1 },
  { id: '1248971726844237', index: 2 },
  { id: '927327876722456', index: 3 },
  { id: '1472413777561417', index: 4 },
  { id: '1602687687647797', index: 5 },
];

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

async function main() {
  // Get thumbnails
  console.log('🖼️  Obteniendo thumbnails...\n');
  for (const v of videoIds) {
    const url = `${BASE}/${v.id}?fields=picture&access_token=${TOKEN}`;
    const res = await fetch(url);
    const data = await res.json();
    v.imageUrl = data.picture || null;
    console.log(`  Video ${v.index}: ${v.imageUrl ? '✅' : '❌'}`);
  }

  // Create ads
  console.log('\n🎨 Creando ads...\n');

  for (const [geo, adsetId] of [['USA', ADSET_USA], ['Latam', ADSET_LATAM]]) {
    for (let i = 0; i < videoIds.length; i++) {
      const v = videoIds[i];
      const copy = COPIES[i % COPIES.length];

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
          page_id: PAGE_ID,
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

  console.log('\n' + '='.repeat(60));
  console.log('🎉 10 ADS CREADOS EXITOSAMENTE');
  console.log('='.repeat(60));
  console.log('\n📦 Campaña USA: 120243509758410626');
  console.log(`   └─ Ad Set: ${ADSET_USA} ($10/day, Broad US)`);
  console.log('      └─ 5 video ads');
  console.log('\n📦 Campaña Latam: 120243509758540626');
  console.log(`   └─ Ad Set: ${ADSET_LATAM} ($10/day, MX+CO+AR+CL+PE+EC)`);
  console.log('      └─ 5 video ads');
  console.log('\n⚠️  TODO EN PAUSED - Revisa en Ads Manager y activa cuando estés listo');
  console.log('='.repeat(60));
}

main().catch(err => {
  console.error('\n❌ ERROR:', err.message);
  process.exit(1);
});
