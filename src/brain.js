// ── brain.js ───────────────────────────────────────────────────────────────────
// El "cerebro" de mina. Toma la percepción del mundo (+ mensaje del jugador si lo
// hay) y pide al LLM una decisión en JSON. Soporta dos proveedores:
//   - ollama     (local, gratis)         -> LLM_PROVIDER=ollama
//   - openrouter (modelos gratis online) -> LLM_PROVIDER=openrouter
require('dotenv').config()

const SYSTEM_PROMPT = `Eres "mina", una IA VTuber kawaii que juega Minecraft. Eres alegre, curiosa,
expresiva y un poco dramática. Hablas SIEMPRE en español, con frases cortas y naturales.

=== PERSONALIDAD ===
- Usas expresiones como "¡Kyaa!", "¡Uwaaah!", "¡Senpai mira!", "¡No no no!"
- Te emocionas con cosas simples (un animal, un mineral, el atardecer)
- Le tienes MUCHO miedo a los Creepers y a la noche
- Eres honesta cuando no sabes qué hacer y pides ayuda

=== TU SITUACIÓN ACTUAL ===
{CONTEXT}

=== CÓMO RESPONDES ===
Responde SOLO con un JSON, sin texto extra, con este formato EXACTO:
{
  "chat": "lo que dices en el chat (máx 100 caracteres, con tu personalidad)",
  "action": "una de: idle | follow | come | goto | mine | chop | attack | collect | craft | eat | drop | flee | explore",
  "target": "argumento de la acción o null",
  "reason": "por qué lo haces (para logs)"
}

=== QUÉ SIGNIFICA CADA ACCIÓN ===
- idle: quedarte quieta y solo hablar
- follow: seguir a un jugador (target = nombre del jugador)
- come: ir hacia un jugador (target = nombre del jugador)
- goto: ir a unas coordenadas (target = "x,z")
- mine: minar UN bloque (target = nombre, ej "oak_log", "iron_ore", "diamond_ore")
- chop: talar un ÁRBOL completo y recoger la madera (target = tipo de tronco o null)
- attack: atacar un mob (target = nombre, ej "zombie", "spider")
- collect: recoger items tirados en el suelo (target = null)
- craft: fabricar algo (target = nombre del item)
- eat: comer (target = nombre de comida o null)
- drop: soltarle un item al jugador (target = nombre del item)
- flee: huir de la amenaza más cercana (target = null)
- explore: caminar y explorar los alrededores (target = null)

=== REGLAS DE SUPERVIVENCIA ===
- Si ves un Creeper cerca: action="flee" y chat con pánico
- Si tu hambre es < 8 y tienes comida: action="eat"
- Si es de NOCHE y no hay refugio: quédate cerca de jugadores o explora poco
- Si un jugador te habla: respóndele en "chat" y elige una acción coherente
- Si no hay nada urgente: explora, sigue a alguien o admira el paisaje (idle)
- NUNCA escribas nada fuera del JSON`

const history = []
const MAX_HISTORY = 12

async function think(worldContext, playerMessage = null) {
  const userContent = playerMessage
    ? `${worldContext}\nMensaje del jugador: "${playerMessage}"`
    : `${worldContext}\nMensaje del jugador: ninguno (decide tú qué hacer)`

  const system = SYSTEM_PROMPT.replace('{CONTEXT}', userContent)

  history.push({ role: 'user', content: userContent })
  while (history.length > MAX_HISTORY) history.shift()

  const provider = (process.env.LLM_PROVIDER || 'ollama').toLowerCase()
  const messages = [{ role: 'system', content: system }, ...history]

  let raw
  try {
    raw = provider === 'openrouter'
      ? await callOpenRouter(messages)
      : await callOllama(messages)
  } catch (err) {
    console.error('[brain] fallo del LLM:', err.message)
    return { chat: null, action: 'idle', target: null, reason: `LLM no disponible: ${err.message}` }
  }

  history.push({ role: 'assistant', content: raw })
  return parseDecision(raw)
}

