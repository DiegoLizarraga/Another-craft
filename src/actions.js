// ── actions.js ───────────────────────────────────────────────────────────────────
// Traduce la decisión del LLM ({ chat, action, target }) a habilidades reales.
// Respeta el pánico (huir de creeper manda) y usa un candado para no lanzar dos
// rutas de pathfinder a la vez.

const skills = require('./skills')
const { toBlockName, toMobName } = require('./vocab')
const Vec3 = require('vec3') // dep transitiva de mineflayer (para colocar la mesa)

const MAX_DEPTH = 5     // log->tablas->palo/mesa sobra; corta recursiones patológicas
const MAX_NODES = 2000  // tope de exploración (alto: hay ~11 recetas por tipo de madera
                        // y el contador no se libera al revertir; barato por nodo)

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

// ── Crafteo recursivo (planificar → ejecutar) ──────────────────────────────────
// Dos fases, para ser correcto y NO tener efectos colaterales en ramas fallidas:
//   1) PLANIFICAR (puro): exploramos recetas sobre un inventario SIMULADO y, si el
//      objetivo es alcanzable, generamos una lista ordenada de crafts. Probamos las
//      recetas más baratas primero; si una rama no se completa, la revertimos y
//      probamos otra. Una receta que necesita mesa "planifica" también una mesa.
//   2) EJECUTAR: recorremos los pasos, colocando la mesa cuando toque y crafteando.
// Planificamos sobre recipe.delta (count<0 = ingrediente consumido, count>0 = resultado).
async function craftItem(bot, name) {
  const itemName = toBlockName(name) || name
  if (!itemName) return
  const data = require('minecraft-data')(bot.version)
  const item = data.itemsByName[itemName]
  if (!item) { bot.chat(`No sé qué es "${itemName}" 😅`); return }

  if (bot.inventory.count(item.id, null) >= 1) {
    bot.chat(`Ya tengo ${itemName} ✨`)
    return
  }

  const res = await planAndCraft(bot, data, item.id, 1)
  if (res.ok) bot.chat(`¡Listo, crafteé ${itemName}! ✨`)
  else bot.chat(`No pude craftear ${itemName}: ${res.reason} 😢`)
}

// Planifica el árbol de crafteo y, si es viable, lo ejecuta. { ok, reason? }. Nunca lanza.
async function planAndCraft(bot, data, itemId, need) {
  const tableBlock = data.blocksByName.crafting_table
  const worldTable = !!(tableBlock && bot.findBlock({ matching: tableBlock.id, maxDistance: 16 }))
  const ctx = {
    bot, data,
    sim: simInventory(bot), // conteos simulados; nunca tocamos el inventario real al planear
    inProgress: new Set(),
    failed: new Map(),
    nodes: 0,
    steps: [],
    worldTable,
  }
  let res
  try {
    res = plan(ctx, itemId, need, 0)
  } catch (err) {
    return { ok: false, reason: cleanErr(err) }
  }
  if (!res.ok) return res
  return executePlan(bot, data, ctx.steps)
}

// Copia de los conteos del inventario real, por id de item: { [id]: count }.
function simInventory(bot) {
  const sim = {}
  for (const it of bot.inventory.items()) sim[it.type] = (sim[it.type] || 0) + it.count
  return sim
}
function simCount(ctx, id) { return ctx.sim[id] || 0 }

