// ── actions.js ───────────────────────────────────────────────────────────────────
// Traduce la decisión del LLM ({ chat, action, target }) a habilidades reales.
// Respeta el pánico (huir de creeper manda) y usa un candado para no lanzar dos
// rutas de pathfinder a la vez.

const skills = require('./skills')
const { toBlockName, toMobName } = require('./vocab')

const HANDLERS = {
  idle: async () => {},

  follow: (bot, target) => {
    const who = target || bot.mina.owner
    return who ? voidify(skills.follow(bot, who)) : null
  },

  come: (bot, target) => skills.comeToPlayer(bot, target || bot.mina.owner),

  goto: async (bot, target) => {
    if (!target) return
    const parts = String(target).split(',').map(Number)
    if (parts.length >= 2 && parts.every(n => !isNaN(n))) {
      await skills.goToCoords(bot, parts[0], parts[parts.length - 1])
    }
  },

  mine: (bot, target) => {
    const block = toBlockName(target)
    return block ? skills.mineNearest(bot, block, 1) : null
  },

  chop: (bot, target) => {
    const block = toBlockName(target)
    return skills.chopTree(bot, block && /_log$/.test(block) ? block : null)
  },

  attack: (bot, target) => {
    const mob = toMobName(target)
    return mob ? skills.attackNearest(bot, mob) : null
  },

  collect: (bot) => skills.collectNearbyItems(bot, 16),

  craft: (bot, target) => craftItem(bot, target),

  eat: (bot, target) => skills.eatFood(bot, target),

  drop: (bot, target) => skills.dropItem(bot, toBlockName(target) || target, bot.mina.owner),

  flee: (bot) => {
    const threat = skills.nearestHostile(bot, 16)
    return threat ? skills.fleeFrom(bot, threat, 16) : null
  },

  explore: (bot) => skills.explore(bot),
}

async function executeDecision(bot, decision) {
  const { chat, action, target, reason } = decision || {}
  console.log(`[mina] ${reason || ''} → ${action}(${target || '-'}) | "${chat || ''}"`)

  if (chat) bot.chat(String(chat).slice(0, 200))

  // El pánico (huir de un creeper) tiene prioridad absoluta sobre lo que pida el LLM.
  if (bot.mina.panic || bot.mina.reflexBusy) return

  const handler = HANDLERS[action]
  if (!handler || action === 'idle') return

  bot.mina.busy = true
  try {
    await handler(bot, target)
  } catch (err) {
    console.error(`[acción] error en ${action}:`, err.message)
  } finally {
    bot.mina.busy = false
  }
}

// Crafteo: intenta sin mesa; si hace falta, busca una mesa cercana.
async function craftItem(bot, name) {
  const itemName = toBlockName(name) || name
  if (!itemName) return
  const mcData = require('minecraft-data')(bot.version)
  const item = mcData.itemsByName[itemName]
  if (!item) return

  let recipes = bot.recipesFor(item.id, null, 1, null)
  let table = null
  if (!recipes.length) {
    const tableType = mcData.blocksByName.crafting_table
    table = tableType ? bot.findBlock({ matching: tableType.id, maxDistance: 16 }) : null
    if (table) {
      await skills.goNear(bot, table.position, 2)
      recipes = bot.recipesFor(item.id, null, 1, table)
    }
  }
  if (recipes.length) {
    await bot.craft(recipes[0], 1, table)
  } else {
    bot.chat(`No puedo craftear ${itemName} con lo que tengo 😅`)
  }
}

function voidify(value) {
  return Promise.resolve(value).then(() => {})
}

module.exports = { executeDecision }
