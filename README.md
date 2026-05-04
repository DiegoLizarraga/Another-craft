# Another Craft 🤖

Bot de Minecraft con IA local usando [Mineflayer](https://github.com/PrismarineJS/mineflayer) y [Ollama](https://ollama.com). El bot se llama **mina**, tiene personalidad VTuber, responde en el chat, toma decisiones autónomas y puede minar, moverse y atacar.

```
┌─────────────────────────────────────┐
│         Minecraft Server             │
└────────────────┬────────────────────┘
                 │
┌────────────────▼────────────────────┐
│         Mineflayer (mina)            │
│  - Percibe el mundo                  │
│  - Ejecuta acciones                  │
└────────────────┬────────────────────┘
                 │  posición, salud, mobs,
                 │  inventario, hora...
┌────────────────▼────────────────────┐
│         Ollama (dolphin-phi)         │
│  - Decide qué hacer                  │
│  - Responde con personalidad         │
└────────────────┬────────────────────┘
                 │  { chat, action, target }
┌────────────────▼────────────────────┐
│         Ejecutor de acciones         │
│  - mine / move / attack / eat...     │
└─────────────────────────────────────┘
```

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

## Viewer en el navegador (opcional)

Para ver al bot en tiempo real desde el navegador, activa el viewer en `.env`:

```env
VIEWER_ENABLED=true
VIEWER_PORT=3007
```

Reinicia el bot y abre `http://localhost:3007`.

---

## Estructura del proyecto

```
Another-craft/
├── src/
│   ├── bot.js        # Punto de entrada: conexión y eventos
│   ├── brain.js      # Integración con Ollama, historial de conversación
│   ├── world.js      # Lee el estado del mundo (posición, mobs, inventario)
│   └── actions.js    # Ejecuta las decisiones: mine, move, attack, eat...
├── .env              # Variables de entorno (no subir a git)
├── .env.example      # Plantilla de configuración
└── package.json
```

---

## Cómo funciona

Cada **15 segundos** el bot:

1. Lee su entorno con `world.js` (posición, salud, hambre, mobs cercanos, hora)
2. Manda ese contexto a Ollama con el system prompt de mina
3. Ollama responde con un JSON: `{ chat, action, target, reason }`
4. `actions.js` ejecuta la acción en el juego

Cuando un **jugador escribe en el chat**, el proceso es el mismo pero incluyendo el mensaje como contexto, y la respuesta es inmediata.

---

## Acciones disponibles

| Acción | Descripción |
|--------|-------------|
| `idle` | No hace nada |
| `move` | Se mueve a coordenadas `x,z` o se aleja de un mob |
| `mine` | Mina el bloque más cercano del tipo indicado |
| `attack` | Ataca al mob más cercano con ese nombre |
| `collect` | Recoge el item más cercano |
| `craft` | Craftea un item si tiene los materiales |
| `eat` | Come el primer alimento disponible en inventario |

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
| IA / cerebro | `Ollama` (dolphin-phi) |
| Viewer | `prismarine-viewer` |

---

## Inspiración

- [Mindcraft](https://github.com/kolbytn/mindcraft) — el proyecto más completo de este estilo
- [Voyager](https://github.com/MineDojo/Voyager) — de NVIDIA, muy avanzado
