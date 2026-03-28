import 'dotenv/config';

const TOKEN = process.env.META_ACCESS_TOKEN;
const VERSION = process.env.META_API_VERSION || 'v21.0';
const BASE = `https://graph.facebook.com/${VERSION}`;
const ACCOUNT_ID = 'act_419589875530964';
const PAGE_ID = '764963230548074';
const PAGE_URL = 'https://ninjatrader.sactraders.com/';
const ADSET_LATAM = '120243509759080626';

async function main() {
  // Get thumbnail for video 5
  const videoId = '1602687687647797';
  const thumbRes = await fetch(`${BASE}/${videoId}?fields=picture&access_token=${TOKEN}`);
  const thumbData = await thumbRes.json();
  const imageUrl = thumbData.picture;

  const copy = {
    primary: `¿Sigues perdiendo dinero adivinando hacia dónde va el mercado?\n\nEn esta masterclass EN VIVO te enseñamos a leer el volumen institucional y operar con la metodología validada por +500 traders.\n\nSin señales mágicas. Sin indicadores que confunden. Solo precio y volumen real.\n\nRegístrate GRATIS → Cupos limitados`,
    headline: 'Masterclass Gratis: Trading Profesional',
    description: 'Aprende a operar como los institucionales',
  };

  const url = `${BASE}/${ACCOUNT_ID}/adcreatives?access_token=${TOKEN}`;
  const creativeRes = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'SAC Evergreen Latam - Video 5 - Pain Point',
      object_story_spec: {
        page_id: PAGE_ID,
        video_data: {
          video_id: videoId,
          message: copy.primary,
          title: copy.headline,
          link_description: copy.description,
          image_url: imageUrl,
          call_to_action: { type: 'SIGN_UP', value: { link: PAGE_URL } },
        },
      },
    }),
  });
  const creative = await creativeRes.json();
  if (creative.error) { console.error('Creative error:', creative.error); process.exit(1); }
  console.log('✅ Creative:', creative.id);

  const adUrl = `${BASE}/${ACCOUNT_ID}/ads?access_token=${TOKEN}`;
  const adRes = await fetch(adUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Video 5 - Pain Point',
      adset_id: ADSET_LATAM,
      creative: { creative_id: creative.id },
      status: 'PAUSED',
    }),
  });
  const ad = await adRes.json();
  if (ad.error) { console.error('Ad error:', ad.error); process.exit(1); }
  console.log('✅ Latam - Video 5 (Pain Point): ad', ad.id);
}

main();
