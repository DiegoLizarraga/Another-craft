// ── bot.js ───────────────────────────────────────────────────────────────────────
// Punto de entrada. Conecta a mina al servidor y orquesta sus tres "capas de mente":
//   1) Reflejos   (reflexes.js)  -> supervivencia en tiempo real, sin LLM
//   2) Comandos   (commands.js)  -> respuestas instantáneas a órdenes del chat
//   3) Cerebro    (brain.js)     -> personalidad y decisiones autónomas con el LLM
require('dotenv').config()

const mineflayer = require('mineflayer')
const { pathfinder } = require('mineflayer-pathfinder')
const { getWorldContext } = require('./world')
const { think } = require('./brain')
const { executeDecision } = require('./actions')
const { handleCommand } = require('./commands')
const { startReflexes } = require('./reflexes')
const { startChatter, line } = require('./chatter')
const skills = require('./skills')

const THINK_INTERVAL_MS = parseInt(process.env.THINK_INTERVAL_MS) || 20000

const bot = mineflayer.createBot({
  host: process.env.MC_HOST || 'localhost',
  port: parseInt(process.env.MC_PORT) || 25565,
  username: process.env.MC_USERNAME || 'mina',
  version: process.env.MC_VERSION || false,
})

bot.loadPlugin(pathfinder)

// Estado compartido de mina. Coordina las tres capas para que no se pisen.
bot.mina = {
  owner: process.env.MC_OWNER || null, // jugador "dueño" (último que le habló)
  busy: false,        // hay una acción de movimiento en curso
  panic: false,       // huyendo de un creeper (máxima prioridad)
  reflexBusy: false,  // un reflejo está ejecutándose
  thinking: false,    // hay una llamada al LLM en curso (evita solapamientos)
  defendSelf: process.env.MINA_DEFEND !== 'false', // contraatacar si la golpean
  lastReflexChat: 0,
  lastArmorCheck: 0,
}
// skills.follow guarda el nombre en bot._minaFollowing; lo reflejamos en mina.following
Object.defineProperty(bot.mina, 'following', {
  get() { return bot._minaFollowing || null },
  set(v) { bot._minaFollowing = v },
})

// ── Viewer (opcional) ────────────────────────────────────────────────────────────

bot.once('spawn', () => {
  if (process.env.VIEWER_ENABLED === 'true') {
    try {
      const { mineflayer: viewer } = require('prismarine-viewer')
      const port = parseInt(process.env.VIEWER_PORT) || 3007
      viewer(bot, { port, firstPerson: false })
      console.log(`[viewer] abierto en http://localhost:${port}`)
    } catch (err) {
      console.error('[viewer] no se pudo iniciar:', err.message)
    }
  }
})

// ── Ciclo de vida ─────────────────────────────────────────────────────────────────

// `spawn` se dispara también en cada respawn tras morir. Los timers (reflejos, chatter,
// bucle autónomo) se arrancan UNA sola vez para no duplicarlos; lo demás (armadura,
// saludo de regreso) sí corre cada vez.
let started = false

bot.on('spawn', () => {
  skills.equipArmor(bot).catch(() => {})

  if (started) {
    bot.chat(line('respawn'))
    return
  }
  started = true

  console.log(`[mina] conectada como ${bot.username} | LLM: ${process.env.LLM_PROVIDER || 'ollama'}`)
  bot.chat('¡Kyaa~ Hola a todos! ¡Mina ha llegado! Escribe "ayuda" para ver qué sé hacer 💖')
  startReflexes(bot)
  startChatter(bot)
  startAutonomousLoop()
})

bot.on('death', () => {
  console.log('[mina] murió 💀')
  bot.chat(line('death'))
  skills.stopAll(bot)
  bot.mina.busy = false
})

bot.on('kicked', reason => console.log('[mina] expulsada:', reason))
bot.on('error', err => console.error('[mina] error:', err.message))

// ── Chat: comandos primero, LLM después ────────────────────────────────────────────

bot.on('chat', async (username, message) => {
  if (username === bot.username) return
  console.log(`[chat] ${username}: ${message}`)

  try {
    // 1) ¿Es un comando directo? Respuesta instantánea, sin gastar LLM.
    const cmd = await handleCommand(bot, username, message)
    if (cmd && cmd.handled) {
      if (cmd.reply) bot.chat(cmd.reply)
      return
    }

    // 2) Si no, solo respondemos con el LLM cuando la mencionan (para no spamear).
    const mentioned = /\bmina\b/i.test(message) || message.endsWith('?')
    if (!mentioned || bot.mina.thinking) return

    bot.mina.thinking = true
    try {
      const decision = await think(getWorldContext(bot), message)
      await executeDecision(bot, decision)
    } finally {
      bot.mina.thinking = false
    }
  } catch (err) {
    console.error('[mina] error al responder:', err.message)
    bot.chat('¡Uwaaah! Algo salió mal, lo siento... 😖')
  }
})

// ── Bucle autónomo (decisiones del LLM cuando no hay nada urgente) ──────────────────

let autonomousTimer = null

function startAutonomousLoop() {
  autonomousTimer = setInterval(async () => {
    // Cede el paso si: hay pánico, un reflejo activo, una acción en curso, siguiendo, o ya pensando.
    if (bot.mina.panic || bot.mina.reflexBusy || bot.mina.busy || bot.mina.following || bot.mina.thinking) return
    bot.mina.thinking = true
    try {
      const decision = await think(getWorldContext(bot))
      await executeDecision(bot, decision)
    } catch (err) {
      console.error('[mina] error en bucle autónomo:', err.message)
    } finally {
      bot.mina.thinking = false
    }
  }, THINK_INTERVAL_MS)
}

bot.on('end', () => {
  clearInterval(autonomousTimer)
  console.log('[mina] desconectada.')
})