// Planifica obtener `need` de itemId. Añade pasos a ctx.steps y actualiza ctx.sim.
// Como un item puede tener MUCHAS recetas (palos desde cada madera, o bambú...),
// probamos las más prometedoras primero y, si una rama falla, la revertimos.
function plan(ctx, itemId, need, depth) {
  const { bot, data } = ctx
  const nm = (data.items[itemId] && data.items[itemId].name) || itemId

  if (simCount(ctx, itemId) >= need) return { ok: true }
  if (depth > MAX_DEPTH) return { ok: false, reason: `receta demasiado profunda (${nm})` }
  if (ctx.inProgress.has(itemId)) return { ok: false, reason: `ciclo de recetas en ${nm}` }
  if (ctx.failed.has(itemId)) return { ok: false, reason: ctx.failed.get(itemId) }
  if (++ctx.nodes > MAX_NODES) return { ok: false, reason: 'plan demasiado complejo' }

  ctx.inProgress.add(itemId)
  try {
    // recipesAll con tabla "virtual" (true): descubre TODAS las recetas, con o sin mesa.
    const recipes = sortRecipes(ctx, bot.recipesAll(itemId, null, true))
    if (!recipes.length) {
      // Sin receta = materia prima (tronco, mineral...): el plan para aquí.
      const reason = `no hay receta para ${nm} (¿hay que minarlo/talarlo?)`
      ctx.failed.set(itemId, reason) // materia prima inalcanzable: no re-explorar
      return { ok: false, reason }
    }

    let lastReason = `no pude obtener ${nm}`
    for (const recipe of recipes) {
      const snap = { sim: { ...ctx.sim }, stepsLen: ctx.steps.length, worldTable: ctx.worldTable }
      const attempt = planRecipe(ctx, itemId, need, depth, recipe)
      if (attempt.ok && simCount(ctx, itemId) >= need) return { ok: true }
      // revertir esta rama fallida y probar la siguiente receta
      ctx.sim = snap.sim
      ctx.steps.length = snap.stepsLen
      ctx.worldTable = snap.worldTable
      lastReason = attempt.reason || lastReason
    }
    return { ok: false, reason: lastReason }
  } finally {
    ctx.inProgress.delete(itemId)
  }
}

// Planifica UNA receta: ingredientes + mesa (si hace falta) + el propio craft.
// { ok, reason? }. Solo simula (no craftea de verdad).
function planRecipe(ctx, itemId, need, depth, recipe) {
  const { data } = ctx
  const haveNow = simCount(ctx, itemId)
  const perCraft = recipe.result.count || 1
  const crafts = Math.max(1, Math.ceil((need - haveNow) / perCraft))

  // 1) Ingredientes (delta.count < 0). Va PRIMERO para que, si falta materia prima,
  //    el motivo de error sea el material que falta (no "necesito una mesa"). Tras
  //    asegurar cada uno lo RESERVAMOS ya (lo restamos del sim) para que un ingrediente
  //    hermano no use lo destinado a este craft (ej: un pico necesita tablas Y palos,
  //    y los palos se hacen de tablas).
  for (const d of recipe.delta) {
    if (d.count >= 0) continue
    const required = -d.count * crafts
    if (simCount(ctx, d.id) < required) {
      const sub = plan(ctx, d.id, required, depth + 1)
      if (!sub.ok) return sub
    }
    ctx.sim[d.id] = simCount(ctx, d.id) - required // reservar
  }

  // 2) Si necesita mesa y no hay una en el mundo, planificamos fabricar+colocar una.
  let placeTable = false
  if (recipe.requiresTable && !ctx.worldTable) {
    const tableItem = data.itemsByName.crafting_table
    if (!tableItem) return { ok: false, reason: 'no conozco la mesa de crafteo' }
    if (simCount(ctx, tableItem.id) < 1) {
      const sub = plan(ctx, tableItem.id, 1, depth + 1) // la mesa NO requiere mesa
      if (!sub.ok) return { ok: false, reason: `necesito una mesa: ${sub.reason}` }
    }
    ctx.sim[tableItem.id] = simCount(ctx, tableItem.id) - 1 // se consume al colocarla
    ctx.worldTable = true // una vez colocada, sirve para los siguientes crafts del plan
    placeTable = true
  }

  // 3) Añadir el/los resultado(s) al sim y registrar el paso.
  for (const d of recipe.delta) {
    if (d.count <= 0) continue
    ctx.sim[d.id] = simCount(ctx, d.id) + d.count * crafts
  }
  ctx.steps.push({ recipe, crafts, requiresTable: recipe.requiresTable, placeTable })
  return { ok: true }
}

