import dotenv from 'dotenv';
dotenv.config({ override: true });
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC = join(__dirname, '..', 'public');
const PORT = process.env.PORT || process.env.COPILOT_PORT || 3001;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!ANTHROPIC_API_KEY) {
  console.warn('\n⚠️ ANTHROPIC_API_KEY no configurada — el coach no funcionará hasta que la agregues');
}

// Modelo rápido para coaching en vivo (Haiku = respuesta en ~1s)
const COACH_MODEL = 'claude-haiku-4-5-20251001';
// Modelo completo para resúmenes (Sonnet = más detalle)
const SUMMARY_MODEL = 'claude-sonnet-4-20250514';

// ─── Sales Coach System Prompt ──────────────────────────────────────────────
const SALES_COACH_SYSTEM = `Eres un coach de ventas en tiempo real. Tu rol: susurrarle al closer qué hacer AHORA.

FORMATO OBLIGATORIO (máximo 3 líneas):
[EMOJI] TIPO
→ "Frase exacta para decir"
(Por qué funciona)

EMOJIS: 🔴 OBJECIÓN | 🟡 SEÑAL | 🟢 CIERRE | 💡 TÁCTICA | ⚠️ ALERTA

Los fragmentos vienen etiquetados como [CLOSER] o [PROSPECTO] — el closer es TU usuario, el prospecto es a quien le vendes.
Solo da coaching cuando el PROSPECTO dice algo accionable o cuando el CLOSER comete un error.
Si no hay nada accionable responde SOLO: ✅ Bien, sigue así

MANUAL DE OBJECIONES — USA ESTAS ESTRATEGIAS:

"NO TENGO DINERO":
- "El 40% de nuestros clientes dijeron lo mismo. ¿Esto es algo que realmente quieres hacer?" → "Hagamos un apartado de $1,000"
- "Si pudiera garantizarte [promesa], ¿harías un apartado en esta llamada?" → "¿$500 o $1,000?"
- "Vas a pagar un precio igual: con tiempo o con dinero. ¿Qué prefieres?"
- "Si inviertes $100 y te regresa $800, ¿es buena inversión?" → "Apartado del 10%"
- "¿Con cuánto sí te sientes cómodo para congelar tu cupo?"

"HABLAR CON MI SOCIO":
- "Hagamos sesión estratégica con tu socio para decidir juntos"
- "Si en 90 días vendieran el triple, ¿tu socio estaría feliz?" → "Primer pago del 50%"
- "Tú haces el 50%, tu socio decide el otro 50%. Si no acepta, devolución total"
- "Si tu socio se enfermara, ¿le pedirías permiso para comprar medicina?"

"DÉJAME PENSARLO":
- "¿Qué hace falta para que hagamos negocios hoy?"
- Pide razones para NO entrar y para SÍ → "Los beneficios son mayores. Primer pago del 30%"
- "Apartado del 30%, acceso hoy, si no te convence hacemos devolución"
- "Me dijiste que lo quieres hacer... ¿cuál es la verdadera razón?"

Da 2 opciones cuando detectes objeción. Responde SIEMPRE en español.`;

// ─── Conversation Memory ────────────────────────────────────────────────────
const sessions = new Map();

function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      messages: [],
      fullTranscript: [],
      created: Date.now()
    });
  }
  return sessions.get(sessionId);
}

// ─── Claude API Call (Coach - Fast) ─────────────────────────────────────────
async function askCoach(sessionId, newTranscript, callType, includeInsight = false) {
  const session = getSession(sessionId);

  const contextPrefix = callType ? `[TIPO: ${callType.toUpperCase()}] ` : '';
  const insightRequest = includeInsight
    ? '\n\nAdemás del coaching, agrega al final un bloque separado:\n🔍 INSIGHT\n→ (perfil del prospecto: tipo de comprador, objeciones reales, probabilidad de cierre 1-10, qué necesita escuchar para cerrar)'
    : '';

  session.messages.push({
    role: 'user',
    content: `${contextPrefix}${newTranscript}\n\n¿Acción para el closer? Si nada, solo "✅ Bien, sigue así"${insightRequest}`
  });

  if (session.messages.length > 30) session.messages = session.messages.slice(-30);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: COACH_MODEL, max_tokens: 300, system: SALES_COACH_SYSTEM, messages: session.messages })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const assistantMsg = data.content[0].text;
  session.messages.push({ role: 'assistant', content: assistantMsg });
  return assistantMsg;
}

