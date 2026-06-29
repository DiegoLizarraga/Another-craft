// ── chatter.js ───────────────────────────────────────────────────────────────────
// La "voz viva" de mina: frases variadas y con personalidad que dice ante eventos del
// juego (alguien entra, mata un mob, le pegan, encuentra mineral, llueve, anochece,
// sube de nivel...). NO usa el LLM: es instantáneo y gratis. Todo pasa por un control
// de cadencia (throttle) para dar vida sin spamear el chat.

const GLOBAL_COOLDOWN_MS = 3500 // tiempo mínimo entre dos frases ambientales

const HOSTILES = new Set([
  'creeper', 'zombie', 'skeleton', 'spider', 'cave_spider', 'witch', 'enderman',
  'zombified_piglin', 'husk', 'stray', 'drowned', 'pillager', 'zombie_villager',
  'phantom', 'slime', 'silverfish', 'vex',
])

// Mineral (en inglés base) → nombre bonito en español, para las frases.
const ORE_ES = {
  coal: 'carbón', copper: 'cobre', iron: 'hierro', gold: 'oro',
  redstone: 'redstone', lapis: 'lapislázuli', diamond: 'diamante',
  emerald: 'esmeralda', quartz: 'cuarzo',
}

// ── Frases por categoría (usa {name}, {mob}, {ore}, {level} como huecos) ───────────

const LINES = {
  join: [
    '¡Holaaa {name}! ¡Bienvenidx! 💖',
    '¡{name} llegó! ¡Kyaa~ hola hola! 🌸',
    '¡Senpai {name}! ¡Qué alegría verte! ✨',
    '¡Mira quién apareció! ¡Hola {name}! 🎉',
    '¡{name}! ¡Justo a tiempo para la aventura! 🗺️',
  ],
  leave: [
    'Adiós {name}... ¡vuelve pronto! 🥺',
    '¡{name} se fue! Cuídate mucho 💕',
    'Byeee {name}~ te voy a extrañar 😢',
    'Hasta luego {name}! ¡No tardes! 👋',
  ],
  hurt: [
    '¡Auch! 😣',
    '¡Eso dolió! 😤',
    '¡Oye! ¡Cuidado! 😖',
    '¡Itai~! 💢',
    '¡Ñññ, me lastimé! 😵‍💫',
  ],
  bigHurt: [
    '¡UWAAAH! ¡Me están haciendo mucho daño! 😭',
    '¡Ayudaaa, esto va en serio! 💔',
    '¡No no no, esto duele MUCHO! 😱',
    '¡Necesito ayudaaa, senpai! 🆘',
  ],
  kill: [
    '¡Toma eso, {mob}! 💥',
    '¡Derroté al {mob}! ¿Vieron eso? 😎',
    '¡Un {mob} menos! ¡Soy fuerte! 💪',
    '¡Ja! El {mob} no pudo conmigo ✨',
    '¡Victoria contra el {mob}! 🏆',
  ],
  ore: [
    '¡Ooooh, {ore}! ¡Brillitos! ✨',
    '¡Mira, encontré {ore}! 🤩',
    '¡Síii, {ore} para mi colección! ⛏️',
    '¡{ore}! ¡Qué emoción! 💖',
  ],
  oreRare: [
    '¡KYAAA! ¡¡{ore}!! ¡NO PUEDE SER! 💎😍',
    '¡SENPAI MIRA! ¡¡ENCONTRÉ {ore}!! 🤩💎',
    '¡{ore}! ¡¡Es el mejor día de mi vida!! ✨😭',
    '¡¡{ore}!! ¡Soy la más afortunada! 🍀💎',
  ],
  rainStart: [
    'Empezó a llover... ¡me voy a mojar! 🌧️',
    '¡Lluviaaa! Espero que no haya rayos 😨⛈️',
    'Qué día tan gris... pero bonito 🌧️💙',
  ],
  rainStop: [
    '¡Salió el sol otra vez! ☀️',
    '¡Dejó de llover! ¡Qué alivio! 🌈',
    'Ahhh, el cielo despejado es precioso ✨',
  ],
  night: [
    'Se hizo de noche... tengo un poco de miedo 🌙😰',
    '¡Ya es de noche! ¡Salen los monstruos! 👻',
    'Brrr, la noche me da escalofríos... quédate cerca 🌃',
    '¡No me gusta la oscuridad! ¿Hacemos un refugio? 🏠',
  ],
  day: [
    '¡Amaneció! ¡Sobreviví la noche! ☀️🎉',
    '¡Buenos días! ¡Hora de aventuras! 🌅',
    '¡Por fin de día! Ya no tengo miedo 😌',
  ],
  levelUp: [
    '¡Subí a nivel {level}! ¡Cada vez más fuerte! ⭐',
    '¡Nivel {level}! ¡Mírenme crecer! ✨',
    '¡Yay~ nivel {level}! ¡Soy increíble! 💖',
  ],
  death: [
    '¡NOOO! ¡Me morí! 💀😭 ¡Voy de regreso!',
    '¡Uwaaah, caí en batalla...! 👼 ¡Ya vuelvo!',
    '¡Game over para mí! 💀 ¡Pero vuelvo más fuerte!',
  ],
  respawn: [
    '¡Estoy de vuelta! ¡Esta vez con más cuidado! 💪',
    '¡Reaparecí! ¿Me extrañaron? 😅',
    '¡Otra oportunidad! ¡Vamos de nuevo! ✨',
  ],
  // ── Sociales (los reutiliza commands.js para responder en el chat) ──────────────
  greet: [
    '¡Holaaa! ¿Cómo estás? 💖',
    '¡Hola hola! ¡Qué gusto! 🌸',
    '¡Buenas! ¡Aquí está mina! ✨',
    '¡Heey! ¡Hola! 👋',
  ],
  thanks: [
    '¡De nadaaa! Para eso estoy 💕',
    '¡Un placer ayudar! 😊',
    '¡Eee~ no es nada! 🌸',
    '¡Cuando quieras! 💖',
  ],
  praise: [
    '¡Kyaa~ me sonrojo! 😳💕',
    '¡Gracias! ¡Me esfuerzo mucho! 💪✨',
    '¡Eee~ no es para tanto! 🥰',
    '¡Siii! ¡Soy la mejor! 😤✨',
  ],
  love: [
    '¡Yo también te quiero! 💖💖',
    '¡Kyaaa! ¡Qué lindx! 😳💕',
    '¡Awww! ¡Mi corazón! 🥰💗',
    '¡Te quiero un montón! 💞',
  ],
  joke: [
    '¿Qué hace un creeper en una fiesta? ¡BOOM, la revienta! 💥😆',
    '¿Por qué el zombi no entró a la disco? ¡Porque estaba muy podrido! 🧟😂',
    '¿Sabes por qué los esqueletos no pelean? ¡No tienen agallas! 💀😆',
    'Un aldeano me dijo "hrmm"... ¡y yo entendí todo! 🤣',
    '¿Cuál es el bloque más educado? ¡El de-cente! 😎',
  ],
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function fill(tpl, vars) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : ''))
}