// Orden de preferencia: SIN mesa antes que con mesa (no construir una mesa por gusto);
// luego las que ya podemos hacer (menos ingredientes faltantes); luego las más simples.
function sortRecipes(ctx, recipes) {
  return recipes
    .map(r => {
      let missing = 0
      let total = 0
      for (const d of r.delta) {
        if (d.count >= 0) continue
        total++
        if (simCount(ctx, d.id) < -d.count) missing++
      }
      return { r, table: r.requiresTable ? 1 : 0, missing, total }
    })
    .sort((a, b) => a.table - b.table || a.missing - b.missing || a.total - b.total)
    .map(x => x.r)
}

// Ejecuta los pasos del plan: coloca una mesa cuando toque y craftea. { ok, reason? }.
async function executePlan(bot, data, steps) {
  const tableBlock = data.blocksByName.crafting_table
  let worldTable = tableBlock ? bot.findBlock({ matching: tableBlock.id, maxDistance: 16 }) : null
  if (worldTable) { try { await skills.goNear(bot, worldTable.position, 2) } catch {} }

  for (const step of steps) {
    if (step.placeTable && !worldTable) {
      const inv = bot.inventory.items().find(i => i.name === 'crafting_table')
      if (!inv) return { ok: false, reason: 'no tengo mesa para colocar' }
      try {
        await bot.equip(inv, 'hand')
        worldTable = await placeCraftingTable(bot, tableBlock)
        if (worldTable) { try { await skills.goNear(bot, worldTable.position, 2) } catch {} }
      } catch {}
      if (!worldTable) return { ok: false, reason: 'no pude colocar la mesa de crafteo' }
    }
    const useTable = step.requiresTable ? worldTable : null
    if (step.requiresTable && !useTable) return { ok: false, reason: 'falta la mesa de crafteo' }
    try {
      await bot.craft(step.recipe, step.crafts, useTable)
    } catch (err) {
      return { ok: false, reason: cleanErr(err) }
    }
  }
  return { ok: true }
}

// Intenta colocar la mesa sobre un bloque sólido libre cerca del bot. Block o null.
async function placeCraftingTable(bot, tableType) {
  const base = bot.entity.position.floored()
  // Referencias preferidas: suelo de los lados (antorcha/mesa al lado), luego paredes,
  // y como último recurso el bloque bajo los pies.
  const offsets = [
    new Vec3(1, -1, 0), new Vec3(-1, -1, 0), new Vec3(0, -1, 1), new Vec3(0, -1, -1),
    new Vec3(1, 0, 0), new Vec3(-1, 0, 0), new Vec3(0, 0, 1), new Vec3(0, 0, -1),
    new Vec3(0, -1, 0),
  ]
  for (const off of offsets) {
    const ref = bot.blockAt(base.plus(off))
    if (!ref || ref.boundingBox !== 'block') continue // referencia debe ser sólida
    const dest = ref.position.offset(0, 1, 0)
    const destBlock = bot.blockAt(dest)
    if (!destBlock || destBlock.boundingBox !== 'empty') continue // hueco ocupado
    if (dest.equals(base) || dest.equals(base.offset(0, 1, 0))) continue // no donde está parada
    try {
      await bot.placeBlock(ref, new Vec3(0, 1, 0))
      const placed = bot.findBlock({ matching: tableType.id, maxDistance: 4 })
      if (placed) return placed
    } catch { /* probamos el siguiente candidato */ }
  }
  return null
}

// Limpia el doble prefijo "Error: ..." que produce bot.craft (throw new Error(err)).
function cleanErr(err) {
  return String((err && err.message) || err).replace(/^Error:\s*/, '')
}

function voidify(value) {
  return Promise.resolve(value).then(() => {})
}

module.exports = { executeDecision }