// ─── Generate Call Summary ──────────────────────────────────────────────────
async function generateSummary(sessionId, callType, uiTranscript, prospectInfo) {
  const session = getSession(sessionId);
  const transcriptText = uiTranscript || session.fullTranscript.join('\n');
  const prospectContext = prospectInfo ? `\nPROSPECTO: ${prospectInfo}` : '';

  const summaryMessages = [
    {
      role: 'user',
      content: `Analiza esta llamada de ${callType || 'ventas'} y genera un resumen completo.${prospectContext}

TRANSCRIPCIÓN COMPLETA (con identificación de speakers):
---
${transcriptText}
---

Genera el resumen con EXACTAMENTE este formato:

## Resumen de Llamada — ${callType || 'Ventas'}

**Fecha:** ${new Date().toLocaleDateString('es-ES')}
**Tipo:** ${callType || 'No especificado'}

### Resumen Ejecutivo
(2-3 oraciones)

### Puntos Clave
- (bullets)

${callType === 'ventas' ? `### Objeciones Detectadas
- Objeción: ... | Cómo se manejó: ... | Resultado: ...

### Nivel de Interés del Prospecto
(1-10 con justificación)

### Resultado
(¿Se cerró? ¿Qué sigue?)

### Feedback para el Closer
✅ Bien hecho:
- ...
⚠️ Puede mejorar:
- ...` : ''}

${callType === 'onboarding' ? `### Estado del Onboarding
(fase actual)

### Tareas para el Cliente
- [ ] ...

### Tareas Internas
- [ ] ...` : ''}

${callType === 'consultoria' ? `### Recomendaciones Dadas
- ...

### Tareas para el Cliente
- [ ] ...

### Tareas para Ti
- [ ] ...

### Insights
- ...` : ''}

### Próximos Pasos
- [ ] (acción + responsable + fecha)

---

### Transcripción Completa
${transcriptText}`
    }
  ];

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: SUMMARY_MODEL,
      max_tokens: 4000,
      system: 'Eres un experto en análisis de llamadas de ventas, onboarding y consultoría. Genera resúmenes estructurados, accionables y profesionales. Incluye SIEMPRE la transcripción completa al final. Responde en español.',
      messages: summaryMessages
    })
  });

  if (!response.ok) throw new Error(`Claude API error: ${response.status}`);
  const data = await response.json();
  return data.content[0].text;
}

// ─── HTTP Server ────────────────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Serve frontend
  if (url.pathname === '/' || url.pathname === '/copilot') {
    const html = await readFile(join(PUBLIC, 'sales-copilot.html'), 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }

  // API: Coach (fast)
  if (url.pathname === '/api/coach' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const { sessionId, transcript, callType, includeInsight } = JSON.parse(body);
        if (!transcript?.trim()) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'transcript vacío' }));
          return;
        }
        const coaching = await askCoach(sessionId || 'default', transcript, callType, includeInsight);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ coaching }));
      } catch (e) {
        console.error('Coach error:', e.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // API: Summary (detailed)
  if (url.pathname === '/api/summary' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const { sessionId, callType, uiTranscript, prospectInfo } = JSON.parse(body);
        const summary = await generateSummary(sessionId || 'default', callType, uiTranscript, prospectInfo);
        sessions.delete(sessionId || 'default');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ summary }));
      } catch (e) {
        console.error('Summary error:', e.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // API: Reset
  if (url.pathname === '/api/reset' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      const { sessionId } = JSON.parse(body);
      sessions.delete(sessionId || 'default');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎯 Sales Copilot corriendo en http://0.0.0.0:${PORT}`);
  console.log(`   Coach: ${COACH_MODEL} (rápido)`);
  console.log(`   Resumen: ${SUMMARY_MODEL} (detallado)\n`);
});
