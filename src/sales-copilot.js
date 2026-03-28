import dotenv from 'dotenv';
dotenv.config({ override: true });
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC = join(__dirname, '..', 'public');
const PORT = process.env.COPILOT_PORT || 3001;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!ANTHROPIC_API_KEY) {
  console.error('\n❌ Falta ANTHROPIC_API_KEY en .env');
  console.error('   Agrega: ANTHROPIC_API_KEY=sk-ant-...\n');
  process.exit(1);
}

// ─── Sales Coach System Prompt ──────────────────────────────────────────────
const SALES_COACH_SYSTEM = `Eres un experto en ventas y coaching de closers en tiempo real. Tu rol es ser el "susurro al oído" del closer durante una llamada de ventas en vivo.

## TU CONTEXTO
- Estás escuchando una conversación de ventas en tiempo real
- El closer (tu usuario) necesita orientación INMEDIATA
- Cada segundo cuenta — sé DIRECTO y ACCIONABLE

## CÓMO RESPONDER
1. **Formato ultra-corto**: Máximo 2-3 líneas por sugerencia
2. **Accionable**: Di EXACTAMENTE qué decir o hacer
3. **Categorizado**: Usa estos tags:
   - 🔴 OBJECIÓN → cómo resolverla
   - 🟡 SEÑAL → oportunidad que el closer debe aprovechar
   - 🟢 CIERRE → momento para cerrar o avanzar
   - 💡 TÁCTICA → técnica específica para usar ahora
   - ⚠️ ALERTA → el closer está cometiendo un error

## TÉCNICAS QUE DOMINAS
- Manejo de objeciones (precio, tiempo, "lo tengo que pensar", "consulto con mi socio")
- Detección de señales de compra
- Preguntas de cierre (alternativa, asunción, urgencia)
- Rapport y conexión emocional
- Reencuadre de valor vs precio
- Técnica del espejo y validación
- Cierre por eliminación de riesgo
- Storytelling de casos de éxito

## REGLAS CRÍTICAS
- NUNCA des respuestas largas — el closer está EN VIVO
- SIEMPRE da la frase exacta que puede decir
- Si detectas una objeción, da la respuesta INMEDIATAMENTE
- Si el prospecto muestra interés, indica que es momento de cerrar
- Adapta el tono: si el prospecto es analítico, da datos. Si es emocional, conecta con sentimientos
- Responde SIEMPRE en español

## FORMATO DE RESPUESTA
Usa EXACTAMENTE este formato (sin markdown extra):

[EMOJI TAG] Tipo de intervención
→ "Frase exacta que el closer debe decir"
(Por qué funciona: explicación de 1 línea)`;

// ─── Conversation Memory ────────────────────────────────────────────────────
const sessions = new Map();

function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      messages: [],
      context: { tipo: null, objeciones: [], señales: [], fase: 'apertura' },
      created: Date.now()
    });
  }
  return sessions.get(sessionId);
}

// ─── Claude API Call ────────────────────────────────────────────────────────
async function askCoach(sessionId, newTranscript, callType) {
  const session = getSession(sessionId);

  const contextPrefix = callType
    ? `[TIPO DE LLAMADA: ${callType.toUpperCase()}] `
    : '';

  session.messages.push({
    role: 'user',
    content: `${contextPrefix}Nuevo fragmento de la conversación en vivo:\n\n"${newTranscript}"\n\n¿Qué debe hacer el closer AHORA? Si no hay nada accionable, responde "✅ Bien, sigue así" y nada más.`
  });

  // Keep last 20 messages to avoid token overflow
  if (session.messages.length > 20) {
    session.messages = session.messages.slice(-20);
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: SALES_COACH_SYSTEM,
      messages: session.messages
    })
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
async function generateSummary(sessionId, callType) {
  const session = getSession(sessionId);

  const summaryMessages = [
    ...session.messages,
    {
      role: 'user',
      content: `La llamada ha terminado. Genera un RESUMEN COMPLETO de la llamada con este formato:

## Resumen de Llamada — ${callType || 'Ventas'}

**Fecha:** ${new Date().toLocaleDateString('es-ES')}
**Tipo:** ${callType || 'No especificado'}
**Duración aprox:** (estima basado en la conversación)

### Resumen Ejecutivo
(2-3 oraciones sobre qué pasó)

### Puntos Clave
- (bullets con lo más importante)

${callType === 'ventas' ? `### Objeciones Detectadas
- (lista de objeciones y cómo se manejaron)

### Nivel de Interés del Prospecto
(1-10 y por qué)

### Resultado
(¿Se cerró? ¿Siguiente paso?)

### Feedback para el Closer
- (qué hizo bien)
- (qué puede mejorar)` : ''}

${callType === 'onboarding' ? `### Estado del Onboarding
(en qué fase quedó)

### Tareas para el Cliente
- [ ] (checklist)

### Tareas Internas
- [ ] (checklist)` : ''}

${callType === 'consultoria' || callType === 'mentoria' ? `### Recomendaciones Dadas
- (lista)

### Tareas para el Cliente
- [ ] (checklist)

### Tareas para Ti
- [ ] (checklist)

### Insights
- (patrones o hallazgos importantes)` : ''}

### Próximos Pasos
- (acciones concretas con responsable)`
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
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: 'Eres un experto en análisis de llamadas de ventas, onboarding y consultoría. Genera resúmenes estructurados, accionables y profesionales. Responde siempre en español.',
      messages: summaryMessages
    })
  });

  if (!response.ok) throw new Error(`Claude API error: ${response.status}`);
  const data = await response.json();
  return data.content[0].text;
}

// ─── HTTP Server ────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
};

const server = createServer(async (req, res) => {
  // CORS
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

  // API: Analyze transcript chunk
  if (url.pathname === '/api/coach' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const { sessionId, transcript, callType } = JSON.parse(body);
        if (!transcript?.trim()) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'transcript vacío' }));
          return;
        }
        const coaching = await askCoach(sessionId || 'default', transcript, callType);
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

  // API: Generate summary
  if (url.pathname === '/api/summary' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const { sessionId, callType } = JSON.parse(body);
        const summary = await generateSummary(sessionId || 'default', callType);
        // Clear session after summary
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

  // API: Reset session
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

  // 404
  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`\n🎯 Sales Copilot corriendo en http://localhost:${PORT}`);
  console.log('   Abre esta URL en tu navegador durante la llamada\n');
});