// Devuelve una frase aleatoria de una categoría (o '' si no existe). Útil para que
// commands.js dé respuestas variadas reutilizando estas mismas listas.
function line(category, vars = {}) {
  const pool = LINES[category]
  return pool ? fill(pick(pool), vars) : ''
}

// Dice una frase respetando la cadencia: una global (no spamear) y una por categoría
// (no repetir el mismo tipo de comentario seguido). force=true se salta ambas.
function say(bot, category, vars = {}, { force = false, cooldown = 12000 } = {}) {
  const text = line(category, vars)
  if (!text) return false

  const now = Date.now()
  if (!bot.mina.chatterCooldowns) bot.mina.chatterCooldowns = {}
  if (!force) {
    if (now - (bot.mina.lastChatter || 0) < GLOBAL_COOLDOWN_MS) return false
    if (now - (bot.mina.chatterCooldowns[category] || 0) < cooldown) return false
  }

  bot.mina.lastChatter = now
  bot.mina.chatterCooldowns[category] = now
  bot.chat(text)
  return true
}

function prettyOre(name) {
  const base = name.replace(/^deepslate_/, '').replace(/_ore$/, '')
  return ORE_ES[base] || base
}

// ── Cableado de eventos ──────────────────────────────────────────────────────────

function startChatter(bot) {
  // Alguien entra / sale del servidor.
  bot.on('playerJoined', player => {
    if (!player || player.username === bot.username) return
    say(bot, 'join', { name: player.username }, { cooldown: 8000 })
  })
  bot.on('playerLeft', player => {
    if (!player || player.username === bot.username) return
    say(bot, 'leave', { name: player.username }, { cooldown: 8000 })
  })

  // Le pegan: reacciona según cuánto daño recibió (sin pisar a los reflejos de pánico).
  bot.mina._lastHealth = bot.health
  bot.on('health', () => {
    const prev = bot.mina._lastHealth ?? bot.health
    const dropped = prev - bot.health
    bot.mina._lastHealth = bot.health
    if (dropped <= 0 || bot.health <= 0 || bot.mina.panic) return
    if (dropped >= 5) say(bot, 'bigHurt', {}, { cooldown: 6000 })
    else say(bot, 'hurt', {}, { cooldown: 5000 })
  })

  // Mató (o murió cerca) un hostil: si estaba a tiro, se lo apunta.
  bot.on('entityDead', entity => {
    if (!entity || !entity.name || !HOSTILES.has(entity.name) || !bot.entity) return
    const dist = entity.position.distanceTo(bot.entity.position)
    if (dist <= 6) say(bot, 'kill', { mob: entity.name }, { cooldown: 5000 })
  })

  // Terminó de picar un bloque: si era mineral, se emociona (más si es raro).
  bot.on('diggingCompleted', block => {
    if (!block || !/_ore$/.test(block.name)) return
    const base = block.name.replace(/^deepslate_/, '').replace(/_ore$/, '')
    const ore = prettyOre(block.name)
    if (base === 'diamond' || base === 'emerald') say(bot, 'oreRare', { ore }, { cooldown: 3000 })
    else say(bot, 'ore', { ore }, { cooldown: 6000 })
  })

  // Clima.
  bot.on('rain', () => {
    say(bot, bot.isRaining ? 'rainStart' : 'rainStop', {}, { cooldown: 20000 })
  })

  // Sube de nivel de experiencia.
  bot.mina._lastLevel = bot.experience ? bot.experience.level : 0
  bot.on('experience', () => {
    const lvl = bot.experience ? bot.experience.level : 0
    if (lvl > (bot.mina._lastLevel || 0)) say(bot, 'levelUp', { level: lvl }, { cooldown: 8000 })
    bot.mina._lastLevel = lvl
  })

  // Transición día/noche (sondeo ligero; no hay evento limpio para esto).
  bot.mina._wasNight = bot.time && bot.time.timeOfDay >= 13000
  const timeTimer = setInterval(() => {
    if (!bot.time) return
    const isNight = bot.time.timeOfDay >= 13000
    if (isNight && !bot.mina._wasNight) say(bot, 'night', {}, { cooldown: 30000 })
    else if (!isNight && bot.mina._wasNight) say(bot, 'day', {}, { cooldown: 30000 })
    bot.mina._wasNight = isNight
  }, 5000)
  bot.once('end', () => clearInterval(timeTimer))
}

module.exports = { startChatter, say, line, LINES, pick }
