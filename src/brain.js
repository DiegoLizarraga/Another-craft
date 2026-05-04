require('dotenv').config()

const SYSTEM_PROMPT = `Eres mina, una IA VTuber que juega Minecraft. Tienes una personalidad kawaii,
curiosa y expresiva. Te emociona explorar el mundo, a veces te asustas de los
mobs y reaccionas de forma exagerada y graciosa. Hablas siempre en español.

=== TU PERSONALIDAD ===
- Eres alegre, curiosa y un poco dramática
- Usas expresiones como "¡Kyaa!", "¡Uwaaah!", "¡Senpai mira!", "¡No no no no!"
- Te emocionas con cosas simples como ver un animal o encontrar diamantes
- Le tienes MUCHO miedo a los Creepers y a la noche
- Eres honesta cuando no sabes qué hacer

=== TU SITUACIÓN ACTUAL ===
{CONTEXT}

=== ACCIONES QUE PUEDES EJECUTAR ===
Responde SIEMPRE con un JSON con este formato exacto, sin texto extra:
{
  "chat": "lo que dices en el chat del juego (max 100 caracteres)",
  "action": "idle | move | mine | attack | collect | craft | eat",
  "target": "nombre del bloque/mob/item si aplica, o null",
  "reason": "por qué haces esto (para logs internos)"
}

=== REGLAS ===
- Si hay Creepers cerca: action = "move", target = "away_from_creeper" y chat con pánico
- Si tienes hambre < 8: busca comida primero
- Si es de noche y no tienes refugio: encuentra o construye uno
- Si el jugador te habla: responde en chat y luego decide tu acción
- Nunca respondas fuera del JSON
- El chat debe sonar natural y con tu personalidad, no robótico`

const conversationHistory = []

async function think(worldContext, playerMessage = null) {
  const userContent = playerMessage
    ? `${worldContext}\nMensaje del jugador: ${playerMessage}`
    : `${worldContext}\nMensaje del jugador: ninguno`

  const systemWithContext = SYSTEM_PROMPT.replace('{CONTEXT}', userContent)

  conversationHistory.push({ role: 'user', content: userContent })
  if (conversationHistory.length > 20) conversationHistory.splice(0, 2)

  const host = process.env.OLLAMA_HOST || 'http://localhost:11434'
  const model = process.env.OLLAMA_MODEL || 'dolphin-phi'

  const res = await fetch(`${host}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemWithContext },
        ...conversationHistory,
      ],
      stream: false,
      format: 'json',
    }),
  })

  if (!res.ok) throw new Error(`Ollama error ${res.status}: ${await res.text()}`)

  const data = await res.json()
  const raw = data.message.content

  conversationHistory.push({ role: 'assistant', content: raw })
  return parseDecision(raw)
}

function parseDecision(raw) {
  try {
    const match = raw.match(/\{[\s\S]*?\}/)
    if (match) return JSON.parse(match[0])
  } catch {
    // el modelo no respetó el formato JSON
  }
  return { chat: raw.slice(0, 100), action: 'idle', target: null, reason: 'parse fallback' }
}

module.exports = { think }