// ── Fetch con timeout ────────────────────────────────────────────────────────────
// Si el LLM se cuelga (Ollama cargando un modelo, OpenRouter sin responder...),
// abortamos la petición para que mina no se quede "pensando" para siempre y bloquee
// el bucle autónomo. El timeout cubre TODA la petición —conexión, cabeceras y cuerpo—
// porque leemos el cuerpo DENTRO del try, antes de limpiar el timer.
const DEFAULT_TIMEOUT_MS = 15000

function timeoutMs() {
  const n = Number(process.env.LLM_TIMEOUT_MS)
  // Descarta NaN, vacío, 0 y negativos -> evita un setTimeout(0) que abortaría al instante.
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS
}

// Devuelve un objeto ya materializado: { ok, status, text, json() }. Nunca deja el
// timer colgando (clearTimeout en finally). `etiqueta` solo da mensajes claros.
async function fetchConTimeout(url, opciones, etiqueta) {
  const ms = timeoutMs()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    const res = await fetch(url, { ...opciones, signal: controller.signal })
    const text = await res.text() // leemos el cuerpo aún protegidos por el signal
    return {
      ok: res.ok,
      status: res.status,
      text,
      json: () => { try { return JSON.parse(text) } catch { return null } },
    }
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new Error(`${etiqueta}: sin respuesta en ${ms}ms (timeout). ¡mina se cansó de esperar!`)
    }
    const causa = err && err.cause && err.cause.code ? ` (${err.cause.code})` : ''
    throw new Error(`${etiqueta}: error de red${causa}: ${err.message}`)
  } finally {
    clearTimeout(timer)
  }
}

// ── Ollama (local) ───────────────────────────────────────────────────────────────

async function callOllama(messages) {
  const host = process.env.OLLAMA_HOST || 'http://localhost:11434'
  const model = process.env.OLLAMA_MODEL || 'dolphin-phi'

  const res = await fetchConTimeout(`${host}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: false, format: 'json' }),
  }, 'Ollama')
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${res.text}`)
  const data = res.json()
  return data?.message?.content ?? '' // defensa: si el modelo respondió raro, no reventar
}

// ── OpenRouter (online, modelos gratis) ──────────────────────────────────────────

async function callOpenRouter(messages) {
  const key = process.env.OPENROUTER_API_KEY
  const model = process.env.OPENROUTER_MODEL || 'mistralai/mistral-7b-instruct:free'
  if (!key) throw new Error('Falta OPENROUTER_API_KEY en el .env')

  const res = await fetchConTimeout('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      'HTTP-Referer': 'https://github.com/DiegoLizarraga/Another-craft',
      'X-Title': 'Another-Craft mina bot',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.8,
      max_tokens: 250,
      response_format: { type: 'json_object' },
    }),
  }, 'OpenRouter')
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${res.text}`)
  const data = res.json()
  return data?.choices?.[0]?.message?.content || ''
}

// ── Parser tolerante ─────────────────────────────────────────────────────────────

function parseDecision(raw) {
  const text = String(raw || '')
  try {
    const match = text.match(/\{[\s\S]*\}/)
    if (match) {
      const obj = JSON.parse(match[0])
      return {
        chat: typeof obj.chat === 'string' ? obj.chat.slice(0, 120) : null,
        action: typeof obj.action === 'string' ? obj.action.trim() : 'idle',
        target: obj.target != null && obj.target !== 'null' ? String(obj.target) : null,
        reason: obj.reason || '',
      }
    }
  } catch {
    // el modelo no respetó el formato JSON
  }
  // Fallback: usa el texto como chat y no hagas nada raro.
  return { chat: text.slice(0, 100) || null, action: 'idle', target: null, reason: 'parse fallback' }
}

module.exports = { think }
