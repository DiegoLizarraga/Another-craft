// ── commands.js ──────────────────────────────────────────────────────────────────
// Comandos directos por el chat del juego. Se resuelven al instante, SIN llamar al
// LLM: rápidos y fiables. Si el mensaje no es un comando, devolvemos { handled:false }
// para que el cerebro (LLM) decida si responde.

const skills = require('./skills')
const { toBlockName, toMobName } = require('./vocab')

// Resuelve una palabra a un bloque/mob REAL (valida contra minecraft-data). Devuelve
// null si no existe — así "mina hola" no intenta minar un bloque inexistente, dado que
// "mina" es a la vez el nombre del bot y el verbo "minar".
function realBlock(bot, word) {
  const name = toBlockName(word)
  return name && require('minecraft-data')(bot.version).blocksByName[name] ? name : null
}
function realMob(bot, word) {
  const name = toMobName(word)
  return name && require('minecraft-data')(bot.version).entitiesByName[name] ? name : null
}

// Quita acentos y signos para emparejar comandos sin pelearnos con la ortografía.
function clean(text) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[¿?¡!.,]/g, '')
    .trim()
}

// Atajos: arranca una tarea en segundo plano sin bloquear el chat.
function run(bot, label, promise) {
  bot.mina.busy = true
  Promise.resolve(promise)
    .catch(err => console.error(`[cmd:${label}]`, err.message))
    .finally(() => { bot.mina.busy = false })
}

