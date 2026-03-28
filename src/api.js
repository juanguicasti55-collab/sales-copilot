import 'dotenv/config';

const TOKEN = process.env.META_ACCESS_TOKEN;
const VERSION = process.env.META_API_VERSION || 'v21.0';
const BASE = `https://graph.facebook.com/${VERSION}`;

if (!TOKEN) {
  console.error('META_ACCESS_TOKEN no encontrado en .env');
  process.exit(1);
}

// Rate limiting
const DELAY_MS = 300;
let lastRequest = 0;

async function throttle() {
  const now = Date.now();
  const wait = DELAY_MS - (now - lastRequest);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastRequest = Date.now();
}

// Retry on rate limit (code 17) with exponential backoff
async function fetchWithRetry(url, options, retries = 3) {
  for (let i = 0; i <= retries; i++) {
    await throttle();
    const res = await fetch(url, options);
    const data = await res.json();

    if (data.error?.code === 17 && i < retries) {
      const backoff = (i + 1) * 5000;
      console.error(`Rate limit hit, waiting ${backoff / 1000}s...`);
      await new Promise(r => setTimeout(r, backoff));
      continue;
    }

    if (data.error) {
      throw new Error(`Meta API: ${data.error.message} (code ${data.error.code})`);
    }
    return data;
  }
}

export async function get(endpoint, params = {}) {
  const url = new URL(`${BASE}/${endpoint}`);
  url.searchParams.set('access_token', TOKEN);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : v);
  }
  return fetchWithRetry(url);
}

export async function post(endpoint, body = {}) {
  const url = new URL(`${BASE}/${endpoint}`);
  url.searchParams.set('access_token', TOKEN);
  return fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function getAll(endpoint, params = {}) {
  let results = [];
  const searchParams = new URLSearchParams({ access_token: TOKEN });
  for (const [k, v] of Object.entries(params)) {
    searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : v);
  }

  let fullUrl = `${BASE}/${endpoint}?${searchParams}`;

  while (fullUrl) {
    const data = await fetchWithRetry(fullUrl);
    if (data.data) results = results.concat(data.data);
    fullUrl = data.paging?.next || null;
  }

  return results;
}
