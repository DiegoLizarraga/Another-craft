// ── vocab.js ───────────────────────────────────────────────────────────────────
// Traduce palabras en español (o nombres ya válidos) a IDs de minecraft-data.
// Lo usan tanto los comandos de chat como el ejecutor del LLM.

const BLOCK_WORDS = {
  madera: 'oak_log', tronco: 'oak_log', arbol: 'oak_log', árbol: 'oak_log',
  roble: 'oak_log', abedul: 'birch_log', pino: 'spruce_log',
  piedra: 'stone', cobblestone: 'cobblestone', roca: 'stone',
  carbon: 'coal_ore', carbón: 'coal_ore',
  hierro: 'iron_ore', fierro: 'iron_ore',
  oro: 'gold_ore',
  diamante: 'diamond_ore', diamantes: 'diamond_ore',
  cobre: 'copper_ore', redstone: 'redstone_ore', esmeralda: 'emerald_ore',
  arena: 'sand', tierra: 'dirt', grava: 'gravel', arcilla: 'clay',
  trigo: 'wheat', zanahoria: 'carrots', papa: 'potatoes', patata: 'potatoes',
}

const MOB_WORDS = {
  zombi: 'zombie', zombie: 'zombie', muerto: 'zombie',
  creeper: 'creeper',
  esqueleto: 'skeleton',
  arana: 'spider', araña: 'spider',
  bruja: 'witch', enderman: 'enderman', slime: 'slime',
  vaca: 'cow', cerdo: 'pig', puerco: 'pig', oveja: 'sheep',
  pollo: 'chicken', gallina: 'chicken', caballo: 'horse',
  aldeano: 'villager', lobo: 'wolf', conejo: 'rabbit',
}

function normalize(str) {
  return (str || '').toLowerCase().trim()
}

// Devuelve un nombre de bloque válido o null.
function toBlockName(word) {
  const w = normalize(word)
  return BLOCK_WORDS[w] || (/^[a-z_]+$/.test(w) ? w : null)
}

// Devuelve un nombre de mob válido o null.
function toMobName(word) {
  const w = normalize(word)
  return MOB_WORDS[w] || (/^[a-z_]+$/.test(w) ? w : null)
}

module.exports = { toBlockName, toMobName, normalize, BLOCK_WORDS, MOB_WORDS }
