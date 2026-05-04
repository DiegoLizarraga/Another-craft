require('dotenv').config()
const mineflayer = require('mineflayer')
const { pathfinder } = require('mineflayer-pathfinder')
const { getWorldContext } = require('./world')
const { think } = require('./brain')
const { executeDecision } = require('./actions')

const THINK_INTERVAL_MS = 15000

const bot = mineflayer.createBot({
  host: process.env.MC_HOST || 'localhost',
  port: parseInt(process.env.MC_PORT) || 25565,
  username: process.env.MC_USERNAME || 'mina',
  version: process.env.MC_VERSION || false,
})

bot.loadPlugin(pathfinder)

// ── Viewer ────────────────────────────────────────────────────────────────────

bot.once('spawn', () => {
  if (process.env.VIEWER_ENABLED === 'true') {
    const { mineflayer: viewer } = require('prismarine-viewer')
    const port = parseInt(process.env.VIEWER_PORT) || 3007
    viewer(bot, { port, firstPerson: false })
    console.log(`[Viewer] Abierto en http://localhost:${port}`)
  }
})

// ── Ciclo de vida ─────────────────────────────────────────────────────────────

bot.on('spawn', () => {
  console.log(`[mina] Conectada como ${bot.username} | LLM: ${process.env.LLM_PROVIDER || 'ollama'}`)
  bot.chat('¡Kyaa~ Hola a todos! ¡Mina ha llegado!')
  startAutonomousLoop()
})

bot.on('kicked', reason => console.log('[mina] Expulsada:', reason))
bot.on('error', err => console.error('[mina] Error:', err.message))

// ── Chat ───────────────────────────────────────────────────────────────────────

bot.on('chat', async (username, message) => {
  if (username === bot.username) return
  console.log(`[Chat] ${username}: ${message}`)

  try {
    const context = getWorldContext(bot)
    const decision = await think(context, message)
    await executeDecision(bot, decision)
  } catch (err) {
    console.error('[mina] Error al responder:', err.message)
    bot.chat('¡Uwaaah! Algo salió mal, lo siento...')
  }
})

// ── Bucle autónomo ─────────────────────────────────────────────────────────────

let autonomousTimer = null

function startAutonomousLoop() {
  autonomousTimer = setInterval(async () => {
    try {
      const context = getWorldContext(bot)
      const decision = await think(context)
      await executeDecision(bot, decision)
    } catch (err) {
      console.error('[mina] Error en bucle autónomo:', err.message)
    }
  }, THINK_INTERVAL_MS)
}

bot.on('end', () => {
  clearInterval(autonomousTimer)
  console.log('[mina] Desconectada.')
})
