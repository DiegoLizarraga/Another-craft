const { Movements, goals } = require('mineflayer-pathfinder')

const ACTION_HANDLERS = {
  idle,
  move,
  mine,
  attack,
  collect,
  craft,
  eat,
}

async function executeDecision(bot, decision) {
  const { chat, action, target, reason } = decision
  console.log(`[mina] ${reason || ''} → ${action}(${target || '-'}) | "${chat}"`)

  if (chat) bot.chat(chat)

  const handler = ACTION_HANDLERS[action] || idle
  try {
    await handler(bot, target)
  } catch (err) {
    console.error(`[Acción] Error en ${action}:`, err.message)
  }
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async function idle() {
  // no hace nada
}

async function move(bot, target) {
  if (!target) return
  // target puede ser "away_from_creeper" o "x,z"
  if (target === 'away_from_creeper' || target === 'away') {
    const creeper = findNearestMob(bot, 'creeper')
    if (creeper) {
      const away = bot.entity.position.plus(
        bot.entity.position.minus(creeper.position).normalize().scale(16)
      )
      await goTo(bot, Math.floor(away.x), Math.floor(away.z))
    }
    return
  }
  const parts = target.split(',').map(Number)
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    await goTo(bot, parts[0], parts[1])
  }
}

async function mine(bot, blockName) {
  if (!blockName) return
  const mcData = require('minecraft-data')(bot.version)
  const blockType = mcData.blocksByName[blockName]
  if (!blockType) return

  const block = bot.findBlock({ matching: blockType.id, maxDistance: 32 })
  if (!block) return

  await goToBlock(bot, block)
  await bot.dig(block)
}

async function attack(bot, targetName) {
  if (!targetName) return
  const entity = findNearestMob(bot, targetName)
  if (entity) bot.attack(entity)
}

async function collect(bot, itemName) {
  if (!itemName) return
  const item = Object.values(bot.entities).find(
    e => e.name === 'item' && e.position.distanceTo(bot.entity.position) < 16
  )
  if (item) await goTo(bot, Math.floor(item.position.x), Math.floor(item.position.z))
}

async function craft(bot, itemName) {
  if (!itemName) return
  const mcData = require('minecraft-data')(bot.version)
  const item = mcData.itemsByName[itemName]
  if (!item) return

  const recipe = bot.recipesFor(item.id)[0]
  if (recipe) await bot.craft(recipe, 1, null)
}

async function eat(bot, foodName) {
  const mcData = require('minecraft-data')(bot.version)
  const foodItem = bot.inventory.items().find(i => {
    if (foodName) return i.name === foodName
    return mcData.foods?.[i.id] !== undefined
  })
  if (foodItem) await bot.equip(foodItem, 'hand').then(() => bot.consume())
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function goTo(bot, x, z) {
  const mcData = require('minecraft-data')(bot.version)
  bot.pathfinder.setMovements(new Movements(bot, mcData))
  await bot.pathfinder.goto(new goals.GoalXZ(x, z))
}

async function goToBlock(bot, block) {
  const mcData = require('minecraft-data')(bot.version)
  bot.pathfinder.setMovements(new Movements(bot, mcData))
  await bot.pathfinder.goto(
    new goals.GoalGetToBlock(block.position.x, block.position.y, block.position.z)
  )
}

function findNearestMob(bot, name) {
  return Object.values(bot.entities)
    .filter(e => e !== bot.entity && e.name === name)
    .sort((a, b) =>
      a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position)
    )[0] || null
}

module.exports = { executeDecision }
