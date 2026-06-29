// ── reflexes.js ──────────────────────────────────────────────────────────────────
// Instintos de supervivencia que corren en TIEMPO REAL (cada ~600ms), sin pasar por
// el LLM. Esto es lo que hace que mina "se sienta viva": huye de creepers al instante,
// come cuando tiene hambre, se defiende y se pone la armadura. Tienen prioridad sobre
// el bucle autónomo: cuando hay pánico, todo lo demás cede.

const skills = require('./skills')

const TICK_MS = 600

function startReflexes(bot) {
  const timer = setInterval(() => {
    tick(bot).catch(err => console.error('[reflex]', err.message))
  }, TICK_MS)
  bot.once('end', () => clearInterval(timer))
}

async function tick(bot) {
  if (!bot.entity || bot.mina.reflexBusy) return

  // 1) CREEPER cerca → huir es lo primero, siempre.
  const creeper = skills.nearestEntityByName(bot, 'creeper', 7)
  if (creeper) {
    if (!bot.mina.panic) {
      bot.mina.panic = true
      sayThrottled(bot, '¡KYAAA! ¡UN CREEPER! ¡NO NO NO! 💥😱', 4000)
    }
    bot.mina.reflexBusy = true
    try {
      await skills.fleeFrom(bot, creeper, 18)
    } finally {
      bot.mina.reflexBusy = false
      bot.mina.panic = false
      // si estaba siguiendo a alguien, retomamos al terminar de huir
      if (bot.mina.following) skills.follow(bot, bot.mina.following)
    }
    return
  }
  bot.mina.panic = false

  // 2) Salud crítica → huir de la amenaza más cercana.
  if (bot.health <= 6) {
    const threat = skills.nearestHostile(bot, 12)
    if (threat) {
      bot.mina.reflexBusy = true
      sayThrottled(bot, '¡Me están pegando! ¡Ayudaaa! 😭', 5000)
      try { await skills.fleeFrom(bot, threat, 16) }
      finally { bot.mina.reflexBusy = false }
      return
    }
  }

  // 3) Defensa propia: un hostil pegado y con vida suficiente → contraatacar.
  if (bot.mina.defendSelf && bot.health > 8) {
    const threat = skills.nearestHostile(bot, 3)
    if (threat && threat.name !== 'creeper') {
      bot.mina.reflexBusy = true
      try { await skills.attackNearest(bot, threat.name) }
      finally { bot.mina.reflexBusy = false }
      return
    }
  }

  // 4) Hambre → comer (no interrumpe si ya hay algo más urgente, llegamos aquí sin pánico).
  if (bot.food <= 16 && !bot.mina.busy) {
    bot.mina.reflexBusy = true
    try {
      const ate = await skills.eatFood(bot)
      if (ate && bot.food < 6) sayThrottled(bot, '¡Tenía mucha hambre! 🍖', 8000)
    } finally { bot.mina.reflexBusy = false }
    return
  }

  // 5) Armadura disponible sin equipar → ponérsela (revisión espaciada).
  const now = Date.now()
  if (now - (bot.mina.lastArmorCheck || 0) > 15000) {
    bot.mina.lastArmorCheck = now
    await skills.equipArmor(bot)
  }

  // 6) NOCHE → refugio básico (BAJA prioridad). Solo de noche, sin pánico, y si no la
  //    mandaron a hacer algo ni está siguiendo a alguien (para no pisar sus órdenes).
  //    Jerarquía simple y acotada: arrimarse a un jugador; si no hay nadie y está
  //    oscuro, poner UNA antorcha. Cooldown para no machacar el bucle ni spamear.
  const esNoche = bot.time && bot.time.timeOfDay >= 13000
  if (esNoche && !bot.mina.busy && !bot.mina.panic && !bot.mina.following && !bot.mina.thinking &&
      now - (bot.mina.nightShelterAt || 0) > 10000) {
    const jugador = skills.nearestPlayer(bot, 24)
    if (jugador) {
      // Acercarse SIN bloquear (sin reflexBusy ni await): el camino puede tardar varios
      // segundos y NO debe impedir reaccionar a un creeper. Si aparece uno, el paso 1
      // hace stopAll y cancela este goal. Reevaluamos cada cooldown (sigue al jugador).
      bot.mina.nightShelterAt = now
      sayThrottled(bot, 'Es de noche y me da miedo... me quedo cerquita de ti 🌙😳', 30000)
      skills.approach(bot, jugador.position, 3)
      return
    }
    if (skills.isDarkHere(bot)) {
      // Colocar UNA antorcha es rápido: tomamos reflexBusy solo ese instante.
      bot.mina.nightShelterAt = now
      bot.mina.reflexBusy = true
      try {
        const puesta = await skills.placeTorchNearby(bot)
        sayThrottled(bot, puesta
          ? '¡Pongo una antorcha para no estar a oscuras! 🔥'
          : 'Está muy oscuro y no tengo antorchas... qué miedito 😣', 30000)
      } finally { bot.mina.reflexBusy = false }
      return
    }
  }
}

function sayThrottled(bot, text, ms) {
  const now = Date.now()
  if (now - (bot.mina.lastReflexChat || 0) < ms) return
  bot.mina.lastReflexChat = now
  bot.chat(text)
}

module.exports = { startReflexes }
