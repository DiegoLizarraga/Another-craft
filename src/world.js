function getWorldContext(bot) {
  const pos = bot.entity.position
  const inventory = bot.inventory.items().map(i => `${i.name}x${i.count}`).join(', ') || 'vacío'
  const time = bot.time.timeOfDay

  let timeLabel
  if (time < 1000) timeLabel = 'amanecer'
  else if (time < 6000) timeLabel = 'mañana'
  else if (time < 12000) timeLabel = 'tarde'
  else if (time < 13000) timeLabel = 'atardecer'
  else timeLabel = 'NOCHE (peligro)'

  const mobs = getNearbyMobs(bot, 24)
  const blocks = getNearbyBlocks(bot, 8)

  return `Posición: x=${Math.floor(pos.x)}, y=${Math.floor(pos.y)}, z=${Math.floor(pos.z)}
Salud: ${bot.health}/20
Hambre: ${bot.food}/20
Inventario: ${inventory}
Hora: ${timeLabel} (${time})
Mobs cercanos: ${mobs.length ? mobs.join(', ') : 'ninguno'}
Bloques cercanos: ${blocks.length ? blocks.join(', ') : 'ninguno relevante'}`
}

function getNearbyMobs(bot, radius) {
  return Object.values(bot.entities)
    .filter(e => e !== bot.entity && e.type === 'mob')
    .map(e => {
      const dist = Math.floor(e.position.distanceTo(bot.entity.position))
      return dist <= radius ? `${e.name}@${dist}m` : null
    })
    .filter(Boolean)
    .sort((a, b) => {
      const da = parseInt(a.split('@')[1])
      const db = parseInt(b.split('@')[1])
      return da - db
    })
    .slice(0, 8)
}

function getNearbyBlocks(bot, radius) {
  const interesting = new Set([
    'oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log', 'dark_oak_log',
    'coal_ore', 'iron_ore', 'gold_ore', 'diamond_ore',
    'crafting_table', 'furnace', 'chest',
    'wheat', 'carrots', 'potatoes',
    'water', 'lava',
  ])
  const pos = bot.entity.position
  const found = new Map()

  for (let x = -radius; x <= radius; x++) {
    for (let y = -radius; y <= radius; y++) {
      for (let z = -radius; z <= radius; z++) {
        const block = bot.blockAt(pos.offset(x, y, z))
        if (block && interesting.has(block.name)) {
          found.set(block.name, (found.get(block.name) || 0) + 1)
        }
      }
    }
  }

  return Array.from(found.entries()).map(([name, n]) => `${name}x${n}`)
}

module.exports = { getWorldContext }
