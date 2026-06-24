# Another Craft

![Another Craft](https://github.com/user-attachments/assets/2dc1e3b1-a2f1-4113-8167-e6daea5a0d34)

Bot de Minecraft con IA local usando [Mineflayer](https://github.com/PrismarineJS/mineflayer) y [Ollama](https://ollama.com). El bot se llama **mina**, tiene personalidad VTuber, responde en el chat, toma decisiones autónomas, y puede talar árboles, minar, seguirte, combatir y reaccionar sola al peligro.

```text
┌─────────────────────────────────────────────┐
│              Minecraft Server                 │
└───────────────────────┬───────────────────────┘
                        │  percepción + chat
┌───────────────────────▼───────────────────────┐
│               Mineflayer (mina)                │
└───────────────────────┬───────────────────────┘
        ┌───────────────┼────────────────┐
        ▼               ▼                ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────────┐
│  REFLEJOS    │ │  COMANDOS    │ │   CEREBRO (LLM)  │
│ ~0.6s, sin   │ │ chat directo │ │ Ollama/OpenRouter│
│ LLM:         │ │ sin LLM:     │ │ personalidad +   │
│ huir, comer, │ │ sígueme,     │ │ decisiones       │
│ defender,    │ │ mina, tala,  │ │ autónomas        │
│ armadura     │ │ ataca...     │ │ { chat, action } │
└──────┬───────┘ └──────┬───────┘ └────────┬─────────┘
       └────────────────┼───────────────────┘
                        ▼
            ┌─────────────────────────┐
            │  skills.js ("las manos")│
            │  seguir/minar/talar/    │
            │  atacar/recoger/equipar │
            └─────────────────────────┘
```

> Prioridad: **Reflejos > Comandos > Cerebro**. Si hay pánico (un creeper), todo lo demás cede.

---

## Requisitos

- **Node.js** v18 o superior
- **Java 25** (requerido por Minecraft 1.21.x)
- **Ollama** con el modelo `dolphin-phi`
- **Minecraft Java Edition** (para conectarte y ver al bot en acción)

---

## Instalación

### 1. Clona el repositorio

```bash
git clone https://github.com/DiegoLizarraga/Another-craft.git
cd Another-craft
```

### 2. Instala dependencias

```bash
npm install
```

### 3. Configura el entorno

Copia el archivo de ejemplo y edítalo:

```bash
cp .env.example .env
```

El `.env` por defecto ya viene listo para correr con Ollama en local. Solo ajusta la versión de Minecraft si usas una diferente:

```env
MC_HOST=localhost
MC_PORT=25565
MC_USERNAME=mina
MC_VERSION=1.21.11

OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=dolphin-phi

VIEWER_ENABLED=false
VIEWER_PORT=3007
```

---

## Levantar el servidor de Minecraft

### 1. Descarga el servidor

Descarga el jar de Minecraft Java Server **1.21.11** (o cualquier versión entre 1.21.1 y 1.21.11).

Crea una carpeta, por ejemplo `C:\mc-server`, y pon el jar ahí.

### 2. Primera ejecución (genera los archivos de configuración)

```bash
java -Xmx2G -jar server.jar nogui
```

Va a fallar pidiendo aceptar la EULA.

### 3. Acepta la EULA

Abre `eula.txt` y cambia:

```
eula=false  →  eula=true
```

### 4. Pon el servidor en modo offline

Abre `server.properties` y cambia:

```
online-mode=true  →  online-mode=false
```

Esto es necesario para que el bot pueda conectarse sin una cuenta de Mojang verificada.

### 5. Arranca el servidor

```bash
java -Xmx2G -jar server.jar nogui
```

Espera hasta ver:

```
Done (Xs)! For help, type "help"
```

---

## Levantar Ollama

### 1. Instala Ollama

Descarga desde [ollama.com](https://ollama.com) e instala.

### 2. Descarga el modelo

```bash
ollama pull dolphin-phi
```

### 3. Verifica que esté corriendo

```bash
ollama list
```

Debe aparecer `dolphin-phi` en la lista.

---

## Correr el bot

Con el servidor de Minecraft y Ollama activos, en la carpeta del proyecto:

```bash
npm start
```

Deberías ver:

```
[mina] Conectada como mina | LLM: ollama
```

Y en el chat del servidor:

```
¡Kyaa~ Hola a todos! ¡Mina ha llegado!
```

Para desarrollo con auto-reload:

```bash
npm run dev
```

---

## Conectarte al servidor

Abre Minecraft Java Edition → **Multijugador** → **Conexión directa** → `localhost`

Una vez dentro puedes hablarle a mina en el chat con `T` y responderá usando su personalidad VTuber.

---

## Comandos de chat

mina entiende **órdenes directas** al instante (sin esperar al LLM). Escríbelas en el chat del juego:

| Escribe... | Y mina... |
|------------|-----------|
| `sígueme` / `ven conmigo` | Te sigue a todas partes |
| `ven` / `ven aquí` | Camina hasta ti |
| `para` / `quieta` / `espera` | Se detiene |
| `mina madera` · `mina 5 hierro` | Va, equipa la herramienta y mina (y recoge el drop) |
| `tala` · `tala árbol` · `corta roble` | Tala el árbol completo (todos los troncos + ramas) y recoge la madera |
| `ataca zombie` / `mata creeper` | Ataca al mob más cercano |
| `defiéndeme` | Ataca a la amenaza más cercana |
| `recoge` | Junta los items tirados cerca |
| `suelta madera` / `dame hierro` | Te lanza ese item de su inventario |
| `come` | Come algo si tiene hambre |
| `explora` | Camina y explora los alrededores |
| `inventario` / `dónde estás` / `vida` | Te dice su estado |
| `ayuda` | Lista lo que sabe hacer |

Acepta sinónimos en español (madera, piedra, carbón, hierro, oro, diamante, zombi, araña, esqueleto...). Para **conversar** con ella (no dar órdenes), menciónala por su nombre o haz una pregunta: `mina, ¿qué opinas de la noche?` y responderá con el LLM y su personalidad.

> Reflejos automáticos (sin que se lo pidas): huye de los creepers, come cuando tiene hambre, se pone la armadura que lleve y se defiende si la golpean.

---

## Viewer en el navegador (opcional)

Para ver al bot en tiempo real desde el navegador, activa el viewer en `.env`:

```env
VIEWER_ENABLED=true
VIEWER_PORT=3007
```

Reinicia el bot y abre `http://localhost:3007`.

---

## Estructura del proyecto

```text
Another-craft/
├── src/
│   ├── bot.js        # Punto de entrada: conexión, eventos y coordinación
│   ├── reflexes.js   # Instintos en tiempo real (huir, comer, defenderse) SIN LLM
│   ├── commands.js   # Comandos de chat directos e instantáneos SIN LLM
│   ├── brain.js      # El cerebro LLM (Ollama / OpenRouter) + personalidad
│   ├── actions.js    # Traduce las decisiones del LLM a habilidades
│   ├── skills.js     # "Las manos": seguir, minar, atacar, recoger, equipar...
│   ├── world.js      # Percepción del mundo (posición, mobs, jugadores, inventario)
│   └── vocab.js      # Traduce palabras en español a bloques/mobs de Minecraft
├── .env              # Variables de entorno (no subir a git)
├── .env.example      # Plantilla de configuración
└── package.json
```

---

## Cómo funciona

mina tiene **tres capas de mente** que trabajan en conjunto, de la más rápida a la más lenta:

1. **Reflejos** (`reflexes.js`) — cada ~0.6 s revisa peligros y necesidades y reacciona al instante, sin LLM: huye de creepers, come cuando tiene hambre, se pone armadura y se defiende. Tiene **prioridad máxima**: cuando hay pánico, todo lo demás cede.
2. **Comandos** (`commands.js`) — cuando un jugador escribe una orden conocida (`sígueme`, `mina hierro`...), se ejecuta de inmediato sin gastar el LLM.
3. **Cerebro** (`brain.js`) — para conversar y decidir qué hacer cuando no hay nada urgente. Cada `THINK_INTERVAL_MS` (20 s por defecto) o cuando la mencionan en el chat:
   1. Lee el mundo con `world.js` (posición, salud, hambre, jugadores, mobs, hora)
   2. Manda ese contexto al LLM con el system prompt de mina
   3. El LLM responde un JSON: `{ chat, action, target, reason }`
   4. `actions.js` lo traduce a una habilidad real de `skills.js`

El bucle del cerebro **cede el paso** si hay un reflejo activo, una acción en curso o está siguiendo a alguien, para que las capas no se pisen.

---

## Acciones del cerebro (LLM)

Estas son las acciones que el LLM puede elegir de forma autónoma (los jugadores normalmente usan los [comandos de chat](#comandos-de-chat) de arriba):

| Acción | Descripción |
|--------|-------------|
| `idle` | Se queda quieta y solo habla |
| `follow` | Sigue a un jugador (`target` = nombre) |
| `come` | Va hacia un jugador (`target` = nombre) |
| `goto` | Va a coordenadas (`target` = `"x,z"`) |
| `mine` | Equipa la herramienta, mina el bloque y recoge el drop |
| `chop` | Tala un árbol completo (troncos + ramas) y recoge la madera |
| `attack` | Equipa el arma y ataca al mob más cercano |
| `collect` | Recoge los items tirados cerca |
| `craft` | Fabrica un item (busca mesa de crafteo si hace falta) |
| `eat` | Come comida del inventario |
| `drop` | Le lanza un item al jugador |
| `flee` | Huye de la amenaza más cercana |
| `explore` | Camina y explora los alrededores |

---

## Solución de problemas

**`unsupported protocol version`**
El servidor corre una versión de Minecraft que mineflayer no soporta. Usa una versión entre `1.21.1` y `1.21.11`.

**`UnsupportedClassVersionError`**
Necesitas Java 25. Descarga Temurin 25 desde [adoptium.net](https://adoptium.net).

**`multiplayer.disconnect.unverified_username`**
El servidor está en modo online. Cambia `online-mode=false` en `server.properties`.

**`Ollama error 404`**
El modelo no está descargado. Corre `ollama pull dolphin-phi`.

**El bot no responde en formato JSON**
Algunos modelos pequeños no respetan el formato. El bot usa el texto crudo como fallback para el chat. Prueba con `mistral` o `llama3.2` si `dolphin-phi` da problemas.

---

## Stack

| Capa | Herramienta |
|------|-------------|
| Conexión al juego | `mineflayer` |
| Navegación | `mineflayer-pathfinder` |
| IA / cerebro | `Ollama` (local) u `OpenRouter` (online) |
| Viewer | `prismarine-viewer` |

---

## Inspiración

- [Mindcraft](https://github.com/kolbytn/mindcraft) — el proyecto más completo de este estilo
- [Voyager](https://github.com/MineDojo/Voyager) — de NVIDIA, muy avanzado