// Devuelve { handled, reply, background } o null si no es comando.
async function handleCommand(bot, username, message) {
  const text = clean(message)
  const words = text.split(/\s+/)

  // mina recuerda quién le habló al último (su "dueña/o" temporal)
  bot.mina.owner = username

  // ── Seguir ──────────────────────────────────────────────────────────────────
  if (/\b(sigueme|sigue ?me|ven conmigo|acompaname|follow)\b/.test(text)) {
    skills.stopAll(bot)
    const ok = skills.follow(bot, username)
    return reply(ok ? `¡Voy contigo, ${username}! ✨` : 'No te veo... ¿dónde estás? 😖')
  }

  // ── Ven aquí / acércate ──────────────────────────────────────────────────────
  if (/\b(ven aqui|ven aca|ven aca|ven|come here)\b/.test(text) && !/\bven a (minar|por|el|la)\b/.test(text)) {
    skills.stopAll(bot)
    run(bot, 'come', skills.comeToPlayer(bot, username))
    return reply(`¡Ya voy, ${username}! 🏃‍♀️`)
  }

  // ── Parar / quedarse ──────────────────────────────────────────────────────────
  if (/\b(para|parate|detente|quieta|quedate|alto|stop|espera)\b/.test(text)) {
    skills.stopAll(bot)
    bot.mina.busy = false
    return reply('¡Me quedo aquí! 🧍‍♀️')
  }

  // ── Talar árbol completo ──────────────────────────────────────────────────────
  if (/\b(tala|talar|corta|cortar|tumba|tumbar)\b/.test(text)) {
    let wood = null
    for (const w of words) {
      if (/^(madera|tronco|arbol|el|un|de)$/.test(w)) continue
      const b = realBlock(bot, w)
      if (b && /_log$/.test(b)) { wood = b; break }
    }
    skills.stopAll(bot)
    run(bot, 'chop', skills.chopTree(bot, wood)
      .then(n => bot.chat(n ? `¡Taláé el árbol enterito! ${n} troncos 🌳🪓` : 'No veo ningún árbol cerca 🌲❓')))
    return reply('¡A talar el árbol! 🪓')
  }

  // ── Minar ──────────────────────────────────────────────────────────────────────
  let m = text.match(/\b(mina|minar|pica|picar|consigue|consigueme)\s+(\d+\s+)?(.+)/)
  if (m && !/\bme sigues?\b/.test(text)) {
    const count = m[2] ? parseInt(m[2]) : 1
    const block = realBlock(bot, m[3].split(/\s+/)[0])
    if (block) {
      skills.stopAll(bot)
      run(bot, 'mine', skills.mineNearest(bot, block, Math.min(count, 64))
        .then(n => bot.chat(n ? `¡Listo! Conseguí ${n} de ${block} ⛏️` : `No encontré ${block} cerca 😢`)))
      return reply(`¡A picar ${block}! ⛏️`)
    }
  }

  // ── Atacar / defender ────────────────────────────────────────────────────────
  m = text.match(/\b(ataca|atacar|mata|matar|pega|golpea)\s+(?:el |la |al |a )?(.+)/)
  if (m) {
    const mob = realMob(bot, m[2].split(/\s+/)[0])
    if (mob) {
      skills.stopAll(bot)
      run(bot, 'attack', skills.attackNearest(bot, mob)
        .then(ok => bot.chat(ok ? `¡Toma! 💥` : `No veo ningún ${mob} 👀`)))
      return reply(`¡A por el ${mob}! ⚔️`)
    }
  }
  if (/\b(defiendeme|protegeme|defiende)\b/.test(text)) {
    const threat = skills.nearestHostile(bot, 16)
    if (threat) {
      skills.stopAll(bot)
      run(bot, 'defend', skills.attackNearest(bot, threat.name))
      return reply(`¡Yo te protejo de ese ${threat.name}! 🛡️`)
    }
    return reply('¡No hay peligro cerca! Estás a salvo conmigo 😤')
  }

  // ── Recoger drops ──────────────────────────────────────────────────────────────
  if (/\b(recoge|recoger|junta los items|levanta)\b/.test(text)) {
    skills.stopAll(bot)
    run(bot, 'collect', skills.collectNearbyItems(bot, 16)
      .then(n => bot.chat(n ? `Recogí ${n} cosas 🧺` : 'No hay nada que recoger 🤔')))
    return reply('¡Recogiendo todo! 🧺')
  }

  // ── Soltar / dar item ──────────────────────────────────────────────────────────
  m = text.match(/\b(suelta|tira|dame|dropea)\s+(?:el |la |un |una )?(.+)/)
  if (m) {
    const item = toBlockName(m[2].split(/\s+/)[0]) || m[2].split(/\s+/)[0]
    run(bot, 'drop', skills.dropItem(bot, item, username)
      .then(ok => bot.chat(ok ? `¡Toma tu ${item}, ${username}! 🎁` : `No tengo ${item} 😅`)))
    return reply('Déjame ver qué tengo... 🎒')
  }

  // ── Comer ──────────────────────────────────────────────────────────────────────
  if (/\b(come|comer|come algo|alimentate)\b/.test(text)) {
    run(bot, 'eat', skills.eatFood(bot)
      .then(ok => bot.chat(ok ? '¡Ñam ñam! 🍖' : 'No tengo comida 😭')))
    return reply('¡Tengo hambre! 🍗')
  }

  // ── Explorar ──────────────────────────────────────────────────────────────────
  if (/\b(explora|explorar|camina|pasea)\b/.test(text)) {
    skills.stopAll(bot)
    run(bot, 'explore', skills.explore(bot))
    return reply('¡A explorar el mundo! 🗺️')
  }

  // ── Estado: inventario ──────────────────────────────────────────────────────────
  if (/\b(inventario|que tienes|que llevas|mochila)\b/.test(text)) {
    const items = bot.inventory.items()
    return reply(items.length
      ? `Tengo: ${items.map(i => `${i.count} ${i.name}`).slice(0, 8).join(', ')} 🎒`
      : 'Mi mochila está vacía 😢')
  }

  // ── Estado: posición ────────────────────────────────────────────────────────────
  if (/\b(donde estas|coordenadas|posicion|ubicacion)\b/.test(text)) {
    const p = bot.entity.position
    return reply(`Estoy en x=${Math.floor(p.x)} y=${Math.floor(p.y)} z=${Math.floor(p.z)} 📍`)
  }

  // ── Estado: vida (solo preguntas explícitas de stats; "cómo estás" va al LLM) ──────
  if (/\b(tu vida|tu salud|cuanta vida|tu hambre)\b/.test(text) || /^(vida|salud|hambre)$/.test(text)) {
    return reply(`Vida ${bot.health}/20 ❤️ y hambre ${bot.food}/20 🍗`)
  }

  // ── Ayuda ──────────────────────────────────────────────────────────────────────
  if (/\b(ayuda|help|que sabes hacer|comandos)\b/.test(text)) {
    return reply('Puedo: sígueme, ven, para, mina <bloque>, tala árbol, ataca <mob>, recoge, suelta <item>, explora, inventario 💡')
  }

  return null // no es un comando → que decida el LLM
}

function reply(text) {
  return { handled: true, reply: text }
}

module.exports = { handleCommand }
