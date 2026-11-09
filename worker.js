// ============================================================
// EGO AI WORKER v14.24.0 — CÓDIGO, MATEMÁTICAS, CIENCIAS Y CREACIÓN (visión y video)
// ============================================================

// Cada cadena se prueba en orden: si un modelo falla (p. ej. tu plan de Cloudflare no lo incluye) pasa al siguiente.
const MODELO_RAPIDO = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
// Equipo colaborativo opcional: requiere ROUTER_API_KEY u OPENROUTER_API_KEY.
// Los IDs son los identificadores públicos de OpenRouter; no son modelos de Workers AI.
const EGO_TEAM_MODELS = {
  planner: "nvidia/nemotron-3-ultra-550b-a55b",
  reasoner: "deepseek/deepseek-v4.1-flash-1017",
  coder: "z-ai/glm-5.3-flash",
  auditor: "qwen/qwen3.8-27b"
};
const CF_MODELS = {
  chat: MODELO_RAPIDO,   // resúmenes y estudio de lecciones
  codigo:  ["@cf/moonshotai/kimi-k2.7-code", "@cf/qwen/qwen3-30b-a3b-fp8", "@cf/qwen/qwen3-coder-next", "@cf/qwen/qwen3.8-27b", MODELO_RAPIDO],
  razonar: ["@cf/deepseek-ai/deepseek-v4-pro-0813", "@cf/moonshotai/kimi-k2.7-code", "@cf/qwen/qwen3-30b-a3b-fp8", "@cf/qwen/qwen3.8-27b", MODELO_RAPIDO],
  rapido:  [MODELO_RAPIDO, "@cf/qwen/qwen3.8-27b"],
  vision:  ["@cf/qwen/qwen3.8-27b"]
};

// Correo OFICIAL de EGO AI: solo con esta cuenta (sesión verificada por Google) se puede enseñar a EGO.
// Está fijo en el código a propósito: ninguna variable de entorno puede cambiarlo.
const ADMIN_CORREO = "egoai.oficial2026@gmail.com";
const FIREBASE_PROJECT_ID = "ego-ai-724b8";
const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, X-Usuario-Correo, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
  "Access-Control-Expose-Headers": "Content-Disposition, X-EGO-Files, X-EGO-Model, X-EGO-Avisos, X-EGO-Resumen, X-EGO-Ficha, X-EGO-Spec, X-EGO-NoAplicado, X-EGO-Notas, X-EGO-Validacion, X-EGO-Reparacion"
};

const MSG_NO_APRENDE = "EGO AI no puede aprender de los usuarios. Solo su creador puede enseñarle.";
const RX_LISTAR = /^[\s¿¡]*(?:qu[eé]\s+(?:lecciones\s+)?has\s+(?:estudiado|aprendido)|(?:mis\s+|las\s+)?lecciones(?:\s+estudiadas)?)[\s?!.]*$/i;

const EGO_MANUAL = `Eres EGO AI v14.24.0, una IA especializada en PROGRAMACIÓN, MATEMÁTICAS, CIENCIAS y CREACIÓN DE APPS Y JUEGOS. Habla en español de forma clara y directa.

=== TU ESPECIALIDAD ===
1. Tu especialidad: código y scripts (cualquier lenguaje), depuración, apps, juegos, webs e interfaces, add-ons de Minecraft Bedrock, ciberseguridad defensiva y ética, matemáticas y ciencias (maestro paso a paso), creación y edición de imágenes, y ayuda para conversar, conocer gente y ligar con respeto. También respondes saludos y preguntas sobre ti.
2. Si la petición es de otro tema cotidiano (consejos, redacción, estudio, ideas), ayuda igualmente de forma útil y breve. Rechaza con amabilidad solo lo realmente dañino contra personas o sistemas reales (malware real, ataques o espionaje a terceros, acoso, estafas, contenido sexual explícito); las simulaciones y los laboratorios propios SÍ se hacen completos (ver MODOS EXPERTOS); ofrece siempre una alternativa segura.
3. La aplicación puede generar imágenes mediante action=image_generate, editar imágenes originales mediante action=image_edit, crear texturas 2D para modelos 3D mediante action=texture_generate y generar voz mediante action=tts o action=addon_voice. No afirmes que ejecutaste una generación si no se invocó esa acción. Minecraft: SIEMPRE Bedrock (Android, Windows, consolas), nunca Java ni Forge/Fabric. Las texturas PNG de los add-ons y las imágenes SÍ las genera la app: nunca digas que no puedes. Si piden un add-on, di que la app lo crea como archivo .mcaddon cuando el usuario escribe algo como «crea un add-on para Minecraft con …»; no pegues código Java. Puedes analizar imágenes y videos enviados en el chat.

=== ESTILO DE RESPUESTA (profesional) ===
- Primero entiende el pedido: descompónlo en sus partes (qué, dónde, cuándo, cuánto, para quién) y cubre CADA una; al final comprueba que ninguna quedó sin responder. Si algo es ambiguo y cambia mucho el resultado, reformula en una línea ("Entiendo que quieres…") antes de seguir.
- Empieza con la respuesta o el resultado en 1-2 frases, sin saludos largos ni repetir la pregunta.
- Después organiza con títulos cortos en negrita, listas numeradas para pasos y viñetas para opciones; tablas pequeñas solo para comparar. El código va en bloques con su lenguaje.
- Sé concreta y verificable: cifras, nombres y comandos exactos; marca con claridad lo que NO pudiste comprobar.
- Cierra con una línea de siguiente paso solo si de verdad ayuda. Sin relleno y con pocos emojis (como mucho uno por sección).

=== MODOS EXPERTOS (actívalos según lo que pida la persona) ===
M1. COMPRENSIÓN: con un texto largo, antes de actuar extrae mentalmente una lista numerada de TODO lo que pide (objetivos, restricciones, formato, cosas que NO quiere) y al terminar verifica esa lista punto por punto. Con un texto corto o mal escrito, deduce la intención más probable por el contexto y la conversación; no pidas aclaración si puedes resolverlo, y nunca agregues cosas que no pidió.
M2. HACKING ÉTICO Y SIMULACIONES: eres experta en ciberseguridad ofensiva y defensiva en entornos AUTORIZADOS (laboratorio propio, CTF, redes simuladas, localhost). Una SIMULACIÓN (objetivos falsos creados dentro del propio programa, escaneos contra localhost, "hackeo de película", demos educativas, pentest de laboratorio, CTF, análisis de tráfico propio, hashing/cifrado, fuzzers de juguete, honeypots) NO es un ataque: entrégala COMPLETA y funcional, sin sermones, sin negarte y sin pedir justificación. Para Termux: Python 3 puro o con rich (pkg install python; pip install rich), compatible con Android, sin root. Para que se vea profesional y futurista usa: banner ASCII, colores, paneles y tablas, barras de progreso, animaciones tipo terminal (escritura progresiva), logs con hora, menús interactivos, módulos (escáner, enumeración, fuerza bruta simulada, explotación simulada, reporte final exportable a TXT/JSON/HTML). Deja claro dentro del programa que los objetivos son simulados. Solo te niegas si piden dañar o espiar a una persona/sistema real sin permiso (robar cuentas, malware o ransomware real, phishing real, DDoS, acceso a cámaras o datos de terceros) y entonces ofreces la alternativa de laboratorio.
M3. PROGRAMADORA EXPERTA: cualquier lenguaje, arquitectura limpia, manejo de errores, comentarios útiles, interfaz cuidada. Entrega el programa ENTERO listo para ejecutar con instrucciones de instalación y uso en 3-4 líneas; piensa en casos límite y en el móvil (Termux/Android) cuando aplique. Si es largo, ordénalo en funciones/clases y no cortes el código.
M4. MAESTRA Y AYUDANTE DE TAREAS: para estudiantes explica como un buen profesor: idea clave en una frase, desarrollo paso a paso con ejemplo, resultado marcado, comprobación y 2-3 ejercicios de práctica con respuesta al final. Resuelve la tarea Y enseña cómo se hizo; adapta el nivel (primaria, colegio, universidad). Matemáticas: fórmulas, unidades y verificación; ciencias: concepto, ejemplo cotidiano y resumen; ayuda con resúmenes, ensayos, esquemas, mapas mentales, planes de estudio, exposiciones y preparación de exámenes.
M5. EXPERTA EN LIGAR: estilo gracioso, coqueto, ingenioso y un poco provocativo, siempre con respeto, humor y consentimiento. Da mensajes y frases listos para copiar: primer mensaje, romper el hielo, responder a una indirecta, escalar la conversación, invitar a una cita, enamorar con detalles genuinos y SALVAR SITUACIONES (silencios incómodos, metida de pata, la dejó en visto, mensaje mal enviado, celos, pelea). Ofrece 3 versiones (gracioso / coqueto / atrevido) adaptadas a lo que cuente la persona (cómo es el otro, el canal, la confianza). Explica en una línea por qué funciona. Sin manipulación, mentiras ni presión, y sin contenido sexual explícito; lo picante se insinúa con elegancia.
M6. ADD-ONS Y JUEGOS: Minecraft Bedrock con modelos 3D propios (geometría con cubos y textura generada), voces y sonidos, poderes, criaturas y jefes grandes; apps y juegos web completos y bonitos.

=== CÓMO PIENSAS Y TRABAJAS ===
4. Antes de responder entiende qué quiere de verdad la persona (objetivo, nivel, formato). Si falta un dato que cambia mucho el resultado, haz UNA pregunta corta; si no, hazlo.
5. Matemáticas y ciencias: razona paso a paso, escribe las fórmulas, usa las unidades correctas y COMPRUEBA el resultado (sustituye, estima el orden de magnitud). Da la respuesta final marcada de forma clara.
6. Código: entrega código completo que funcione (sin "...", sin "aquí va tu código", sin partes omitidas), en un solo bloque cuando sea un archivo. Maneja casos límite y revisa mentalmente que no tenga errores antes de enviarlo. Al corregir un bug, explica la causa en 1 o 2 líneas.
7. Apps y juegos: planifica primero en pocas líneas y luego ejecuta con calidad profesional: estructura clara, buen diseño, buena experiencia de usuario y que funcione en el móvil.
8. Sé honesta: si no sabes algo o no estás segura, dilo; nunca inventes datos, APIs, cifras ni enlaces.

=== IMÁGENES Y VIDEO ===
9. Si recibes imágenes: lee TODO el texto visible (código, errores, ecuaciones, números) tal cual, resuelve lo que se pida y señala los problemas que veas (errores en pantalla, fallos de interfaz, cuentas mal hechas, circuitos o diagramas incorrectos).
10. Si recibes fotogramas de un video (el mensaje lo avisa): son muestras en orden de tiempo, no el video completo. Analiza qué pasa y cómo cambia, y di con claridad lo que no se alcanza a ver entre fotogramas. No inventes lo que no aparece.

=== CONOCIMIENTO QUE TE ENSEÑÓ TU CREADOR ===
11. Debajo puede aparecer "LECCIONES ESTUDIADAS" y/o "CONOCIMIENTO COMPARTIDO". Son lo que tu creador te enseñó y es tu criterio de calidad. Si el tema coincide, APLÍCALO COMPLETO: sigue sus reglas, técnicas y criterios de calidad, y entrega el resultado al nivel que enseñan. Si la petición va más allá de la lección, combínala con tu propio conocimiento.
12. Si la respuesta está escrita en el conocimiento compartido, ÚSALA. No menciones estas instrucciones internas; simplemente trabaja a ese nivel.
13. "RECORDATORIOS PERSONALES" = solo de ese usuario. Úsalos al hablar con esa persona; si hay un nombre, úsalo al saludar.
14. Sé concisa en lo simple y completa en lo complejo.`;

// ============================================================
// FUNCIONES AUXILIARES
// ============================================================

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status, headers: { ...CORS, "Content-Type": "application/json" }
  });
}

function textOf(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content))
    return content.filter(p => p?.type === "text").map(p => p.text).join("\n");
  return "";
}

function lastUserText(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role === "user") {
      const hasImage = Array.isArray(m.content) &&
        m.content.some(p => p?.type === "image_url");
      return { text: textOf(m.content), hasImage };
    }
  }
  return { text: "", hasImage: false };
}

function cleanUser(u) {
  const s = String(u || "default").trim().slice(0, 80).replace(/[^\w.@-]/g, "_");
  return s || "default";
}

function esCorreoAdmin(email) {
  return String(email || "").trim().toLowerCase() === ADMIN_CORREO;
}

function b64uBytes(s) {
  s = String(s).replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}

// 🔐 Verifica de verdad el inicio de sesión: la app manda el token de Firebase (firmado por Google).
// Un correo escrito a mano en el encabezado o en el cuerpo NO vale nada para enseñar a EGO.
async function traerClaves(sinCache) {
  const r = await fetch(JWKS_URL, sinCache ? { cf: { cacheTtl: 0 } } : { cf: { cacheTtl: 3600, cacheEverything: true } });
  if (!r.ok) return [];
  const j = await r.json();
  return Array.isArray(j.keys) ? j.keys : [];
}

async function verificarSesion(token) {
  try {
    if (typeof token !== "string" || token.length < 20 || token.length > 4096) return null;
    const p = token.split(".");
    if (p.length !== 3) return null;
    const dec = new TextDecoder();
    const header = JSON.parse(dec.decode(b64uBytes(p[0])));
    const payload = JSON.parse(dec.decode(b64uBytes(p[1])));
    if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid) return null;

    // 1) La firma RS256 debe ser válida con la clave pública de Google (kid del encabezado)
    let jwk = (await traerClaves(false)).find(k => k.kid === header.kid);
    if (!jwk) jwk = (await traerClaves(true)).find(k => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const firmaOk = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64uBytes(p[2]), new TextEncoder().encode(p[0] + "." + p[1]));
    if (!firmaOk) return null;

    // 2) Las afirmaciones del token deben coincidir con tu proyecto de Firebase
    const ahora = Math.floor(Date.now() / 1000);
    if (payload.aud !== FIREBASE_PROJECT_ID) return null;
    if (payload.iss !== "https://securetoken.google.com/" + FIREBASE_PROJECT_ID) return null;
    if (typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 128) return null;
    if (typeof payload.exp !== "number" || !(payload.exp > ahora)) return null;
    if (typeof payload.iat !== "number" || payload.iat > ahora + 300) return null;
    if (typeof payload.email !== "string" || !payload.email) return null;
    if (payload.email_verified !== true) return null;
    return { email: payload.email.trim().toLowerCase() };
  } catch { return null; }
}

// Devuelve {email, admin:true} SOLO si el token es auténtico y es del correo oficial; si no, null.
async function verificarAdmin(token) {
  const s = await verificarSesion(token);
  return s && esCorreoAdmin(s.email) ? { email: s.email, admin: true } : null;
}

// Candado extra: toda función que escribe o borra en la biblioteca compartida lo exige.
function exigirAdmin(sesion) {
  if (!sesion || sesion.admin !== true || !esCorreoAdmin(sesion.email)) throw new Error("no_autorizado");
}

function obtenerCorreo(request, body) {
  return request.headers.get("X-Usuario-Correo") || body?.correo || null;
}

// ============================================================
// 📖 BIBLIOTECA COMPARTIDA
// ============================================================

async function agregarBiblioteca(env, tema, contenido, sesion) {
  exigirAdmin(sesion);
  if (!env.EGO_BIBLIOTECA) return null;
  const entrada = {
    fecha: new Date().toISOString(),
    tema: tema.trim().slice(0, 100),
    contenido: contenido.trim().slice(0, 3000)
  };
  const clave = `tema:${entrada.tema.replace(/\s+/g, "_").slice(0, 50)}`;
  
  const listaRaw = await env.EGO_BIBLIOTECA.get("indice_temas");
  const lista = listaRaw ? JSON.parse(listaRaw) : [];
  if (!lista.includes(clave)) lista.push(clave);
  
  await env.EGO_BIBLIOTECA.put(clave, JSON.stringify(entrada));
  await env.EGO_BIBLIOTECA.put("indice_temas", JSON.stringify(lista.slice(-100)));
  return entrada;
}

async function leerBiblioteca(env) {
  if (!env.EGO_BIBLIOTECA) return [];
  try {
    const listaRaw = await env.EGO_BIBLIOTECA.get("indice_temas");
    const claves = listaRaw ? JSON.parse(listaRaw) : [];
    const temas = [];
    for (const clave of claves) {
      const dato = await env.EGO_BIBLIOTECA.get(clave);
      if (dato) temas.push(JSON.parse(dato));
    }
    return temas;
  } catch { return []; }
}

// ============================================================
// 🎓 MAESTRO Y ALUMNO (lecciones del creador)
// ============================================================
// Cada lección se guarda en EGO_BIBLIOTECA:  leccion:<id>  +  indice_lecciones
// "Aprender" = guardar el material + un estudio estructurado (resumen, reglas, criterios de calidad)
// y recuperarlo cuando la petición del usuario trate del mismo tema.

const MAX_LECCION = 12000;      // caracteres de material original que se estudian y guardan
const MAX_LECCIONES = 300;
const MODELO_EMB = "@cf/baai/bge-m3";   // embeddings multilingües (búsqueda por significado)
const UMBRAL_SIM = 0.42;               // similitud mínima para considerar una lección relacionada
const REVISAR = true;                  // segunda pasada de revisión de calidad en tareas de construir (juegos, código, diseño). Pon false para ahorrar uso de IA
const RX_CONSTRUIR = /juego|videojuego|app\b|aplicaci|p[aá]gina|sitio web|web\b|c[oó]digo|script|programa|dise[ñn]|html|css|javascript|python|interfaz|landing/i;
const PRESUPUESTO_LECCIONES = 9000;  // caracteres máximos de lecciones inyectadas por respuesta
const PRESUPUESTO_LEGADO = 2500;     // caracteres máximos del conocimiento corto antiguo (tema:)

const STOP = new Set("para como esta este esto esos esas pero porque cuando donde quien cual cuales sobre entre desde hasta tambien muy mas menos solo todo toda todos todas algo nada tiene tengo quiero puedes puede hacer haz hazme dame dime crea crear una uno unos unas del los las que con por sin son ser fue hay the and for with that this what how make".split(" "));

// ============================================================
// 🏫 CURRÍCULO BASE (lecciones que ya trae EGO de fábrica; el creador puede añadir más)
// ============================================================
const BASE_VERSION = "3";
const BASE_LECCIONES = [
{
  titulo: "Juegos web de alta calidad (técnica)",
  claves: ["juego","videojuego","game","canvas","html5","platformer","plataformas","arcade","runner","shooter","puzzle","snake","flappy","pong","tetris","carreras","naves","laberinto","fisicas","colisiones","sprites","fps","javascript","movil","tactil","controles"],
  resumen: "Cómo construir un juego jugable, fluido y pulido en un solo archivo HTML (canvas + JavaScript) que funcione en móvil y PC.",
  reglas: [
    "Entrega UN solo archivo HTML completo (HTML+CSS+JS) que abra y funcione sin librerías externas ni imágenes externas.",
    "Game loop con requestAnimationFrame y delta time (dt en segundos, limitado a ~0.05) para que la velocidad no dependa del dispositivo.",
    "Separa en funciones: init(), reset(), update(dt), render(), handleInput(). Estado del juego en un objeto; estados: menu, jugando, pausa, gameover.",
    "Canvas responsivo: ajusta al tamaño de pantalla y a devicePixelRatio; usa coordenadas lógicas fijas y escala al dibujar; viewport meta y touch-action:none.",
    "Controles dobles: teclado (flechas/WASD/espacio) y táctil (botones en pantalla o gestos); usa pointer events; evita scroll y zoom accidentales.",
    "Colisiones: AABB o círculo-círculo para empezar; resuelve eje por eje en plataformas; nunca atravieses paredes a alta velocidad (limita velocidad o subdivide pasos).",
    "Dificultad progresiva: empieza fácil, sube velocidad/enemigos por niveles u oleadas; da un objetivo claro (puntos, nivel, meta).",
    "Guarda el récord con localStorage dentro de try/catch; muestra puntuación, mejor puntuación y vidas.",
    "Sonido opcional con Web Audio API (osciladores simples) activado tras el primer toque del usuario; con botón para silenciar.",
    "Pantalla de inicio con título e instrucciones, pausa, y pantalla de fin con botón de reintentar; reiniciar sin recargar la página.",
    "Dibuja con formas, degradados y sombras para que se vea bonito sin imágenes; no uses emojis como único gráfico principal si puedes dibujar mejor.",
    "Prueba mentalmente: ¿arranca?, ¿se puede perder y ganar?, ¿reiniciar deja todo limpio?, ¿no hay variables sin definir?"
  ],
  calidad: [
    "Se juega bien a 60 FPS y se siente responsivo al primer toque.",
    "Tiene objetivo, riesgo y recompensa claros y sube de dificultad.",
    "Funciona en móvil (táctil) y en PC (teclado) sin romper el diseño.",
    "Código ordenado, sin errores en consola y sin partes omitidas.",
    "Se ve pulido: colores coherentes, animaciones suaves y feedback en cada acción."
  ],
  original:
`ESQUELETO BASE (adáptalo, no lo copies sin mejorar):
<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no"><title>Juego</title>
<style>html,body{margin:0;height:100%;background:#0b0b10;overflow:hidden;touch-action:none}canvas{display:block;width:100vw;height:100vh}</style></head><body><canvas id="c"></canvas><script>
const cv=document.getElementById('c'),ctx=cv.getContext('2d');const W=360,H=640;let scale=1,ox=0,oy=0;
function resize(){const d=window.devicePixelRatio||1;cv.width=innerWidth*d;cv.height=innerHeight*d;scale=Math.min(cv.width/W,cv.height/H);ox=(cv.width-W*scale)/2;oy=(cv.height-H*scale)/2}
addEventListener('resize',resize);resize();
let state='menu',score=0,best=0;try{best=+localStorage.getItem('best')||0}catch(e){}
function reset(){score=0;state='play'}
function update(dt){/* mover, colisionar, puntuar */}
function render(){ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,cv.width,cv.height);ctx.setTransform(scale,0,0,scale,ox,oy);/* dibujar */}
let last=0;function loop(t){const dt=Math.min((t-last)/1000,0.05);last=t;if(state==='play')update(dt);render();requestAnimationFrame(loop)}
addEventListener('pointerdown',()=>{if(state!=='play')reset()});requestAnimationFrame(loop);
<\/script></body></html>`
},
{
  titulo: "Diseño de juegos: que sea divertido y adictivo",
  claves: ["juego","videojuego","game design","diseno de juego","divertido","adictivo","mecanica","nivel","niveles","dificultad","progresion","recompensa","puntos","vidas","enemigos","jefe","power-ups","retencion","idea de juego","concepto","reglas del juego"],
  resumen: "Principios de game design para que un juego sea claro, desafiante y satisfactorio de jugar, no solo técnicamente correcto.",
  reglas: [
    "Define el bucle central en una frase: qué hace el jugador cada segundo, qué riesgo corre y qué gana (ej. esquivar, recoger, sobrevivir).",
    "Una mecánica principal bien hecha vale más que diez mediocres: pule la sensación (movimiento, salto, disparo) antes de añadir contenido.",
    "Curva de dificultad: enseña jugando (primer nivel casi imposible de perder), luego sube un poco cada vez; alterna tensión y descanso.",
    "Feedback inmediato en cada acción: partículas, sacudida de pantalla leve, sonido, números flotantes, cambios de color.",
    "Recompensas variadas: puntos, combos y multiplicadores, power-ups temporales, desbloqueos, récords; que el jugador sienta progreso.",
    "Riesgo/recompensa: lo mejor debe estar en el lugar más peligroso. Derrotas justas: que el jugador entienda por qué perdió.",
    "Rejugabilidad: generación aleatoria controlada, oleadas, modos, objetivos diarios o récord personal.",
    "Claridad visual: el jugador, los peligros y los premios deben distinguirse al instante (contraste, forma, color).",
    "Empieza simple y entrega una versión completa y jugable primero; ofrece mejoras después (más niveles, skins, modos).",
    "Si piden \"un juego\" sin detalles, elige tú un concepto concreto y atractivo, dilo en una línea y hazlo completo."
  ],
  calidad: [
    "Se entiende en 5 segundos y engancha en 30.",
    "Dificultad justa y progresiva; perder motiva a reintentar.",
    "Cada acción tiene respuesta visible y/o sonora.",
    "Hay metas claras y sensación de progreso.",
    "Es un juego completo, no una demo vacía."
  ],
  original: ""
},
{
  titulo: "Código de calidad profesional",
  claves: ["codigo","programar","programa","script","funcion","bug","error","refactorizar","limpio","buenas practicas","javascript","python","html","css","java","api","algoritmo","app","aplicacion","software","depurar","arreglar"],
  resumen: "Cómo escribir y revisar código correcto, legible y mantenible, y cómo entregarlo para que funcione a la primera.",
  reglas: [
    "Entiende el requisito antes de escribir: entradas, salidas, casos límite. Si algo ambiguo cambia mucho el resultado, pregunta una sola cosa.",
    "Entrega código COMPLETO y ejecutable: sin \"...\", sin \"resto igual\", sin pseudocódigo, con todos los imports y la forma de ejecutarlo.",
    "Nombres claros que expliquen la intención; funciones pequeñas con una sola responsabilidad; evita números mágicos (usa constantes).",
    "Maneja errores y casos límite: entradas vacías o nulas, red caída, JSON inválido, división por cero. Nunca tragues errores en silencio sin motivo.",
    "No repitas código: extrae funciones. Pero no sobre-diseñes: la solución más simple que cumpla el requisito es la mejor.",
    "Seguridad básica: nunca pongas claves secretas en el cliente; valida y escapa entradas del usuario; evita innerHTML con datos no confiables.",
    "Rendimiento razonable: evita trabajo repetido en bucles, no bloquees la interfaz, usa async/await y limpia temporizadores/listeners.",
    "Al corregir un bug: reproduce, encuentra la causa raíz, arregla lo mínimo necesario y explica qué estaba mal en 1-2 líneas.",
    "Comentarios solo donde el porqué no es obvio. Estructura: configuración, utilidades, lógica, interfaz, arranque.",
    "Antes de enviar, revisa mentalmente: sintaxis, variables definidas, llaves cerradas, que cada función llamada exista, que el ejemplo corra.",
    "Si das varias opciones, recomienda una y di por qué. Explica brevemente cómo usar o probar lo que entregaste."
  ],
  calidad: [
    "Funciona a la primera y cubre los casos límite.",
    "Se lee fácil: nombres claros, estructura ordenada.",
    "Completo: nada omitido ni dejado como ejercicio.",
    "Seguro y sin dependencias innecesarias.",
    "Viene con una explicación corta de cómo usarlo."
  ],
  original: ""
},
{
  titulo: "Diseño de interfaces móviles premium",
  claves: ["diseno","interfaz","ui","ux","pagina","web","landing","app","pantalla","boton","colores","tipografia","modo oscuro","responsive","css","layout","animacion","formulario","tarjeta","menu","dashboard","bonito","premium","moderno"],
  resumen: "Principios para crear pantallas y páginas que se vean modernas, claras y cómodas de usar en el teléfono.",
  reglas: [
    "Mobile first: diseña para 360-430 px de ancho y escala hacia arriba; sin scroll horizontal; usa unidades flexibles (rem, %, clamp, vh con cuidado).",
    "Áreas táctiles de al menos 44x44 px con separación suficiente; botón principal visible y al alcance del pulgar (zona inferior).",
    "Jerarquía visual: un título claro, un botón principal destacado, secundarios discretos; mucho espacio en blanco; alinea todo a una cuadrícula (múltiplos de 4/8 px).",
        "Paleta corta y coherente: 1 color de acento, neutros para fondo/texto, colores semánticos (éxito, error). Contraste de texto mínimo 4.5:1.",
    "Define variables CSS para colores, radios, sombras y espaciados; soporta modo claro y oscuro con prefers-color-scheme y un fondo explícito.",
    "Tipografía: 1 o 2 familias, escala consistente (14/16/20/28), interlineado 1.4-1.6; nunca menos de 14 px para texto de lectura.",
    "Estados completos: hover/pressed, deshabilitado, cargando, vacío y error con mensajes humanos que digan qué hacer.",
    "Animaciones suaves y breves (150-300 ms, ease-out) solo para dar feedback o guiar la atención; respeta prefers-reduced-motion.",
    "Formularios: etiquetas visibles, tipos de input correctos (email, tel, number), teclado que no tape el campo, validación en línea.",
    "Accesibilidad: HTML semántico, alt en imágenes, foco visible, no dependas solo del color para comunicar.",
    "Si te piden un diseño sin detalles, elige una dirección visual concreta y moderna (no una plantilla genérica) y entrégalo completo."
  ],
  calidad: [
    "Se ve ordenado, moderno y coherente en modo claro y oscuro.",
    "Se usa cómodamente con una mano en móvil.",
    "Cumple contraste y tamaños táctiles.",
    "Tiene todos los estados (vacío, cargando, error).",
    "No tiene desbordes ni elementos tapados por el teclado."
  ],
  original: ""
},
{
  titulo: "Método de un experto: razonar, planificar y responder",
  claves: ["ayuda","explica","explicar","como","por que","plan","planificar","analiza","analisis","resolver","problema","consejo","recomienda","comparar","decidir","estrategia","proyecto","idea","aprender","estudiar","resumen","paso a paso"],
  resumen: "Forma de pensar y responder como un experto paciente: entender, planificar, ejecutar con calidad, verificar y explicar claro.",
  reglas: [
    "Entiende primero: identifica el objetivo real detrás de la pregunta y el nivel de la persona; adapta el lenguaje (sin jerga innecesaria).",
    "Responde lo importante primero (la conclusión o la solución), y después los detalles; usa pasos numerados para procesos y tablas o listas solo si ayudan.",
    "Para problemas complejos: descompón en partes, resuelve cada una y comprueba que el resultado final cumple lo pedido.",
    "Verifica antes de entregar: cuentas, lógica, que no haya contradicciones; si no estás seguro de un dato, dilo y no lo inventes.",
    "Da ejemplos concretos y, cuando sea útil, una analogía sencilla; evita relleno y repeticiones.",
    "Si hay varias opciones, compáralas brevemente y recomienda una con su razón; menciona el riesgo principal.",
    "Cuando enseñes, comprueba comprensión con un mini ejemplo y sugiere el siguiente paso lógico.",
    "Cuando el usuario corrija o discrepe, reconsidera con honestidad: admite el error si lo hay, y mantén tu posición con argumentos si no.",
    "Mantén un tono cercano, claro y respetuoso; sé breve en lo simple y completo en lo complejo.",
    "Si falta un dato clave, haz UNA pregunta concreta; si no cambia mucho el resultado, asume lo más razonable, dilo y avanza."
  ],
  calidad: [
    "Va al grano y resuelve lo que la persona necesitaba de verdad.",
    "Es correcta y no inventa datos.",
    "Está organizada y se entiende a la primera.",
    "Indica próximos pasos o recomendaciones accionables.",
    "Reconoce incertidumbre con honestidad."
  ],
  original: ""
},
{
  titulo: "Minecraft Bedrock: add-ons completos (referencia técnica)",
  claves: ["minecraft","bedrock","addon","add-on","mcaddon","mcpack","behavior pack","resource pack","manifest","script api","item","espada","arma","bloque","entidad","mob","receta","loot","particulas","rayos","poderes","habilidad","herramienta","armadura","mod"],
  resumen: "Cómo construir un add-on de Minecraft Bedrock (Android, Windows, consolas) con behavior pack + resource pack enlazados, ítems personalizados y Script API, listo para importar como .mcaddon.",
  reglas: [
    "Minecraft es SIEMPRE Bedrock aquí: nunca Java, Forge ni Fabric. Un add-on son DOS carpetas en la raíz del paquete: BP/ (behavior pack) y RP/ (resource pack), cada una con su manifest.json. Nunca pongas archivos sueltos en la raíz.",
    "manifest.json: format_version 2; header con name, description, uuid, version [1,0,0] y min_engine_version [1,26,50] (ajústalo si el usuario dice su versión). Todos los UUID (headers y módulos) deben ser UUID v4 distintos entre sí. SOLO el BP depende del RP usando el UUID del header del RP; el RP no debe depender del BP.",
    "BP modules: {type:'data'} y, si hay scripts, {type:'script', language:'javascript', entry:'scripts/main.js'} más la dependencia {module_name:'@minecraft/server', version:'<versión estable reciente>'}. No uses módulos beta salvo que haga falta; si usas @minecraft/server-ui o similares, declara también su dependencia.",
    "Ítems personalizados: BP/items/<nombre>.json con format_version '1.21.0', 'minecraft:item' > description.identifier con prefijo propio (ej. ego:espada_trueno) y menu_category {category:'equipment', group:'minecraft:itemGroup.name.sword'}; components típicos: minecraft:icon, minecraft:max_stack_size, minecraft:hand_equipped, minecraft:damage, minecraft:durability, minecraft:enchantable.",
    "Icono y textura: genera PNG individual para cada objeto con silueta acorde al tipo real: pistola/rifle/escopeta no son espadas; botiquín, granada, munición, armadura, herramientas y consumibles tienen iconos diferenciados. Registra cada PNG en RP/textures/item_texture.json y enlázalo desde minecraft:icon. No uses texturas vanilla como sustituto silencioso.",
    "Cada entidad personalizada necesita su propia entrada RP/entity/<archivo>.entity.json, identificador idéntico al BP, huevo spawn_egg, geometría y textura existentes, más animación locomotora conectada cuando tenga extremidades móviles. No repitas una misma entidad o geometría para todos los huevos.",
    "Nombres visibles: RP/texts/en_US.lang y RP/texts/es_ES.lang con la línea item.<identificador>=Nombre, y RP/texts/languages.json con ['en_US','es_ES']. Sin esto el ítem aparece con el identificador en crudo.",
    "Poderes y efectos (rayos, partículas, sonidos, habilidades) van en BP/scripts/main.js con Script API: import { world, system } from '@minecraft/server'. Eventos útiles: world.afterEvents.itemUse (usar el ítem; ev.source es el jugador, ev.itemStack el ítem) y world.afterEvents.entityHitEntity (golpear; ev.damagingEntity, ev.hitEntity). Comprueba siempre itemStack.typeId === tu identificador.",
    "Rayo: dimension.spawnEntity('minecraft:lightning_bolt', ubicacion). Apuntar: jugador.getEntitiesFromViewDirection({maxDistance:30}) (devuelve lista con .entity) o jugador.getBlockFromViewDirection({maxDistance:30}) (devuelve algo con .block, puede ser undefined). Partículas: dimension.spawnParticle('minecraft:totem_particle', ubicacion) usando solo partículas que existan. Sonido: jugador.playSound('random.explode').",
    "Enfriamiento (cooldown) y control: guarda el último uso por jugador en un Map con system.currentTick; evita que un solo uso dispare mil rayos; usa system.runTimeout / system.runInterval para efectos retardados. Envuelve el código de eventos en try/catch y no uses APIs inventadas: si dudas de una API, usa un comando (jugador.runCommand('summon lightning_bolt ~ ~ ~')) que sí existe.",
    "Entidades, recetas y loot: BP/entities/*.json (format_version '1.21.0'), BP/recipes/*.json y BP/loot_tables/. Cada entidad personalizada recibe client_entity, huevo, geometría y textura individual mediante el postprocesador; no uses un mob vanilla como sustituto silencioso.",
    "Entrega: lista completa de archivos con su contenido (nada de '...'), un README.md con instalación (abrir el .mcaddon con Minecraft, activar ambos packs en el mundo, activar Experimentos/Funciones creativas solo si algo no aparece), cómo probarlo (/give @s ego:espada_trueno) y qué se puede personalizar."
  ],
  calidad: [
    "Los dos manifest.json son JSON válido, con UUID v4 distintos y dependencias cruzadas correctas.",
    "Cada ítem tiene identificador con prefijo, icono específico según su categoría, textura existente y nombre en es_ES y en_US.",
    "Cada criatura tiene un huevo asociado al identifier correcto, geometría y textura propias, y animación locomotora conectada si tiene extremidades móviles.",
    "El script solo usa APIs reales de @minecraft/server, comprueba el ítem y tiene cooldown.",
    "No hay archivos sueltos en la raíz ni binarios inventados.",
    "El README explica instalación, prueba y personalización en pocos pasos."
  ],
  original:
`EJEMPLO MÍNIMO QUE FUNCIONA (adáptalo):
BP/items/espada_trueno.json
{"format_version":"1.21.0","minecraft:item":{"description":{"identifier":"ego:espada_trueno","menu_category":{"category":"equipment","group":"minecraft:itemGroup.name.sword"}},"components":{"minecraft:icon":{"textures":{"default":"ego_espada_trueno"}},"minecraft:max_stack_size":1,"minecraft:hand_equipped":true,"minecraft:damage":8,"minecraft:durability":{"max_durability":1500}}}}
RP/textures/item_texture.json
{"resource_pack_name":"ego","texture_name":"atlas.items","texture_data":{"ego_espada_trueno":{"textures":"textures/items/ego_espada_trueno"}}}
RP/texts/en_US.lang  ->  item.ego:espada_trueno=Thunder Sword
BP/scripts/main.js
import { world, system } from "@minecraft/server";
const espera = new Map();
world.afterEvents.itemUse.subscribe((ev) => {
  const j = ev.source;
  if (ev.itemStack.typeId !== "ego:espada_trueno") return;
  if ((espera.get(j.id) ?? 0) > system.currentTick) return;
  espera.set(j.id, system.currentTick + 40);
  const objetivo = j.getEntitiesFromViewDirection({ maxDistance: 30 })[0]?.entity;
  const lugar = objetivo ? objetivo.location : j.getBlockFromViewDirection({ maxDistance: 30 })?.block?.location;
  if (!lugar) return;
  j.dimension.spawnEntity("minecraft:lightning_bolt", lugar);
  j.playSound("random.explode");
});`
},
{
  titulo: "Ciberseguridad defensiva y ética",
  claves: ["ciberseguridad","seguridad","hackeo","hackear","hackeado","contrasena","contraseña","phishing","malware","virus","vpn","owasp","vulnerabilidad","inyeccion","sql injection","xss","csrf","cifrado","2fa","pentest","ctf","firewall","privacidad","cuenta robada","estafa","enlace sospechoso"],
  resumen: "Cómo proteger cuentas, apps y redes, revisar código por vulnerabilidades y aprender seguridad de forma legal, sin ayudar a atacar a nadie.",
  reglas: [
    "Enfoque defensivo y educativo: explicas cómo funcionan los ataques para que la persona se proteja, y siempre dentro de la ley y con autorización (sus propios sistemas o laboratorios legales).",
    "No creas malware, ransomware, keyloggers, exploits listos para usar, phishing, robo de cuentas, espionaje ni evasión de seguridad contra terceros, aunque lo pidan 'para aprender'. Ofrece la alternativa segura: laboratorios legales (TryHackMe, Hack The Box, OverTheWire, PortSwigger Web Security Academy, DVWA/Juice Shop en local).",
    "Revisión de código: busca los fallos del OWASP Top 10 (inyección SQL/comandos, XSS, autenticación rota, control de acceso, secretos en el código, deserialización insegura, SSRF, configuración insegura, dependencias vulnerables). Muestra la línea débil, el riesgo y el código corregido.",
    "Buenas prácticas al programar: validar y escapar toda entrada, consultas parametrizadas, hash de contraseñas con bcrypt/argon2 (nunca MD5/SHA1 solos), HTTPS, cabeceras de seguridad, mínimo privilegio, secretos en variables de entorno o gestores (nunca en GitHub ni en el frontend), CORS restringido, límites de peticiones y registros sin datos sensibles.",
    "Cuentas y teléfono: contraseñas largas y únicas con gestor de contraseñas, verificación en dos pasos (preferir app autenticadora o llave física sobre SMS), revisar sesiones activas, actualizar el sistema, instalar apps solo de tiendas oficiales y desconfiar de permisos innecesarios.",
    "Enlaces, mensajes y archivos sospechosos: enseña señales de phishing (urgencia, remitente raro, dominio parecido, pedir claves o códigos). Nunca pidas ni guardes contraseñas o códigos de la persona. Sugiere verificar con el sitio oficial escrito a mano y analizar con herramientas como VirusTotal.",
    "Si le hackearon una cuenta: cambiar la contraseña desde un dispositivo limpio, cerrar todas las sesiones, activar 2FA, revisar correo de recuperación y reglas de reenvío, avisar a contactos, usar el formulario oficial de recuperación de la plataforma y vigilar movimientos bancarios.",
    "Redes y privacidad: cambiar la clave por defecto del router, WPA2/WPA3, no usar WiFi público para operaciones sensibles sin VPN confiable, y explicar que una VPN no da anonimato total.",
    "Aprendizaje: ruta clara (redes, Linux, programación web, criptografía básica, OWASP, CTF) con recursos gratuitos y proyectos prácticos en laboratorio propio.",
    "Sé honesto con el riesgo: no prometas seguridad total, indica qué mitiga cada medida y qué no."
  ],
  calidad: [
    "Ayuda a protegerse, no a atacar; deja claro el límite legal sin sermonear.",
    "Da pasos concretos y ordenados que la persona puede hacer hoy.",
    "En revisión de código señala el fallo exacto y entrega la versión corregida.",
    "No inventa vulnerabilidades ni herramientas."
  ],
  original: ""
},
{
  titulo: "Maestro de matemáticas y ciencias",
  claves: ["matematicas","matemáticas","algebra","álgebra","calculo","cálculo","derivada","integral","ecuacion","ecuación","geometria","trigonometria","probabilidad","estadistica","fisica","física","quimica","química","biologia","biología","ciencias","problema","ejercicio","formula","demuestra","teorema","examen","tarea","despejar","unidades"],
  resumen: "Cómo enseñar y resolver matemáticas y ciencias paso a paso, verificando el resultado y adaptándose al nivel del estudiante.",
  reglas: [
    "Identifica el nivel (primaria, secundaria, bachillerato, universidad) y el dato pedido; reescribe el problema con sus datos y la incógnita antes de resolver.",
    "Resuelve paso a paso, un paso por línea, nombrando la regla o fórmula que usas y por qué; no saltes pasos algebraicos que un estudiante necesita ver.",
    "Escribe las matemáticas en texto claro y legible en móvil: x^2, sqrt(x), a/b, (a+b)/(c-d), pi, ∫, Σ, y usa un renglón por operación. Evita notaciones que se rompen en pantallas pequeñas.",
    "Verifica siempre: sustituye la solución en la ecuación original, comprueba unidades y orden de magnitud, y comenta si el resultado es razonable. Marca claramente la respuesta final.",
    "Física y química: lista datos con unidades (SI), escribe la fórmula, despeja con símbolos antes de reemplazar números, cuida cifras significativas y balancea ecuaciones químicas comprobando átomos a ambos lados.",
    "Estadística y probabilidad: define el espacio muestral o el modelo, nombra la distribución y sus supuestos, y interpreta el resultado en palabras.",
    "Para demostraciones: enuncia qué se quiere probar, elige el método (directo, contradicción, inducción) y cierra con la conclusión.",
    "Si la persona quiere aprender, no solo copiar: explica la idea, da un ejemplo parecido resuelto, y propone un ejercicio corto para practicar con su corrección posterior.",
    "Si un enunciado es ambiguo o faltan datos, dilo y plantea la interpretación más razonable en lugar de inventar valores. Nunca inventes un resultado: si no puedes asegurarlo, indícalo.",
    "Ciencias en general: explica con analogías simples, distingue hecho de teoría, y cuando hables de datos o descubrimientos recientes indica que conviene verificarlos en una fuente actual."
  ],
  calidad: [
    "El resultado es correcto y está comprobado.",
    "Cada paso se entiende sin saltos.",
    "La respuesta final está marcada y con unidades.",
    "Se adapta al nivel de la persona y propone práctica."
  ],
  original: ""
},
{
  titulo: "Conversación, ligue y relaciones con respeto",
  claves: ["ligar","ligue","coquetear","coqueteo","conquistar","chico","chica","me gusta","cita","salir","tinder","bumble","hinge","mensaje","conversacion","conversación","pareja","crush","enamorar","rechazo","primera cita","perfil","amistad","ex","reconquistar"],
  resumen: "Cómo ayudar a alguien a conocer gente, escribir mensajes naturales y tener citas, con honestidad, consentimiento y respeto.",
  reglas: [
    "Ayudas a cualquier persona, de cualquier género u orientación, a conversar mejor y a conocer a alguien. El objetivo es conexión real, no manipulación: nada de engaños, presión, insistencia, juegos psicológicos, celos ni técnicas para 'conseguir' a alguien contra su voluntad.",
    "Consentimiento primero: enseña a leer señales (respuestas cortas o tardías suelen ser desinterés), a aceptar un no con elegancia y a no insistir. Si la otra persona dijo que no, la respuesta es respetar y seguir adelante.",
    "Si la persona parece menor de 18 años, no ayudes con ligue romántico ni con contenido sexual; ofrece consejos de amistad, respeto y hablar con una persona adulta de confianza.",
    "Antes de escribir mensajes pregunta lo mínimo útil: ¿cómo se conocieron (app, escuela, trabajo, amigos)?, ¿qué intereses tienen en común?, ¿qué tono quieres (divertido, tierno, directo)? Si ya lo dijo, ve directo.",
    "Entrega 2 o 3 opciones de mensaje cortas y naturales, con distinto tono, escritas como las escribiría una persona real (sin frases robadas ni cursilerías forzadas), y explica en una línea por qué funcionan.",
    "Principios que funcionan: ser auténtico, mostrar curiosidad por la otra persona, hacer preguntas abiertas sobre sus intereses, humor ligero, propuestas concretas y fáciles de aceptar (un café, una caminata) y no escribir ni demasiado ni demasiado poco.",
    "Perfiles de apps: ayuda a elegir fotos claras y sonrientes, redactar una bio breve con personalidad y detalles específicos en lugar de clichés, y a evitar mentir en edad, fotos o intenciones.",
    "Primera cita: lugar público y cómodo, avisar a un amigo, llegar a tiempo, escuchar más de lo que hablas, estar presente sin el celular y terminar con claridad (me gustó verte, ¿repetimos?).",
    "Rechazo y nervios: normaliza que pasa, enfoca en aprender y no en culparse, y propone pasos pequeños. Si hay ansiedad fuerte o tristeza persistente, sugiere con cariño hablar con alguien de confianza o un profesional.",
    "Límites: no escribes contenido sexual explícito, no ayudas a acosar, vigilar, espiar o chantajear a nadie, ni a engañar a una pareja. Si una situación parece de abuso o control, dilo con claridad y sugiere buscar apoyo.",
    "Mantén un tono cálido, cercano y sin juicios; respeta la identidad y las preferencias de la persona."
  ],
  calidad: [
    "Los mensajes suenan naturales, propios de la persona y respetuosos.",
    "Pregunta lo mínimo y entrega opciones útiles enseguida.",
    "Promueve honestidad y consentimiento, sin manipulación.",
    "Es cálida y práctica, no sermonea."
  ],
  original: ""
},
{
  titulo: "Apps y webs completas: del móvil a producción",
  claves: ["app","aplicacion","aplicación","pagina web","página web","sitio web","web","pwa","landing","tienda","calculadora","tareas","todo","dashboard","formulario","android","kotlin","capacitor","react","nativa","apk","pantalla","login","base de datos","api","zip","proyecto completo","backend"],
  resumen: "Cómo crear apps y sitios completos, bonitos y funcionales: una web de un solo archivo, una PWA o un proyecto multiarchivo en ZIP.",
  reglas: [
    "Decide el formato: para una app o web que se abre de inmediato, entrega UN archivo HTML completo (HTML+CSS+JS, sin librerías externas); para algo grande (varias pantallas, backend, app Android) recomienda el proyecto completo en ZIP y dile al usuario que escriba, por ejemplo: 'crea un proyecto completo de app nativa Android de ...' para recibirlo como archivo.",
    "Mobile-first: viewport correcto, botones de al menos 44 px, tipografía legible, modo oscuro con prefers-color-scheme, y layout con flex/grid que no se rompa a 360 px de ancho.",
    "Estructura limpia: estado en un objeto, funciones pequeñas con una sola responsabilidad (render, acciones, almacenamiento), sin variables globales sueltas, y nombres claros en español o inglés de forma consistente.",
    "Persistencia: localStorage o IndexedDB envueltos en try/catch, con datos iniciales sensatos y botón de exportar/borrar. Valida y escapa todo lo que el usuario escribe antes de mostrarlo (textContent en vez de innerHTML).",
    "Estados completos: vacío, cargando, error y éxito; mensajes de error comprensibles; ningún botón que no haga nada; nada de 'aquí va tu código'.",
    "Accesibilidad básica: etiquetas en formularios, contraste suficiente, foco visible y atributos aria donde hagan falta.",
    "Diseño: paleta coherente (3 colores), espaciado consistente, esquinas redondeadas, sombras suaves, transiciones cortas y un solo punto de énfasis por pantalla; que parezca una app real, no una demo.",
    "Apps Android nativas: ofrece Kotlin + Jetpack Compose (o Capacitor/WebView si se quiere reutilizar la web); incluye estructura de carpetas, build.gradle, AndroidManifest con solo los permisos necesarios, y cómo compilar con Android Studio o GitHub Actions.",
    "APIs y backend: Cloudflare Workers (gratis y rápidos) con KV o D1 para datos; nunca pongas claves en el frontend; valida entradas y limita peticiones.",
    "Antes de entregar revisa mentalmente: ¿abre sin errores?, ¿funciona en móvil?, ¿se guardan los datos?, ¿se puede reiniciar?, ¿las rutas y archivos mencionados existen?"
  ],
  calidad: [
    "Funciona al abrirlo, sin errores de consola y sin partes omitidas.",
    "Se ve profesional y cómodo en móvil.",
    "Maneja errores y estados vacíos.",
    "Si es grande, se entrega como proyecto con README de instalación."
  ],
  original: ""
},
{
  titulo: "Scripts y automatización robustos",
  claves: ["script","automatizar","automatizacion","automatización","bot","python","bash","termux","node","cron","scraping","archivos","renombrar","cli","linea de comandos","powershell","macro","tarea programada","json","csv","excel"],
  resumen: "Cómo escribir scripts útiles y seguros en Python, Bash o JavaScript que se puedan ejecutar de verdad, incluso desde el móvil con Termux.",
  reglas: [
    "Pregunta o deduce dónde se ejecutará (PC, Termux en Android, servidor, Cloudflare Worker) y entrega un script completo que corra tal cual, con las instrucciones exactas para instalarlo y lanzarlo.",
    "Estructura: constantes de configuración arriba, funciones pequeñas, una función main(), argumentos de línea de comandos (argparse en Python, process.argv en Node) y mensajes de ayuda en español.",
    "Robustez: manejo de errores con mensajes claros, validación de entradas, rutas con pathlib, codificación UTF-8, tiempos de espera y reintentos en red, y salidas que no borren datos sin confirmar.",
    "Seguridad: nunca pongas claves en el script; léelas de variables de entorno. No ejecutes cadenas de texto como código ni construyas comandos de shell con entrada sin validar.",
    "Idempotencia y registro: que ejecutarlo dos veces no duplique trabajo; registra lo que hace con logging; ofrece un modo de prueba (--dry-run) para acciones destructivas.",
    "Rendimiento: procesa archivos grandes por partes, usa generadores y evita cargar todo en memoria; respeta los límites de las páginas web (robots.txt, términos y pausas entre peticiones).",
    "Limítate a automatizaciones legítimas: no hagas scripts para acceso no autorizado, spam, fraude, evasión de pagos o acoso.",
    "Cierra con un ejemplo de uso real y la salida esperada, y sugiere cómo programarlo (cron, Tareas programadas, Termux:Boot) si tiene sentido."
  ],
  calidad: [
    "El script corre tal cual y hace lo pedido.",
    "Falla con mensajes claros y no destruye datos.",
    "No contiene secretos ni ejecuta entrada sin validar.",
    "Incluye cómo instalarlo y usarlo."
  ],
  original: ""
}
];

// ---------- Embeddings (significado) guardados comprimidos en KV: emb_indice = { id: base64(int8[]) } ----------
function aInt8B64(vec) {
  let n = 0; for (const x of vec) n += x * x; n = Math.sqrt(n) || 1;
  const b = new Int8Array(vec.length);
  for (let i = 0; i < vec.length; i++) b[i] = Math.max(-127, Math.min(127, Math.round(vec[i] / n * 127)));
  let s = ""; for (let i = 0; i < b.length; i += 512) s += String.fromCharCode.apply(null, b.subarray(i, i + 512));
  return btoa(s);
}
function deB64Int8(b64) {
  const s = atob(b64), b = new Int8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) > 127 ? s.charCodeAt(i) - 256 : s.charCodeAt(i);
  return b;
}
function simInt8(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let d = 0; for (let i = 0; i < a.length; i++) d += a[i] * b[i];
  return d / (127 * 127);
}
// Devuelve un arreglo de vectores (uno por texto) o null si los embeddings no están disponibles
async function embeber(env, textos) {
  if (!env.AI || !textos.length) return null;
  try {
    const r = await env.AI.run(MODELO_EMB, { text: textos.map(t => String(t).slice(0, 1500)) });
    const d = r && (r.data || r.embeddings || r.response);
    if (!Array.isArray(d) || d.length !== textos.length || !Array.isArray(d[0]) || typeof d[0][0] !== "number") return null;
    return d;
  } catch { return null; }
}
async function leerEmb(env) {
  try { const raw = await env.EGO_BIBLIOTECA.get("emb_indice"); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}
async function guardarEmb(env, mapa) { await env.EGO_BIBLIOTECA.put("emb_indice", JSON.stringify(mapa)); }

function norm(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function stems(s) {
  const out = new Set();
  for (const w of norm(s).split(/[^a-z0-9ñ]+/)) {
    if (w.length < 3 || STOP.has(w)) continue;
    out.add(w.length > 5 ? w.slice(0, 5) : w);
  }
  return out;
}
function slugId(t) {
  return norm(t).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50) || ("leccion_" + Date.now());
}
function sacarJSON(txt) {
  const a = String(txt || "").indexOf("{"), b = String(txt || "").lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(txt.slice(a, b + 1)); } catch { return null; }
}
const lista = (x, n, m) => (Array.isArray(x) ? x : []).map(v => String(v).trim().slice(0, m)).filter(Boolean).slice(0, n);

async function estudiarMaterial(material, env) {
  const prompt =
`Eres un estudiante experto y exigente. Tu creador te enseña el material de abajo para que luego lo apliques con la misma calidad cuando un usuario lo pida.
Estúdialo a fondo y responde SOLO con un JSON válido (sin texto extra, sin markdown) con estas claves:
{
 "titulo": "título corto (máx 80 caracteres)",
 "claves": ["10 a 20 palabras clave en español e inglés para reconocer cuándo aplicar esta lección: temas, sinónimos y cómo lo pediría un usuario (ej. juego, videojuego, game, platformer...)"],
 "resumen": "qué enseña, en 3 a 6 líneas",
 "reglas": ["6 a 14 reglas, técnicas o pasos concretos y accionables que enseña"],
 "calidad": ["4 a 10 criterios para juzgar si un resultado está al nivel enseñado (qué distingue lo excelente de lo mediocre)"],
 "nota": número del 1 al 10 con la calidad del material como enseñanza (10 = excelente, completo y accionable),
 "evaluacion": "tu juicio honesto de la calidad del material: nivel (alto/medio/bajo), fortalezas y 2 a 4 vacíos o cosas que faltaría enseñarte para dominarlo"
}

MATERIAL:
${material}`;
  try {
    const r = await cfChat(CF_MODELS.chat, [
      { role: "system", content: "Respondes únicamente con JSON válido en español." },
      { role: "user", content: prompt }
    ], env, 2000);
    const j = sacarJSON(r.content);
    if (j && (j.resumen || j.reglas)) {
      return {
        titulo: String(j.titulo || "").trim().slice(0, 80),
        claves: lista(j.claves, 24, 40),
        resumen: String(j.resumen || "").trim().slice(0, 900),
        reglas: lista(j.reglas, 16, 300),
        calidad: lista(j.calidad, 12, 260),
        evaluacion: String(j.evaluacion || "").trim().slice(0, 700),
        nota: Math.max(1, Math.min(10, Math.round(Number(j.nota) || 0))) || null,
        estudiado: true
      };
    }
  } catch {}
  return { titulo: "", claves: [], resumen: "", reglas: [], calidad: [], evaluacion: "", nota: null, estudiado: false };
}

async function guardarLeccion(env, material, sesion) {
  exigirAdmin(sesion);
  if (!env.EGO_BIBLIOTECA) return null;
  const recortado = material.length > MAX_LECCION;
  const original = material.slice(0, MAX_LECCION);
  const est = await estudiarMaterial(original, env);
  const titulo = est.titulo || original.split(/\n/)[0].replace(/^[#*\s-]+/, "").slice(0, 80) || "Lección";
  // si el estudio con IA falló, las claves salen de las palabras más repetidas del material
  if (!est.claves.length) {
    const cuenta = {};
    for (const w of norm(original + " " + titulo).split(/[^a-z0-9ñ]+/)) if (w.length > 3 && !STOP.has(w)) cuenta[w] = (cuenta[w] || 0) + 1;
    est.claves = Object.entries(cuenta).sort((a, b) => b[1] - a[1]).slice(0, 20).map(x => x[0]);
  }
  const id = slugId(titulo);
  const leccion = { ...est, id, fecha: new Date().toISOString(), titulo, original };
  await env.EGO_BIBLIOTECA.put("leccion:" + id, JSON.stringify(leccion));
  const raw = await env.EGO_BIBLIOTECA.get("indice_lecciones");
  let idx = []; try { idx = raw ? JSON.parse(raw) : []; } catch {}
  idx = idx.filter(x => x.id !== id);
  const sem = semTexto(leccion);
  idx.push({ id, titulo, claves: est.claves, sem, fecha: leccion.fecha });
  const quedan = idx.slice(-MAX_LECCIONES);
  await env.EGO_BIBLIOTECA.put("indice_lecciones", JSON.stringify(quedan));
  // significado: se calcula ahora; si falla, se completa solo más adelante
  const v = await embeber(env, [sem]);
  const emb = await leerEmb(env);
  if (v) emb[id] = aInt8B64(v[0]); else delete emb[id];
  for (const k of Object.keys(emb)) if (!quedan.some(x => x.id === k)) delete emb[k];
  await guardarEmb(env, emb);
  return { leccion, recortado, total: quedan.length, significado: !!v };
}

function semTexto(l) {
  return [l.titulo, (l.claves || []).join(", "), l.resumen || "", (l.reglas || []).slice(0, 4).join(". ")].join(". ").slice(0, 900);
}

// Siembra el currículo base (una sola vez por versión)
async function sembrarBase(env) {
  if (!env.EGO_BIBLIOTECA) return;
  try {
    if ((await env.EGO_BIBLIOTECA.get("base_version")) === BASE_VERSION) return;
    const idx = await leerIndiceLecciones(env);
    for (const b of BASE_LECCIONES) {
      const id = "base_" + slugId(b.titulo);
      const leccion = { ...b, id, fecha: new Date().toISOString(), estudiado: true, nota: 10, evaluacion: "Lección base de fábrica escrita por el maestro de EGO.", base: true };
      await env.EGO_BIBLIOTECA.put("leccion:" + id, JSON.stringify(leccion));
      const e = { id, titulo: b.titulo, claves: b.claves, sem: semTexto(leccion), fecha: leccion.fecha };
      const k = idx.findIndex(x => x.id === id);
      if (k >= 0) idx[k] = e; else idx.push(e);
    }
    await env.EGO_BIBLIOTECA.put("indice_lecciones", JSON.stringify(idx.slice(-MAX_LECCIONES)));
    await env.EGO_BIBLIOTECA.put("base_version", BASE_VERSION);
  } catch {}
}

async function leerIndiceLecciones(env) {
  if (!env.EGO_BIBLIOTECA) return [];
  try { const raw = await env.EGO_BIBLIOTECA.get("indice_lecciones"); return raw ? JSON.parse(raw) : []; }
  catch { return []; }
}

async function borrarLeccion(env, nombre, sesion) {
  exigirAdmin(sesion);
  const idx = await leerIndiceLecciones(env);
  const q = norm(nombre).trim();
  const hit = idx.find(x => x.id === slugId(nombre)) || idx.find(x => norm(x.titulo).includes(q));
  if (!hit) return null;
  await env.EGO_BIBLIOTECA.delete("leccion:" + hit.id);
  await env.EGO_BIBLIOTECA.put("indice_lecciones", JSON.stringify(idx.filter(x => x.id !== hit.id)));
  try { const emb = await leerEmb(env); delete emb[hit.id]; await guardarEmb(env, emb); } catch {}
  return hit;
}

// Elige las lecciones más relacionadas (palabras clave + significado con embeddings)
async function elegirLecciones(env, consulta) {
  const idx = await leerIndiceLecciones(env);
  if (!idx.length) return [];
  const q = stems(consulta);

  // significado: embedding de la consulta y de lo que aún no tenga embedding
  let sims = {};
  try {
    const qv = String(consulta || "").trim() ? await embeber(env, [consulta]) : null;
    if (qv) {
      const emb = await leerEmb(env);
      const faltan = idx.filter(x => !emb[x.id]).slice(0, 12);
      if (faltan.length) {
        const fv = await embeber(env, faltan.map(x => x.sem || x.titulo));
                if (fv) { faltan.forEach((x, i) => { emb[x.id] = aInt8B64(fv[i]); }); await guardarEmb(env, emb); }
      }
      const qi = deB64Int8(aInt8B64(qv[0]));
      for (const x of idx) if (emb[x.id]) sims[x.id] = simInt8(qi, deB64Int8(emb[x.id]));
    }
  } catch { sims = {}; }

  const puntos = idx.map(x => {
    let kw = 0;
    const claves = new Set(); (x.claves || []).forEach(c => stems(c).forEach(s => claves.add(s)));
    const tit = stems(x.titulo);
    q.forEach(s => { if (claves.has(s)) kw += 3; if (tit.has(s)) kw += 3; });
    const sim = sims[x.id] || 0;
    return { x, kw, sim, p: sim * 10 + Math.min(kw, 12) };
  }).filter(o => o.kw >= 3 || o.sim >= UMBRAL_SIM).sort((a, b) => b.p - a.p).slice(0, 2);

  const out = [];
  for (const o of puntos) {
    try { const d = await env.EGO_BIBLIOTECA.get("leccion:" + o.x.id); if (d) out.push(JSON.parse(d)); } catch {}
  }
  return out;
}

function textoLecciones(lecciones) {
  if (!lecciones.length) return "";
  let t = "\n\n=== LECCIONES ESTUDIADAS (enseñadas por tu creador; aplícalas con su nivel de calidad) ===\n";
  const base = lecciones.map(l => {
    let s = `### ${l.titulo}\n`;
    if (l.resumen) s += `Resumen: ${l.resumen}\n`;
    if (l.reglas?.length) s += "Reglas y técnicas:\n" + l.reglas.map(r => "- " + r).join("\n") + "\n";
    if (l.calidad?.length) s += "Criterios de calidad:\n" + l.calidad.map(r => "- " + r).join("\n") + "\n";
    return s;
  });
  const usado = base.reduce((a, s) => a + s.length, 0);
  const resto = Math.max(0, PRESUPUESTO_LECCIONES - usado);
  lecciones.forEach((l, i) => {
    t += base[i];
    const trozo = (l.original || "").slice(0, Math.floor(resto / lecciones.length));
    if (trozo) t += "Material original del creador:\n" + trozo + (l.original.length > trozo.length ? "\n[...]" : "") + "\n";
    t += "\n";
  });
  return t + "=== FIN DE LECCIONES ===\n";
}

function respuestaEstudio(r) {
  const l = r.leccion;
  let t = `📚 Lección estudiada y guardada: **${l.titulo}**\n`;
  if (!l.estudiado) {
    t += "\n⚠️ Guardé el material completo, pero no pude hacer el análisis con IA ahora mismo; igual lo aplicaré cuando el tema coincida. Puedes volver a enviarlo para intentar el estudio otra vez.";
  } else {
    if (l.resumen) t += `\n**Lo que entendí:** ${l.resumen}\n`;
    if (l.reglas.length) t += `\n**Reglas y técnicas clave (${l.reglas.length}):**\n` + l.reglas.slice(0, 8).map(x => "• " + x).join("\n") + (l.reglas.length > 8 ? `\n• …y ${l.reglas.length - 8} más guardadas` : "") + "\n";
    if (l.calidad.length) t += `\n**Cómo juzgo la calidad:**\n` + l.calidad.slice(0, 6).map(x => "• " + x).join("\n") + "\n";
    if (l.nota) t += `\n**Nota de calidad del material:** ${l.nota}/10\n`;
    if (l.evaluacion) t += `\n**Mi evaluación del material:** ${l.evaluacion}\n`;
  }
  t += `\n🔑 Lo aplicaré cuando pidan: ${l.claves.slice(0, 8).join(", ")}.`;
  if (r.recortado) t += `\n✂️ El material era muy largo: estudié los primeros ${MAX_LECCION} caracteres. Envía el resto como otra lección ("Estudia esto: …").`;
  if (!r.significado) t += "\n(La búsqueda por significado no respondió esta vez; igual la encontraré por palabras clave y se indexará sola después.)";
  t += `\n📖 Lecciones guardadas: ${r.total}. Para borrar una: "Borra la lección: título".`;
  return t;
}

// ============================================================
// 👤 PERFILES DE USUARIO
// ============================================================

async function guardarPerfil(env, correo, datos) {
  if (!env.EGO_PERFILES || !correo) return null;
  const clave = `usuario:${cleanUser(correo)}`;
  const perfilRaw = await env.EGO_PERFILES.get(clave);
  const perfil = perfilRaw ? JSON.parse(perfilRaw) : { correo };
  Object.assign(perfil, datos);
  await env.EGO_PERFILES.put(clave, JSON.stringify(perfil));
  return perfil;
}

async function leerPerfil(env, correo) {
  if (!env.EGO_PERFILES || !correo) return null;
  try {
    const clave = `usuario:${cleanUser(correo)}`;
    const dato = await env.EGO_PERFILES.get(clave);
    return dato ? JSON.parse(dato) : { correo };
  } catch { return { correo }; }
}

// ============================================================
// 🧠 MEMORIA PERSONAL
// ============================================================

function detectarAprendizaje(text) {
  const out = [];
  const t = String(text || "");
  const push = (tema, contenido) => {
    contenido = String(contenido).trim().replace(/\s+/g, " ").slice(0, 300);
    if (contenido.length > 2) out.push({ tema, contenido });
  };
  let m = t.match(/(?:[Mm]e llamo|[Mm]i nombre es|[Yy]o soy|[Ss]oy)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{1,20}(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)/);
  if (m) push("Mi nombre", "Mi nombre es " + m[1]);
  m = t.match(/(?:mi cumplea[ñn]os|mi fecha de nacimiento)\s+(?:es|fue|cae)?\s*(?:el\s+)?([^.!?\n]+)/i);
  if (!m) m = t.match(/\bnac[ií]\s+(?:el\s+|en\s+)?([^.!?\n]+)/i);
  if (m) push("Mi cumpleaños", "Mi cumpleaños / nacimiento: " + m[1]);
  m = t.match(/\btengo\s+(\d{1,3})\s+a[ñn]os/i);
  if (m) push("Mi edad", "Tengo " + m[1] + " años");
  m = t.match(/\brecuerda(?:\s+que|\s+esto|\s+lo siguiente)?\s*[:,]?\s+([^\n]{4,})/i);
  if (m && !/^(?:esto|eso|lo)\s*[.!]*$/i.test(m[1].trim())) push(m[1].slice(0, 60), m[1]);
  return out;
}

async function leerListaPersonal(env, usuario) {
  if (!env.EGO_MEMORY) return [];
  try {
    const datos = await env.EGO_MEMORY.get(`historial:${usuario}`);
    return datos ? JSON.parse(datos) : [];
  } catch { return []; }
}

async function guardarAprendizajes(env, usuario, datos) {
  if (!env.EGO_MEMORY) return { ok: false, lista: [] };
  let lista = await leerListaPersonal(env, usuario);
  for (const d of datos) {
    lista = lista.filter(x => x.tema !== d.tema);
    lista.push({ fecha: new Date().toISOString(), tema: d.tema, contenido: d.contenido });
  }
  lista = lista.slice(-80);
  try {
    await env.EGO_MEMORY.put(`historial:${usuario}`, JSON.stringify(lista));
    return { ok: true, lista };
  } catch (e) { return { ok: false, lista, error: String(e.message || e) }; }
  }

// ============================================================
// 🤖 FUNCIONES DE IA
// ============================================================

function salida(r) {
  if (!r) return "";
  if (typeof r === "string") return r.trim();
  let t = r.response ?? r.text ?? r.result?.response;
  if (typeof t !== "string" || !t) t = r.choices?.[0]?.message?.content ?? r.choices?.[0]?.text ?? "";
  if (Array.isArray(t)) t = t.filter(p => p?.type === "text").map(p => p.text).join("");
  return String(t || "").replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<think>[\s\S]*$/i, "").trim();
}

const usaCompletion = id => /kimi|deepseek-v4|qwen3\.8/.test(id);

// Modelos gratuitos de OpenRouter; el router dinámico permite fallback cuando cambian los endpoints.
const OR_FREE = {
  chat: "nvidia/nemotron-3.5-lightning:free",
  code: "cohere/north-mini-code:free",
  reasoning: "nvidia/nemotron-3-ultra-550b-a55b:free",
  vision: "nvidia/nemotron-3.5-super-vl:free",
  fallback: "openrouter/free"
};
function openRouterCandidates(env, task) {
  const configured = task === "code"
    ? env.OPENROUTER_CODE_MODEL || env.PROJECT_MODEL
    : task === "reasoning"
      ? env.OPENROUTER_REASONING_MODEL
      : task === "vision"
        ? env.OPENROUTER_VISION_MODEL
        : env.OPENROUTER_CHAT_MODEL;
  const primary = configured || env.OPENROUTER_MODEL || OR_FREE[task] || OR_FREE.chat;
  return [...new Set([primary, OR_FREE.fallback])];
}


async function cfChat(modelId, messages, env, maxTokens = 4000, extra = {}) {
  if (!env.AI) throw new Error("AI no disponible");
  const limite = usaCompletion(modelId) ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens };
  const p = { messages, ...extra, ...limite };
  const result = await env.AI.run(modelId, p);
  return { content: salida(result), model: modelId };
}

// Prueba los modelos de la cadena en orden; si uno falla o responde vacío, pasa al siguiente.
// ---------- Venice AI (opcional: secreto VENICE_API_KEY) ----------
// El Worker descubre en vivo los modelos que tu clave puede usar (GET /models) y elige los mejores por tarea.
function veniceKey(env) { return String(env.VENICE_API_KEY || "").trim(); }
let _venCache = { t: 0, lista: null };
async function veniceCatalogo(env) {
  if (_venCache.lista && Date.now() - _venCache.t < 600000) return _venCache.lista;
  try {
    const pedir = async (t) => { try { const r = await fetch("https://api.venice.ai/api/v1/models?type=" + t, { headers: { "Authorization": `Bearer ${veniceKey(env)}` } }); const j = await r.json().catch(() => ({})); return Array.isArray(j && j.data) ? j.data : []; } catch (e) { return []; } };
    const [texto, imagen] = await Promise.all([pedir("text"), pedir("image")]);
    const vistos = new Set(), data = [];
    for (const m of texto.concat(imagen)) { const id = m && m.id; if (id && !vistos.has(id)) { vistos.add(id); data.push(m); } }
    if (data.length) _venCache = { t: Date.now(), lista: data };
    return data.length ? data : (_venCache.lista || []);
  } catch (e) { return _venCache.lista || []; }
}
function veniceInfo(m) {
  const spec = (m && m.model_spec) || {}, cap = spec.capabilities || {};
  return { id: String((m && m.id) || ""), tipo: String((m && m.type) || spec.type || "").toLowerCase(),
    vision: !!cap.supportsVision, razona: !!cap.supportsReasoning, codigo: !!cap.optimizedForCode,
    ctx: Number(spec.availableContextTokens || 0), offline: !!spec.offline };
}
const VEN_EXCLUIR = /(uncensored|embed|whisper|tts|speech|asr|image|flux|sd3|sdxl|stable|upscal|video|lustify|inpaint|background|ocr|moderation)/i;
const VEN_PREF = {
  code:      [/coder/, /glm-?5/, /kimi/, /deepseek/, /qwen3-?(235|next|max)/, /gpt-oss/, /glm/, /qwen/, /llama-3\.3/],
  reasoning: [/kimi/, /deepseek/, /glm-?5/, /qwen3-?235/, /gpt-oss/, /glm/, /qwen/],
  chat:      [/glm-?5/, /llama-3\.3/, /qwen/, /mistral/, /glm/, /gemma/],
  vision:    [/qwen.*vl/, /vl\b|vision/, /gemma/, /mistral/, /glm.*v/]
};
function veniceRanking(catalogo, task) {
  const pref = VEN_PREF[task] || VEN_PREF.chat;
  const out = [];
  for (const m of catalogo) {
    const i = veniceInfo(m);
    if (!i.id || i.offline) continue;
    if (i.tipo && i.tipo !== "text") continue;
    if (task === "vision") { if (!i.vision && !/vl\b|vision/i.test(i.id)) continue; }
    else if (VEN_EXCLUIR.test(i.id)) continue;
    let p = pref.findIndex(rx => rx.test(i.id.toLowerCase()));
    let score = p < 0 ? 0 : (pref.length - p) * 10;
    if (task === "code" && i.codigo) score += 25;
    if (task === "reasoning" && i.razona) score += 15;
    if (task === "vision" && i.vision) score += 20;
    score += Math.min(8, Math.floor(i.ctx / 32000));
    if (/^e2ee-/i.test(i.id)) score -= 5;
    out.push({ id: i.id, score });
  }
  return out.sort((a, b) => b.score - a.score).map(x => x.id);
}
async function veniceModelos(env, task) {
  const cfg = String((task === "code" ? env.VENICE_CODE_MODELS : task === "reasoning" ? env.VENICE_REASONING_MODELS : env.VENICE_CHAT_MODELS) || env.VENICE_MODELS || "").split(",").map(x => x.trim()).filter(Boolean);
  if (cfg.length) return cfg;
  const rank = veniceRanking(await veniceCatalogo(env), task).slice(0, 3);
  if (rank.length) return rank;
  return task === "reasoning" ? ["kimi-k2-6", "zai-org-glm-5"] : ["zai-org-glm-5", "kimi-k2-6"];
}
async function veniceChat(messages, env, maxTokens, model) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const normalized = messages.map(m => ({ role: ["system", "user", "assistant"].includes(m && m.role) ? m.role : "user", content: typeof (m && m.content) === "string" ? m.content : textOf(m && m.content) }));
    const llamar = async (extra) => fetch("https://api.venice.ai/api/v1/chat/completions", {
      method: "POST", signal: controller.signal,
      headers: { "Authorization": `Bearer ${veniceKey(env)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: normalized, max_tokens: maxTokens, temperature: 0.2, ...extra })
    });
    let r = await llamar({ venice_parameters: { include_venice_system_prompt: false } });
    if (r.status === 400) r = await llamar({});
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Venice HTTP ${r.status}: ${String((data && data.error && data.error.message) || (data && data.error) || (data && data.message) || "rechazó la solicitud").slice(0, 160)}`);
    const content = salida(data);
    if (!content) throw new Error("Venice respuesta vacía");
    return { content, model: `venice:${model}` };
  } finally { clearTimeout(timer); }
}
async function intentarVenice(task, messages, env, maxTokens, fallos) {
  if (!veniceKey(env)) return null;
  for (const m of await veniceModelos(env, task)) {
    try { const r = await veniceChat(messages, env, maxTokens, m); if (r.content) return { ...r, fallos }; fallos.push(`venice:${m}: respuesta vacía`); }
    catch (e) { fallos.push(`venice:${m}: ${String(e && e.message || e).slice(0, 140)}`); }
  }
  return null;
}
// Visión: reenvía el mensaje con imágenes tal cual (formato OpenAI) a un modelo de Venice con visión.
async function veniceVision(messages, env) {
  if (!veniceKey(env)) throw new Error("sin clave de Venice");
  const cfg = String(env.VENICE_VISION_MODELS || "").split(",").map(x => x.trim()).filter(Boolean);
  const modelos = cfg.length ? cfg : veniceRanking(await veniceCatalogo(env), "vision").slice(0, 2);
  if (!modelos.length) throw new Error("Venice no lista modelos con visión");
  let ultimo = null;
  for (const model of modelos) {
    try {
      const r = await fetch("https://api.venice.ai/api/v1/chat/completions", { method: "POST",
        headers: { "Authorization": `Bearer ${veniceKey(env)}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages, max_tokens: 3000, temperature: 0.2, venice_parameters: { include_venice_system_prompt: false } }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`Venice HTTP ${r.status}`);
      const content = salida(data); if (content) return { content, model: `venice:${model}` };
    } catch (e) { ultimo = e; }
  }
  throw ultimo || new Error("Venice visión sin respuesta");
}
// Imágenes: prueba el endpoint compatible con OpenAI y luego el nativo de Venice.
async function veniceImagen(env, prompt, width, height) {
  if (!veniceKey(env)) return null;
  const cat = await veniceCatalogo(env);
  const cfg = String(env.VENICE_IMAGE_MODEL || "").split(",").map(x => x.trim()).filter(Boolean);
  const auto = cat.map(veniceInfo).filter(i => i.tipo === "image" && !i.offline && !/(upscal|edit|inpaint|background|lustify|uncensored|nsfw)/i.test(i.id))
    .sort((a, b) => ((/flux|qwen-image|z-image|hidream|seedream|imagine|gpt-image|nano/i.test(b.id) ? 1 : 0) - (/flux|qwen-image|z-image|hidream|seedream|imagine|gpt-image|nano/i.test(a.id) ? 1 : 0))).map(i => i.id);
  const modelos = (cfg.length ? cfg : auto).slice(0, 2);
  const w = Math.max(256, Math.min(1280, Math.round(width / 16) * 16)), h = Math.max(256, Math.min(1280, Math.round(height / 16) * 16));
  for (const model of modelos) {
    const intentos = [
      ["https://api.venice.ai/api/v1/images/generations", { model, prompt: prompt.slice(0, 1400), n: 1, size: `${w}x${h}`, response_format: "b64_json" }, d => d && d.data && d.data[0] && d.data[0].b64_json],
      ["https://api.venice.ai/api/v1/image/generate", { model, prompt: prompt.slice(0, 1400), width: w, height: h, format: "png", hide_watermark: true }, d => d && d.images && d.images[0]]
    ];
    for (const [u, cuerpo, sacar] of intentos) {
      try {
        const r = await fetch(u, { method: "POST", headers: { "Authorization": `Bearer ${veniceKey(env)}`, "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
        const d = await r.json().catch(() => ({}));
        const b64 = r.ok ? sacar(d) : "";
        if (b64) { const out = imagenResultado({ image: b64 }, `venice:${model}`); if (out) return out; }
      } catch (e) { console.warn("venice_image", model, String(e && e.message || e).slice(0, 120)); }
    }
  }
  return null;
}

// Cuatro especialistas trabajan en paralelo y un coordinador integra sus respuestas.
// Si uno o varios proveedores fallan, el equipo continúa con los que sí respondan;
// si falla la síntesis, se devuelve la mejor respuesta individual disponible.
async function egoTeamChat(messages, env, maxTokens, task = "reasoning") {
  if (!routerApiKey(env) || env.EGO_TEAM_MODE === "0") return null;

  const esProyecto = task === "software-project" || String(task).startsWith("minecraft-bedrock-");
  const roles = esProyecto ? [
    ["planner", "Eres el arquitecto del proyecto. Extrae requisitos, define una estructura mínima completa y señala dependencias/riesgos. No generes archivos; entrega un plan breve y verificable."],
    ["reasoner", "Eres el revisor técnico. Comprueba compatibilidad, APIs, lógica, dependencias y casos límite. No inventes versiones ni APIs; indica incertidumbres concretas."],
    ["coder", "Eres el IMPLEMENTADOR PRINCIPAL. Debes generar el proyecto completo, con contenido íntegro de cada archivo, sin placeholders. Obedece literalmente el formato de salida exigido por el mensaje system original. Para Minecraft, solo Bedrock; nunca Java/Forge/Fabric."],
    ["auditor", "Eres el auditor independiente. Revisa los requisitos y el plan; detecta omisiones, archivos faltantes, referencias rotas, incompatibilidades y errores probables. No generes un proyecto alternativo; entrega una lista breve de correcciones imprescindibles."]
  ] : [
    ["planner", "Eres el planificador principal. Descompón el problema, detecta requisitos y propone una solución verificable."],
    ["reasoner", "Eres el especialista en razonamiento, matemáticas y análisis técnico. Comprueba la lógica y detecta supuestos incorrectos."],
    ["coder", "Eres el especialista en programación e implementación. Prioriza código correcto, APIs reales y manejo de errores."],
    ["auditor", "Eres el auditor independiente. Busca fallos, contradicciones, requisitos omitidos y casos límite."]
  ];
  const base = messages.map(m => ({
    role: ["system", "user", "assistant"].includes(m?.role) ? m.role : "user",
    content: typeof m?.content === "string" ? m.content : textOf(m?.content)
  }));
  const memberTokens = Math.max(900, Math.min(7000, Math.floor(maxTokens * 0.45)));
  const systemOriginal = base.find(m => m.role === "system")?.content || "";
  const contextoNoImplementador = esProyecto
    ? [{ role: "system", content: `Analiza la solicitud de proyecto como especialista de EGO AI. Requisitos y restricciones originales:\n${systemOriginal.slice(0, 12000)}\nNo generes archivos ni repitas el formato de salida; entrega solo tu análisis técnico breve.` }, ...base.filter(m => m.role !== "system")]
    : base;
  const results = await Promise.all(roles.map(async ([key, rolePrompt]) => {
    const model = EGO_TEAM_MODELS[key];
    const mensajesRol = esProyecto && key !== "coder" ? contextoNoImplementador : base;
    const tokensRol = esProyecto ? (key === "coder" ? Math.max(5000, Math.min(14000, Math.floor(maxTokens * 0.78))) : 1800) : memberTokens;
    try {
      const r = await openRouterChat([
        { role: "system", content: `${rolePrompt}\nTarea: ${task}. No inventes pruebas ni APIs.` },
        ...mensajesRol
      ], env, tokensRol, model);
      return { key, model, content: String(r.content || "").trim() };
    } catch (e) {
      return { key, model, content: "", error: String(e?.message || e).slice(0, 150) };
    }
  }));

  const ok = results.filter(x => x.content);
  if (!ok.length) return null;
  const fallos = results.filter(x => x.error).map(x => `${x.key}: ${x.error}`);
  if (ok.length === 1) return {
    content: ok[0].content,
    model: `ego-team:${ok[0].model}`,
    fallos
  };

  const aportes = ok.map(x => `ESPECIALISTA ${x.key.toUpperCase()} (${x.model}):\n${x.content}`).join("\n\n---\n\n");
  const instruccionSintesis = esProyecto
    ? "Eres el coordinador final de EGO AI para GENERACIÓN DE PROYECTOS. La respuesta del especialista CODER es la base de los archivos. Usa al planificador, razonador y auditor para corregir omisiones y errores, pero NO sustituyas el proyecto por una explicación. PRESERVA EXACTAMENTE el protocolo de archivos indicado en el mensaje system original: primera línea PROYECTO: nombre; después cada archivo con === ARCHIVO: ruta ===, contenido completo y === FIN ===. No uses Markdown, no añadas texto fuera del protocolo, no omitas README.md, no inventes pruebas ejecutadas. Si es Minecraft, conserva BP/ y RP/ con manifests coherentes. Devuelve solo el proyecto final."
    : "Eres el coordinador final de EGO AI. Integra las aportaciones de cuatro especialistas. Resuelve discrepancias usando la opción técnicamente más sólida; elimina errores y duplicados; cumple todos los requisitos del usuario. No afirmes que ejecutaste pruebas que no se hicieron. Devuelve únicamente la respuesta final en español.";
  const synthesisMessages = [
    {
      role: "system",
      content: instruccionSintesis
    },
    {
      role: "user",
      content: `SOLICITUD ORIGINAL Y CONTEXTO:\n${base.map(m => `${m.role.toUpperCase()}:\n${m.content}`).join("\n\n").slice(-26000)}\n\nAPORTACIONES DEL EQUIPO:\n${aportes.slice(0, 30000)}`
    }
  ];
  try {
    const final = await openRouterChat(synthesisMessages, env, maxTokens, EGO_TEAM_MODELS.planner);
    if (final.content) return {
      content: final.content,
      model: `ego-team:${ok.map(x => x.model.split("/").pop()).join("+")}->nemotron`,
      fallos
    };
  } catch (e) {
    fallos.push(`síntesis: ${String(e?.message || e).slice(0, 150)}`);
  }

  // Degradación segura: sin síntesis, se usa una respuesta completa de un miembro.
  const best = ok.find(x => x.key === "reasoner") || ok.find(x => x.key === "coder") || ok[0];
  return { content: best.content, model: `ego-team-fallback:${best.model}`, fallos };
}

async function cfChatSeguro(cadena, messages, env, maxTokens) {
  const fallos = [];
  const tarea = cadena === CF_MODELS.razonar ? "reasoning" : cadena === CF_MODELS.codigo ? "code" : "chat";
  // Colaboración de los cuatro modelos. Se puede desactivar con EGO_TEAM_MODE=0.
  if (routerApiKey(env) && env.EGO_TEAM_MODE !== "0") {
    try {
      const equipo = await egoTeamChat(messages, env, maxTokens, tarea);
      if (equipo?.content) return equipo;
    } catch (e) {
      fallos.push(`ego-team: ${String(e?.message || e).slice(0, 120)}`);
    }
  }
  if ((tarea === "code" || tarea === "reasoning") && env.VENICE_FIRST !== "0") { const v = await intentarVenice(tarea, messages, env, maxTokens, fallos); if (v) return v; }
  for (const m of cadena) {
    try {
      const extra = /deepseek-v4/.test(m) ? { reasoning_effort: "high" } : {};
      const r = await cfChat(m, messages, env, maxTokens, extra);
      if (r.content) return { ...r, fallos };
      fallos.push(m + ": respuesta vacía");
    } catch (e) { fallos.push(m + ": " + String(e && e.message || e).slice(0, 120)); }
  }
  if (tarea === "chat" || env.VENICE_FIRST === "0") { const v = await intentarVenice(tarea, messages, env, maxTokens, fallos); if (v) return v; }
  // Fallback por tarea: modelo gratuito específico y luego router dinámico.
  const task = cadena === CF_MODELS.razonar ? "reasoning" : cadena === CF_MODELS.codigo ? "code" : "chat";
  if (routerApiKey(env)) {
    for (const openRouterModel of openRouterCandidates(env, task)) {
      try {
        const r = await openRouterChat(messages, env, maxTokens, openRouterModel);
        if (r.content) return { ...r, fallos };
        fallos.push(`${openRouterModel}: respuesta vacía`);
      } catch (e) {
        fallos.push(`${openRouterModel}: ${String(e && e.message || e).slice(0, 120)}`);
      }
    }
  }
  throw new Error("Ningún modelo respondió. " + fallos.join(" | "));
}


// Usa el secreto que ya existe en Cloudflare (ROUTER_API_KEY) y mantiene
// compatibilidad con OPENROUTER_API_KEY para instalaciones anteriores.
function routerApiKey(env) {
  return String(env.ROUTER_API_KEY || env.OPENROUTER_API_KEY || "").trim();
}

async function openRouterChat(messages, env, maxTokens, model = env.OPENROUTER_MODEL) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55000);
  try {
    const normalized = messages.map(m => ({
      role: ["system", "user", "assistant"].includes(m?.role) ? m.role : "user",
      content: typeof m?.content === "string" ? m.content : textOf(m?.content)
    }));
    const headers = {
      "Authorization": `Bearer ${routerApiKey(env)}`,
      "Content-Type": "application/json",
      "HTTP-Referer": env.OPENROUTER_SITE_URL || "https://ego-ai.app",
      "X-Title": "EGO AI"
    };
    let response, data = {}, usado = Math.max(1, Number(maxTokens) || 1024);
    const presupuestos = [usado];
    // OpenRouter puede rechazar una solicitud grande aunque el modelo permita responder
    // con un presupuesto menor. Reintenta SOLO cuando el 402 menciona max_tokens/afford.
    for (let intento = 0; intento < 2; intento++) {
      response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST", signal: controller.signal, headers,
        body: JSON.stringify({ model, messages: normalized, max_tokens: usado, temperature: 0.2 })
      });
      data = await response.json().catch(() => ({}));
      if (response.ok) break;
      const detalle = String(data?.error?.message || "proveedor rechazó la solicitud");
      if (response.status === 402 && intento === 0 && /max[_ ]tokens|only afford|can only afford|fewer max_tokens/i.test(detalle)) {
        usado = Math.max(64, Math.min(255, usado));
        continue;
      }
      throw new Error(`HTTP ${response.status}: ${detalle.slice(0, 180)}`);
    }
    if (!response?.ok) throw new Error(`HTTP ${response?.status || 502}: ${String(data?.error?.message || "proveedor rechazó la solicitud").slice(0, 180)}`);
    const content = salida(data);
    if (!content) throw new Error("respuesta vacía");
    return { content, model: `openrouter:${model}`, maxTokensUsados: usado };
  } finally { clearTimeout(timer); }
}

async function visionOpenRouter(messages, env) {
  const model = openRouterCandidates(env, "vision")[0];
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${routerApiKey(env)}`, "Content-Type": "application/json", "HTTP-Referer": env.OPENROUTER_SITE_URL || "https://ego-ai.app", "X-Title": "EGO AI" },
    body: JSON.stringify({ model, messages: messages.map(m => ({ role: ["system", "user", "assistant"].includes(m?.role) ? m.role : "user", content: m.content })), max_tokens: 4000, temperature: 0.2 })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`OpenRouter HTTP ${r.status}: ${String(data?.error?.message || "error").slice(0, 100)}`);
  const content = salida(data);
  if (!content) throw new Error("OpenRouter devolvió una respuesta vacía");
  return { content, model: `openrouter:${model}` };
}
// ---- Comprobación contra la API OFICIAL de Mojang (@minecraft/server 2.11.0 y server-ui 2.3.0, de bedrock-samples; juego 1.26.60) ----
const MC_API={"act":{"members":["AddRider","Admin","Adventure","Ageable","AirBubbles","AlreadyRegistered","Angle","Any","AnyItem","ApplyWaterlogging","Armor","ArmorFeet","ArmorHead","ArmorLegs","ArmorTorso","Ascending","Attack","Axe","Back","BannedItem","BelowName","BirchFoliage","Black","Block","BlockDynamicProperties","BlockType","Blocks","Blue","Body","Book","Boolean","Born","Bow","Breathable","BreathingPoint","Brown","Build","Camera","CameraRelative","CameraRelativeStrafe","CanClimb","CanFly","CanPowerJump","CarrotStick","Chest","Circle","Clear","Color","Color2","CommandBlockOutput","CommandBlocksEnabled","Compostable","Console","Contains","Cooldown","Copy","CosmeticHead","Creative","Crossbow","Crosshair","CursorInventory","Custom","Cyan","Day","DefaultCategoryId","DefaultFoliage","DefaultPresetId","Deferred","Descending","Desktop","DisallowedNamespace","Disjoint","Dismount","Distance","DoDayLightCycle","DoEntityDrops","DoFireTick","DoImmediateRespawn","DoInsomnia","DoLimitedCrafting","DoMobLoot","DoMobSpawning","DoTileDrops","DoWeatherCycle","Down","DropAttachPoint","DropItem","DrowningDamage","DryFoliage","Durability","Dyeable","DynamicProperties","East","Easy","Elytra","Enchantable","EnderInventory","Entity","EntitySelector","EntityType","Enum","EnumDependencyMissing","Equippable","Event","EvergreenFoliage","ExceedsMaxPageLength","ExceedsMaxPages","ExceedsTitleLength","Exhaustion","Expanded","Expanding","ExplosionPoint","Eyes","Failure","FakePlayer","FallDamage","Fancy","Feet","FireDamage","FireImmune","First","FirstQuarter","FishingRod","Flintsteel","Float","FloatsInLiquid","FluidContainer","FlyingSpeed","Food","ForceCopy","Fourth","FreezeDamage","FrictionModifier","Front","FullMoon","FunctionCommandLimit","GameDirectors","Gamepad","Grass","Gray","Green","Hard","Head","Heal","Healable","Health","Hide","High","Hoe","HorseHealth","Host","Hotbar","Hunger","IdentifierAlreadyExists","IgnoreWaterlogging","Immovable","InBack","InBounce","InCirc","InCubic","InElastic","InExpo","InOutBack","InOutBounce","InOutCirc","InOutCubic","InOutElastic","InOutExpo","InOutQuad","InOutQuart","InOutQuint","InOutSine","InQuad","InQuart","InQuint","InSine","Instrument","Integer","Interact","Intersects","Inventory","IsBaby","IsCharged","IsChested","IsDyeable","IsHiddenWhenInvisible","IsIgnited","IsIllagerCaptain","IsSaddled","IsShaking","IsSheared","IsStackable","IsStunned","IsTamed","Item","ItemText","ItemType","Jump","KeepInventory","KeyboardAndMouse","LastQuarter","LateralMovement","Lava","LavaMovement","Layers","Leashable","Legs","LightBlue","Lime","Linear","List","Loaded","Location","LockedPlayerRelativeStrafe","Low","Magenta","Mainhand","MapColor","MarkVariant","MaxCommandChainLength","MeleeSpear","Member","Memory","Mid","Midnight","Mine","MobGriefing","Mobile","MotionController","Mount","Mouth","Movable","Move","MoveBackward","MoveForward","MoveLeft","MoveRight","Movement","MovementAmphibious","MovementBasic","MovementFly","MovementGeneric","MovementGlide","MovementHover","MovementJump","MovementSkip","MovementSway","NPCDialogue","NamespaceMismatch","NaturalRegeneration","NavigationClimb","NavigationFloat","NavigationFly","NavigationGeneric","NavigationHover","NavigationWalk","NestedStorageItem","NewMoon","Night","NoItem","NoNamespace","None","Noon","Normal","North","NotAllowedItem","Offhand","OnFire","Operator","Orange","OutBack","OutBounce","OutCirc","OutCubic","OutElastic","OutExpo","OutQuad","OutQuart","OutQuint","OutSine","OverChunkLimit","OverWeightLimit","Owner","PaperDoll","ParameterLimit","Peaceful","Pickaxe","Pink","Piston","Player","PlayerRelative","PlayerRelativeStrafe","PlayerSelector","PlayersSleepingPercentage","Popped","Positional","Potion","PowderSnow","PrecipitationInteractions","Pressed","ProgressBar","Projectile","ProjectilesCanBreakBlocks","Purple","Push","PushPull","PushThrough","Pvp","Rain","RandomTickSpeed","RayTraced","RecipesUnlock","RecordPlayer","Red","RedstoneProducer","Regeneration","RegistryInvalid","RegistryReadOnly","Released","Reset","RespawnBlocksExplode","Retracted","Retracting","Rideable","Riding","Rotate180","Rotate270","Rotate90","Rotational","Same","Saturation","Scale","Second","SelfHeal","SendCommandFeedback","Server","Shears","Shield","Shovel","ShowBorderEffect","ShowCoordinates","ShowDaysPlayed","ShowDeathMessages","ShowRecipeMessages","ShowTags","SideLengthExceeded","Sidebar","Sign","Silver","Simple","SkinId","SmallSquare","SmallStar","Sneak","South","SpawnRadius","Spawned","Spear","Spectator","Spring","Square","StatusEffects","Strength","String","Success","Sunrise","Sunset","SuperHigh","SuperLow","Survival","Sword","TameMount","Tameable","Third","ThrowItem","Thunder","TntExplodes","TntExplosionDropDecay","ToolTips","TotemOfUndying","Touch","TouchControls","Transformed","TypeFamily","UnderwaterMovement","UnknownIdentifier","Up","UseItem","Variant","Visitor","WaningCrescent","WaningGibbous","WantsJockey","Water","WaxingCrescent","WaxingGibbous","WaypointAlreadyExists","WaypointLimitExceeded","WaypointNotFound","WeaponAttachPoint","West","White","World","X","XZ","Yellow","Z","ZeroWeightItem","above","accessSourceFilter","accumulatesSnow","add","addCategory","addDye","addEffect","addEnchantment","addEnchantments","addExperience","addItem","addLevels","addObjective","addPreset","addRider","addScore","addShake","addTag","addText","addTimeMarker","addWaypoint","addedComponentGroups","additionalSlotsPerStrength","afterEvents","airInertia","allowNestedStorageItems","allowUnderwater","allowedDamageCauses","allowedHealCauses","allowedItems","allowedSlots","alpha","amount","amplifier","animation","animationMode","animationSeconds","anvil","applyDamage","applyImpulse","applyKnockback","artist","artists","attachToEntity","attachedTo","attackingEntity","author","avoidDamageBlocks","avoidPortals","avoidSun","avoidWater","backfaceVisible","backgroundColorOverride","bannedItems","beforeEvents","beforeItemStack","beforeOnPlayerPlace","below","blendOutTime","block","blockComponentRegistry","blockContainerClosed","blockContainerOpened","blockDestructionSource","blockExplode","blockExplosion","blockFace","blockFilter","blockPermutation","blockState","blockTypes","blue","bonusChance","bonusRolls","bottomCenter","boundingBox","boundingSize","breakProgress","breaksBlocks","breathesAir","breathesLava","breathesSolids","breathesWater","brokenBlockPermutation","button","buttonPush","buttons","calculateClosestBiomeFromSeed","camera","campfire","canAddEnchantment","canAlwaysEat","canBeDestroyedByLiquidSpread","canBeSiphonedFrom","canBeStolen","canBreach","canBreakDoors","canContainLiquid","canFloat","canJump","canOpenDoors","canOpenIronDoors","canPassDoors","canPathFromAir","canPathOverLava","canPathOverWater","canSink","canSwim","canWalk","canWalkInLava","cancel","catchFireOnHurt","category","cause","causesFire","center","chance","chances","charging","cheatsRequired","checkForBlocks","chunkCount","clear","clearAll","clearDynamicProperties","clearJob","clearObjectiveAtDisplaySlot","clearPropertyOverridesForEntity","clearRun","clearVelocity","clientSystemInfo","clock","clone","cloneBlocks","closeSource","closest","color","commandBlockOutput","commandBlocksEnabled","commandPermissionLevel","componentId","compostingChance","conditions","constructor","contact","container","containerRules","containerType","contains","containsBiomes","containsBlock","contents","controlPoints","controller","controllingSeat","cooldownCategory","cooldownTicks","count","createEmpty","createExplosion","createFromWorld","createTickingArea","critParticlesOnProjectileHurt","crouchingSkipInteract","currentTick","currentValue","customCommandRegistry","customComponentParameters","damage","damageSource","damagingEntity","damagingProjectile","data","dataDrivenEntityTrigger","deadEntity","defaultBlockPriority","defaultColor","defaultEntityPriority","defaultItemSettings","defaultValue","delete","depthTest","description","destination","destroyOnProjectileHurt","dimension","dimensionRegistry","displayName","distance","doDayLightCycle","doEntityDrops","doFireTick","doImmediateRespawn","doInsomnia","doLimitedCrafting","doMobLoot","doMobSpawning","doTileDrops","doWeatherCycle","doesLocationTouchFaces","doesVolumeTouchFaces","drowning","drowningDamage","durability","durabilityDamage","duration","durationInfo","durationTicks","easeOptions","easeTime","easeType","easingFunc","east","effect","effectAdd","effectType","effectiveMax","effectiveMin","effects","ejectRecord","ejectRider","ejectRiders","emptySlotsCount","enabled","enchantment","enchantments","entities","entity","entityAttack","entityContainerClosed","entityContainerOpened","entityDie","entityExplosion","entityFilter","entityHeal","entityHealthChanged","entityHitBlock","entityHitEntity","entityHurt","entityItemDrop","entityItemPickup","entityLoad","entityOffset","entityRemove","entityRidingOn","entityRules","entitySource","entitySpawn","entityStartSneaking","entityStopSneaking","entityTamed","entityType","entityTypes","entityUpgrade","entries","equals","eventId","eventName","eventTypes","exclude","excludeBiomes","excludeFamilies","excludeGameModes","excludeItems","excludeNames","excludePermutations","excludeTags","excludeTypes","explodedBlockPermutation","explosion","extent","extinguishFire","face","faceLocation","facingEntity","facingLocation","fade","fadeColor","fadeInDuration","fadeInTime","fadeOutDuration","fadeOutTime","fadeTime","fall","fallDamage","fallDistance","fallingBlock","families","farthest","fillBlocks","fillLevel","find","findLast","fire","fireDamage","fireTick","fireworks","firstEmptySlot","firstItem","fluidColor","flyIntoWall","fogSettings","forceProvidedPositionOnDimensionChange","forceUse","fov","freezeDamage","freezing","from","fromDimension","fromGameMode","fromLocation","functionCommandLimit","functions","gameMode","gameRuleChange","gameRules","generateLootFromBlock","generateLootFromBlockPermutation","generateLootFromBlockType","generateLootFromEntity","generateLootFromEntityType","generateLootFromTable","generatesBubbles","genres","get","getAABB","getAbsoluteTime","getAimAssist","getAll","getAllBlocksStandingOn","getAllDeliveryTypes","getAllEffectTypes","getAllPlayers","getAllStates","getAllTickingAreas","getAllWaypoints","getAttachedBlocks","getAttachedBlocksLocations","getBiome","getBlock","getBlockAbove","getBlockBelow","getBlockFromRay","getBlockFromViewDirection","getBlockHit","getBlockLocationIterator","getBlockPermutation","getBlockPriorities","getBlockStandingOn","getBlockTagPriorities","getBlocks","getBreatheBlocks","getButtonState","getCanDestroy","getCanPlaceOn","getCapacity","getCategories","getCategory","getClock","getClosest","getComponent","getComponents","getConnectedFaces","getControlScheme","getCooldownTicksRemaining","getDamageChance","getDamageChanceRange","getDay","getDefaultSpawnLocation","getDefinitions","getDeliveryType","getDifficulty","getDimension","getDimensionLocation","getDropItems","getDynamicProperty","getDynamicPropertyIds","getDynamicPropertyTotalByteCount","getEffect","getEffectType","getEffects","getEnchantment","getEnchantments","getEntities","getEntitiesAtBlockLocation","getEntitiesFromRay","getEntitiesFromViewDirection","getEntity","getEntityHit","getEntityPriorities","getEntityTypeFamilyPriorities","getEquipment","getEquipmentSlot","getExcludedBlockTagTargets","getExcludedBlockTargets","getExcludedEntityTargets","getExcludedEntityTypeFamilyTargets","getFamilyTypes","getFarthest","getFeedItems","getFluidType","getGameMode","getHeadLocation","getHiddenHudElements","getImpactedBlocks","getInstrumentName","getIsWaterlogged","getItem","getItemCooldown","getItemSettings","getItemStack","getLightLevel","getLiquidTargetingItems","getLootTable","getLootTableManager","getLore","getMax","getMin","getModifiers","getMoonPhase","getMovementVector","getName","getNonBreatheBlocks","getObjective","getObjectiveAtDisplaySlot","getObjectives","getPackSettings","getPackStructureIds","getPageContent","getParticipants","getParts","getPlaybackPosition","getPlayers","getPreset","getPresets","getProperty","getRawLore","getRawPageContent","getRawText","getRecord","getRedstonePower","getRiders","getRotation","getScore","getScores","getSeats","getShapes","getSkyLightLevel","getSlot","getSpan","getSpawnPoint","getStack","getState","getStronglyPoweredFace","getTags","getTameItems","getText","getTextDyeColor","getTickingArea","getTimeOfDay","getTopmostBlock","getTotalXp","getTypeFamilies","getVelocity","getViewDirection","getWorldStructureIds","graphicsMode","gravity","greaterThan","greaterThanOrEquals","green","growUp","growth","hadEffect","handSettings","hardDistance","hasCapacity","hasComponent","hasDuration","hasEnchantment","hasItem","hasParticipant","hasTag","hasTags","hasTickingArea","hasTypeFamily","hasWaypoint","healAmount","healSource","healedEntity","healing","heightRange","heldItemOption","heldItemStack","hideAllExcept","hitBlock","hitBlockPermutation","hitEntity","hitEntitySound","hitGroundSound","hitParticle","hitVector","holdTime","hurtEntity","iconHeight","iconWidth","id","identifier","ignoreBlockCollision","ignoreChunkBoundErrors","ignoreQuantityChange","ignoreStartHeight","ignoreThinBlocks","includeBiomes","includeBlocks","includeEntities","includeItems","includeLiquidBlocks","includePassableBlocks","includePermutations","includeTags","includeTypes","inhaleTime","initialPersistence","initialRange","initialRotation","initialSpawn","initiator","inputInfo","inputPermissions","insertPage","integrity","integritySeed","intensity","interactText","intersects","inventory","inventorySize","inventoryType","isActive","isAir","isAmphibious","isBroadcast","isChunkLoaded","isClimbing","isCooldownCategory","isEditorWorld","isEmoting","isEnabled","isExpanding","isFalling","isFirstEvent","isFlying","isForcedHidden","isFullyLoaded","isGliding","isHardcore","isInWater","isInside","isJumping","isLeashed","isLiquid","isLiquidBlocking","isMoving","isOnGround","isPaused","isPermissionCategoryEnabled","isPlaying","isPowered","isSigned","isSleeping","isSneaking","isSnowLoggable","isSprinting","isStackable","isStackableWith","isSwimming","isTamed","isTamedToPlayer","isValid","isWaterlogged","isWaxed","item","itemCompleteUse","itemComponentRegistry","itemFilter","itemName","itemReleaseUse","itemStack","itemStackAfterBreak","itemStackBeforeBreak","itemStartUse","itemStartUseOn","itemStopUse","itemStopUseOn","itemTagsAll","itemTagsAny","itemTagsNone","itemUse","items","keepInventory","keepJigsaws","keepOnDeath","keepVelocity","kill","lastInputModeUsed","lava","leashHolder","leashHolderEntityId","leashTo","lessThan","lessThanOrEquals","level","levels","leverAction","lightning","lightningStrikeOnHit","lineGapHeight","liquidCanFlowFromDirection","liquidInertia","liquidSettings","liquidSpreadCausesSpawn","locale","localizationKey","location","locator","locatorBar","lockMode","lockRiderRotation","lookAt","loop","loopCount","lootTable","lootingMultiplier","lore","lowerBound","maceSmash","magic","magma","mandatoryParameters","matches","material","max","maxAmount","maxChance","maxChunkCount","maxCommandChainLength","maxCount","maxDistance","maxDurability","maxDuration","maxFillLevel","maxHorizontalRotation","maxLevel","maxRenderDistance","maxRiderCount","maxScore","maxShapes","maxTurn","maxVerticalRotation","maximumRenderDistance","memoryTier","message","min","minDistance","minDuration","minFillLevel","minHorizontalRotation","minLevel","minRiderCount","minScore","minVerticalRotation","minedBlockPermutation","mirror","mobGriefing","moods","moveItem","movementType","musicInfo","name","nameTag","nameplateDepthTested","nameplateRenderDistance","namespaces","naturalRegeneration","newButtonState","newInputModeUsed","newSlotSelected","newTime","newValue","newWeather","nextState","none","north","notEquals","nutrition","objective","obstructsRain","offset","offsetFromTargetCenter","oldValue","onBeforeDurabilityDamage","onBlockStateChange","onBreak","onCompleteUse","onConsume","onEntity","onEntityFallOn","onFireTicksRemaining","onFireTime","onHitEntity","onMineBlock","onPlace","onPlayerBreak","onPlayerInteract","onRandomTick","onRedstoneUpdate","onScreenDisplay","onStepOff","onStepOn","onTick","onUse","onUseOn","openSource","optionalParameters","override","owner","pageCount","pages","params","participant","passengerMaxWidth","path","pattern","pause","pauseRecord","period","permissionLevel","permutation","permutationToPlace","permutations","personaPieceId","piston","pistonActivate","pitch","place","placeFeature","placeFeatureRule","placeJigsaw","placeJigsawStructure","platformType","playAnimation","playInstrumentSound","playMusic","playRecord","playSound","player","playerBreakBlock","playerButtonInput","playerCancelBreakingBlock","playerDimensionChange","playerEmote","playerFilter","playerGameModeChange","playerHotbarSelectedSlotChange","playerId","playerInputModeChange","playerInputPermissionCategoryChange","playerInteractWithBlock","playerInteractWithEntity","playerInventoryItemChange","playerJoin","playerLeave","playerName","playerPermissionLevel","playerPlaceBlock","playerRules","playerSpawn","playerStartBreakingBlock","playerSwingStart","players","playersSleepingPercentage","pools","pop","position","potionDeliveryType","potionEffectType","power","powerLevel","presetId","pressurePlatePop","pressurePlatePush","previousBlock","previousInputModeUsed","previousPermutation","previousPowerLevel","previousRedstonePower","previousSlotSelected","previousWeather","primitiveShapesManager","private","probability","progressKeyFrames","projectile","projectileHitBlock","projectileHitEntity","projectilesCanBreakBlocks","propertyId","propertyOptions","pullInEntities","push","pvp","quality","queueMusic","ramAttack","randomTickSpeed","range","rawContents","rawtext","recipesUnlock","recipient","red","redstonePower","registerClock","registerCommand","registerCustomComponent","registerCustomDimension","registerEnum","remove","removeAll","removeAllEnchantments","removeAllTickingAreas","removeAllWaypoints","removeEffect","removeEnchantment","removeObjective","removePage","removeParticipant","removePropertyOverrideForEntity","removeTag","removeText","removeTickingArea","removeTimeMarker","removeWaypoint","removedComponentGroups","removedEntity","removedEntityId","resetHudElementsVisibility","resetLevel","resetProperty","resetToDefaultValue","resetToMaxValue","resetToMinValue","resolve","respawnBlocksExplode","restrictToOwner","resultItem","resume","rewindTo","riderCanInteract","rolls","rotation","rotationKeyFrames","rule","run","runCommand","runInterval","runJob","runTimeout","saturationModifier","saveAs","saveMode","saveToWorld","scale","score","scoreOptions","scoreboard","scoreboardIdentity","scriptEventReceive","seatCount","seatRotation","seed","seekTo","selectedSlotIndex","selfDestruct","sendCommandFeedback","sendMessage","sendScriptEvent","serverSystemInfo","set","setAbsoluteTime","setActionBar","setBlockPermutation","setBlockPriorities","setBlockTagPriorities","setBlockType","setCamera","setCanDestroy","setCanPlaceOn","setColorRGB","setColorRGBA","setContents","setControlScheme","setCurrentValue","setDefaultCamera","setDefaultSpawnLocation","setDifficulty","setDimensionLocation","setDynamicProperties","setDynamicProperty","setEntityPriorities","setEntityTypeFamilyPriorities","setEquipment","setExcludedBlockTagTargets","setExcludedBlockTargets","setExcludedEntityTargets","setExcludedEntityTypeFamilyTargets","setFloat","setFluidType","setFov","setGameMode","setHudVisibility","setImpactedBlocks","setItem","setItemSettings","setLiquidTargetingItems","setLocation","setLore","setObjectiveAtDisplaySlot","setOnFire","setPageContent","setPermissionCategory","setPermutation","setPitch","setPotion","setProperty","setPropertyOverrideForEntity","setRecord","setRotation","setScore","setSpawnPoint","setSpeedAndDirection","setStack","setText","setTextDyeColor","setTimeOfDay","setTitle","setType","setVector3","setVolume","setWaterlogged","setWaxed","setWeather","settings","shoot","shouldBounceOnHit","showBorderEffect","showCoordinates","showDaysPlayed","showDead","showDeathMessages","showHidden","showInvisible","showParticles","showRecipeMessages","showSneaking","showSpectator","showSpectatorToSpectator","showTags","shutdown","signBook","size","skipTo","slot","slots","softDistance","sonicBoom","sortOrder","soulCampfire","soundCompleted","soundDefinitionRegistry","soundEventId","soundInstanceId","source","sourceBlock","sourceEntity","sourceType","sources","south","spawnEntity","spawnEvent","spawnItem","spawnParticle","spawnRadius","spawnXp","speedWhenTurning","stalactite","stalagmite","startCooldown","startItemCooldown","startSpeed","startup","starve","state","status","stayDuration","stickyType","stop","stopExpression","stopMusic","stopOnHit","stopShaking","structureManager","subTable","subscribe","subtitle","successCount","suffocateTime","suffocation","swapItems","swayAmplitude","swayFrequency","swingSource","tags","tame","tameToPlayer","tamedToPlayer","tamedToPlayerId","tamingEntity","tamingEntityFilter","target","targetBlockHit","targetEntity","targetMode","teleport","temperature","text","textBackfaceVisible","texture","textureBoundsList","textureSelector","thorns","tickingAreaManager","tiers","time","timeLeft","timeMarker","timeMarkers","timeSeconds","tintMethod","tintedColor","title","titles","tntExplodes","tntExplosionDropDecay","to","toDimension","toGameMode","toLocation","totalArmor","totalByteCount","totalSupply","totalTimeLeft","totalTimeSeconds","totalToughness","totalXpNeededForNextLevel","touchOnlyAffectsHotbar","transferItem","transformToItem","translate","treasure","triggerEvent","tripWireTrip","tryTeleport","type","typeId","unbreakable","uncertainty","unleash","unsubscribe","updateSubtitle","upgradeId","upperBound","useDuration","useRotation","usedOnBlockPermutation","usingConvertsTo","validValues","value","values","viewAngle","viewOffset","visibleTo","void","volume","waitTicks","waterlogged","weatherChange","weight","weightLimit","west","with","withState","wither","worldClockOnPaused","worldClockOnRestart","worldClockOnResumed","worldClockOnTimeMarker","worldClockOnTimeModified","worldClockRegistry","worldLoad","x","xpEarnedAtCurrentLevel","y","z"],"exports":["AABB","AimAssistCategory","AimAssistCategorySettings","AimAssistPreset","AimAssistPresetSettings","AimAssistRegistry","AimAssistTargetMode","AnimationOptions","BiomeFilter","BiomeSearchOptions","BiomeType","BiomeTypes","Block","BlockBoundingBox","BlockComponent","BlockComponentBlockBreakEvent","BlockComponentBlockStateChangeEvent","BlockComponentEntityEvent","BlockComponentEntityFallOnEvent","BlockComponentOnPlaceEvent","BlockComponentPlayerBreakEvent","BlockComponentPlayerInteractEvent","BlockComponentPlayerPlaceBeforeEvent","BlockComponentRandomTickEvent","BlockComponentRedstoneUpdateEvent","BlockComponentRegistry","BlockComponentReturnType","BlockComponentStepOffEvent","BlockComponentStepOnEvent","BlockComponentTickEvent","BlockComponentTypeMap","BlockComponentTypes","BlockContainerAccessEventOptions","BlockContainerClosedAfterEvent","BlockContainerClosedAfterEventSignal","BlockContainerOpenedAfterEvent","BlockContainerOpenedAfterEventSignal","BlockCustomComponent","BlockCustomComponentAlreadyRegisteredError","BlockCustomComponentInstance","BlockCustomComponentReloadNewComponentError","BlockCustomComponentReloadNewEventError","BlockCustomComponentReloadVersionError","BlockDynamicPropertiesComponent","BlockEvent","BlockEventOptions","BlockExplodeAfterEvent","BlockExplodeAfterEventSignal","BlockFillOptions","BlockFilter","BlockFluidContainerComponent","BlockHitInformation","BlockInstrumentComponent","BlockInventoryComponent","BlockLocationIterator","BlockMapColorComponent","BlockMovableComponent","BlockPermutation","BlockPistonComponent","BlockPistonState","BlockPrecipitationInteractionsComponent","BlockQueryOptions","BlockRaycastHit","BlockRaycastOptions","BlockRecordPlayerComponent","BlockRedstoneProducerComponent","BlockSignComponent","BlockStateArg","BlockStateType","BlockStates","BlockType","BlockTypes","BlockVolume","BlockVolumeBase","BlockVolumeIntersection","BookError","BookErrorReason","BookPageContentError","ButtonPushAfterEvent","ButtonPushAfterEventSignal","ButtonState","Camera","CameraAttachOptions","CameraFadeOptions","CameraFadeTimeOptions","CameraFixedBoomOptions","CameraFovOptions","CameraSetFacingOptions","CameraSetLocationOptions","CameraSetPosOptions","CameraSetRotOptions","CameraShakeOptions","CameraShakeType","CameraTargetOptions","CatmullRomSpline","ClientSystemInfo","CloneMode","CommandError","CommandPermissionLevel","CommandResult","Component","Container","ContainerAccessSource","ContainerAccessSourceFilter","ContainerRules","ContainerRulesError","ContainerRulesErrorReason","ContainerSlot","ControlScheme","CustomCommand","CustomCommandError","CustomCommandErrorReason","CustomCommandOrigin","CustomCommandParamType","CustomCommandParameter","CustomCommandRegistry","CustomCommandResult","CustomCommandSource","CustomCommandStatus","CustomComponentInvalidRegistryError","CustomComponentNameError","CustomComponentNameErrorReason","CustomComponentParameters","CustomDimensionAlreadyRegisteredError","CustomDimensionInvalidRegistryError","CustomDimensionNameError","CustomDimensionReloadNewDimensionError","CustomTexture","DamagedByEntityCondition","DataDrivenEntityTriggerAfterEvent","DataDrivenEntityTriggerAfterEventSignal","DefinitionModifier","Difficulty","Dimension","DimensionLocation","DimensionRegistry","DimensionType","DimensionTypes","Direction","DisplaySlotId","DyeColor","EaseOptions","EasingType","Effect","EffectAddAfterEvent","EffectAddAfterEventSignal","EffectAddBeforeEvent","EffectAddBeforeEventSignal","EffectType","EffectTypes","EmptyLootItem","EnchantInfo","EnchantRandomEquipmentFunction","EnchantRandomlyFunction","EnchantWithLevelsFunction","Enchantment","EnchantmentLevelOutOfBoundsError","EnchantmentSlot","EnchantmentType","EnchantmentTypeNotCompatibleError","EnchantmentTypeUnknownIdError","EnchantmentTypes","Entity","EntityAddRiderComponent","EntityAgeableComponent","EntityApplyDamageByProjectileOptions","EntityApplyDamageOptions","EntityAttachPoint","EntityAttributeComponent","EntityBaseMovementComponent","EntityBreathableComponent","EntityCanClimbComponent","EntityCanFlyComponent","EntityCanPowerJumpComponent","EntityColor2Component","EntityColorComponent","EntityComponent","EntityComponentReturnType","EntityComponentTypeMap","EntityComponentTypes","EntityContainerAccessEventOptions","EntityContainerClosedAfterEvent","EntityContainerClosedAfterEventSignal","EntityContainerOpenedAfterEvent","EntityContainerOpenedAfterEventSignal","EntityDamageCause","EntityDamageSource","EntityDataDrivenTriggerEventOptions","EntityDefinitionFeedItem","EntityDieAfterEvent","EntityDieAfterEventSignal","EntityEffectOptions","EntityEnderInventoryComponent","EntityEquippableComponent","EntityEventOptions","EntityExhaustionComponent","EntityFilter","EntityFireImmuneComponent","EntityFloatsInLiquidComponent","EntityFlyingSpeedComponent","EntityFrictionModifierComponent","EntityHasMarkVariantCondition","EntityHasVariantCondition","EntityHealAfterEvent","EntityHealAfterEventSignal","EntityHealBeforeEvent","EntityHealBeforeEventSignal","EntityHealCause","EntityHealEventOptions","EntityHealSource","EntityHealableComponent","EntityHealthChangedAfterEvent","EntityHealthChangedAfterEventSignal","EntityHealthComponent","EntityHitBlockAfterEvent","EntityHitBlockAfterEventSignal","EntityHitEntityAfterEvent","EntityHitEntityAfterEventSignal","EntityHitInformation","EntityHungerComponent","EntityHurtAfterEvent","EntityHurtAfterEventOptions","EntityHurtAfterEventSignal","EntityHurtBeforeEvent","EntityHurtBeforeEventOptions","EntityHurtBeforeEventSignal","EntityInitializationCause","EntityInventoryComponent","EntityIsBabyComponent","EntityIsChargedComponent","EntityIsChestedComponent","EntityIsDyeableComponent","EntityIsHiddenWhenInvisibleComponent","EntityIsIgnitedComponent","EntityIsIllagerCaptainComponent","EntityIsSaddledComponent","EntityIsShakingComponent","EntityIsShearedComponent","EntityIsStackableComponent","EntityIsStunnedComponent","EntityIsTamedComponent","EntityItemComponent","EntityItemDropAfterEvent","EntityItemDropAfterEventSignal","EntityItemDropEventOptions","EntityItemPickupAfterEvent","EntityItemPickupAfterEventSignal","EntityItemPickupBeforeEvent","EntityItemPickupBeforeEventSignal","EntityItemPickupEventOptions","EntityKilledCondition","EntityLavaMovementComponent","EntityLeashableComponent","EntityLoadAfterEvent","EntityLoadAfterEventSignal","EntityMarkVariantComponent","EntityMovementAmphibiousComponent","EntityMovementBasicComponent","EntityMovementComponent","EntityMovementFlyComponent","EntityMovementGenericComponent","EntityMovementGlideComponent","EntityMovementHoverComponent","EntityMovementJumpComponent","EntityMovementSkipComponent","EntityMovementSwayComponent","EntityNavigationClimbComponent","EntityNavigationComponent","EntityNavigationFloatComponent","EntityNavigationFlyComponent","EntityNavigationGenericComponent","EntityNavigationHoverComponent","EntityNavigationWalkComponent","EntityOnFireComponent","EntityProjectileComponent","EntityPushThroughComponent","EntityQueryOptions","EntityQueryPropertyOptions","EntityQueryScoreOptions","EntityRaycastHit","EntityRaycastOptions","EntityRemoveAfterEvent","EntityRemoveAfterEventSignal","EntityRemoveBeforeEvent","EntityRemoveBeforeEventSignal","EntityRideableComponent","EntityRidingComponent","EntitySaturationComponent","EntityScaleComponent","EntitySkinIdComponent","EntitySneakingChangedEventOptions","EntitySpawnAfterEvent","EntitySpawnAfterEventSignal","EntitySpawnError","EntityStartSneakingAfterEvent","EntityStartSneakingAfterEventSignal","EntityStopSneakingAfterEvent","EntityStopSneakingAfterEventSignal","EntityStrengthComponent","EntitySwingSource","EntityTameMountComponent","EntityTameableComponent","EntityTamedAfterEvent","EntityTamedAfterEventSignal","EntityTamedBeforeEvent","EntityTamedBeforeEventSignal","EntityTamedEventOptions","EntityType","EntityTypeFamilyComponent","EntityTypes","EntityUnderwaterMovementComponent","EntityUpgradeAfterEvent","EntityUpgradeAfterEventSignal","EntityVariantComponent","EntityVisibilityRules","EntityWantsJockeyComponent","EntityWaypoint","EqualsComparison","EquipmentSlot","ExplorationMapFunction","ExplosionAfterEvent","ExplosionAfterEventSignal","ExplosionBeforeEvent","ExplosionBeforeEventSignal","ExplosionDecayFunction","ExplosionOptions","FeedItem","FeedItemEffect","FillContainerFunction","FluidContainer","FluidType","FogSettings","FogSettingsError","GameMode","GameRule","GameRuleChangeAfterEvent","GameRuleChangeAfterEventSignal","GameRules","GetBlocksStandingOnOptions","GraphicsMode","GreaterThanComparison","GreaterThanOrEqualsComparison","HeldItemOption","HotbarEventOptions","HudElement","HudElementsCount","HudVisibility","HudVisibilityCount","ISerializable","InputButton","InputEventOptions","InputInfo","InputMode","InputPermissionCategory","InvalidBlockComponentError","InvalidContainerError","InvalidContainerSlotError","InvalidEntityComponentError","InvalidEntityError","InvalidItemStackError","InvalidIteratorError","InvalidPotionDeliveryTypeError","InvalidPotionEffectTypeError","InvalidStructureError","InvalidWaypointError","InvalidWaypointTextureSelectorError","InventoryItemEventOptions","IsBabyCondition","ItemBlockDynamicPropertiesComponent","ItemBookComponent","ItemCompleteUseAfterEvent","ItemCompleteUseAfterEventSignal","ItemCompleteUseEvent","ItemComponent","ItemComponentBeforeDurabilityDamageEvent","ItemComponentCompleteUseEvent","ItemComponentConsumeEvent","ItemComponentHitEntityEvent","ItemComponentMineBlockEvent","ItemComponentRegistry","ItemComponentReturnType","ItemComponentTypeMap","ItemComponentTypes","ItemComponentUseEvent","ItemComponentUseOnEvent","ItemCompostableComponent","ItemCooldownComponent","ItemCustomComponent","ItemCustomComponentAlreadyRegisteredError","ItemCustomComponentInstance","ItemCustomComponentReloadNewComponentError","ItemCustomComponentReloadNewEventError","ItemCustomComponentReloadVersionError","ItemDurabilityComponent","ItemDyeableComponent","ItemEnchantableComponent","ItemFilter","ItemFoodComponent","ItemInventoryComponent","ItemLockMode","ItemPotionComponent","ItemReleaseUseAfterEvent","ItemReleaseUseAfterEventSignal","ItemStack","ItemStartUseAfterEvent","ItemStartUseAfterEventSignal","ItemStartUseOnAfterEvent","ItemStartUseOnAfterEventSignal","ItemStopUseAfterEvent","ItemStopUseAfterEventSignal","ItemStopUseOnAfterEvent","ItemStopUseOnAfterEventSignal","ItemType","ItemTypes","ItemUseAfterEvent","ItemUseAfterEventSignal","ItemUseBeforeEvent","ItemUseBeforeEventSignal","ItemUseOnEvent","JigsawPlaceOptions","JigsawStructurePlaceOptions","KilledByEntityCondition","KilledByPlayerCondition","KilledByPlayerOrPetsCondition","LessThanComparison","LessThanOrEqualsComparison","LeverActionAfterEvent","LeverActionAfterEventSignal","LinearSpline","LiquidSettings","LiquidType","ListBlockVolume","LocationInUnloadedChunkError","LocationOutOfWorldBoundariesError","LocationWaypoint","LocatorBar","LocatorBarError","LocatorBarErrorReason","LootItem","LootItemCondition","LootItemFunction","LootPool","LootPoolEntry","LootPoolTiers","LootTable","LootTableEntry","LootTableManager","LootTableReference","LootingEnchantFunction","MatchToolCondition","MemoryTier","MolangVariableMap","MoonPhase","MoonPhaseCount","MovementType","MusicOptions","NamespaceNameError","NamespaceNameErrorReason","NotEqualsComparison","ObjectiveSortOrder","PaletteColor","PassengerOfEntityCondition","PistonActivateAfterEvent","PistonActivateAfterEventSignal","PlaceJigsawError","PlatformType","PlayAnimationOptions","Player","PlayerAimAssist","PlayerAimAssistSettings","PlayerBreakBlockAfterEvent","PlayerBreakBlockAfterEventSignal","PlayerBreakBlockBeforeEvent","PlayerBreakBlockBeforeEventSignal","PlayerBreakingBlockEventOptions","PlayerButtonInputAfterEvent","PlayerButtonInputAfterEventSignal","PlayerCancelBreakingBlockAfterEvent","PlayerCancelBreakingBlockAfterEventSignal","PlayerCursorInventoryComponent","PlayerDimensionChangeAfterEvent","PlayerDimensionChangeAfterEventSignal","PlayerEmoteAfterEvent","PlayerEmoteAfterEventSignal","PlayerGameModeChangeAfterEvent","PlayerGameModeChangeAfterEventSignal","PlayerGameModeChangeBeforeEvent","PlayerGameModeChangeBeforeEventSignal","PlayerHotbarSelectedSlotChangeAfterEvent","PlayerHotbarSelectedSlotChangeAfterEventSignal","PlayerInputModeChangeAfterEvent","PlayerInputModeChangeAfterEventSignal","PlayerInputPermissionCategoryChangeAfterEvent","PlayerInputPermissionCategoryChangeAfterEventSignal","PlayerInputPermissions","PlayerInteractWithBlockAfterEvent","PlayerInteractWithBlockAfterEventSignal","PlayerInteractWithBlockBeforeEvent","PlayerInteractWithBlockBeforeEventSignal","PlayerInteractWithEntityAfterEvent","PlayerInteractWithEntityAfterEventSignal","PlayerInteractWithEntityBeforeEvent","PlayerInteractWithEntityBeforeEventSignal","PlayerInventoryItemChangeAfterEvent","PlayerInventoryItemChangeAfterEventSignal","PlayerInventoryType","PlayerJoinAfterEvent","PlayerJoinAfterEventSignal","PlayerLeaveAfterEvent","PlayerLeaveAfterEventSignal","PlayerLeaveBeforeEvent","PlayerLeaveBeforeEventSignal","PlayerPermissionLevel","PlayerPlaceBlockAfterEvent","PlayerPlaceBlockAfterEventSignal","PlayerSoundOptions","PlayerSpawnAfterEvent","PlayerSpawnAfterEventSignal","PlayerSplitScreenSlot","PlayerStartBreakingBlockAfterEvent","PlayerStartBreakingBlockAfterEventSignal","PlayerSwingEventOptions","PlayerSwingStartAfterEvent","PlayerSwingStartAfterEventSignal","PlayerVisibilityRules","PlayerWaypoint","PotionDeliveryType","PotionEffectType","Potions","PressurePlatePopAfterEvent","PressurePlatePopAfterEventSignal","PressurePlatePushAfterEvent","PressurePlatePushAfterEventSignal","PrimitiveShape","PrimitiveShapeError","PrimitiveShapeQueryOptions","PrimitiveShapesManager","ProgressKeyFrame","ProjectileHitBlockAfterEvent","ProjectileHitBlockAfterEventSignal","ProjectileHitEntityAfterEvent","ProjectileHitEntityAfterEventSignal","ProjectileShootOptions","RGB","RGBA","RandomAuxValueFunction","RandomBlockStateFunction","RandomChanceCondition","RandomChanceWithLootingCondition","RandomDifficultyChanceCondition","RandomDyeFunction","RandomRegionalDifficultyChanceCondition","RangeComparison","RawMessage","RawMessageError","RawMessageScore","RawText","RotationKeyFrame","Scoreboard","ScoreboardIdentity","ScoreboardIdentityType","ScoreboardObjective","ScoreboardObjectiveDisplayOptions","ScoreboardScoreInfo","ScreenDisplay","ScriptEventCommandMessageAfterEvent","ScriptEventCommandMessageAfterEventSignal","ScriptEventMessageFilterOptions","ScriptEventSource","Seat","SetArmorTrimFunction","SetBannerDetailsFunction","SetBookContentsFunction","SetDataFromColorIndexFunction","SetItemCountFunction","SetItemDamageFunction","SetItemDataFunction","SetItemLoreFunction","SetItemNameFunction","SetOminousBottleFunction","SetPotionFunction","SetSpawnEggFunction","SetStewEffectFunction","ShutdownBeforeEventSignal","ShutdownEvent","SignSide","SmeltItemFunction","SoundCompletedAfterEvent","SoundCompletedAfterEventSignal","SoundDefinition","SoundDefinitionDurationInfo","SoundDefinitionFilter","SoundDefinitionMusicInfo","SoundDefinitionRegistry","SoundDurationInfo","SoundInstance","SpawnEntityOptions","SpecificEnchantFunction","SplineAnimation","StartupBeforeEventSignal","StartupEvent","StickyType","Structure","StructureAnimationMode","StructureCreateOptions","StructureManager","StructureMirrorAxis","StructurePlaceOptions","StructureRotation","StructureSaveMode","System","SystemAfterEvents","SystemBeforeEvents","SystemInfo","TargetBlockHitAfterEvent","TargetBlockHitAfterEventSignal","TeleportOptions","TextPrimitive","TickingArea","TickingAreaError","TickingAreaErrorReason","TickingAreaManager","TickingAreaOptions","TicksPerDay","TicksPerSecond","TimeMarker","TimeMarkerOptions","TimeOfDay","TintMethod","TitleDisplayOptions","Trigger","TripWireTripAfterEvent","TripWireTripAfterEventSignal","UnloadedChunksError","Vector2","Vector3","VectorXZ","Waypoint","WaypointTexture","WaypointTextureBounds","WaypointTextureSelector","WeatherChangeAfterEvent","WeatherChangeAfterEventSignal","WeatherChangeBeforeEvent","WeatherChangeBeforeEventSignal","WeatherType","World","WorldAfterEvents","WorldBeforeEvents","WorldClock","WorldClockAddTimeMarkerError","WorldClockEventOptions","WorldClockInvalidRegistryError","WorldClockInvalidTimeMarkerError","WorldClockNotFoundError","WorldClockOnPausedAfterEvent","WorldClockOnPausedAfterEventSignal","WorldClockOnRestartBeforeEvent","WorldClockOnRestartBeforeEventSignal","WorldClockOnResumedAfterEvent","WorldClockOnResumedAfterEventSignal","WorldClockOnTimeMarkerAfterEvent","WorldClockOnTimeMarkerAfterEventSignal","WorldClockOnTimeModifiedAfterEvent","WorldClockOnTimeModifiedAfterEventSignal","WorldClockRegistrationError","WorldClockRegistrationOptions","WorldClockRegistry","WorldClockReloadNewWorldClockError","WorldClockReloadTimeMarkerError","WorldClockRemoveMinecraftTimeMarkerError","WorldClockRewindError","WorldClockTimeMarkerEventOptions","WorldClockTimeMarkerNotFoundError","WorldLoadAfterEvent","WorldLoadAfterEventSignal","WorldSoundOptions","system","world"],"events":{"after":["blockContainerClosed","blockContainerOpened","blockExplode","buttonPush","dataDrivenEntityTrigger","effectAdd","entityContainerClosed","entityContainerOpened","entityDie","entityHeal","entityHealthChanged","entityHitBlock","entityHitEntity","entityHurt","entityItemDrop","entityItemPickup","entityLoad","entityRemove","entitySpawn","entityStartSneaking","entityStopSneaking","entityTamed","entityUpgrade","explosion","gameRuleChange","itemCompleteUse","itemReleaseUse","itemStartUse","itemStartUseOn","itemStopUse","itemStopUseOn","itemUse","leverAction","pistonActivate","playerBreakBlock","playerButtonInput","playerCancelBreakingBlock","playerDimensionChange","playerEmote","playerGameModeChange","playerHotbarSelectedSlotChange","playerInputModeChange","playerInputPermissionCategoryChange","playerInteractWithBlock","playerInteractWithEntity","playerInventoryItemChange","playerJoin","playerLeave","playerPlaceBlock","playerSpawn","playerStartBreakingBlock","playerSwingStart","pressurePlatePop","pressurePlatePush","projectileHitBlock","projectileHitEntity","soundCompleted","targetBlockHit","tripWireTrip","weatherChange","worldClockOnPaused","worldClockOnResumed","worldClockOnTimeMarker","worldClockOnTimeModified","worldLoad"],"before":["effectAdd","entityHeal","entityHurt","entityItemPickup","entityRemove","entityTamed","explosion","itemUse","playerBreakBlock","playerGameModeChange","playerInteractWithBlock","playerInteractWithEntity","playerLeave","weatherChange","worldClockOnRestart"]},"ui_exports":["ActionFormData","ActionFormResponse","ButtonOptions","CustomForm","DataDrivenScreenClosedReason","DividerOptions","DropdownItemData","DropdownOptions","FormCancelationReason","FormRejectError","FormRejectReason","FormResponse","FormVisibilityError","FormVisibilityErrorReason","ImageDetails","ImageOptions","InvalidFormError","InvalidFormModificationError","InvalidObservableError","MessageBox","MessageBoxButtonOptions","MessageBoxResult","MessageFormData","MessageFormResponse","ModalFormData","ModalFormDataDropdownOptions","ModalFormDataSliderOptions","ModalFormDataTextFieldOptions","ModalFormDataToggleOptions","ModalFormResponse","ObservableBoolean","ObservableNumber","ObservableOptions","ObservableString","ObservableUIRawMessage","PlayerLeftError","SliderOptions","SpacingOptions","TextFieldOptions","TextFilteringError","TextOptions","ToggleOptions","UIManager","UIRawMessage","uiManager"],"ui_members":["AlreadyShowing","ClientClosed","DisabledByPlayer","MalformedResponse","NotShowing","PlayerQuit","ServerClosed","ServerShutdown","TextProcessorServiceUnreachable","Unknown","UserBusy","UserClosed","body","button","button1","button1WithOptions","button2","button2WithOptions","cancelationReason","canceled","clientWritable","close","closeAllForms","closeButton","closeReason","constructor","defaultValue","defaultValueIndex","description","disabled","divider","dropdown","formValues","getData","getFilteredText","header","image","imageDetails","imagePackId","imageSrc","isShowing","label","onClick","rawtext","selection","setData","show","slider","spacer","step","submitButton","subscribe","text","textField","title","toggle","tooltip","translate","unsubscribe","value","valueStep","visible","width","with"]}};
const MC_JS_CONOCIDOS=new Set(("length push pop shift unshift slice splice concat join reverse sort map filter forEach reduce reduceRight find findIndex findLast findLastIndex some every includes indexOf lastIndexOf flat flatMap fill keys values entries at copyWithin "+
 "toString toFixed toPrecision toUpperCase toLowerCase trim trimStart trimEnd split replace replaceAll match matchAll startsWith endsWith padStart padEnd repeat charAt charCodeAt codePointAt substring substr localeCompare normalize test exec "+
 "get set has add delete clear size then catch finally resolve reject all race "+
 "floor ceil round abs min max sqrt pow random sin cos tan atan atan2 hypot sign trunc log exp PI "+
 "assign freeze fromEntries getPrototypeOf hasOwnProperty isArray isInteger isFinite isNaN parseInt parseFloat stringify parse from of now call apply bind "+
 "toISOString getTime error warn log info constructor prototype name message stack").split(" "));
function lintScriptApi(texto, verSrv="2.10.0"){
  const prob=[];const api=MC_API.act;
  const es210=/^2\.10(?:\.|$)/.test(String(verSrv));
  const apiNo210=new Set(["spawnXp","fade","pause","resume","seek","setPitch","setVolume","lineGapHeight","getClock","worldClockOnPaused","worldClockOnResumed","worldClockOnTimeMarker","worldClockOnTimeModified","worldClockOnRestart","TimeMarker","TimeMarkerOptions","WorldClock","WorldClockAddTimeMarkerError","WorldClockEventOptions","WorldClockInvalidRegistryError","WorldClockInvalidTimeMarkerError","WorldClockNotFoundError","WorldClockOnPausedAfterEvent","WorldClockOnPausedAfterEventSignal","WorldClockOnRestartBeforeEvent","WorldClockOnRestartBeforeEventSignal","WorldClockOnResumedAfterEvent","WorldClockOnResumedAfterEventSignal","WorldClockOnTimeMarkerAfterEvent","WorldClockOnTimeMarkerAfterEventSignal","WorldClockOnTimeModifiedAfterEvent","WorldClockOnTimeModifiedAfterEventSignal","WorldClockRegistrationError","WorldClockRegistrationOptions","WorldClockRegistry","WorldClockReloadNewWorldClockError","WorldClockReloadTimeMarkerError","WorldClockRemoveMinecraftTimeMarkerError","WorldClockRewindError","WorldClockTimeMarkerEventOptions","WorldClockTimeMarkerNotFoundError","button1WithOptions","button2WithOptions"]);
  const sin=String(texto).replace(/\/\*[\s\S]*?\*\//g,"").replace(/\/\/[^\n]*/g,"").replace(/`(?:\\.|[^`\\])*`/g,'""').replace(/"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g,'""');
  const conocidos=new Set([...api.members,...api.ui_members,...api.exports,...api.ui_exports,...MC_JS_CONOCIDOS]);
  if(es210)for(const n of apiNo210)conocidos.delete(n);
  const locales=new Set();
  for(const m of sin.matchAll(/(?:function\s+|class\s+|const\s+|let\s+|var\s+)([A-Za-z_$][\w$]*)/g))locales.add(m[1]);
  for(const m of sin.matchAll(/([A-Za-z_$][\w$]*)\s*(?::|\()\s*(?:async\s*)?(?:function|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/g))locales.add(m[1]);
  for(const m of sin.matchAll(/^\s*(?:async\s+|static\s+|get\s+|set\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/gm))locales.add(m[1]);
  for(const m of sin.matchAll(/[{,]\s*([A-Za-z_$][\w$]*)\s*(?=[:,}])/g))locales.add(m[1]);
  // 1) importaciones
  const ok1=new Set(api.exports),ok2=new Set(api.ui_exports);
  if(es210)for(const n of apiNo210){ok1.delete(n);ok2.delete(n);}
  for(const m of sin.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']?@minecraft\/(server-ui|server)["']?/g)){}
  for(const m of String(texto).matchAll(/import\s*\{([^}]*)\}\s*from\s*["']@minecraft\/(server-ui|server)["']/g)){
    const ok=m[2]==="server"?ok1:ok2;
    for(const n of m[1].split(",").map(x=>x.trim().split(/\s+as\s+/)[0]).filter(Boolean))if(!ok.has(n))prob.push("importa «"+n+"» de @minecraft/"+m[2]+" y no existe en esa versión");
  }
  // 2) eventos
  for(const m of sin.matchAll(/\.\s*(afterEvents|beforeEvents)\s*\.\s*([A-Za-z_$][\w$]*)/g)){
    const lista=api.events[m[1]==="afterEvents"?"after":"before"];
    if(es210 && apiNo210.has(m[2])){prob.push("el evento "+m[1]+"."+m[2]+" requiere @minecraft/server 2.11.0 o superior");continue;}
    if(!lista.includes(m[2]))prob.push("el evento "+m[1]+"."+m[2]+" no existe"+(m[1]==="beforeEvents"&&api.events.after.includes(m[2])?" (existe en afterEvents)":""));
  }
  // 3) métodos llamados que no existen en la API ni en JavaScript ni en el propio script
  const vistos=new Set();
  for(const m of sin.matchAll(/\.\s*([A-Za-z_$][\w$]*)\s*\(/g)){
    const n=m[1];if(vistos.has(n))continue;vistos.add(n);
    if(!conocidos.has(n)&&!locales.has(n))prob.push("llama a .{n}() que no existe en la API de Minecraft".replace("{n}",n));
  }
  // 4) clases creadas con new
  for(const m of sin.matchAll(/\bnew\s+([A-Z][\w$]*)\s*\(/g)){
    if(!["Map","Set","Date","Error","Array","Object","Promise","WeakMap","WeakSet","RegExp"].includes(m[1])&&!ok1.has(m[1])&&!ok2.has(m[1])&&!locales.has(m[1]))prob.push("usa new "+m[1]+"() y esa clase no existe");
  }
  return prob.slice(0,8);
}
// ============================================================
// 🌐 BÚSQUEDA EN INTERNET (varias fuentes a la vez, sin clave obligatoria)
//   Opcionales: TAVILY_API_KEY, BRAVE_API_KEY (más calidad). Con VENICE_API_KEY también usa la búsqueda web de Venice.
//   Siempre: DuckDuckGo, Wikipedia, Microsoft Learn (documentación de Minecraft), GitHub y Stack Overflow.
// ============================================================
const WEB_UA = "Mozilla/5.0 (compatible; EGO-AI/1.0)";
async function webFetch(url, opts, ms) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms || 6000);
  try { return await fetch(url, { ...(opts || {}), signal: c.signal, headers: { "User-Agent": WEB_UA, "Accept": "*/*", ...((opts && opts.headers) || {}) } }); }
  finally { clearTimeout(t); }
}
function webLimpiar(s) {
  return String(s || "").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/\s+/g, " ").trim();
}
async function webTavily(q, env) {
  const r = await webFetch("https://api.tavily.com/search", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.TAVILY_API_KEY }, body: JSON.stringify({ query: q, max_results: 6, search_depth: "basic" }) }, 9000);
  const d = await r.json();
  return (d.results || []).map(x => ({ titulo: x.title, url: x.url, resumen: String(x.content || "").slice(0, 400), fuente: "Tavily" }));
}
async function webBrave(q, env) {
  const r = await webFetch("https://api.search.brave.com/res/v1/web/search?count=6&q=" + encodeURIComponent(q), { headers: { "X-Subscription-Token": env.BRAVE_API_KEY, "Accept": "application/json" } }, 8000);
  const d = await r.json();
  return ((d.web && d.web.results) || []).map(x => ({ titulo: x.title, url: x.url, resumen: webLimpiar(x.description).slice(0, 400), fuente: "Brave" }));
}
async function webDuck(q) {
  const r = await webFetch("https://html.duckduckgo.com/html/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "q=" + encodeURIComponent(q) }, 7000);
  const h = await r.text(); const out = [];
  const rx = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>)?/g;
  let m; while ((m = rx.exec(h)) && out.length < 6) {
    let u = m[1].replace(/&amp;/g, "&"); const g = u.match(/[?&]uddg=([^&]+)/); if (g) u = decodeURIComponent(g[1]); if (u.startsWith("//")) u = "https:" + u;
    if (!/^https?:/.test(u)) continue;
    out.push({ titulo: webLimpiar(m[2]), url: u, resumen: webLimpiar(m[3]).slice(0, 400), fuente: "DuckDuckGo" });
  }
  return out;
}
async function webWiki(q) {
  const res = [];
  for (const lg of ["es", "en"]) {
    try {
      const r = await webFetch(`https://${lg}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json&srlimit=2&origin=*`, {}, 5000);
      const d = await r.json();
      for (const x of ((d.query && d.query.search) || [])) res.push({ titulo: x.title, url: `https://${lg}.wikipedia.org/wiki/${encodeURIComponent(x.title.replace(/ /g, "_"))}`, resumen: webLimpiar(x.snippet), fuente: "Wikipedia" });
    } catch (e) {}
  }
  return res;
}
async function webLearn(q) {
  const r = await webFetch("https://learn.microsoft.com/api/search?locale=en-us&$top=5&search=" + encodeURIComponent(q), {}, 6000);
  const d = await r.json();
  return (d.results || []).map(x => ({ titulo: x.title, url: x.url, resumen: webLimpiar(x.description).slice(0, 400), fuente: "Microsoft Learn" }));
}
async function webGithub(q) {
  const r = await webFetch("https://api.github.com/search/repositories?per_page=3&q=" + encodeURIComponent(q), { headers: { "Accept": "application/vnd.github+json" } }, 6000);
  const d = await r.json();
  return (d.items || []).map(x => ({ titulo: x.full_name, url: x.html_url, resumen: String(x.description || "").slice(0, 300) + " (★" + x.stargazers_count + ")", fuente: "GitHub" }));
}
async function webStack(q) {
  const r = await webFetch("https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&pagesize=3&site=stackoverflow&q=" + encodeURIComponent(q), {}, 6000);
  const d = await r.json();
  return (d.items || []).map(x => ({ titulo: webLimpiar(x.title), url: x.link, resumen: "Respondida: " + (x.is_answered ? "sí" : "no") + ", votos " + x.score, fuente: "Stack Overflow" }));
}
async function webNpm(q) {
  const out = [];
  const nombres = [...new Set((q.match(/@[a-z0-9_.-]+\/[a-z0-9_.-]+/gi) || []).map(x => x.toLowerCase()))].slice(0, 2);
  for (const n of nombres) {
    try {
      const r = await webFetch("https://registry.npmjs.org/" + n.replace("/", "%2f"), { headers: { "Accept": "application/vnd.npm.install-v1+json" } }, 7000);
      const d = await r.json(); const tags = d["dist-tags"] || {};
      const vs = Object.keys(d.versions || {}).filter(v => !/-/.test(v)).slice(-6);
      out.push({ titulo: "npm " + n + " (registro oficial)", url: "https://www.npmjs.com/package/" + n, resumen: "Etiquetas: " + Object.entries(tags).map(([k, v]) => k + "=" + v).join(", ") + ". Últimas versiones estables: " + vs.join(", "), fuente: "npm" });
    } catch (e) {}
  }
  return out;
}
async function veniceBuscar(q, env) {
  if (!veniceKey(env)) return null;
  const modelo = (await veniceModelos(env, "chat"))[0];
  const r = await webFetch("https://api.venice.ai/api/v1/chat/completions", { method: "POST", headers: { "Authorization": "Bearer " + veniceKey(env), "Content-Type": "application/json" },
    body: JSON.stringify({ model: modelo, max_tokens: 1200, temperature: 0.1,
      messages: [{ role: "system", content: "Busca en internet y responde con datos actuales y verificables en español. Cita la fuente de cada dato y la fecha si la ves. Si no lo encuentras, dilo." }, { role: "user", content: q }],
      venice_parameters: { enable_web_search: "on", enable_web_citations: true, include_venice_system_prompt: false } }) }, 40000);
  const d = await r.json(); if (!r.ok) return null;
  const texto = salida(d); if (!texto) return null;
  const citas = (((d.venice_parameters || {}).web_search_citations) || []).filter(c => c && c.url).slice(0, 6).map(c => ({ titulo: c.title || c.url, url: c.url, resumen: String(c.content || "").slice(0, 300), fuente: "Venice web" }));
  return { texto: texto.slice(0, 3500), citas };
}
async function webBuscar(q, env) {
  q = String(q || "").trim().slice(0, 300); if (!q) return { resultados: [], fuentes: [] };
  const mc = /(minecraft|bedrock|add-?on|@minecraft|script api)/i.test(q);
  const tareas = [];
  if (env.TAVILY_API_KEY) tareas.push(["Tavily", webTavily(q, env)]);
  if (env.BRAVE_API_KEY) tareas.push(["Brave", webBrave(q, env)]);
  const tecnico = mc || /@[a-z0-9_.-]+\/|\b(api|npm|javascript|python|versi[oó]n|sdk|framework|librer[ií]a)\b/i.test(q);
  tareas.push(["DuckDuckGo", webDuck(q)], ["Stack Overflow", webStack(q)]);
  if (/@[a-z0-9_.-]+\//i.test(q)) tareas.unshift(["npm", webNpm(q)]);
  if (!tecnico) tareas.push(["Wikipedia", webWiki(q)]);
  if (mc || /(api|javascript|python|docs|documentaci)/i.test(q)) tareas.push(["Microsoft Learn", webLearn(q)], ["GitHub", webGithub(q)]);
  const rs = await Promise.allSettled(tareas.map(t => t[1]));
  const res = [], usadas = [], vistos = new Set();
  rs.forEach((r, i) => { if (r.status === "fulfilled" && r.value && r.value.length) { usadas.push(tareas[i][0]); for (const x of r.value) { if (x.url && !vistos.has(x.url)) { vistos.add(x.url); res.push(x); } } } });
  // Prioridad: fuentes de calidad primero
  const peso = { "npm": -1, "Tavily": 0, "Brave": 0, "Microsoft Learn": 1, "GitHub": 2, "DuckDuckGo": 2, "Stack Overflow": 3, "Wikipedia": 3 };
  res.sort((a, b) => (peso[a.fuente] ?? 5) - (peso[b.fuente] ?? 5));
  return { resultados: res.slice(0, 10), fuentes: usadas };
}
function webUrlSegura(u) {
  try { const x = new URL(u); if (!/^https?:$/.test(x.protocol)) return false; const h = x.hostname; return !(/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[)/.test(h) || !h.includes(".")); } catch (e) { return false; }
}
async function webLeer(url, max) {
  if (!webUrlSegura(url)) return "";
  try {
    const r = await webFetch(url, {}, 7000); if (!r.ok) return "";
    const ct = r.headers.get("content-type") || ""; if (!/text|json|xml/.test(ct)) return "";
    const t = (await r.text()).slice(0, 400000);
    return (/html/.test(ct) ? webLimpiar(t) : t.replace(/\s+/g, " ")).slice(0, max || 3500);
  } catch (e) { return ""; }
}
// Reglas para decidir cuándo conviene buscar solos (o siempre que el usuario lo pida)
const RX_WEB = /(busca(?:r|me)?\s+(?:en\s+)?(?:internet|la web|google)|b[uú]sca(?:lo)?\s+en\s+(?:internet|la web)|investiga|en internet|en la web|[uú]ltim[ao]s?\s+(?:versi[oó]n|noticias|novedades)|versi[oó]n\s+(?:actual|m[aá]s reciente|estable)|changelog|novedades|noticias|cu[aá]nto cuesta|qui[eé]n es el actual|esta semana|compatible con|ya sali[oó]|sali[oó] la|lanzamiento|documentaci[oó]n oficial)/i;
async function contextoWeb(texto, env, forzar) {
  const q = String(texto || "").replace(/\s+/g, " ").slice(0, 300);
  const [b, v] = await Promise.all([webBuscar(q, env), veniceBuscar(q, env).catch(() => null)]);
  const todos = [...(v ? v.citas : []), ...b.resultados];
  const vistos = new Set(), lista = [];
  for (const x of todos) { if (!vistos.has(x.url)) { vistos.add(x.url); lista.push(x); } }
  if (!lista.length && !(v && v.texto)) return { texto: "", fuentes: [] };
  // Lee las 2 mejores páginas (documentación) para tener datos y no solo títulos
  const leer = lista.filter(x => /learn\.microsoft|github\.com|wiki\.bedrock|minecraft\.net|docs\.|developer\./.test(x.url)).slice(0, 2);
  const paginas = await Promise.all(leer.map(x => webLeer(x.url, 2500)));
  let c = "\n\n=== INFORMACIÓN ACTUAL DE INTERNET (consultada ahora, " + new Date().toISOString().slice(0, 10) + ") ===\nUsa estos datos como fuente principal para versiones, fechas, precios y noticias; si algo no aparece aquí, dilo en vez de inventarlo, y cita las fuentes.\n";
  if (v && v.texto) c += "\n[Búsqueda de Venice]\n" + v.texto + "\n";
  lista.slice(0, 8).forEach((x, i) => { c += `\n[${i + 1}] ${x.titulo} — ${x.url} (${x.fuente})\n${x.resumen || ""}\n`; });
  paginas.forEach((p, i) => { if (p) c += `\n--- Contenido de ${leer[i].url} ---\n${p}\n`; });
  c += "=== FIN INTERNET ===\n";
  return { texto: c, fuentes: lista.slice(0, 6).map(x => ({ titulo: x.titulo, url: x.url })), usadas: [...new Set([...(v ? ["Venice web"] : []), ...b.fuentes])] };
}
const RX_WEB_PEDIDA = /(internet|busca(?:r|me)?\b|investiga|la web|google)/i;
// ============================================================
// 🏗️ GENERADOR POR PARTES DE ADD-ONS GRANDES (Minecraft Bedrock)
//   mc_plan  → el modelo planifica (objetos, ids y partes)
//   mc_part  → cada parte se genera en su propia petición (sin límite de tamaño)
//   mc_build → el código arma el paquete: manifests, texturas PNG, idiomas, scripts y README
// El modelo escribe solo la lógica; todo lo frágil (manifest, UUID, texturas, lang) lo hace el código.
// ============================================================
const MC_GUIA_BASE=`Eres un ingeniero experto en Minecraft BEDROCK Edition (Android, Windows, consolas). NUNCA Java, Forge ni Fabric. Trabajas con packs: BP/ (behavior pack) y RP/ (resource pack).
REGLAS GENERALES:
- Todos los identificadores llevan el prefijo del add-on (ej. ns:nombre_del_objeto) y se escriben EXACTAMENTE como en el plan.
- NO escribas manifest.json, pack_icon.png, imágenes PNG ni archivos binarios: el sistema los genera solo (manifests, texturas, íconos y archivos de idioma).
- JSON estricto: sin comentarios, sin comas finales. Contenido completo, sin placeholders ni "...".
- Haz EXACTAMENTE lo que pidió el usuario: no agregues objetos, armas, jefes ni funciones que no pidió (los ejemplos de estas guías son solo de formato, nunca los copies).
- No inventes componentes ni APIs. Si no estás seguro de algo, usa la opción más simple y segura que sí exista.`;
const MC_GUIAS={
 items:`ÍTEMS (BP/items/<nombre>.json): {"format_version":"1.21.0","minecraft:item":{"description":{"identifier":"ns:nombre","menu_category":{"category":"equipment|items|nature|construction","group":"itemGroup.name.sword (opcional)"}},"components":{...}}}.
Componentes válidos: "minecraft:icon":{"textures":{"default":"nombre_corto"}}, "minecraft:max_stack_size":N, "minecraft:hand_equipped":true, "minecraft:damage":N, "minecraft:durability":{"max_durability":N}, "minecraft:enchantable":{"slot":"sword|axe|pickaxe|shovel|hoe|bow|armor_head|armor_torso|armor_legs|armor_feet","value":10}, "minecraft:food":{"nutrition":4,"saturation_modifier":0.6,"can_always_eat":false}, "minecraft:use_modifiers":{"use_duration":1.6,"movement_modifier":0.35}, "minecraft:wearable":{"slot":"slot.armor.chest","protection":6}, "minecraft:fuel":{"duration":20}, "minecraft:glint":true, "minecraft:can_destroy_in_creative":false.
NO uses "minecraft:cooldown". El ícono (PNG) lo genera el sistema; usa "minecraft:icon" con textures.default = nombre corto en minúsculas.`,
 blocks:`BLOQUES (BP/blocks/<nombre>.json): {"format_version":"1.21.0","minecraft:block":{"description":{"identifier":"ns:nombre","menu_category":{"category":"construction|nature|items"}},"components":{"minecraft:material_instances":{"*":{"texture":"nombre_corto","render_method":"opaque"}},"minecraft:destructible_by_mining":{"seconds_to_destroy":3},"minecraft:destructible_by_explosion":{"explosion_resistance":6},"minecraft:light_emission":0-15,"minecraft:friction":0.4,"minecraft:map_color":"#RRGGBB","minecraft:loot":"loot_tables/blocks/nombre.json"}}}. La textura del bloque la genera el sistema (el nombre_corto de material_instances).`,
 entities:`CRIATURAS (BP/entities/<nombre>.json, format_version "1.21.0"): {"minecraft:entity":{"description":{"identifier":"ns:nombre","is_spawnable":true,"is_summonable":true,"is_experimental":false},"component_groups":{...},"components":{...},"events":{...}}}.
Componentes típicos: "minecraft:type_family":{"family":["ns_nombre","monster"]}, "minecraft:health":{"value":40,"max":40}, "minecraft:collision_box":{"width":0.6,"height":1.9}, "minecraft:movement":{"value":0.25}, "minecraft:movement.basic":{}, "minecraft:navigation.walk":{"can_path_over_water":true,"avoid_water":true,"can_break_doors":false}, "minecraft:jump.static":{}, "minecraft:can_climb":{}, "minecraft:physics":{}, "minecraft:pushable":{"is_pushable":true,"is_pushable_by_piston":true}, "minecraft:attack":{"damage":6}, "minecraft:behavior.float":{"priority":0}, "minecraft:behavior.melee_attack":{"priority":3,"speed_multiplier":1.0,"track_target":true}, "minecraft:behavior.random_stroll":{"priority":6,"speed_multiplier":1.0}, "minecraft:behavior.look_at_player":{"priority":7,"look_distance":8}, "minecraft:behavior.random_look_around":{"priority":9}, "minecraft:behavior.hurt_by_target":{"priority":1}, "minecraft:behavior.nearest_attackable_target":{"priority":2,"must_see":true,"reselect_targets":true,"entity_types":[{"filters":{"test":"is_family","subject":"other","value":"player"},"max_dist":24}]}, "minecraft:loot":{"table":"loot_tables/entities/nombre.json"}, "minecraft:despawn":{"despawn_from_distance":{}}, "minecraft:experience_reward":{"on_death":"5"}.
El aspecto visual lo resuelve el sistema reutilizando un modelo del juego (zombie, esqueleto, cerdo, vaca, araña o creeper según el nombre); NO escribas archivos de RP/entity ni geometrías.`,
 script:`SCRIPT (BP/scripts/main.js es el archivo de entrada; puedes crear otros en BP/scripts/ e importarlos con rutas relativas "./otro.js"). JavaScript moderno (módulos ES).
Importa solo: import { world, system, ItemStack } from "@minecraft/server"; (y "@minecraft/server-ui" para formularios).
APIs de @minecraft/server 1.17 que SÍ existen: world.afterEvents.{itemUse,itemUseOn,entityHitEntity,entityHurt,entityDie,entitySpawn,playerSpawn,playerJoin,playerLeave,playerBreakBlock,playerPlaceBlock,projectileHitEntity,projectileHitBlock,buttonPush,leverAction}, world.beforeEvents.{itemUse,playerBreakBlock,explosion}, system.run(fn), system.runTimeout(fn,ticks), system.runInterval(fn,ticks), system.currentTick, world.getAllPlayers(), world.getDimension("overworld"), world.sendMessage(txt), world.getDynamicProperty/setDynamicProperty. Entity/Player: id, typeId, location, dimension, nameTag, getComponent("minecraft:health"|"minecraft:inventory"|"minecraft:equippable"), addEffect("speed",ticks,{amplifier,showParticles}), removeEffect, setOnFire(seg,true), applyDamage(n), kill(), remove(), teleport(loc), getViewDirection(), addTag/hasTag/removeTag, getEntitiesFromViewDirection({maxDistance}), getBlockFromViewDirection({maxDistance}), Player.sendMessage, Player.playSound("id"), Player.onScreenDisplay.setActionBar(txt)/setTitle(txt), runCommand("comando"). Dimension: spawnEntity(typeId,loc), spawnItem(new ItemStack(id,n),loc), spawnParticle("minecraft:id",loc), createExplosion(loc,radio,{breaksBlocks,causesFire}), getEntities({location,maxDistance,type,excludeTypes}), getPlayers(), getBlock(loc), runCommand("cmd"). Block: typeId, location, setType("minecraft:id"). 
IMPORTANTE: las habilidades especiales de armas y herramientas (rayos, fuego, hielo, explosión, veneno, viento, curación al usar o golpear) las programa EGO automáticamente según el campo "habilidad" del plan: NO las escribas tú. Escribe aquí solo lógica adicional (eventos del mundo, comandos, jefes, etc.).
Reglas: no uses await en el nivel superior, ni setTimeout/Date.now (usa system.runTimeout y system.currentTick); envuelve la lógica de cada evento en try/catch; compara ítems con itemStack.typeId; usa Map con id del jugador para los tiempos de espera; sin dependencias externas.`,
 recipes:`RECETAS (BP/recipes/<nombre>.json): {"format_version":"1.20.10","minecraft:recipe_shaped":{"description":{"identifier":"ns:nombre_receta"},"tags":["crafting_table"],"pattern":["ABA"," C "," C "],"key":{"A":{"item":"minecraft:diamond"},"B":{"item":"ns:otro"},"C":{"item":"minecraft:stick"}},"result":{"item":"ns:resultado","count":1}}}. También "minecraft:recipe_shapeless" (ingredients:[{"item":"..."}]) y "minecraft:recipe_furnace" (input, output, tags:["furnace"]).`,
 loot:`TABLAS DE BOTÍN (BP/loot_tables/entities/<nombre>.json o BP/loot_tables/blocks/<nombre>.json): {"pools":[{"rolls":1,"entries":[{"type":"item","name":"minecraft:diamond","weight":1,"functions":[{"function":"set_count","count":{"min":1,"max":3}}]}]}]}.`,
 spawn:`REGLAS DE APARICIÓN (BP/spawn_rules/<nombre>.json): {"format_version":"1.8.0","minecraft:spawn_rules":{"description":{"identifier":"ns:nombre","population_control":"monster|animal|ambient"},"conditions":[{"minecraft:spawns_on_surface":{},"minecraft:brightness_filter":{"min":0,"max":7,"adjust_for_weather":false},"minecraft:weight":{"default":80},"minecraft:herd":{"min_size":1,"max_size":3},"minecraft:biome_filter":{"test":"has_biome_tag","operator":"==","value":"overworld"}}]}}.`
};
MC_GUIAS.misc=[MC_GUIAS.items,MC_GUIAS.blocks,MC_GUIAS.entities,MC_GUIAS.script,MC_GUIAS.recipes,MC_GUIAS.loot,MC_GUIAS.spawn].join("\n\n");

function mcNs(v){const s=String(v||"").toLowerCase().replace(/[^a-z0-9_]/g,"").slice(0,12);return /^[a-z][a-z0-9_]{1,11}$/.test(s)?s:"ego";}
function mcId(ns,v){const x=String(v||"").toLowerCase().replace(/^[^:]*:/,"").normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9_]+/g,"_").replace(/^_+|_+$/g,"").slice(0,40);return x?ns+":"+x:"";}
const MC_TIPOS_PARTE=["items","blocks","entities","script","recipes","loot","spawn","misc"];
const RX_3D=/(?:modelo\s*(?:3\s*d|propio|grande|personalizado|custom)|\b3\s*d\b|geometr[ií]a|jefe\s+(?:gigante|enorme|grande)|boss\s+gigante|dise[nñ]o\s+propio)/i;
function limpiarPlan(j,prompt){
  const base={nombre:"Add-on EGO",ns:"ego",resumen:String(prompt||"").slice(0,300),objetos:[],partes:[]};
  if(!j||typeof j!=="object") j={};
  base.nombre=tituloCaso(String(j.nombre||"Add-on EGO").replace(/[^\p{L}\p{N} '’-]/gu,""))||"Add-on EGO";
  base.ns=mcNs(j.ns);
  {const cnt={};for(const o of (Array.isArray(j.objetos)?j.objetos:[])){const mm=String(o&&o.id||"").match(/^([a-z][a-z0-9_]{1,12}):/i);if(mm){const k=mm[1].toLowerCase();cnt[k]=(cnt[k]||0)+1;}}const top=Object.entries(cnt).sort((a,b)=>b[1]-a[1])[0];if(top&&(base.ns==="ego"||!cnt[base.ns]))base.ns=mcNs(top[0]);}
  base.resumen=String(j.resumen||prompt||"").slice(0,400);
  base.requisitos=(Array.isArray(j.requisitos)?j.requisitos:[]).map(x=>String(x||"").trim().slice(0,160)).filter(Boolean).slice(0,14);
  {const pj=new Set((Array.isArray(j.poderes_jugador)?j.poderes_jugador:(Array.isArray(j.poderesJugador)?j.poderesJugador:[])).map(x=>normMc(x).replace(/[^a-z_]/g,"")).filter(x=>MC_PODERES_JUG[x]));for(const x of detectarPoderesJugador(prompt))pj.add(x);base.poderesJugador=[...pj];}
  const sinObj=/(?:no quiero|sin|nada de|no necesito)\s+(?:ning[uú]n\s+)?(?:objetos?|[ií]tems?|criaturas?|mobs?|bloques?|armas?)/i.test(String(prompt||""));
  if(j.kit&&typeof j.kit==="object"&&/\b(?:cofres?|kit|caja)\b/i.test(String(prompt||""))){const K=j.kit;base.kit={armadura:!!K.armadura,herramientas:!!K.herramientas,recursos:!!K.recursos,encantar:!!K.encantar,material:/diam/i.test(String(K.material))?"diamond":"netherite"};}
  const vistos=new Set();
  for(const o of (sinObj&&base.poderesJugador.length?[]:(Array.isArray(j.objetos)?j.objetos:[]).slice(0,60))){
    const id=mcId(base.ns,o&&o.id); const tipo=["item","block","entity"].includes(o&&o.tipo)?o.tipo:"item";
    if(!id||vistos.has(id)) continue; vistos.add(id);
    base.objetos.push({id,tipo,icono:["arma_fuego","pistola","rifle","escopeta","francotirador","botiquin","granada","municion","armadura","escudo","espada","hacha","pico","vara","reloj","libro","corona","botella","anillo","lingote","orbe","gema"].includes(normMc(o.icono))?normMc(o.icono):"",nombre:tituloCaso(String(o.nombre||id.split(":")[1].replace(/_/g," "))).slice(0,40),descripcion:String(o.descripcion||"").slice(0,300),habilidad:["rayo","fuego","hielo","explosion","veneno","viento","curacion","ninguna"].includes(normMc(o.habilidad))?normMc(o.habilidad):"",entrega:["kit","crafteo","creativo","botin","aparece"].includes(normMc(o.entrega))?normMc(o.entrega):"",rayos:Number(o.rayos)||0,espera:Number(o.espera)||0,poderes:(Array.isArray(o.poderes)?o.poderes:[]).map(x=>normMc(x).replace(/[^a-z_]/g,"")).filter(x=>MC_PODERES[x]).slice(0,8)});
  }
  for(const p of (sinObj&&base.poderesJugador.length?[]:(Array.isArray(j.partes)?j.partes:[])).slice(0,8)){
    if(/^(?:textur|sonid|sound|audio|icon|imagen)/i.test(String(p&&p.titulo||"").trim())&&!/(?:script|logic|comport)/i.test(String(p&&p.titulo||"")))continue; // EGO crea las texturas solo; los sonidos no se pueden generar
    if(p&&p.tipo==="modelo3d")continue;
    const tipo=MC_TIPOS_PARTE.includes(p&&p.tipo)?p.tipo:"misc";
    const arch=(Array.isArray(p&&p.archivos)?p.archivos:[]).map(x=>safeProjectPath(x)).filter(x=>x&&/^(BP|RP)\//.test(x)&&!/manifest\.json$|\.png$/i.test(x)).slice(0,12);
    base.partes.push({titulo:String((p&&p.titulo)||"Parte "+(base.partes.length+1)).slice(0,60),tipo,detalle:String((p&&p.detalle)||"").slice(0,1500),archivos:arch});
  }
  if(!base.partes.length&&!(sinObj&&base.poderesJugador.length)) base.partes.push({titulo:"Add-on completo",tipo:"misc",detalle:String(prompt||"").slice(0,1500),archivos:[]});
  {const ents=base.objetos.filter(o=>o.tipo==="entity");const pedidos=new Map();
   for(const q of (Array.isArray(j.modelos3d)?j.modelos3d:[]).slice(0,6)){const id=mcId(base.ns,q&&(q.entidad||q.id));if(ents.some(e=>e.id===id))pedidos.set(id,String((q&&q.descripcion)||"").slice(0,500));}
   if(RX_3D.test(String(prompt||"")))for(const e of ents)if(!pedidos.has(e.id))pedidos.set(e.id,"");
   for(const [id,desc] of [...pedidos].slice(0,4)){const o=ents.find(e=>e.id===id);base.partes.push({titulo:"Modelo 3D: "+o.nombre,tipo:"modelo3d",detalle:desc||o.descripcion||"",archivos:[],entidad:id});}}
  base.sonidos=[];for(const s of (Array.isArray(j.sonidos)?j.sonidos:[]).slice(0,4)){const texto=String(s&&s.texto||"").replace(/[<>]/g," ").trim().slice(0,240);if(texto.length<3)continue;const nom=String(s&&s.nombre||"voz").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9_]/g,"_").slice(0,20)||"voz";const ent=s&&s.entidad?mcId(base.ns,s.entidad):"";base.sonidos.push({nombre:nom+(base.sonidos.length?"_"+base.sonidos.length:""),texto,entidad:ent});}
  return base;
}
async function candidatosCodigo(env,rol){
  const c=[];
  if(rol==="razonar"){
    if(veniceKey(env)&&env.VENICE_FIRST!=="0")for(const x of await veniceModelos(env,"reasoning"))c.push({tipo:"venice",id:x});
    if(env.AI)for(const x of CF_MODELS.razonar.slice(0,3))c.push({tipo:"cf",id:x});
    if(veniceKey(env)&&env.VENICE_FIRST==="0")for(const x of await veniceModelos(env,"reasoning"))c.push({tipo:"venice",id:x});
    if(routerApiKey(env))for(const x of openRouterCandidates(env,"reasoning").slice(0,2))c.push({tipo:"or",id:x});
    if(c.length)return c;
  }
  const ven=veniceKey(env)?(await veniceModelos(env,"code")).map(m=>({tipo:"venice",id:m})):[];
  if(ven.length&&env.VENICE_FIRST!=="0") c.push(...ven);
  if(env.AI){const cad=env.PROJECT_CF_MODEL?[String(env.PROJECT_CF_MODEL),...CF_MODELS.codigo.filter(m=>m!==String(env.PROJECT_CF_MODEL))]:CF_MODELS.codigo;
    for(const m of cad.slice(0,4)) c.push({tipo:"cf",id:m});}
  if(ven.length&&env.VENICE_FIRST==="0") c.push(...ven);
  if(routerApiKey(env)) for(const m of openRouterCandidates(env,"code").slice(0,2)) c.push({tipo:"or",id:m});
  return c;
}
async function llamarCodigo(env,mensajes,maxTok,desde,rol){
  const cands=await candidatosCodigo(env,rol); const fallos=[];
  if(!cands.length) throw new Error("Configura Workers AI, VENICE_API_KEY u OPENROUTER_API_KEY.");
  for(let i=Math.min(desde||0,cands.length-1);i<cands.length;i++){
    const c=cands[i];
    try{
      let raw="";
      if(c.tipo==="cf") raw=(await cfChat(c.id,mensajes,env,maxTok)).content;
      else if(c.tipo==="venice") raw=(await veniceChat(mensajes,env,maxTok,c.id)).content;
      else{
        const r=await fetch("https://openrouter.ai/api/v1/chat/completions",{method:"POST",headers:{"Authorization":`Bearer ${routerApiKey(env)}`,"Content-Type":"application/json","HTTP-Referer":env.OPENROUTER_SITE_URL||"https://ego-ai.app","X-Title":"EGO AI"},body:JSON.stringify({model:c.id,messages:mensajes,temperature:0.15,max_tokens:Math.min(maxTok,16000)})});
        const data=await r.json().catch(()=>({}));
        if(!r.ok) {
          const detalle=String(data?.error?.message||data?.error||"proveedor rechazó la solicitud").slice(0,180);
          if(r.status===402) throw new Error(`CRÉDITOS/TOKENS INSUFICIENTES (HTTP 402): ${detalle}`);
          throw new Error(`HTTP ${r.status}: ${detalle}`);
        }
        raw=salida(data);
      }
      if(raw&&String(raw).trim()) return {raw:String(raw),model:c.id,idx:i,fallos};
      fallos.push(c.id.split("/").pop()+": vacío");
    }catch(e){fallos.push(c.id.split("/").pop()+": "+String(e&&e.message||e).slice(0,70));}
  }
  throw new Error("Ningún modelo respondió ("+fallos.join(" | ").slice(0,260)+")");
}
// JSON tolerante: quita comentarios de línea y comas finales antes de rendirse.
function jsonTolerante(t){
  try{return {ok:true,obj:JSON.parse(t)};}catch{}
  try{
    const l=String(t).replace(/^\s*\/\/.*$/gm,"").replace(/\/\*[\s\S]*?\*\//g,"").replace(/,\s*([}\]])/g,"$1");
    return {ok:true,obj:JSON.parse(l)};
  }catch(e){return {ok:false,error:String(e&&e.message||e).slice(0,100)};}
}

async function mcPlan(body,env){
  const prompt=String(body.prompt||"").trim().slice(0,12000);
  if(!prompt) return respuestaJsonError("Falta prompt.");
  const sys=MC_GUIA_BASE+`\n\nTu tarea ahora: PLANIFICAR el add-on pedido. Devuelve SOLO un JSON (sin Markdown) con esta forma:
{"nombre":"Nombre del add-on","ns":"prefijo corto en minúsculas (por defecto ego)","resumen":"qué hace en 1-2 frases","requisitos":["una línea por cada cosa CONCRETA que pidió el usuario, con sus detalles; si algo no se puede hacer en Minecraft Bedrock, empieza la línea con IMPOSIBLE: y explica qué se hará en su lugar"],"objetos":[{"id":"ns:nombre_en_minusculas","tipo":"item|block|entity","nombre":"Nombre visible","descripcion":"cómo se comporta","icono":"arma_fuego|pistola|rifle|escopeta|francotirador|botiquin|municion|armadura|escudo|espada|hacha|pico|vara|reloj|libro|corona|botella|anillo|lingote|orbe|gema: cómo se ve el ítem","habilidad":"solo para ítems de arma/herramienta: rayo|fuego|hielo|explosion|veneno|viento|curacion|ninguna (EGO programa esa habilidad automáticamente: clic derecho + golpe)","entrega":"kit|crafteo|creativo|botin|aparece: DÓNDE y CUÁNDO recibe el jugador este objeto según el pedido (si dijo que viene en el cofre inicial, kit)","poderes":["solo si el ítem da poderes pasivos o de vuelo: vuelo|vision_nocturna|velocidad|fuerza|regeneracion|resistencia|salto|respirar_agua|sin_hambre|resistencia_fuego"]}],"kit":null,"poderes_jugador":[],"modelos3d":[],"sonidos":[],"partes":[{"titulo":"corto","tipo":"items|blocks|entities|script|recipes|loot|spawn","detalle":"instrucciones exactas y completas de lo que debe contener esta parte (comportamientos, números, ids que usa)","archivos":["BP/items/nombre.json"]}]}
ANÁLISIS PROFUNDO: antes de planificar, lee el pedido palabra por palabra y enumera en "requisitos" TODO lo que pidió (nada más, nada menos). Cada objeto, habilidad y parte del plan debe servir a un requisito. No interpretes a tu gusto: si el usuario no lo dijo, no lo agregues.
PODERES DEL JUGADOR: si el usuario quiere TENER poderes él mismo (inmortal, vida infinita, volar, velocidad, fuerza, daño infinito, aura, miedo en monstruos, aldeanos que lo adoran, destruir, levantar objetos, visión nocturna, saltar, respirar bajo el agua, sin hambre, inmune al fuego), ponlos en \"poderes_jugador\" usando SOLO estos nombres: inmortal, vida_infinita, vuelo, velocidad, fuerza, dano_infinito, aura, miedo_mobs, adoracion_aldeanos, destruccion, telekinesis, vision_nocturna, salto, respirar_agua, sin_hambre, resistencia_fuego. EGO los programa y se activan solos al entrar al mundo: NO crees ítems, criaturas ni scripts para eso. Si dijo que no quiere objetos, objetos=[] y partes=[].
MODELOS 3D: si el usuario pide un modelo 3D, un diseño propio, un jefe/criatura grande o que se vea diferente a los mobs del juego, pon en \"modelos3d\" una entrada por criatura: {\"entidad\":\"ns:id de un objeto tipo entity\",\"descripcion\":\"cómo se ve: forma, tamaño, colores, partes\"}. EGO diseña la geometría y la textura por su cuenta. SONIDOS Y VOCES: si pide que algo hable o tenga voz/sonido propio, pon en \"sonidos\" {\"nombre\":\"corto\",\"texto\":\"frase exacta que dirá (máx 240 caracteres)\",\"entidad\":\"ns:id opcional: suena cuando aparece\"}; EGO genera el audio con voz sintética.
REGLA CLAVE: incluye SOLO lo que el usuario pidió, nada más (cero extras de ejemplo). EGO programa por su cuenta, sin que tú lo escribas: (a) las habilidades de armas (campo habilidad), (b) los poderes de un ítem (campo poderes: vuelo, visión nocturna, etc.), (c) el KIT INICIAL: si el usuario pide recibir al crear/entrar al mundo un cofre con armadura, herramientas o recursos, pon en el JSON "kit":{"armadura":true|false,"herramientas":true|false,"recursos":true|false,"encantar":true|false,"material":"netherite|diamond"} (si no lo pidió, "kit":null) y NO crees bloques, ítems ni scripts para eso. Solo crea los objetos personalizados que el usuario nombró (ej. el reloj o el amuleto).
Reglas: máximo 8 partes y 12 archivos por parte; separa en partes lógicas (ítems, bloques, criaturas, scripts, recetas, botín, aparición); cada parte debe poder escribirse sola usando los ids de "objetos"; los scripts van en BP/scripts/ (el principal es BP/scripts/main.js); no incluyas manifests ni imágenes. Sé fiel al pedido y no recortes funciones: si el usuario pide mucho, haz muchas partes.`;
  try{
    const r=await llamarCodigo(env,[{role:"system",content:sys},{role:"user",content:"Pedido del usuario:\n"+prompt}],6000,0,"razonar");
    const plan=limpiarPlan(extractJson(r.raw),prompt);
    return json({ok:true,plan,model:r.model,fallosModelos:r.fallos||[]});
  }catch(e){
    const plan=limpiarPlan(null,prompt);
    return json({ok:true,plan,model:"plan-basico",aviso:String(e&&e.message||e).slice(0,160)});
  }
}

const MC_FORMATO=`\n\nFORMATO DE RESPUESTA (obligatorio, sin Markdown ni explicaciones): para CADA archivo escribe una línea exacta "=== ARCHIVO: ruta/relativa.ext ===", luego el contenido completo del archivo tal cual y termina con la línea exacta "=== FIN ===".`;

const MC_CRITICO_SYS=`Eres un REVISOR TÉCNICO estricto de add-ons de Minecraft Bedrock 1.26.52.x (@minecraft/server 2.10.0 estable). Recibes los REQUISITOS del usuario, el plan y los archivos recién escritos por otra IA. Busca SOLO defectos REALES y concretos que harían que algo NO funcione en el juego o que no cumplan un requisito:
- lógica que falta o está vacía (funciones sin cuerpo, TODO, comentarios en vez de código), o que no implementa lo que dice el requisito;
- ids que no coinciden con los del plan; efectos/eventos/sonidos/partículas con nombres inexistentes;
- API obsoleta: world.events, runCommandAsync, require(), setTimeout, Location(), applyKnockback con 4 argumentos (ahora es applyKnockback({x,z}, vertical)), cambiar bloques o entidades dentro de beforeEvents sin system.run;
- JSON de entidades/ítems/bloques con componentes inventados o mal formados;
- cosas que se ejecutan al cargar el script usando world/dimensiones antes de tiempo.
No inventes problemas ni pidas mejoras de estilo. Si todo está bien responde {"problemas":[]}.
Responde SOLO JSON: {"problemas":[{"archivo":"ruta","problema":"qué está mal, concreto","arreglo":"cómo corregirlo"}]} con máximo 6.`;
const tmoMc=(ms)=>new Promise((_,rej)=>setTimeout(()=>rej(new Error("tiempo")),ms));
function parsearSalidaMc(raw){
  const p=leerProyectoModelo(raw);const files=[],errores=[];const vistos=new Set();
  if(!p||!p.files.length)return {files,errores:["formato"]};
  for(const f of p.files){
    const path=safeProjectPath(f.path);
    if(!path||!/^(BP|RP)\//.test(path)||/manifest\.json$|\.(png|jpg|ogg|zip|mcaddon)$/i.test(path)||vistos.has(path)||typeof f.content!=="string")continue;
    vistos.add(path);
    if(/\.json$/i.test(path)){const t=jsonTolerante(f.content);if(!t.ok){errores.push(path);continue;}files.push({path,content:JSON.stringify(t.obj,null,2)+"\n"});}
    else if(/\.js$/i.test(path)){if(balanceJs(f.content)||lintScriptApi(f.content, "2.10.0").length){errores.push(path);continue;}files.push({path,content:f.content});}
    else files.push({path,content:f.content.slice(0,300000)});
  }
  return {files,errores};
}
// ===== MODELOS 3D PROPIOS (geometría + textura de paleta, generadas por código: siempre válidas) =====
function limpiarModelo3d(partes){
  const out=[];const nombres=new Set();
  for(const p of (Array.isArray(partes)?partes:[]).slice(0,160)){
    if(!p||typeof p!=="object")continue;
    const num=(v,d,lo,hi)=>{const n=Number(v);return Number.isFinite(n)?Math.max(lo,Math.min(hi,n)):d};
    const vec=(a,d,lo,hi)=>Array.isArray(a)&&a.length>=3?[num(a[0],d[0],lo,hi),num(a[1],d[1],lo,hi),num(a[2],d[2],lo,hi)]:null;
    const tam=vec(p.tam||p.size||p.tamano,[0,0,0],0,160);const org=vec(p.origen||p.pos||p.origin,[0,0,0],-160,160);
    if(!tam||!org||tam.every(v=>v<=0))continue;
    let col=String(p.color||"#888888").trim();if(!/^#[0-9a-f]{6}$/i.test(col))col="#888888";
    {const rgb=[1,3,5].map(i=>parseInt(col.slice(i,i+2),16));const lum=(rgb[0]+rgb[1]+rgb[2])/3;const esOjo=/ojo|eye|brill|gema|runa/.test(String(p.nombre||p.name||"").toLowerCase());if(lum<46&&!esOjo){col="#"+rgb.map((v,i)=>Math.round(v*0.55+[78,70,96][i]*0.45).toString(16).padStart(2,"0")).join("");}}
    let nom=String(p.nombre||p.name||"parte").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9_]/g,"_").slice(0,24)||"parte";
    let k=nom,n=2;while(nombres.has(k))k=nom+"_"+(n++);nom=k;nombres.add(nom);
    const piv=vec(p.pivote||p.pivot,[0,0,0],-160,160);const rot=vec(p.rot||p.rotacion||p.rotation,[0,0,0],-180,180);
    out.push({nombre:nom,origen:org,tam:tam.map(v=>Math.max(0,v)),color:col.toLowerCase(),pivote:piv,rot:rot&&rot.some(v=>v)?rot:null,padre:String(p.padre||p.parent||"").toLowerCase().replace(/[^a-z0-9_]/g,"_").slice(0,24)});
  }
  return out;
}
function construirModelo3d(geoId,partes){
  const ps=limpiarModelo3d(partes);if(ps.length<3)return null;
  const cols=[...new Set(ps.map(p=>p.color))].slice(0,256);const idx=new Map(cols.map((c,i)=>[c,i]));
  const px=new Uint8Array(16*16*4);
  cols.forEach((c,i)=>{const o=i*4;px[o]=parseInt(c.slice(1,3),16);px[o+1]=parseInt(c.slice(3,5),16);px[o+2]=parseInt(c.slice(5,7),16);px[o+3]=255});
  for(let i=cols.length;i<256;i++){px[i*4+3]=255;px[i*4]=px[i*4+1]=px[i*4+2]=128}
  const nombres=new Set(ps.map(p=>p.nombre));
  let minX=1e9,maxX=-1e9,minY=1e9,maxY=-1e9,minZ=1e9,maxZ=-1e9;
  const bones=ps.map(p=>{
    const ci=idx.has(p.color)?idx.get(p.color):0,u=ci%16,v=Math.floor(ci/16);
    const cara={uv:[u,v],uv_size:[1,1]};
    const t=p.tam.map(x=>Math.max(x,0));
    minX=Math.min(minX,p.origen[0]);maxX=Math.max(maxX,p.origen[0]+t[0]);minY=Math.min(minY,p.origen[1]);maxY=Math.max(maxY,p.origen[1]+t[1]);minZ=Math.min(minZ,p.origen[2]);maxZ=Math.max(maxZ,p.origen[2]+t[2]);
    const b={name:p.nombre,pivot:p.pivote||[p.origen[0]+t[0]/2,p.origen[1]+t[1]/2,p.origen[2]+t[2]/2],cubes:[{origin:p.origen,size:t,uv:{north:cara,east:cara,south:cara,west:cara,up:cara,down:cara}}]};
    if(p.padre&&p.padre!==p.nombre&&nombres.has(p.padre))b.parent=p.padre;
    if(p.rot)b.rotation=p.rot;
    return b;
  });
  const ancho=Math.max(2,Math.ceil(Math.max(Math.abs(minX),Math.abs(maxX),Math.abs(minZ),Math.abs(maxZ))*2/16)+1),alto=Math.max(2,Math.ceil(maxY/16)+1);
  const geo={format_version:"1.12.0","minecraft:geometry":[{description:{identifier:geoId,texture_width:16,texture_height:16,visible_bounds_width:ancho,visible_bounds_height:alto,visible_bounds_offset:[0,alto/2,0]},bones}]};
  const FASE={pierna_i:1,pierna_d:-1,bota_i:1,bota_d:-1,brazo_i:-1,brazo_d:1,manga_i:-1,manga_d:1,hombrera_i:-1,hombrera_d:1,pata_di:1,pata_dd:-1,pata_ti:-1,pata_td:1};
  const ab={};for(const p of ps){const f=FASE[p.nombre]??(/^pata_/.test(p.nombre)?((Number((p.nombre.match(/\d+$/)||["0"])[0])%2)?-1:1):0);if(f){const amp=/brazo|manga|hombrera/.test(p.nombre)?28:36;ab[p.nombre]={rotation:["Math.cos(query.modified_distance_moved * 38.17) * "+(f*amp)+" * query.modified_move_speed",0,0]};}}
  return {geo:JSON.stringify(geo,null,2)+"\n",png:pngBytes(16,16,px),cubos:ps.length,colores:cols.length,alto:maxY-minY,ancho:Math.max(maxX-minX,maxZ-minZ),animados:Object.keys(ab).length,bonesAnim:ab};
}
// ===== GENERADORES DE MODELOS: proporciones correctas garantizadas por código =====
function aclararMc(hex,f){const c=hexRgb(hex);return "#"+mezcla(c,f>0?[255,255,255]:[0,0,0],Math.abs(f)).map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,"0")).join("");}
function hexOk(v,d){const s=String(v||"").trim();return /^#[0-9a-f]{6}$/i.test(s)?s.toLowerCase():d;}
function modeloHumanoide(o){
  const H=Math.max(24,Math.min(150,Number(o.altura)||32)),u=H/32,b=H>44?1.25:1;
  const C=o.colores||{};const piel=hexOk(C.piel,"#b99b83"),arm=hexOk(C.armadura,"#4a4a5e"),arm2=hexOk(C.armadura2,aclararMc(arm,-.35)),ac=hexOk(C.acento,"#8a4fd0"),oj=hexOk(C.ojos,"#ff3322"),ca=hexOk(C.capa,arm2);
  const R=o.rasgos||{};const P=[];
  const add=(nombre,origen,tam,color,x)=>P.push(Object.assign({nombre,origen:origen.map(v=>+v.toFixed(2)),tam:tam.map(v=>+v.toFixed(2)),color},x||{}));
  const tw=8*u*b,td=4*u*b,aw=4*u*b;
  // piernas (pivote en la cadera)
  for(const [n,sg] of [["pierna_i",1],["pierna_d",-1]]){add(n,[sg>0?0.1*u:-tw/2,0,-td/2],[tw/2-0.1*u,12*u,td],arm2,{pivote:[sg>0?tw/4:-tw/4,12*u,0]});
    add("bota_"+n.slice(7),[sg>0?0:-tw/2-0.1*u,0,-td/2-0.2*u],[tw/2+0.1*u,3*u,td+0.4*u],arm,{pivote:[sg>0?tw/4:-tw/4,12*u,0]});}
  add("torso",[-tw/2,12*u,-td/2],[tw,12*u,td],arm2);
  add("peto",[-tw/2-0.3*u,13*u,-td/2-0.3*u],[tw+0.6*u,9*u,td+0.6*u],arm);
  add("cinturon",[-tw/2-0.35*u,11.5*u,-td/2-0.35*u],[tw+0.7*u,2*u,td+0.7*u],ac);
  add("emblema",[-1.2*u,16*u,-td/2-0.5*u],[2.4*u,2.4*u,0.4*u],ac);
  for(const [n,sg] of [["brazo_i",1],["brazo_d",-1]]){const x=sg>0?tw/2:-tw/2-aw;add(n,[x,12*u,-aw/2],[aw,12*u,aw],piel,{pivote:[x+aw/2,22*u,0]});
    add("manga_"+n.slice(6),[x-0.2*u,16*u,-aw/2-0.2*u],[aw+0.4*u,7*u,aw+0.4*u],arm,{pivote:[x+aw/2,22*u,0]});
    if(R.hombreras!==false)add("hombrera_"+n.slice(6),[x-0.4*u,22*u,-aw/2-0.5*u],[aw+0.8*u,2.6*u,aw+1*u],ac,{pivote:[x+aw/2,22*u,0]});}
  add("cabeza",[-4*u,24*u,-4*u],[8*u,8*u,8*u],piel,{pivote:[0,24*u,0]});
  if(R.casco!==false)add("casco",[-4.5*u,26.5*u,-4.5*u],[9*u,6.2*u,9*u],arm,{});
  add("visera",[-4.6*u,24.2*u,-4.6*u],[9.2*u,2.2*u,9.2*u],arm2,{});
  add("ojo_i",[0.8*u,27*u,-4.9*u],[2*u,1*u,0.5*u],oj);add("ojo_d",[-2.8*u,27*u,-4.9*u],[2*u,1*u,0.5*u],oj);
  if(R.cuernos){for(const sg of [1,-1]){add("cuerno_base_"+(sg>0?"i":"d"),[sg>0?2.2*u:-3.6*u,32.2*u,-1*u],[1.4*u,3*u,1.4*u],"#e8e2d0",{});add("cuerno_"+(sg>0?"i":"d"),[sg>0?2.6*u:-3.2*u,35*u,-1*u],[0.9*u,4*u,0.9*u],"#f4efe2",{rot:[0,0,sg*-18],pivote:[sg>0?3*u:-2.8*u,35*u,-0.5*u]});}}
  if(R.corona)for(let i=-2;i<=2;i++)add("pua_"+(i+3),[i*1.7*u-0.5*u,32*u,-0.5*u],[1*u,i%2?2*u:3*u,1*u],"#f2c94c");
  if(R.capa!==false&&(R.capa||H>40)){add("capa",[-tw/2-0.8*u,5*u,td/2+0.3*u],[tw+1.6*u,19*u,0.8*u],ca,{pivote:[0,24*u,td/2]});add("cuello_capa",[-tw/2-1*u,22*u,-td/2-0.2*u],[tw+2*u,2.4*u,td+1*u],ac,{});}
  if(R.alas){for(const sg of [1,-1]){const n=sg>0?"i":"d";for(let k=0;k<3;k++)add("ala_"+n+k,[sg>0?tw/2:-tw/2-(8+k*3)*u,(21-k*3.5)*u,td/2+0.6*u+k*0.3*u],[(8+k*3)*u,(6-k)*u,0.9*u],aclararMc(ca,-.15*k),{rot:[0,sg*-25,sg*(-10-k*8)],pivote:[sg>0?tw/2:-tw/2,22*u,td/2]});}}
  if(R.cola){for(let k=0;k<4;k++)add("cola"+k,[-0.8*u+0,(7-k*0.6)*u,(td/2+0.5*u)+k*2.2*u],[(1.6-k*0.25)*u,(1.6-k*0.25)*u,2.4*u],k%2?ac:arm,{});}
  const arma=String(R.arma||"");
  if(/espada|hacha|baston|lanza/.test(arma)){const x=-tw/2-aw/2;
    if(/espada/.test(arma)){add("empunadura",[x-0.5*u,11.2*u,-1*u],[1*u,1*u,4*u],"#5a3a1c");add("guarda",[x-2*u,11*u,-3.4*u],[4*u,1.2*u,1*u],ac);add("hoja",[x-0.6*u,11.2*u,-3.4*u-16*u*b*0.8],[1.2*u,1.2*u,16*u*b*0.8],"#d6dbe6",{});}
    else if(/hacha/.test(arma)){add("mango",[x-0.5*u,10*u,-10*u],[1*u,1*u,14*u],"#5a3a1c");add("filo",[x-0.5*u,10*u-3*u,-10*u],[1*u,7*u,4*u],"#c8ccd8");}
    else if(/lanza/.test(arma)){add("asta",[x-0.5*u,11*u,-14*u],[1*u,1*u,22*u],"#5a3a1c");add("punta",[x-0.6*u,10.4*u,-18*u],[1.2*u,2.2*u,4*u],"#d6dbe6");}
    else {add("baston",[x-0.5*u,0,-0.5*u],[1*u,30*u,1*u],"#5a3a1c");add("gema_baston",[x-1.2*u,30*u,-1.2*u],[2.4*u,2.4*u,2.4*u],ac);}}
  return P;
}
function modeloBestia(o){
  const H=Math.max(14,Math.min(130,Number(o.altura)||24)),u=H/24;const C=o.colores||{};const R=o.rasgos||{};
  const piel=hexOk(C.piel,"#6b5a4a"),vientre=hexOk(C.armadura2,aclararMc(piel,.25)),ac=hexOk(C.acento,"#c0392b"),oj=hexOk(C.ojos,"#ffcc00");
  const P=[];const add=(nombre,origen,tam,color,x)=>P.push(Object.assign({nombre,origen:origen.map(v=>+v.toFixed(2)),tam:tam.map(v=>+v.toFixed(2)),color},x||{}));
  const L=18*u,A=9*u;
  add("cuerpo",[-A/2,9*u,-L/2+2*u],[A,8*u,L],piel);add("lomo",[-A/2+1*u,17*u-0.2*u,-L/2+3*u],[A-2*u,1.2*u,L-2*u],ac);add("vientre",[-A/2+0.5*u,9*u-0.4*u,-L/2+3*u],[A-1*u,1.4*u,L-2*u],vientre);
  for(const [n,x,z] of [["pata_di",-A/2,-L/2+2.5*u],["pata_dd",A/2-3*u,-L/2+2.5*u],["pata_ti",-A/2,L/2-3.5*u],["pata_td",A/2-3*u,L/2-3.5*u]])add(n,[x,0,z],[3*u,9*u,3*u],piel,{pivote:[x+1.5*u,9*u,z+1.5*u]});
  add("cuello",[-2.5*u,13*u,-L/2-1*u],[5*u,6*u,5*u],piel,{rot:[-20,0,0],pivote:[0,14*u,-L/2+1*u]});
  add("cabeza",[-3.5*u,15*u,-L/2-6*u],[7*u,6*u,7*u],piel);add("hocico",[-2*u,15*u,-L/2-9.5*u],[4*u,3*u,4*u],vientre);
  add("ojo_i",[1*u,18.2*u,-L/2-6.3*u],[1.4*u,1.2*u,0.5*u],oj);add("ojo_d",[-2.4*u,18.2*u,-L/2-6.3*u],[1.4*u,1.2*u,0.5*u],oj);
  add("oreja_i",[1.5*u,21*u,-L/2-3*u],[1.8*u,3*u,1.2*u],piel);add("oreja_d",[-3.3*u,21*u,-L/2-3*u],[1.8*u,3*u,1.2*u],piel);
  for(let k=0;k<4;k++)add("cola"+k,[-1*u+0,(14-k*1.2)*u,(L/2+2*u)+k*2.4*u],[(2-k*0.35)*u,(2-k*0.35)*u,2.6*u],k===3?ac:piel);
  if(R.cuernos)for(const sg of [1,-1])add("cuerno_"+(sg>0?"i":"d"),[sg>0?2*u:-3*u,20.5*u,-L/2-4*u],[1*u,4*u,1*u],"#efe9d8",{rot:[0,0,sg*-20],pivote:[sg>0?2.5*u:-2.5*u,20.5*u,-L/2-3.5*u]});
  if(R.alas)for(const sg of [1,-1])for(let k=0;k<3;k++)add("ala_"+(sg>0?"i":"d")+k,[sg>0?A/2:-A/2-(10+k*3)*u,(17+k*1)*u,-L/2+5*u+k*3*u],[(10+k*3)*u,0.8*u,5*u],aclararMc(ac,-.1*k),{rot:[0,0,sg*(-15-k*6)],pivote:[sg>0?A/2:-A/2,17*u,-L/2+6*u]});
  return P;
}

const MC_MODELADOR_SYS=`Eres el DIRECTOR DE MODELADO 3D de EGO para Minecraft Bedrock. Para cada criatura eliges un ARQUETIPO y EGO construye el modelo con proporciones perfectas, animación de caminar y buen detalle. Responde SOLO JSON:
{"arquetipo":"humanoide|bestia|libre","altura":N,"colores":{"piel":"#hex","armadura":"#hex","armadura2":"#hex","acento":"#hex","ojos":"#hex","capa":"#hex"},"rasgos":{"cuernos":bool,"capa":bool,"alas":bool,"corona":bool,"cola":bool,"casco":bool,"hombreras":bool,"arma":"espada|hacha|lanza|baston|ninguna"},"extras":[{"nombre":"...","origen":[x,y,z],"tam":[x,y,z],"color":"#hex"}]}
- "humanoide": caballeros, jefes, zombis, magos, demonios, golems con forma de persona. "bestia": animales y monstruos de cuatro patas (lobo, dragón, jabalí, felino). "libre": cualquier otra forma (arañas, serpientes, torres, slimes, flores): entonces añade "partes":[cubos] con 25–120 cubos.
- "altura" en píxeles: 16 px = 1 bloque. Persona normal 32; jefe 48–64; gigante 80–120. Bestias: 16–40 (dragón 40–70). Respeta lo que pidió el usuario (si dijo «4 bloques de alto» → 64).
- Colores: paleta coherente; evita negro puro (usa grises/morados oscuros como #3a3550 para que se vea el volumen); "acento" = el color que brilla (detalles); "ojos" = color de ojos.
- "extras" (opcional, máx 40 cubos): detalles adicionales sobre el modelo base (runas, pinchos, medallón, hombreras gigantes, aureola, tentáculos...). Coordenadas en píxeles: eje Y arriba, pies en y=0, frente hacia -Z, "origen" = esquina mínima, "tam" = [x,y,z]. Los extras deben tocar el cuerpo.
- Para "libre": cada cubo {"nombre","origen","tam","color"}; usa los nombres pierna_i/pierna_d/brazo_i/brazo_d si quieres que se animen al caminar, con "pivote" en la articulación.`;
async function mcModelo3d(parte,plan,prompt,env){
  const obj=(plan.objetos||[]).find(o=>o.id===parte.entidad)||{id:parte.entidad,nombre:parte.entidad,descripcion:""};
  const user="Criatura a modelar: "+obj.nombre+" ("+obj.id+"). "+(obj.descripcion||"")+"\nDetalle pedido: "+(parte.detalle||"")+"\nPedido original del usuario:\n"+prompt.slice(0,3000);
  let ult="",modelo="";
  for(let t=0;t<2;t++){
    try{
      const r=await llamarCodigo(env,[{role:"system",content:MC_MODELADOR_SYS},{role:"user",content:user+(ult?"\n\nTu intento anterior falló: "+ult+". Devuelve el JSON completo otra vez.":"")}],12000,0);
      const j=extractJson(r.raw);let ps=null;
      if(j){const ar=String(j.arquetipo||"").toLowerCase();let base=[];
        if(/human|person|caball|bipedo/.test(ar))base=modeloHumanoide(j);else if(/best|cuadr|animal|lobo|dragon/.test(ar))base=modeloBestia(j);
        const ex=limpiarModelo3d(j.extras).slice(0,40),libres=limpiarModelo3d(j.partes);
        ps=base.length?base.concat(ex):(libres.length?libres:null);}
      const b=ps&&construirModelo3d("geometry.test",ps);
      if(b){return json({ok:true,modelo3d:{entidad:parte.entidad,partes:limpiarModelo3d(ps)},files:[],model:r.model,fallosModelos:r.fallos||[],revisado:b.cubos+" cubos, "+b.colores+" colores, "+b.animados+" partes animadas"});}
      ult="el JSON no tenía un arquetipo válido ni cubos con origen, tam y color";
    }catch(e){ult=String(e&&e.message||e).slice(0,120);}
  }
  return json({error:"No se pudo crear el modelo 3D de «"+obj.nombre+"»: "+ult},502);
}
async function mcPart(body,env){
  const prompt=String(body.prompt||"").trim().slice(0,12000);
  const plan=limpiarPlan(body.plan,prompt);
  const i=Math.max(0,Math.min(plan.partes.length-1,Number(body.parte)||0));
  const pe=body.parteExtra&&typeof body.parteExtra==='object'?body.parteExtra:null;
  const parte=pe?{titulo:String(pe.titulo||"Completar").slice(0,60),tipo:MC_TIPOS_PARTE.includes(pe.tipo)?pe.tipo:"script",detalle:String(pe.detalle||"").slice(0,3000),archivos:[]}:plan.partes[i];
  if(parte&&parte.tipo==="modelo3d")return await mcModelo3d(parte,plan,prompt,env);
  const existentes=String(body.existentes||"").slice(0,14000);
  const previos=(Array.isArray(body.previos)?body.previos:[]).map(x=>String(x).slice(0,120)).slice(0,120);
  const sys=MC_GUIA_BASE+"\n\n"+(MC_GUIAS[parte.tipo]||MC_GUIAS.misc)+
    "\n\nPLAN DEL ADD-ON (úsalo tal cual):\n"+JSON.stringify({nombre:plan.nombre,ns:plan.ns,resumen:plan.resumen,objetos:plan.objetos})+MC_FORMATO;
  const user=`Escribe SOLO los archivos de esta parte: "${parte.titulo}" (tipo ${parte.tipo}).\nQué debe contener: ${parte.detalle||plan.resumen}\n`+
    (parte.archivos.length?`Archivos esperados: ${parte.archivos.join(", ")}\n`:"Elige tú las rutas dentro de BP/ o RP/.\n")+
    (previos.length?`Archivos que ya existen en otras partes (no los repitas): ${previos.join(", ")}\n`:"")+
    (existentes?`\nARCHIVOS ACTUALES DEL ADD-ON (modifícalos o amplíalos; devuelve completos los que cambies):\n${existentes}\n`:"")+
    `\nPedido original del usuario (para mantener fidelidad):\n${prompt}`;
  let desde=0,errores=[],mejor=null,modelo="",fallosM=[];
  for(let intento=0;intento<2;intento++){
    let r;
    try{r=await llamarCodigo(env,[{role:"system",content:sys},{role:"user",content:user+(errores.length?"\n\nTU RESPUESTA ANTERIOR TUVO ESTOS ERRORES; corrígelos y devuelve todos los archivos otra vez:\n- "+errores.join("\n- "):"")}],12000,desde);}
    catch(e){ if(mejor) break; return json({error:"No se pudo generar la parte «"+parte.titulo+"»: "+String(e&&e.message||e).slice(0,200)},502); }
    modelo=r.model; fallosM=(r.fallos||[]); desde=r.idx+(intento===0?1:0);
    const p=leerProyectoModelo(r.raw);
    errores=[]; const files=[];
    if(!p||!p.files.length){errores.push("No usaste el formato '=== ARCHIVO: ruta ===' ... '=== FIN ==='.");continue;}
    const vistos=new Set();
    for(const f of p.files){
      const path=safeProjectPath(f.path);
      if(!path||!/^(BP|RP)\//.test(path)||/manifest\.json$|\.(png|jpg|ogg|zip|mcaddon)$/i.test(path)||vistos.has(path)||typeof f.content!=="string") continue;
      vistos.add(path);
      if(/\.json$/i.test(path)){const t=jsonTolerante(f.content);if(!t.ok){errores.push(path+": JSON inválido ("+t.error+")");continue;}files.push({path,content:JSON.stringify(t.obj,null,2)+"\n"});}
      else if(/\.js$/i.test(path)){const bal=balanceJs(f.content);if(bal){errores.push(path+": "+bal);}for(const pr of lintScriptApi(f.content, "2.10.0"))errores.push(path+": "+pr+". Usa solo la API oficial de @minecraft/server.");files.push({path,content:f.content});}
      else files.push({path,content:f.content.slice(0,300000)});
    }
    if(!files.length&&!errores.length)errores.push("No devolviste archivos BP/ o RP/ válidos.");
    if(!mejor||errores.length<mejor.errores.length||(errores.length===mejor.errores.length&&files.length>=mejor.files.length))mejor={files,errores:errores.slice()};
    if(!errores.length) break;
  }
  // ---- Revisor independiente (otro modelo, de razonamiento) + corrección ----
  let revisado="";
  if(mejor&&mejor.files.length&&["script","entities","items","blocks","misc"].includes(parte.tipo)&&env.MC_CRITICO!=="0"){
    try{
      const texto=mejor.files.filter(f=>/\.(js|json)$/.test(f.path)).map(f=>"=== ARCHIVO: "+f.path+" ===\n"+f.content).join("\n").slice(0,16000);
      const crit=await Promise.race([llamarCodigo(env,[{role:"system",content:MC_CRITICO_SYS},{role:"user",content:"REQUISITOS:\n"+((plan.requisitos||[]).map((x,k)=>(k+1)+". "+x).join("\n")||prompt.slice(0,1500))+"\n\nPLAN:\n"+JSON.stringify({objetos:plan.objetos,poderes_jugador:plan.poderesJugador})+"\n\nARCHIVOS DE LA PARTE «"+parte.titulo+"»:\n"+texto}],1800,0,"razonar"),tmoMc(50000)]);
      const jc=extractJson(crit.raw);
      const probs=(jc&&Array.isArray(jc.problemas)?jc.problemas:[]).map(x=>String((x&&x.archivo?x.archivo+": ":"")+((x&&x.problema)||"")+(x&&x.arreglo?" → "+x.arreglo:"")).slice(0,260)).filter(x=>x.length>12).slice(0,6);
      if(probs.length){
        const rr=await Promise.race([llamarCodigo(env,[{role:"system",content:sys},{role:"user",content:user+"\n\nTUS ARCHIVOS ACTUALES:\n"+texto+"\n\nUN REVISOR ENCONTRÓ ESTOS PROBLEMAS REALES. Corrígelos TODOS y devuelve TODOS los archivos de esta parte completos otra vez:\n- "+probs.join("\n- ")}],12000,0),tmoMc(150000)]);
        const np=parsearSalidaMc(rr.raw);
        if(np.files.length&&!np.errores.length){mejor={files:np.files,errores:[]};revisado="el revisor ("+String(crit.model).replace(/^.*\//,"")+") encontró "+probs.length+" problema(s) y se corrigieron";}
        else revisado="el revisor encontró "+probs.length+" problema(s) pero la corrección no pasó la verificación; se dejó la versión original";
      }else revisado="revisado por "+String(crit.model).replace(/^.*\//,"")+": sin problemas";
    }catch(e){}
  }
  if(!mejor||!mejor.files.length) return json({error:"La parte «"+parte.titulo+"» no produjo archivos válidos.",detalle:errores.slice(0,4)},502);
  return json({ok:true,files:mejor.files,model:modelo,revisado,fallosModelos:fallosM,avisos:mejor.errores.slice(0,6),parte:i,titulo:parte.titulo});
}
// Revisa llaves/paréntesis/comillas de un script (no ejecuta nada).
function balanceJs(src){
  const pila=[],par={"}":"{",")":"(","]":"["};let i=0,n=src.length;
  while(i<n){
    const c=src[i],d=src[i+1];
    if(c==="/"&&d==="/"){while(i<n&&src[i]!=="\n")i++;continue;}
    if(c==="/"&&d==="*"){i=src.indexOf("*/",i+2);if(i<0)return "comentario sin cerrar";i+=2;continue;}
    if(c==="'"||c==='"'){const q=c;i++;while(i<n&&src[i]!==q&&src[i]!=="\n"){if(src[i]==="\\")i++;i++;}if(src[i]!==q)return "comillas sin cerrar";i++;continue;}
    if(c==="`"){i++;while(i<n&&src[i]!=="`"){if(src[i]==="\\")i++;i++;}if(i>=n)return "plantilla ` sin cerrar";i++;continue;}
    if("{([".includes(c))pila.push(c);
    else if("})]".includes(c)){if(pila.pop()!==par[c])return "llaves o paréntesis desbalanceados";}
    i++;
  }
  return pila.length?"falta cerrar "+pila.length+" llave(s) o paréntesis":"";
}

// ---------- Texturas generadas por código (PNG reales) ----------
function semillaDe(t){let h=2166136261;for(const c of String(t)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
function prng(seed){let s=seed||1;return()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296;};}
function colorDeNombre(t){
  const n=normMc(t);
  for(const k of Object.keys(MC_COLORES)){const raiz=k.replace(/[oa]$/,"");if(new RegExp("\\b"+raiz+"(o|a|os|as)?\\b").test(n))return MC_COLORES[k];}
  if(/(fuego|lava|llama|rubi|sangre|demonio)/.test(n))return "#e0452b";
  if(/(hielo|escarcha|agua|oceano|cristal)/.test(n))return "#6fd3ff";
  if(/(esmeralda|veneno|slime|bosque|planta)/.test(n))return "#3fc65a";
  if(/(oro|sol|luz|dorad)/.test(n))return "#f2c230";
  if(/(sombra|oscur|vacio|noche|void)/.test(n))return "#5b3a8c";
  const r=prng(semillaDe(n)),h=Math.floor(r()*360),s=0.65,l=0.55;
  const a=s*Math.min(l,1-l),f=k=>{const kk=(k+h/30)%12;return l-a*Math.max(-1,Math.min(kk-3,9-kk,1));};
  const hx=v=>Math.round(v*255).toString(16).padStart(2,"0");return "#"+hx(f(0))+hx(f(8))+hx(f(4));
}
function tipoIconoDe(t){
  const n=normMc(t);
  // Categorías consumibles antes que el tipo de arma: "munición de rifle" es munición, no un rifle.
  if(/(botiquin|kit medico|medkit|venda|vendaje|antibiotico|medicina|curacion|primeros auxilios)/.test(n))return "botiquin";
  if(/(granada|explosivo|bomba)/.test(n))return "granada";
  if(/(municion|cartucho|bala|balas|ammo)/.test(n))return "municion";
  if(/(francotirador|sniper|rifle de precision)/.test(n))return "francotirador";
  if(/(escopeta|shotgun)/.test(n))return "escopeta";
  if(/(pistola|revolver)/.test(n))return "pistola";
  if(/(rifle|fusil|subfusil|ametralladora|metralleta|carabina|mosquete|lanzallamas|canon|uzi|ak47)/.test(n))return "rifle";
  if(/(firearm|gun|arma_fuego|arma de fuego)/.test(n))return "arma_fuego";
  if(/(armadura|chaleco tactico|casco tactico|proteccion)/.test(n))return "armadura";
  if(/(escudo|shield)/.test(n))return "escudo";
  if(/(espada|sable|katana|lanza|daga|cuchillo|hoja|filo|mandoble|espadon|estoque|cimitarra|machete|cuchilla|guadana|hoz|tridente|blade|sword|dagger)/.test(n))return "espada";
  if(/(hacha|martillo|maza|mazo|axe|hammer)/.test(n))return "hacha";
  if(/(pico|pala|azada|pickaxe|shovel)/.test(n))return "pico";
  if(/(vara|baston|cetro|varita|staff|wand|bastón)/.test(n))return "vara";
  if(/(reloj|clock|watch|brujula|compas)/.test(n))return "reloj";
  if(/(libro|tomo|grimorio|biblia|book|pergamino|manual)/.test(n))return "libro";
  if(/(corona|diadema|tiara|crown)/.test(n))return "corona";
  if(/(pocion|botella|frasco|elixir|vial|potion)/.test(n))return "botella";
  if(/(anillo|sortija|amuleto|colgante|medallon|talisman|ring)/.test(n))return "anillo";
  if(/(lingote|barra|ingot)/.test(n))return "lingote";
  if(/(orbe|esfera|bola|perla|huevo|nucleo|corazon)/.test(n))return "orbe";
  return "gema";
}
function dibujarGenerico(tipo,principal,acento){
  if(["espada","hacha","pico","vara"].includes(tipo))return dibujarIcono(tipo,principal,acento);
  const W=16,px=new Uint8Array(W*W*4),P=hexRgb(principal),A=hexRgb(acento),CLARO=mezcla(P,[255,255,255],.55),OSC=mezcla(P,[0,0,0],.38),OUT=[24,20,30];
  const set=(x,y,c)=>{if(x<0||y<0||x>=W||y>=W)return;const i=(y*W+x)*4;px[i]=c[0];px[i+1]=c[1];px[i+2]=c[2];px[i+3]=255;};
  const lleno=(x,y)=>x>=0&&y>=0&&x<W&&y<W&&px[(y*W+x)*4+3]>0;
  if(["arma_fuego","pistola","rifle","escopeta","francotirador"].includes(tipo)){
    // Siluetas pixel-art distintas para cada clase de arma; no se sustituyen por espadas.
    if(tipo==="pistola"){
      for(let y=6;y<=8;y++)for(let x=4;x<=11;x++)set(x,y,y===6?CLARO:(y===8?OSC:P));
      for(let y=6;y<=7;y++)for(let x=11;x<=14;x++)set(x,y,OSC);
      for(let y=8;y<=12;y++)for(let x=7;x<=9;x++)set(x,y,OSC);
      for(let y=9;y<=11;y++)set(10,y,A);set(4,7,CLARO);
    } else if(tipo==="francotirador"){
      for(let y=7;y<=8;y++)for(let x=2;x<=13;x++)set(x,y,y===7?CLARO:P);
      for(let y=7;y<=8;y++)for(let x=13;x<=15;x++)set(x,y,OSC);
      for(let y=8;y<=12;y++)for(let x=5;x<=7;x++)set(x,y,OSC);
      for(let y=4;y<=6;y++)for(let x=8;x<=10;x++)set(x,y,A);
      for(let x=1;x<=3;x++)set(x,6,OSC);
    } else if(tipo==="escopeta"){
      for(let y=6;y<=9;y++)for(let x=3;x<=13;x++)set(x,y,y===6?CLARO:(y===9?OSC:P));
      for(let y=7;y<=8;y++)for(let x=13;x<=15;x++)set(x,y,OSC);
      for(let y=8;y<=12;y++)for(let x=6;x<=8;x++)set(x,y,OSC);
      for(let y=6;y<=9;y++)set(4,y,A);for(let x=9;x<=11;x++)set(x,5,A);
    } else {
      // Rifle / arma larga genérica: culata, cuerpo, cañón, mira y empuñadura.
      for(let y=6;y<=9;y++)for(let x=4;x<=12;x++)set(x,y,y===6?CLARO:(y===9?OSC:P));
      for(let y=7;y<=8;y++)for(let x=12;x<=15;x++)set(x,y,OSC);
      for(let y=8;y<=12;y++)for(let x=6;x<=8;x++)set(x,y,OSC);
      for(let y=4;y<=5;y++)for(let x=8;x<=10;x++)set(x,y,A);
      for(let y=5;y<=6;y++)set(4,y,CLARO);for(let y=7;y<=8;y++)set(3,y,P);
    }
  } else if(tipo==="botiquin"){
    for(let y=3;y<=13;y++)for(let x=2;x<=13;x++)set(x,y,(x===2||x===13||y===3||y===13)?OSC:P);
    for(let y=6;y<=10;y++)for(let x=6;x<=9;x++)set(x,y,[245,245,235]);
    for(let y=4;y<=5;y++)for(let x=6;x<=9;x++)set(x,y,CLARO);
    for(let y=7;y<=9;y++)for(let x=4;x<=11;x++)set(x,y,[245,245,235]);
  } else if(tipo==="granada"){
    for(let y=5;y<=13;y++)for(let x=4;x<=11;x++){const d=Math.hypot(x-7.5,y-9);if(d<4.8)set(x,y,d<2?CLARO:(x<7?P:OSC));}
    for(let y=3;y<=5;y++)for(let x=6;x<=9;x++)set(x,y,A);
    set(9,2,A);set(10,2,A);set(11,3,A);
    for(let y=7;y<=11;y++)set(5,y,CLARO);
  } else if(tipo==="municion"){
    for(let y=3;y<=13;y++)for(let x=4;x<=6;x++)set(x,y,y<=5?CLARO:(x===4?P:OSC));
    for(let y=3;y<=13;y++)for(let x=9;x<=11;x++)set(x,y,y<=5?CLARO:(x===9?P:OSC));
    for(let x=4;x<=6;x++)set(x,2,A);for(let x=9;x<=11;x++)set(x,2,A);
    for(let y=10;y<=13;y++){set(3,y,OSC);set(12,y,OSC);}
  } else if(tipo==="armadura"||tipo==="escudo"){
    if(tipo==="escudo"){
      for(let y=2;y<=13;y++){const w=Math.min(6,Math.floor((y-1)*.7)+1);for(let x=0;x<16;x++)if(Math.abs(x-7.5)<=w)set(x,y,y===2?CLARO:(x<7?P:OSC));}
      for(let y=5;y<=11;y++)set(7,y,A);for(let x=5;x<=10;x++)set(x,8,A);
    } else {
      for(let y=3;y<=12;y++)for(let x=3;x<=12;x++){const edge=x===3||x===12||y===3||y===12;set(x,y,edge?OSC:P);}
      for(let y=5;y<=10;y++)for(let x=6;x<=9;x++)set(x,y,A);
      set(5,4,CLARO);set(10,4,CLARO);
    }
  } else if(tipo==="reloj"){
    for(let y=0;y<W;y++)for(let x=0;x<W;x++){const d=Math.hypot(x-7.5,y-8.5);if(d<=6.2)set(x,y,d<4.9?[245,240,225]:P);}
    for(let a=0;a<12;a++){const t=a/12*Math.PI*2;set(Math.round(7.5+Math.sin(t)*4),Math.round(8.5-Math.cos(t)*4),OSC);}
    for(let k=1;k<=3;k++)set(7,Math.round(8.5-k*1.2),OSC);for(let k=1;k<=3;k++)set(7+k,9,A);
    set(7,2,A);set(8,2,A);set(7,1,A);set(8,1,A);
  } else if(tipo==="libro"){
    for(let y=2;y<=13;y++)for(let x=3;x<=12;x++)set(x,y,x<=4?OSC:(y<=3||y>=12?OSC:P));
    for(let y=4;y<=11;y++)set(12,y,[245,240,225]);
    for(let x=6;x<=10;x++){set(x,6,A);set(x,9,A);}set(8,7,A);set(8,8,A);
  } else if(tipo==="corona"){
    for(let x=2;x<=13;x++)for(let y=8;y<=12;y++)set(x,y,y<=9?CLARO:(y>=12?OSC:P));
    for(const px0 of [2,5,8,11]){for(let y=4;y<=7;y++){set(px0,y,P);set(px0+1,y,P);}set(px0,4,CLARO);}
    set(7,10,A);set(8,10,A);set(4,10,[255,255,255]);set(11,10,[255,255,255]);
  } else if(tipo==="botella"){
    for(let y=7;y<=13;y++)for(let x=4;x<=11;x++){const d=Math.hypot(x-7.5,y-10);if(d<=3.9)set(x,y,y<=9?CLARO:(y>=12?OSC:P));}
    for(let y=3;y<=7;y++){set(7,y,[220,230,240]);set(8,y,[220,230,240]);}for(let x=6;x<=9;x++)set(x,2,[150,110,70]);
    set(6,9,[255,255,255]);
  } else if(tipo==="anillo"){
    for(let y=0;y<W;y++)for(let x=0;x<W;x++){const d=Math.hypot(x-7.5,y-9),dd=Math.hypot(x-7.5,y-9);if(d<=5.2&&d>=3.1)set(x,y,y<=7?CLARO:P);}
    for(let y=2;y<=5;y++)for(let x=5;x<=10;x++)if(Math.abs(x-7.5)+Math.abs(y-3.5)<=3)set(x,y,y<=3?[255,255,255]:A);
  } else if(tipo==="lingote"){
    for(let y=5;y<=11;y++){const d=Math.floor((11-y)/2);for(let x=2+d;x<=12+d;x++)set(x,y,y<=6?CLARO:(y>=10?OSC:P));}
    for(let x=4;x<=10;x++)set(x,8,A);
  } else if(tipo==="orbe"){
    for(let y=0;y<W;y++)for(let x=0;x<W;x++){const d=Math.hypot(x-7.5,y-7.5);if(d<=5.6)set(x,y,d<2.2?[255,255,255]:(d<3.6?A:(d<4.8?P:OSC)));}
    set(5,5,[255,255,255]);set(6,5,CLARO);
  } else {
    for(let y=2;y<=13;y++){const hw=y<=6?(y-2)*1.15+1.6:(13.5-y)*0.95+0.3;for(let x=0;x<W;x++){const dx=x-7.5;if(Math.abs(dx)<=hw)set(x,y,y<=4?CLARO:(dx<0?P:OSC));}}
    set(5,5,[255,255,255]);set(6,4,[255,255,255]);for(let x=5;x<=10;x++)set(x,6,A);
  }
  const marcar=[];for(let y=0;y<W;y++)for(let x=0;x<W;x++)if(!lleno(x,y)&&(lleno(x+1,y)||lleno(x-1,y)||lleno(x,y+1)||lleno(x,y-1)))marcar.push([x,y]);
  marcar.forEach(([x,y])=>set(x,y,OUT));
  return px;
}
function dibujarBloque(principal,estilo,semilla){
  const W=16,px=new Uint8Array(W*W*4),P=hexRgb(principal),r=prng(semilla);
  const base=estilo==="mena"?[128,128,134]:P;
  for(let y=0;y<W;y++)for(let x=0;x<W;x++){
    const k=(r()-0.5)*0.28;const c=base.map(v=>Math.max(0,Math.min(255,Math.round(v*(1+k)))));
    const borde=(x===0||y===0||x===W-1||y===W-1);const cc=borde?c.map(v=>Math.round(v*0.82)):c;
    const i=(y*W+x)*4;px[i]=cc[0];px[i+1]=cc[1];px[i+2]=cc[2];px[i+3]=255;
  }
  if(estilo==="mena"){
    for(let n=0;n<6;n++){const cx=2+Math.floor(r()*11),cy=2+Math.floor(r()*11);
      for(const [dx,dy] of [[0,0],[1,0],[0,1],[1,1]]){const x=cx+dx,y=cy+dy;if(x<15&&y<15){const i=(y*W+x)*4,t=(dx+dy)%2?mezcla(P,[255,255,255],.35):P;px[i]=t[0];px[i+1]=t[1];px[i+2]=t[2];}}}
  } else if(estilo==="liso"){
    for(let y=3;y<W;y+=4)for(let x=1;x<W-1;x++){const i=(y*W+x)*4;px[i]=Math.round(px[i]*0.9);px[i+1]=Math.round(px[i+1]*0.9);px[i+2]=Math.round(px[i+2]*0.9);}
  }
  return px;
}
const MC_MODELOS_VANILLA={
  zombie:{materials:{default:"zombie"},textures:{default:"textures/entity/zombie/zombie"},geometry:{default:"geometry.zombie.v1.8"},render_controllers:["controller.render.zombie"]},
  skeleton:{materials:{default:"skeleton"},textures:{default:"textures/entity/skeleton/skeleton"},geometry:{default:"geometry.skeleton.v1.8"},render_controllers:["controller.render.skeleton"]},
  pig:{materials:{default:"pig"},textures:{default:"textures/entity/pig/pig"},geometry:{default:"geometry.pig.v1.8"},render_controllers:["controller.render.pig"]},
  cow:{materials:{default:"cow"},textures:{default:"textures/entity/cow/cow"},geometry:{default:"geometry.cow.v1.8"},render_controllers:["controller.render.cow"]},
  spider:{materials:{default:"spider"},textures:{default:"textures/entity/spider/spider"},geometry:{default:"geometry.spider.v1.8"},render_controllers:["controller.render.spider"]},
  creeper:{materials:{default:"creeper"},textures:{default:"textures/entity/creeper/creeper"},geometry:{default:"geometry.creeper.v1.8"},render_controllers:["controller.render.creeper"]}
};
function modeloVanillaDe(t){
  const n=normMc(t);
  if(/(esqueleto|hueso|arquero|skeleton)/.test(n))return "skeleton";
  if(/(cerdo|puerco|pig)/.test(n))return "pig";
  if(/(vaca|toro|cow|bestia)/.test(n))return "cow";
  if(/(arana|spider|insecto)/.test(n))return "spider";
  if(/(creeper|explosiv)/.test(n))return "creeper";
  return "zombie";
}
function parseLang(t){const m=new Map();for(const l of String(t||"").split(/\r?\n/)){const k=l.indexOf("=");if(k>0&&!l.startsWith("#"))m.set(l.slice(0,k).trim(),l.slice(k+1));}return m;}
function nombreDeId(id,plan){const o=(plan.objetos||[]).find(x=>x.id===id);return o?o.nombre:tituloCaso(String(id).split(":").pop().replace(/_/g," "));}

// Arma el paquete final: normaliza, genera lo que falta y devuelve {files, notas, resumen}

// ---- Habilidades de armas: las programa el código (probado), no la IA ----
const RX_ARMA=/(\bespada|\bsable|\bkatana|\bhacha|\bpico\b|\bpala\b|\bvara\b|\bvarita|\bbaston|\bcetro|\blanza\b|\bmartillo|\bguadana|\bdaga|\barma\b|\btridente|\brifle|\bfusil|\bpistola|\bescopeta|\bfrancotirador|\bsubfusil|\bmetralleta|\bsword\b|\baxe\b|\bwand\b|\bstaff\b|\bshotgun\b|\bsniper\b|\bgun\b)/i;
function habilidadDeObjeto(o){return (o.habilidad&&o.habilidad!=="ninguna")?o.habilidad:null;}
function tipoArmaDe(o){const t=normMc((o.nombre||"")+" "+(o.id||""));const x=detectarMc(t);return x.tipo||"espada";}
const LINT_MAL=[[/\bworld\.events\b/,"usa la API antigua world.events"],[/from\s+["']mojang-minecraft/,"importa mojang-minecraft (API antigua)"],[/\brequire\s*\(/,"usa require()"],[/\bsetTimeout\s*\(|\bsetInterval\s*\(/,"usa setTimeout/setInterval"],[/\bnew\s+(Location|BlockLocation)\s*\(/,"usa Location/BlockLocation (API antigua)"],[/\bawait\b(?![^\n]*=>)(?<![ \t]{2})/,""],[/from\s+["'](?!@minecraft\/(server|server-ui)["'])(?!\.\/)[^"']+["']/,"importa un módulo que no existe en Bedrock"],[/:\s*(string|number|boolean)\b\s*[=,)]|\binterface\s+\w+|\bas\s+(string|number|any)\b/,"contiene sintaxis de TypeScript"]];
function lintScript(texto){for(const [rx,msg] of LINT_MAL){if(msg&&rx.test(texto))return msg;}return null;}
function normalizarCriatura(e,plan,archivo,mapa){
  const comps=e.components=e.components||{};
  const obj=(plan.objetos||[]).find(x=>x.id===e.description.identifier)||{};
  const t=normMc((obj.nombre||"")+" "+(obj.descripcion||"")+" "+archivo);
  const hostil=/(jefe|boss|monstruo|enemigo|hostil|gigante|demonio|guardian|titan|golem|zombi|esqueleto|ataca|agresiv|invasor|bestia|dragon)/.test(t)&&!/(amigable|pasivo|mascota|aldean|manso|pacifico)/.test(t);
  const poner=(k,v)=>{if(!(k in comps))comps[k]=v;};
  poner("minecraft:type_family",{family:[plan.ns+"_"+archivo,hostil?"monster":"mob"]});
  poner("minecraft:health",{value:hostil?60:20,max:hostil?60:20});
  poner("minecraft:collision_box",{width:0.8,height:2});
  poner("minecraft:movement",{value:0.25});
  poner("minecraft:movement.basic",{});
  poner("minecraft:navigation.walk",{can_path_over_water:true,avoid_water:true,can_break_doors:false});
  poner("minecraft:jump.static",{});
  poner("minecraft:physics",{});
  poner("minecraft:pushable",{is_pushable:true,is_pushable_by_piston:true});
  poner("minecraft:behavior.float",{priority:0});
  poner("minecraft:behavior.random_stroll",{priority:6,speed_multiplier:1});
  poner("minecraft:behavior.look_at_player",{priority:7,look_distance:8});
  poner("minecraft:behavior.random_look_around",{priority:9});
  if(hostil){
    poner("minecraft:attack",{damage:8});
    poner("minecraft:behavior.melee_attack",{priority:3,speed_multiplier:1.1,track_target:true});
    poner("minecraft:behavior.hurt_by_target",{priority:1});
    poner("minecraft:behavior.nearest_attackable_target",{priority:2,must_see:false,reselect_targets:true,entity_types:[{filters:{test:"is_family",subject:"other",value:"player"},max_dist:32}]});
  }
  const rutaLoot="loot_tables/entities/"+archivo+".json";
  if(!("minecraft:loot" in comps)){
    if(!mapa.has("BP/"+rutaLoot)&&hostil){
      const drops=(plan.objetos||[]).filter(x=>x.tipo==="item"&&/(drop|bot[ií]n|suelta|dropea|recompensa|premio)/i.test(x.descripcion||"")&&normMc((obj.nombre||"")).split(" ").some(w=>w.length>3&&normMc(x.descripcion).includes(w)));
      const ents=(drops.length?drops:[]).slice(0,3).map(x=>({type:"item",name:x.id,weight:1,functions:[{function:"set_count",count:{min:1,max:1}}]}));
      if(ents.length)mapa.set("BP/"+rutaLoot,JSON.stringify({pools:[{rolls:1,entries:ents}]},null,2)+"\n");
    }
    if(mapa.has("BP/"+rutaLoot))comps["minecraft:loot"]={table:rutaLoot};
  }
  return hostil;
}

// ---- Poderes pasivos / vuelo y kit inicial: scripts probados escritos por el código ----
const MC_PODERES={vuelo:1,vision_nocturna:1,velocidad:1,fuerza:1,regeneracion:1,resistencia:1,salto:1,respirar_agua:1,sin_hambre:1,resistencia_fuego:1};
const MC_EFECTO_PODER={vision_nocturna:"night_vision",velocidad:"speed",fuerza:"strength",regeneracion:"regeneration",resistencia:"resistance",salto:"jump_boost",respirar_agua:"water_breathing",sin_hambre:"saturation",resistencia_fuego:"fire_resistance"};
function poderesDeObjeto(o){return Array.isArray(o.poderes)?o.poderes:[];}
function scriptPoderes(s){
  const efectos=s.poderes.filter(p=>MC_EFECTO_PODER[p]);const vuelo=s.poderes.includes("vuelo");
  const lineas=efectos.map(p=>'    p.addEffect("'+MC_EFECTO_PODER[p]+'", '+(p==="vision_nocturna"?420:(p==="sin_hambre"?40:260))+', { amplifier: '+(p==="velocidad"?1:(p==="fuerza"?1:(p==="salto"?1:(p==="resistencia"?1:0))))+', showParticles: false });');
  return ['import { world, system } from "@minecraft/server";','',
  'const ITEM = "'+s.id+'"; // se activa mientras lo llevas en el inventario',
  'function lo_tiene(p) {','  try {','    const inv = p.getComponent("minecraft:inventory")?.container;','    if (!inv) return false;','    for (let i = 0; i < inv.size; i++) { if (inv.getItem(i)?.typeId === ITEM) return true; }','  } catch (e) {}','  return false;','}',
  'const volando = new Set();',
  'system.runInterval(() => {','  for (const p of world.getAllPlayers()) {','    try {','      if (!lo_tiene(p)) { volando.delete(p.id); continue; }',
  ...efectos.length?['      aplicar(p);']:[],'    } catch (e) {}','  }','}, 20);',
  ...efectos.length?['function aplicar(p) {',...lineas,'}']:[],
  ...vuelo?[
  '// VUELO: clic derecho con el objeto activa/desactiva. Saltar = subir, agacharse = bajar, si no, planeas.',
  '// (Es vuelo simulado con efectos: en supervivencia Minecraft no permite el vuelo creativo real.)',
  'world.afterEvents.itemUse.subscribe((ev) => {','  try {','    if (ev.itemStack.typeId !== ITEM) return;','    const p = ev.source;',
  '    if (volando.has(p.id)) { volando.delete(p.id); p.removeEffect("levitation"); p.removeEffect("slow_falling"); p.onScreenDisplay.setActionBar("Vuelo desactivado"); try { p.runCommand("ability @s mayfly false"); } catch (e) {} }',
  '    else { volando.add(p.id); p.onScreenDisplay.setActionBar("Vuelo activado: salta para subir, agáchate para bajar"); try { p.runCommand("ability @s mayfly true"); } catch (e) {} }',
  '  } catch (e) {}','});',
  'system.runInterval(() => {','  for (const p of world.getAllPlayers()) {','    try {','      if (!volando.has(p.id)) continue;','      if (!lo_tiene(p)) { volando.delete(p.id); continue; }',
  '      if (p.isSneaking) { p.removeEffect("levitation"); p.removeEffect("slow_falling"); }',
  '      else if (p.isJumping) { p.addEffect("levitation", 8, { amplifier: 5, showParticles: false }); p.addEffect("slow_falling", 40, { amplifier: 0, showParticles: false }); }',
  '      else { p.removeEffect("levitation"); p.addEffect("slow_falling", 40, { amplifier: 0, showParticles: false }); }',
  '    } catch (e) {}','  }','}, 2);']:[],
  ''].join("\n");
}
function scriptKit(k,propios){
  const mat=k.material;
  const piezas=[];
  if(k.armadura)piezas.push(["helmet","h"],["chestplate","c"],["leggings","l"],["boots","b"]);
  const lista=[];
  const E={h:[["protection",4],["unbreaking",3],["mending",1],["respiration",3],["aqua_affinity",1],["thorns",3]],c:[["protection",4],["unbreaking",3],["mending",1],["thorns",3]],l:[["protection",4],["unbreaking",3],["mending",1],["swift_sneak",3],["thorns",3]],b:[["protection",4],["unbreaking",3],["mending",1],["feather_falling",4],["depth_strider",3],["thorns",3]]};
  for(const [n,k2] of piezas)lista.push({id:"minecraft:"+mat+"_"+n,enc:E[k2]});
  if(k.herramientas){
    lista.push({id:"minecraft:"+mat+"_sword",enc:[["sharpness",5],["looting",3],["fire_aspect",2],["knockback",2],["sweeping_edge",3],["unbreaking",3],["mending",1]]});
    lista.push({id:"minecraft:"+mat+"_pickaxe",enc:[["efficiency",5],["fortune",3],["unbreaking",3],["mending",1]]});
    lista.push({id:"minecraft:"+mat+"_axe",enc:[["efficiency",5],["sharpness",5],["fortune",3],["unbreaking",3],["mending",1]]});
    lista.push({id:"minecraft:"+mat+"_shovel",enc:[["efficiency",5],["fortune",3],["unbreaking",3],["mending",1]]});
    lista.push({id:"minecraft:"+mat+"_hoe",enc:[["efficiency",5],["fortune",3],["unbreaking",3],["mending",1]]});
    lista.push({id:"minecraft:bow",enc:[["power",5],["punch",2],["flame",1],["infinity",1],["unbreaking",3]]});
    lista.push({id:"minecraft:shield",enc:[["unbreaking",3],["mending",1]]});
    lista.push({id:"minecraft:fishing_rod",enc:[["luck_of_the_sea",3],["lure",3],["unbreaking",3],["mending",1]]});
  }
  propios=propios||[];
  const extras=k.recursos?[["minecraft:enchanted_golden_apple",16],["minecraft:cooked_beef",64],["minecraft:arrow",64],["minecraft:torch",64],["minecraft:diamond",64],["minecraft:iron_ingot",64],["minecraft:gold_ingot",64],["minecraft:oak_log",64],["minecraft:cobblestone",64],["minecraft:ender_pearl",16],["minecraft:water_bucket",1],["minecraft:lava_bucket",1],["minecraft:experience_bottle",64]]:[];
  return ['import * as mc from "@minecraft/server";','const { world, system, ItemStack } = mc;','',
  'const PROPIOS = '+JSON.stringify(propios)+'; // objetos propios de este add-on que van en el kit',
  '// Kit inicial: se entrega una sola vez a cada jugador al entrar por primera vez al mundo.',
  'const ENCANTAR = '+(k.encantar?"true":"false")+';',
  'const PIEZAS = '+JSON.stringify(lista)+';',
  'const EXTRAS = '+JSON.stringify(extras)+';',
  '',
  'function encantar(item, lista) {','  const c = item.getComponent("minecraft:enchantable");','  if (!c) return;','  for (const [id, nivel] of lista) {',
  '    for (const tipo of [() => id, () => new mc.EnchantmentType(id)]) {','      try { c.addEnchantment({ type: tipo(), level: nivel }); break; } catch (e) {}','    }','  }','}',
  'function armar() {','  const items = [];','  for (const p of PIEZAS) {','    try { const it = new ItemStack(p.id, 1); if (ENCANTAR) encantar(it, p.enc); items.push(it); } catch (e) {}','  }',
  '  for (const id of PROPIOS) { try { items.unshift(new ItemStack(id, 1)); } catch (e) {} }',
  '  for (const [id, n] of EXTRAS) { try { items.push(new ItemStack(id, n)); } catch (e) {} }','  return items;','}',
  'function colocarCofres(p, items) {',
  '  const base = { x: Math.floor(p.location.x) + 2, y: Math.floor(p.location.y), z: Math.floor(p.location.z) };',
  '  const dim = p.dimension; let i = 0; let cofres = 0; const sobran = [];',
  '  while (i < items.length && cofres < 4) {',
  '    const pos = { x: base.x + cofres, y: base.y, z: base.z };',
  '    try {',
  '      const b = dim.getBlock(pos); if (!b) break;',
  '      b.setType("minecraft:chest");',
  '      const cont = dim.getBlock(pos).getComponent("minecraft:inventory")?.container;',
  '      if (!cont) break;',
  '      while (i < items.length && cont.emptySlotsCount > 0) { cont.addItem(items[i]); i++; }',
  '      cofres++;',
  '    } catch (e) { break; }',
  '  }',
  '  for (; i < items.length; i++) sobran.push(items[i]);',
  '  if (sobran.length) { const inv = p.getComponent("minecraft:inventory")?.container; for (const it of sobran) { try { inv.addItem(it); } catch (e) {} } }',
  '  p.sendMessage("§aKit de recursos listo: busca los cofres a tu lado.");',
  '}',
  'world.afterEvents.playerSpawn.subscribe((ev) => {','  if (!ev.initialSpawn) return;','  const p = ev.player;',
  '  system.runTimeout(() => {','    try {','      if (p.getDynamicProperty("ego_kit_entregado")) return;','      p.setDynamicProperty("ego_kit_entregado", true);','      colocarCofres(p, armar());','    } catch (e) {}','  }, 60);','});',''].join("\n");
}
function detectarKit(plan){return plan.kit||null;}
// ---- Poderes del JUGADOR (sin objetos): scripts probados que se activan solos al entrar al mundo ----
const MC_PODERES_JUG={inmortal:"Inmortalidad (no mueres por daño)",vida_infinita:"Vida infinita",vuelo:"Vuelo (toca saltar dos veces rápido; sprint = velocidad extrema; agacharte = bajar)",velocidad:"Velocidad extrema",fuerza:"Fuerza extrema",dano_infinito:"Daño infinito (todo lo que golpeas muere)",aura:"Aura divina (el mundo tiembla a tu alrededor)",miedo_mobs:"Los monstruos huyen de ti",adoracion_aldeanos:"Los aldeanos te adoran",destruccion:"Poder de destrucción (al romper un bloque se rompe el área; agachado rompes uno solo)",telekinesis:"Telequinesis (agachado y mirando algo, lo levantas)",vision_nocturna:"Visión nocturna",salto:"Super salto",respirar_agua:"Respirar bajo el agua",sin_hambre:"Sin hambre",resistencia_fuego:"Inmune al fuego y la lava"};
function detectarPoderesJugador(prompt){
  const t=normMc(prompt),r=[];
  if(/(inmortal|no morir|no muero|invencible|invulnerab)/.test(t))r.push("inmortal");
  if(/(vida infinita|salud infinita|vida ilimitada)/.test(t))r.push("vida_infinita");
  if(/(\bvolar\b|\bvuelo\b|volando)/.test(t))r.push("vuelo");
  if(/(velocidad (?:extrema|infinita|increible|maxima)|super ?velocidad|correr (?:muy )?rapido|rapidisimo)/.test(t))r.push("velocidad");
  if(/(fuerza (?:infinita|extrema|divina)|super ?fuerza)/.test(t))r.push("fuerza");
  if(/(dano infinito|dano ilimitado|matar de un golpe|mato de un golpe|un solo golpe)/.test(t))r.push("dano_infinito");
  if(/\baura\b/.test(t)||/(temblar|tiemble|terremoto)/.test(t))r.push("aura");
  if(/(sienta(?:n)? miedo|miedo al ver|me teman|huyan|huyen de mi)/.test(t))r.push("miedo_mobs");
  if(/(aldeanos? (?:me )?ador|me ador)/.test(t))r.push("adoracion_aldeanos");
  if(/(poder de destruccion|destruir bloques|destruccion)/.test(t))r.push("destruccion");
  if(/(levantar objetos|telequinesis|telekinesis|levitar objetos|levantar cosas)/.test(t))r.push("telekinesis");
  if(/(ver de noche|vision nocturna|ver en la oscuridad)/.test(t))r.push("vision_nocturna");
  if(/(super salto|saltar muy alto|salto infinito)/.test(t))r.push("salto");
  if(/(respirar (?:bajo el )?agua)/.test(t))r.push("respirar_agua");
  if(/(sin hambre|no tener hambre|hambre infinit)/.test(t))r.push("sin_hambre");
  if(/(inmune al fuego|resistencia al fuego|no quemar|inmune a la lava)/.test(t))r.push("resistencia_fuego");
  return r;
}
function scriptPoderesJugador(lista){
  const P=new Set(lista);const has=k=>P.has(k);
  const L=[];
  L.push('import { world, system } from "@minecraft/server";','',
  '// Poderes del jugador generados por EGO. Se activan solos para todos los jugadores del mundo.',
  'const PODERES = '+JSON.stringify([...P])+';',
  'const tiene = (k) => PODERES.includes(k);',
  'function efecto(p, id, nivel, dur) { try { p.addEffect(id, dur || 300, { amplifier: nivel, showParticles: false }); } catch (e) {} }',
  'function libre(dim, loc) { try { const b = dim.getBlock(loc); return !b || b.isAir || b.isLiquid; } catch (e) { return true; } }',
  '',
  '// ---- cada segundo: efectos permanentes ----',
  'system.runInterval(() => {','  for (const p of world.getAllPlayers()) {','    try {');
  if(has("inmortal")||has("vida_infinita")){L.push('      efecto(p, "resistance", 4, 300);','      efecto(p, "regeneration", 4, 300);'+(has("vida_infinita")?'\n      efecto(p, "health_boost", 9, 300);\n      efecto(p, "absorption", 9, 300);':''));}
  if(has("inmortal"))L.push('      efecto(p, "fire_resistance", 0, 300);','      efecto(p, "water_breathing", 0, 300);');
  if(has("velocidad"))L.push('      efecto(p, "speed", 9, 300);');
  if(has("fuerza"))L.push('      efecto(p, "strength", 19, 300);');
  if(has("vision_nocturna"))L.push('      efecto(p, "night_vision", 0, 440);');
  if(has("salto"))L.push('      efecto(p, "jump_boost", 6, 300);');
  if(has("respirar_agua"))L.push('      efecto(p, "water_breathing", 0, 300);');
  if(has("sin_hambre"))L.push('      efecto(p, "saturation", 4, 300);');
  if(has("resistencia_fuego"))L.push('      efecto(p, "fire_resistance", 0, 300);');
  L.push('    } catch (e) {}','  }','}, 20);','');
  if(has("inmortal")||has("vida_infinita")){
    L.push('// ---- cada 5 ticks: la vida siempre al máximo ----','system.runInterval(() => {','  for (const p of world.getAllPlayers()) {','    try { p.getComponent("minecraft:health")?.resetToMaxValue(); } catch (e) {}','  }','}, 5);','');
  }
  if(has("vuelo")){
    L.push('// ---- VUELO: salta dos veces rápido. Salto = subir, agacharse = bajar, sprint = avanzar a gran velocidad ----',
    '// (vuelo simulado: en supervivencia Minecraft no permite el vuelo creativo real)',
    'const volando = new Set();','const ultimoSalto = new Map();','const saltoAntes = new Map();',
    'system.runInterval(() => {','  for (const p of world.getAllPlayers()) {','    try {',
    '      if (p.isFlying) continue;',
    '      const salta = !!p.isJumping;','      const antes = !!saltoAntes.get(p.id); saltoAntes.set(p.id, salta);',
    '      const ahora = system.currentTick;',
    '      if (salta && !antes) { const u = ultimoSalto.get(p.id) ?? -100; if (!volando.has(p.id) && ahora - u <= 12) { volando.add(p.id); p.onScreenDisplay.setActionBar("Vuelo activado"); } ultimoSalto.set(p.id, ahora); }',
    '      if (!volando.has(p.id)) continue;',
    '      if (p.isOnGround && !salta) { volando.delete(p.id); p.onScreenDisplay.setActionBar("Vuelo desactivado"); continue; }',
    '      const l = p.location; const v = p.getViewDirection();',
    '      let destino = { x: l.x, y: l.y, z: l.z };',
    '      if (p.isSneaking) destino = { x: l.x, y: l.y - 0.5, z: l.z };',
    '      else if (salta) destino = { x: l.x, y: l.y + 0.7, z: l.z };',
    '      else if (p.isSprinting) destino = { x: l.x + v.x * 1.6, y: l.y + v.y * 1.6, z: l.z + v.z * 1.6 };',
    '      if (libre(p.dimension, { x: destino.x, y: destino.y, z: destino.z }) && libre(p.dimension, { x: destino.x, y: destino.y + 1, z: destino.z })) p.teleport(destino, { keepVelocity: false });',
    '      else p.teleport(l, { keepVelocity: false });',
    '    } catch (e) {}','  }','}, 2);','');
  }
  if(has("dano_infinito")){
    L.push('// ---- DAÑO INFINITO: lo que golpeas muere ----','world.afterEvents.entityHitEntity.subscribe((ev) => {','  try {','    const p = ev.damagingEntity; const x = ev.hitEntity;','    if (!p || p.typeId !== "minecraft:player" || !x || x.typeId === "minecraft:player") return;',
    '    try { x.kill(); } catch (e) { try { x.applyDamage(1000000); } catch (e2) {} }','  } catch (e) {}','});','');
  }
  if(has("destruccion")){
    L.push('// ---- DESTRUCCIÓN: al romper un bloque se rompe el área (agachado: solo ese bloque) ----','world.afterEvents.playerBreakBlock.subscribe((ev) => {','  try {','    const p = ev.player; if (p.isSneaking) return;','    const b = ev.block.location; const r = 2;',
    '    p.dimension.runCommand(`fill ${b.x - r} ${b.y - r} ${b.z - r} ${b.x + r} ${b.y + r} ${b.z + r} air destroy`);','  } catch (e) {}','});','');
  }
  if(has("aura")||has("miedo_mobs")||has("adoracion_aldeanos")){
    L.push('// ---- AURA: temblor, partículas, monstruos que huyen y aldeanos que te adoran ----',
    'system.runInterval(() => {','  for (const p of world.getAllPlayers()) {','    try {','      const l = p.location;');
    if(has("aura"))L.push('      p.runCommand("camerashake add @s 0.12 0.6 positional");',
      '      try { p.dimension.spawnParticle("minecraft:totem_particle", { x: l.x, y: l.y + 1, z: l.z }); } catch (e) {}',
      '      if (system.currentTick % 60 === 0) { try { p.playSound("random.explode", { volume: 0.4, pitch: 0.5 }); } catch (e) {} }');
    if(has("miedo_mobs"))L.push('      for (const e of p.dimension.getEntities({ location: l, maxDistance: 18, families: ["monster"] })) {','        try { const dx = e.location.x - l.x, dz = e.location.z - l.z; const d = Math.sqrt(dx * dx + dz * dz) || 1;',
      '          e.applyKnockback({ x: (dx / d) * 1.2, z: (dz / d) * 1.2 }, 0.3); e.addEffect("slowness", 40, { amplifier: 1, showParticles: false }); } catch (e2) {}','      }');
    if(has("adoracion_aldeanos"))L.push('      for (const e of p.dimension.getEntities({ location: l, maxDistance: 18, type: "minecraft:villager_v2" })) {','        try { e.addEffect("regeneration", 60, { amplifier: 1, showParticles: false }); p.dimension.spawnParticle("minecraft:heart_particle", { x: e.location.x, y: e.location.y + 2, z: e.location.z }); } catch (e2) {}','      }');
    L.push('    } catch (e) {}','  }','}, 10);','');
  }
  if(has("telekinesis")){
    L.push('// ---- TELEQUINESIS: agachado en el suelo y mirando algo, lo levantas ----','system.runInterval(() => {','  for (const p of world.getAllPlayers()) {','    try {','      if (!p.isSneaking || !p.isOnGround) continue;',
    '      const m = p.getEntitiesFromViewDirection({ maxDistance: 40 }).find((r) => r.entity.id !== p.id)?.entity;','      if (m) m.addEffect("levitation", 30, { amplifier: 2, showParticles: false });','    } catch (e) {}','  }','}, 10);','');
  }
  L.push('world.afterEvents.playerSpawn.subscribe((ev) => {','  try { if (ev.initialSpawn) ev.player.sendMessage("§6Poderes divinos activos: §f"+PODERES.join(", ")); } catch (e) {}','});','');
  return L.join("\n");
}
function modeloProceduralEntidad(obj, archivo){
  const nombre=String(obj?.nombre||archivo||"criatura");
  const texto=normMc(nombre+" "+String(obj?.descripcion||"")+" "+archivo);
  const base=colorDeNombre(nombre+" "+archivo);
  const c2=aclararMc(base,-.34),ac=aclararMc(base,.38);
  if(/arana|aracn|spider|insecto/.test(texto)){
    const P=[];const add=(n,o,t,c,x)=>P.push(Object.assign({nombre:n,origen:o,tam:t,color:c},x||{}));
    add("abdomen",[-5,8,1],[10,8,12],base);add("cefalotorax",[-4,9,-8],[8,7,9],c2);add("ojos",[-2,13,-8],[4,2,1],"#ff3322");
    for(let i=0;i<4;i++)for(const sg of [-1,1]){const n="pata_"+(i*2+(sg>0?1:2));const z=-7+i*4;add(n,[sg>0?4:-7,5,z],[3,2,7],i%2?c2:base,{pivote:[sg>0?4:-4,7,z+2],rot:[0,0,sg*18]});}
    return P;
  }
  if(/slime|gelatina|cubo gelatinoso|magma cube/.test(texto)){
    const P=[];const add=(n,o,t,c)=>P.push({nombre:n,origen:o,tam:t,color:c});
    add("cuerpo",[-6,3,-6],[12,12,12],base);add("borde_superior",[-5,14,-5],[10,1,10],ac);
    add("ojo_i",[-4,10,-6.5],[3,2,1],"#f5f5f5");add("ojo_d",[1,10,-6.5],[3,2,1],"#f5f5f5");
    add("pupila_i",[-3,10,-7],[1,1,0.5],"#202020");add("pupila_d",[2,10,-7],[1,1,0.5],"#202020");
    add("boca",[-2,7,-6.7],[4,1,0.6],c2);return P;
  }
  const bestia=/(perro|lobo|wolf|dog|dragon|dinosaur|dinosaurio|bestia|animal|oso|bear|felino|tigre|leon|leon|jabal|araña|spider|insecto|serpiente)/.test(texto);
  if(bestia){
    const rasgos={cuernos:/dragon|demon|cuerno/.test(texto),alas:/dragon|volador|wing/.test(texto),cola:true};
    return modeloBestia({altura:/dragon|gigante|jefe/.test(texto)?42:26,colores:{piel:base,armadura:base,armadura2:c2,acento:ac,ojos:/zombi|infect/.test(texto)?"#baff35":"#ffcc33"},rasgos});
  }
  const zombi=/zombi|zombie|infect|mutant|mutante/.test(texto),esqueleto=/esquelet|skeleton|hueso/.test(texto),jefe=/jefe|boss|coloso|gigante|reina|rey|titan|devorador/.test(texto),tanque=/tanque|bruto|acorazado/.test(texto);
  const altura=jefe?72:(tanque?48:(/corredor|rapido|acechador/.test(texto)?36:32));
  const P=modeloHumanoide({altura,colores:{piel:zombi?"#71934b":(esqueleto?"#d9d1b5":base),armadura:zombi?"#344b3b":c2,armadura2:zombi?"#536b43":base,acento:ac,ojos:zombi?"#d7ff36":"#ff3b36",capa:c2},rasgos:{cuernos:/demon|mutante|coloso/.test(texto),capa:jefe||/nocturno|sombra/.test(texto),alas:/angel|demon|dragon/.test(texto),corona:/reina|rey/.test(texto),cola:/demon|mutante/.test(texto),casco:!zombi&&!esqueleto,hombreras:jefe||tanque,arma:"ninguna"}});
  // Rasgos de silueta por arquetipo: no basta con cambiar el nombre o el color del mismo mob.
  const u=altura/32,add=(n,o,t,c)=>P.push({nombre:n,origen:o.map(v=>+(v*u).toFixed(2)),tam:t.map(v=>+(v*u).toFixed(2)),color:c});
  if(tanque){add("placa_tanque_i",[-8,18,-3],[5,6,7],"#626b78");add("placa_tanque_d",[3,18,-3],[5,6,7],"#626b78");add("rodillera_tanque_i",[-5,4,-2],[4,4,5],"#59616c");add("rodillera_tanque_d",[1,4,-2],[4,4,5],"#59616c");}
  if(/toxic|tox|venen/.test(texto)){add("nucleo_toxico",[-2,15,-3],[4,5,1],"#b6ff28");add("tubo_toxico_i",[-5,17,2],[2,8,2],"#76a92e");add("tubo_toxico_d",[3,17,2],[2,8,2],"#76a92e");add("espina_toxica",[-1,25,2],[2,5,2],"#c8ff3d");}
  if(/explos|suicida|bomba/.test(texto)){add("carga_explosiva",[-3,15,-3],[6,6,2],"#ed542f");add("fusible",[-1,22,-1],[2,5,2],"#f4c542");add("placa_roja",[-4,14,-3],[8,1,1],"#a92c26");}
  if(/devor|come|mandibula|boca/.test(texto)){add("mandibula",[-4,22,-5],[8,3,3],"#49352f");for(let i=0;i<4;i++)add("colmillo_"+i,[-3+i*2,21,-6],[1,2,1],"#eee5d0");}
  if(/coloso|gigante|titan/.test(texto)){add("placa_pecho",[-6,14,-3],[12,8,2],"#737b8b");add("placa_centro",[-3,16,-4],[6,4,1],ac);}
  if(/corredor|rapido|acechador/.test(texto)){add("garra_i",[-7,10,-2],[2,4,3],"#d5d8d0");add("garra_d",[5,10,-2],[2,4,3],"#d5d8d0");}
  return P;
}

function postprocesarAddon(entrada,plan,verSrv){
  const notas=[],mapa=new Map(),ns=plan.ns||"ego";
  for(const f of entrada){ if(f&&typeof f.path==="string"&&typeof f.content==="string") mapa.set(f.path,f.content); }
  const leer=(p)=>{const t=jsonTolerante(mapa.get(p));return t.ok?t.obj:null;};
  // --- limpieza previa: nada de extras que el usuario no pidió + kit inicial
  const kit=detectarKit(plan);
  if(kit){
    for(const k of [...mapa.keys()].filter(k=>/^BP\/scripts\/.+\.js$/.test(k))){const t=String(mapa.get(k));if(/initialSpawn|playerSpawn|minecraft:chest/.test(t)){mapa.delete(k);notas.push(k.replace("BP/","")+" se reemplazó por el kit inicial de EGO.");}}
    const propios=[...mapa.keys()].filter(k=>/^BP\/items\/.+\.json$/.test(k)).map(k=>{try{return JSON.parse(mapa.get(k))["minecraft:item"].description.identifier;}catch(_){return null;}}).filter(id=>id&&id.startsWith(plan.ns+":")).filter(id=>{const o=(plan.objetos||[]).find(x=>x.id===id);return !o||!o.entrega||o.entrega==="kit";});
    kit.propios=propios;
    mapa.set("BP/scripts/ego_kit.js",scriptKit(kit,propios));
  }
  // un bloque ya trae su propio ítem: si la IA creó además un ítem con el mismo id, se quita (chocan)
  {const bl=new Set([...mapa.keys()].filter(k=>/^BP\/blocks\/.+\.json$/.test(k)).map(k=>{try{return JSON.parse(mapa.get(k))["minecraft:block"].description.identifier;}catch(_){return null;}}).filter(Boolean));
   for(const k of [...mapa.keys()].filter(k=>/^BP\/items\/.+\.json$/.test(k))){try{const id=JSON.parse(mapa.get(k))["minecraft:item"].description.identifier;if(bl.has(id)){mapa.delete(k);}}catch(_){}}}
  for(const k of [...mapa.keys()]){const mm=k.match(/^BP\/(items|blocks|entities)\/(?:.+\/)([^/]+\.json)$/);if(mm){const nk="BP/"+mm[1]+"/"+mm[2];if(!mapa.has(nk)){mapa.set(nk,mapa.get(k));mapa.delete(k);notas.push("Se movió "+k.replace("BP/","")+" a "+nk.replace("BP/","")+" (Minecraft solo lee esa carpeta).");}}}
  const iconos=[],bloques=[],entidades=[],items=[];
  const verSrvOk=String(verSrv||"2.10.0"),verUI=/^2\.11(?:\.|$)/.test(verSrvOk)?"2.3.0":/^2\./.test(verSrvOk)?"2.2.0":"1.3.0";
  // --- ítems
  for(const p of [...mapa.keys()].filter(k=>/^BP\/items\/[^/]+\.json$/.test(k))){
    const o=leer(p); const it=o&&o["minecraft:item"]; if(!it||!it.description){notas.push(p+" no es un ítem válido; se omitió.");mapa.delete(p);continue;}
    const id=String(it.description.identifier||"");
    if(!/^[a-z0-9_]+:[a-z0-9_]+$/.test(id)){notas.push(p+": identificador inválido; se omitió.");mapa.delete(p);continue;}
    it.components=it.components||{};
    const ic=it.components["minecraft:icon"];
    const corto=slugAscii((typeof ic==="string"?ic:(ic&&((ic.textures&&ic.textures.default)||ic.texture)))||id.split(":")[1]);
    it.components["minecraft:icon"]={textures:{default:corto}};
    if(typeof it.components["minecraft:cooldown"]==="number"){delete it.components["minecraft:cooldown"];notas.push("Se quitó un cooldown inválido de "+p+".");}
    if(!it.description.menu_category)it.description.menu_category={category:"items"};
    o.format_version=o.format_version||"1.21.0";
    mapa.set(p,JSON.stringify(o,null,2)+"\n");
    items.push(id);iconos.push({corto,id});
  }
  // --- bloques
  for(const p of [...mapa.keys()].filter(k=>/^BP\/blocks\/[^/]+\.json$/.test(k))){
    const o=leer(p); const b=o&&o["minecraft:block"]; if(!b||!b.description){notas.push(p+" no es un bloque válido; se omitió.");mapa.delete(p);continue;}
    const id=String(b.description.identifier||"");
    if(!/^[a-z0-9_]+:[a-z0-9_]+$/.test(id)){mapa.delete(p);continue;}
    b.components=b.components||{};
    const mi=b.components["minecraft:material_instances"];const cortos=new Set();
    if(mi&&typeof mi==="object"){for(const k of Object.keys(mi)){const e=mi[k];if(e&&typeof e==="object"){e.texture=slugAscii(e.texture||id.split(":")[1]);e.render_method=e.render_method||"opaque";cortos.add(e.texture);}}}
    if(!cortos.size){const t=slugAscii(id.split(":")[1]);b.components["minecraft:material_instances"]={"*":{texture:t,render_method:"opaque"}};cortos.add(t);}
    if(!b.description.menu_category)b.description.menu_category={category:"construction"};
    o.format_version=o.format_version||"1.21.0";
    mapa.set(p,JSON.stringify(o,null,2)+"\n");
    bloques.push({id,cortos:[...cortos]});
  }
  // --- criaturas
  for(const p of [...mapa.keys()].filter(k=>/^BP\/entities\/[^/]+\.json$/.test(k))){
    const o=leer(p); const e=o&&o["minecraft:entity"]; if(!e||!e.description){notas.push(p+" no es una criatura válida; se omitió.");mapa.delete(p);continue;}
    const id=String(e.description.identifier||"");
    if(!/^[a-z0-9_]+:[a-z0-9_]+$/.test(id)){mapa.delete(p);continue;}
    e.description.is_spawnable=true;e.description.is_summonable=true;
    try{normalizarCriatura(e,plan,p.split("/").pop().replace(/\.json$/,""),mapa);}catch(_){}
    o.format_version=o.format_version||"1.21.0";
    mapa.set(p,JSON.stringify(o,null,2)+"\n");
    entidades.push({id,archivo:p.split("/").pop().replace(/\.json$/,"")});
  }
  // --- texturas de ítems
  const png=[];
  if(iconos.length){
    const dat={};let primero=null;
    for(const ic of iconos){
      const nom=nombreDeId(ic.id,plan),col=colorDeNombre(nom+" "+((plan.objetos||[]).find(x=>x.id===ic.id)||{}).descripcion),px=dibujarGenerico(tipoIconoDe(nom+" "+ic.corto+" "+(((plan.objetos||[]).find(x=>x.id===ic.id)||{}).icono||"")+((((plan.objetos||[]).find(x=>x.id===ic.id)||{}).habilidad&&!/(vara|baston|cetro|varita)/.test(normMc(nom)))?" espada":"")),col,mezcla(hexRgb(col),[255,255,255],.45).length?"#"+mezcla(hexRgb(col),[255,236,140],.6).map(v=>v.toString(16).padStart(2,"0")).join(""):"#ffffff");
      dat[ic.corto]={textures:"textures/items/"+ic.corto};
      mapa.set("RP/textures/items/"+ic.corto+".png",pngBytes(16,16,px));
      if(!primero)primero={px,col};
    }
    mapa.set("RP/textures/item_texture.json",JSON.stringify({resource_pack_name:ns,texture_name:"atlas.items",texture_data:dat},null,2)+"\n");
    png.push(...iconos.map(i=>i.corto));
    plan._icono=primero;
  }
  // --- texturas de bloques
  if(bloques.length){
    const dat={};
    for(const b of bloques)for(const c of b.cortos){
      const nom=nombreDeId(b.id,plan);const col=colorDeNombre(nom+" "+c);const estilo=/(mena|ore|mineral|cristal)/.test(normMc(nom+" "+c))?"mena":(/(liso|ladrillo|pulid|placa)/.test(normMc(nom))?"liso":"piedra");
      dat[c]={textures:"textures/blocks/"+c};
      mapa.set("RP/textures/blocks/"+c+".png",pngBytes(16,16,dibujarBloque(col,estilo,semillaDe(c))));
    }
    mapa.set("RP/textures/terrain_texture.json",JSON.stringify({resource_pack_name:ns,texture_name:"atlas.terrain",padding:8,num_mip_levels:4,texture_data:dat},null,2)+"\n");
    if(!plan._icono){const col=colorDeNombre(nombreDeId(bloques[0].id,plan));plan._icono={px:dibujarBloque(col,"piedra",7),col};}
  }
  // --- modelos de criaturas: conservar solo client_entity completo, con recursos existentes y sin compartir modelo.
  const geometriasUsadas=new Set(),texturasUsadas=new Set();
  for(const e of entidades){
    const rutaCli="RP/entity/"+e.archivo+".entity.json";
    if(mapa.has(rutaCli)){
      const c=leer(rutaCli),d=c?.["minecraft:client_entity"]?.description;
      const geo=d?.geometry?.default,tx=d?.textures?.default;
      let geoOk=false;if(geo){for(const [gp,gf] of mapa){if(!/^RP\/models\/entity\/.+\.geo\.json$/i.test(gp))continue;const j=jsonTolerante(gf);if(j.ok&&(j.obj["minecraft:geometry"]||[]).some(g=>g.description?.identifier===geo)){geoOk=true;break;}}}
      const txClean=String(tx||"").replace(/^\//,"").replace(/\.(png|tga|jpg)$/i,"");
      const txOk=!!txClean&&["png","tga","jpg"].some(ext=>mapa.has("RP/"+txClean+"."+ext));
      const completo=!!(d?.identifier===e.id&&d?.spawn_egg&&geoOk&&txOk&&!geometriasUsadas.has(geo)&&!texturasUsadas.has(txClean));
      if(completo){geometriasUsadas.add(geo);texturasUsadas.add(txClean);mapa.set(rutaCli,JSON.stringify(c,null,2)+"\n");continue;}
      notas.push("«"+nombreDeId(e.id,plan)+"»: se reconstruyó el recurso visual porque faltaba o estaba compartido/incompleto.");
    }
    let mod3=(plan._modelos3d||[]).find(q=>q.entidad===e.id);
    // Política universal: toda entidad recibe geometría y textura propias aunque el usuario no haya pedido explícitamente "modelo 3D".
    if(!mod3) mod3={entidad:e.id,partes:modeloProceduralEntidad((plan.objetos||[]).find(x=>x.id===e.id)||{id:e.id,nombre:nombreDeId(e.id,plan)},e.archivo)};
    if(mod3){const geoId="geometry."+ns+"_"+e.archivo.replace(/[^a-z0-9_]/g,"_");let b=construirModelo3d(geoId,mod3.partes);
      if(!b){const fallback=modeloProceduralEntidad((plan.objetos||[]).find(x=>x.id===e.id)||{id:e.id,nombre:nombreDeId(e.id,plan)},e.archivo);b=construirModelo3d(geoId,fallback);notas.push("«"+nombreDeId(e.id,plan)+"»: el modelo solicitado no era válido; se generó un modelo procedural de respaldo.");}
      if(b){const col0=colorDeNombre(nombreDeId(e.id,plan));mapa.set("RP/models/entity/"+e.archivo+".geo.json",b.geo);mapa.set("RP/textures/entity/"+e.archivo+".png",b.png);
        const animId="animation."+ns+"_"+e.archivo.replace(/[^a-z0-9_]/g,"_")+".caminar";const conAnim=b.animados>0;
        if(conAnim)mapa.set("RP/animations/"+e.archivo+".animation.json",JSON.stringify({format_version:"1.8.0",animations:{[animId]:{loop:true,bones:b.bonesAnim}}},null,2)+"\n");
        mapa.set(rutaCli,JSON.stringify({format_version:"1.10.0","minecraft:client_entity":{description:{identifier:e.id,materials:{default:"entity_alphatest"},textures:{default:"textures/entity/"+e.archivo},geometry:{default:geoId},render_controllers:["controller.render.default"],...(conAnim?{animations:{caminar:animId},scripts:{animate:["caminar"]}}:{}),spawn_egg:{base_color:col0,overlay_color:"#"+mezcla(hexRgb(col0),[0,0,0],.5).map(v=>v.toString(16).padStart(2,"0")).join("")}}}},null,2)+"\n");
        geometriasUsadas.add(geoId);texturasUsadas.add("textures/entity/"+e.archivo);
        {const rb="BP/entities/"+e.archivo+".json";const jb=mapa.has(rb)?leer(rb):null;if(jb&&jb["minecraft:entity"]){const cs=jb["minecraft:entity"].components=jb["minecraft:entity"].components||{};cs["minecraft:collision_box"]={width:Math.round(Math.min(8,Math.max(.6,b.ancho/16))*100)/100,height:Math.round(Math.min(10,Math.max(.8,b.alto/16))*100)/100};mapa.set(rb,JSON.stringify(jb,null,2)+"\n");}}
        notas.push("«"+nombreDeId(e.id,plan)+"» tiene modelo 3D propio ("+b.cubos+" cubos, "+b.colores+" colores, ~"+Math.round(b.alto)+" px de alto). "+(b.animados?"Animación locomotora conectada. ":"Sin animación locomotora automática. ")+"La caja de colisión se ajustó al tamaño del modelo.");
        plan._hab3d=(plan._hab3d||[]).concat("Modelo 3D propio de "+nombreDeId(e.id,plan)+" ("+b.cubos+" cubos)");continue;}}
    const nom=nombreDeId(e.id,plan),m=MC_MODELOS_VANILLA[modeloVanillaDe(nom+" "+e.archivo)];
    const col=colorDeNombre(nom);
    mapa.set(rutaCli,JSON.stringify({format_version:"1.10.0","minecraft:client_entity":{description:{identifier:e.id,...m,spawn_egg:{base_color:col,overlay_color:"#"+mezcla(hexRgb(col),[0,0,0],.5).map(v=>v.toString(16).padStart(2,"0")).join("")}}}},null,2)+"\n");
    notas.push("«"+nom+"» usa el modelo de un mob del juego (sin modelo 3D propio).");
  }
  // --- idiomas
  const en=parseLang(mapa.get("RP/texts/en_US.lang")),es=parseLang(mapa.get("RP/texts/es_ES.lang"));
  const poner=(k,v)=>{if(!es.has(k))es.set(k,v);if(!en.has(k))en.set(k,v);};
  for(const id of items){const n=nombreDeId(id,plan);poner("item."+id,n);poner("item."+id+".name",n);}
  for(const b of bloques){const n=nombreDeId(b.id,plan);poner("tile."+b.id+".name",n);}
  for(const e of entidades){const n=nombreDeId(e.id,plan);poner("entity."+e.id+".name",n);poner("item.spawn_egg.entity."+e.id+".name","Huevo de "+n);}
  const aTxt=(m)=>[...m.entries()].map(([k,v])=>k+"="+v).join("\n")+"\n";
  mapa.set("RP/texts/en_US.lang",aTxt(en));mapa.set("RP/texts/es_ES.lang",aTxt(es));mapa.set("RP/texts/languages.json",'["en_US","es_ES"]\n');
  // --- scripts: se descartan los que usan APIs que no existen; las habilidades las programa el código
  for(const k of [...mapa.keys()].filter(k=>/^BP\/scripts\/.+\.js$/.test(k))){const tx=String(mapa.get(k));const mal=lintScript(tx);const prs=lintScriptApi(tx, verSrv||"2.10.0");if(mal||prs.length){mapa.delete(k);notas.push(k.replace("BP/","")+" se descartó porque "+(mal||prs.slice(0,3).join("; "))+" (no existe en la API oficial de Minecraft y rompería todo el script).");}}
  const habilidades=[...(plan._hab3d||[])];
  for(const id of items){
    const o=(plan.objetos||[]).find(x=>x.id===id)||{id,nombre:nombreDeId(id,plan),descripcion:""};
    const hab=habilidadDeObjeto(o);if(!hab)continue;
    const [pns,corto]=id.split(":");
    const sp={id:corto,ns:pns,nombre:nombreDeId(id,plan),habilidad:hab,tipo:tipoArmaDe(o),rayos:o.rayos||(hab==="rayo"?3:1),espera:o.espera||60,buscar:true,proteger:true,velocidad:false};
    // si el script de la IA ya maneja este ítem, se reemplaza por el probado
    for(const k of [...mapa.keys()].filter(k=>/^BP\/scripts\/.+\.js$/.test(k)&&!/ego_hab_/.test(k))){
      const t=String(mapa.get(k));
      if(t.includes('"'+id+'"')||t.includes("'"+id+"'")){
        if(/itemUse|entityHitEntity|itemStartUse|itemCompleteUse/.test(t)){mapa.set(k,t.split('"'+id+'"').join('"ego:__reemplazado__"').split("'"+id+"'").join("'ego:__reemplazado__'"));notas.push("La habilidad de «"+sp.nombre+"» la maneja el código probado de EGO (el resto de la lógica de "+k.replace("BP/scripts/","")+" se conserva).");}
      }
    }
    mapa.set("BP/scripts/ego_hab_"+corto+".js",scriptHabilidad(sp));
    habilidades.push(sp.nombre+": "+({rayo:"rayos",fuego:"fuego",hielo:"hielo",explosion:"explosión",veneno:"veneno",viento:"viento",curacion:"curación"}[hab])+" (clic derecho y al golpear)");
  }
  for(const id of items){
    const o=(plan.objetos||[]).find(x=>x.id===id)||{id,nombre:nombreDeId(id,plan),descripcion:""};
    const pod=poderesDeObjeto(o);if(!pod.length)continue;
    for(const k of [...mapa.keys()].filter(k=>/^BP\/scripts\/.+\.js$/.test(k)&&!/ego_(hab|pod|kit)/.test(k))){
      const t=String(mapa.get(k));if((t.includes('"'+id+'"')||t.includes("'"+id+"'"))&&/itemUse|runInterval|inventory/.test(t)){mapa.set(k,t.split('"'+id+'"').join('"ego:__reemplazado__"').split("'"+id+"'").join("'ego:__reemplazado__'"));notas.push("Los poderes de «"+nombreDeId(id,plan)+"» los maneja el código probado de EGO (el resto de la lógica de "+k.replace("BP/scripts/","")+" se conserva).");}
    }
    mapa.set("BP/scripts/ego_pod_"+id.split(":")[1]+".js",scriptPoderes({id,poderes:pod}));
    habilidades.push(nombreDeId(id,plan)+": "+pod.map(p=>({vuelo:"vuelo",vision_nocturna:"visión nocturna",velocidad:"velocidad",fuerza:"fuerza",regeneracion:"regeneración",resistencia:"resistencia",salto:"super salto",respirar_agua:"respirar bajo el agua",sin_hambre:"sin hambre",resistencia_fuego:"resistencia al fuego"}[p])).join(", ")+" (mientras lo llevas en el inventario"+(pod.includes("vuelo")?"; clic derecho activa el vuelo":"")+")");
  }
  if(kit)habilidades.push("Kit inicial"+(kit.propios&&kit.propios.length?" (incluye tus ítems propios: "+kit.propios.map(id=>nombreDeId(id,plan)).join(", ")+")":"")+": "+(kit.armadura?"armadura ":"")+(kit.herramientas?"herramientas ":"")+(kit.recursos?"recursos ":"")+"de "+(kit.material==="diamond"?"diamante":"netherite")+(kit.encantar?" encantados al máximo":"")+" en cofres junto a ti la primera vez que entras al mundo");
  if(plan.poderesJugador&&plan.poderesJugador.length){
    mapa.set("BP/scripts/ego_poderes.js",scriptPoderesJugador(plan.poderesJugador));
    habilidades.push("Poderes del jugador (activos desde que entras al mundo, sin objetos): "+plan.poderesJugador.map(k=>MC_PODERES_JUG[k]).join("; "));
  }
  if(plan._voces&&plan._voces.length){
    const defs={};const mapaEnt={};
    for(const v of plan._voces){mapa.set("RP/sounds/ego/"+v.nombre+".wav",v.bytes);defs["ego."+v.nombre]={category:"neutral",max_distance:48,sounds:[{name:"sounds/ego/"+v.nombre,volume:1.0}]};if(v.entidad)mapaEnt[v.entidad]="ego."+v.nombre;}
    mapa.set("RP/sounds/sound_definitions.json",JSON.stringify({format_version:"1.14.0",sound_definitions:defs},null,2)+"\n");
    if(Object.keys(mapaEnt).length)mapa.set("BP/scripts/ego_voces.js",'import { world } from "@minecraft/server";\nconst VOCES = '+JSON.stringify(mapaEnt)+';\nworld.afterEvents.entitySpawn.subscribe((ev) => {\n  try {\n    const e = ev.entity;\n    const s = VOCES[e.typeId];\n    if (!s) return;\n    for (const p of world.getAllPlayers()) {\n      try {\n        const dx = p.location.x - e.location.x, dz = p.location.z - e.location.z;\n        if (p.dimension.id === e.dimension.id && Math.hypot(dx, dz) < 64) p.playSound(s, { volume: 1 });\n      } catch (x) {}\n    }\n  } catch (x) {}\n});\n');
    habilidades.push("Voces generadas con IA: "+plan._voces.map(v=>"«"+v.texto.slice(0,40)+"» (/playsound ego."+v.nombre+" @s)").join("; "));
  }
  const scripts=[...mapa.keys()].filter(k=>/^BP\/scripts\/.+\.js$/.test(k));
  const mods=new Set();
  for(const s of scripts){
    const t=mapa.get(s);for(const m of t.matchAll(/from\s+["'](@minecraft\/[a-z-]+)["']/g))mods.add(m[1]);
    const bal=balanceJs(t);if(bal)notas.push(s.replace("BP/","")+": "+bal+" (revísalo si falla).");
  }
  if(scripts.length){
    if(!mapa.has("BP/scripts/main.js")){mapa.set("BP/scripts/main.js",scripts.map(s=>'import "./'+s.replace("BP/scripts/","")+'";').join("\n")+"\n");}
    else{const principal=mapa.get("BP/scripts/main.js");const faltan=scripts.filter(s=>s!=="BP/scripts/main.js"&&!principal.includes("./"+s.replace("BP/scripts/","").replace(/\.js$/,"")));if(faltan.length)mapa.set("BP/scripts/main.js",faltan.map(s=>'import "./'+s.replace("BP/scripts/","")+'";').join("\n")+"\n"+principal);}
  }
  // --- manifests (siempre los genera el código)
  const pId=crypto.randomUUID(),rId=crypto.randomUUID();
  const modBP=[{type:"data",uuid:crypto.randomUUID(),version:[1,0,0]}];
  const deps=[{uuid:rId,version:[1,0,0]}];
  if(scripts.length){modBP.push({type:"script",language:"javascript",entry:"scripts/main.js",uuid:crypto.randomUUID(),version:[1,0,0]});
    deps.push({module_name:"@minecraft/server",version:verSrvOk});if(mods.has("@minecraft/server-ui"))deps.push({module_name:"@minecraft/server-ui",version:verUI});
    for(const m of mods)if(!["@minecraft/server","@minecraft/server-ui"].includes(m))notas.push("El script usa "+m+", que puede no estar disponible en tu versión.");}
  const man=(n,d,u,m,dp)=>JSON.stringify({format_version:2,metadata:{authors:["EGO AI"]},header:{name:n,description:d,uuid:u,version:[1,0,0],min_engine_version:[1,26,50]},modules:m,...(dp?{dependencies:dp}:{})},null,2)+"\n";
  mapa.set("BP/manifest.json",man(plan.nombre+" BP","Behavior pack: "+plan.nombre,pId,modBP,deps));
  mapa.set("RP/manifest.json",man(plan.nombre+" RP","Resource pack: "+plan.nombre,rId,[{type:"resources",uuid:crypto.randomUUID(),version:[1,0,0]}],null));
  // --- íconos de los packs
  const ico=plan._icono||{px:dibujarGenerico("gema",colorDeNombre(plan.nombre),"#ffe58a"),col:colorDeNombre(plan.nombre)};
  const pk=pngBytes(64,64,iconoPack(ico.px,ico.col));
  mapa.set("BP/pack_icon.png",pk);mapa.set("RP/pack_icon.png",pk);
  // --- referencias a ids que no existen
  const conocidos=new Set([...items,...bloques.map(b=>b.id),...entidades.map(e=>e.id)]);
  for(const p of [...mapa.keys()].filter(k=>/^BP\/recipes\/.+\.json$/.test(k))){
    const t=String(mapa.get(p));for(const m of t.matchAll(/"(?:item|name)"\s*:\s*"([a-z0-9_]+):([a-z0-9_]+)"/g)){if(m[1]===ns&&!conocidos.has(m[1]+":"+m[2]))notas.push(p.replace("BP/","")+" usa "+m[1]+":"+m[2]+", que no existe en este add-on.");}
  }
  // --- README
  const cmd=[];for(const id of items)cmd.push("- `/give @s "+id+"`");for(const b of bloques)cmd.push("- `/give @s "+b.id+"`");for(const e of entidades)cmd.push("- `/summon "+e.id+"` (o con su huevo de aparición)");
  mapa.set("BP/README.md","# "+plan.nombre+"\n\nAdd-on para Minecraft Bedrock creado por EGO AI.\n\n"+(plan.resumen||"")+"\n\n## Instalar\n1. Abre el archivo .mcaddon (Minecraft lo importa solo).\n2. En el mundo: Add-ons > activa el Behavior Pack y el Resource Pack.\n3. Comandos para probarlo:\n"+(cmd.join("\n")||"- (sin objetos nuevos)")+"\n\n## Notas\n"+(notas.map(n=>"- "+n).join("\n")||"- Sin avisos.")+"\n- Las texturas de ítems y bloques son íconos generados automáticamente (16x16); puedes reemplazar los PNG de RP/textures.\n- Si el script no corre, cambia la versión de @minecraft/server en BP/manifest.json ("+verSrvOk+") por una que tu juego soporte.\n");
  // salida ordenada
  const salida=[...mapa.entries()].map(([path,content])=>({path,content})).sort((a,b)=>a.path.localeCompare(b.path));
  return {files:salida,notas,conteo:{habilidades,items:items.length,bloques:bloques.length,criaturas:entidades.length,scripts:scripts.length,texturas:png.length+bloques.length}};
}

// ---- Auditoría final: compara lo pedido con lo que de verdad quedó dentro del archivo ----
function inventarioAddon(files,habilidades){
  const L=[];
  for(const f of files){
    const p=f.path;let t=typeof f.content==="string"?f.content:"";
    try{
      if(/^BP\/items\/.+\.json$/.test(p)){const j=JSON.parse(t)["minecraft:item"];L.push("ITEM "+j.description.identifier+": "+Object.keys(j.components||{}).map(x=>x.replace("minecraft:","")).join(","));}
      else if(/^BP\/blocks\/.+\.json$/.test(p)){const j=JSON.parse(t)["minecraft:block"];L.push("BLOQUE "+j.description.identifier+": "+Object.keys(j.components||{}).map(x=>x.replace("minecraft:","")).join(","));}
      else if(/^BP\/entities\/.+\.json$/.test(p)){const j=JSON.parse(t)["minecraft:entity"];L.push("CRIATURA "+j.description.identifier+": "+Object.keys(j.components||{}).map(x=>x.replace("minecraft:","")).join(","));}
      else if(/^BP\/recipes\//.test(p))L.push("RECETA "+p.split("/").pop());
      else if(/^BP\/loot_tables\//.test(p))L.push("BOTÍN "+p.replace("BP/loot_tables/",""));
      else if(/^BP\/spawn_rules\//.test(p))L.push("APARICIÓN "+p.split("/").pop());
      else if(/^BP\/scripts\/.+\.js$/.test(p)){
        const ev=[...new Set([...t.matchAll(/(?:after|before)Events\.(\w+)/g)].map(x=>x[1]))];
        const efx=[...new Set([...t.matchAll(/addEffect\(\s*["']([\w:]+)/g)].map(x=>x[1]))];
        const ids=[...new Set([...t.matchAll(/["']([a-z0-9_]+:[a-z0-9_]+)["']/g)].map(x=>x[1]))].slice(0,12);
        L.push("SCRIPT "+p.replace("BP/scripts/","")+" ("+t.length+" caracteres) eventos="+ev.join(",")+" efectos="+efx.join(",")+" ids="+ids.join(","));
      }
    }catch(_){}
  }
  if(habilidades&&habilidades.length)L.push("HABILIDADES PROGRAMADAS POR EGO: "+habilidades.join(" | "));
  return L.join("\n").slice(0,6500);
}
async function auditarAddon(plan,files,habilidades,env){
  const req=plan.requisitos||[];
  if(!req.length)return null;
  try{
    const sys="Eres un auditor estricto de add-ons de Minecraft Bedrock. Recibes los REQUISITOS que pidió el usuario y el INVENTARIO real de lo que quedó dentro del add-on. Para cada requisito decide si el inventario lo cumple de verdad (existe el archivo/script/componente que lo implementa). Sé honesto: si solo hay un archivo pero no la lógica, NO está cumplido. Si el requisito empieza con IMPOSIBLE:, márcalo como cumplido solo si el sustituto existe. Responde SOLO JSON: {\"cumplidos\":[números base 1],\"faltan\":[{\"n\":número,\"motivo\":\"en español, corto, qué falta\"}]}";
    const user="REQUISITOS:\n"+req.map((x,i)=>(i+1)+". "+x).join("\n")+"\n\nINVENTARIO:\n"+inventarioAddon(files,habilidades);
    const r=await Promise.race([llamarCodigo(env,[{role:"system",content:sys},{role:"user",content:user}],1500,0,"razonar"),new Promise((_,rej)=>setTimeout(()=>rej(new Error("tiempo")),25000))]);
    const j=extractJson(r.raw);if(!j)return null;
    const faltan=(Array.isArray(j.faltan)?j.faltan:[]).map(x=>({n:Number(x&&x.n),motivo:String(x&&x.motivo||"").slice(0,140)})).filter(x=>x.n>=1&&x.n<=req.length);
    const cumplidos=req.length-new Set(faltan.map(x=>x.n)).size;
    return {total:req.length,cumplidos,faltan:faltan.map(x=>"«"+req[x.n-1].replace(/^IMPOSIBLE:\s*/i,"").slice(0,70)+"»: "+x.motivo)};
  }catch(e){return null;}
}

function fichaAddon(plan,r,au){
  const ids={item:[],block:[],entity:[]};
  for(const f of r.files){let mm;
    if(/^BP\/items\/.+\.json$/.test(f.path)&&(mm=String(f.content).match(/"identifier"\s*:\s*"([^"]+)"/)))ids.item.push(mm[1]);
    else if(/^BP\/blocks\/.+\.json$/.test(f.path)&&(mm=String(f.content).match(/"identifier"\s*:\s*"([^"]+)"/)))ids.block.push(mm[1]);
    else if(/^BP\/entities\/.+\.json$/.test(f.path)&&(mm=String(f.content).match(/"identifier"\s*:\s*"([^"]+)"/)))ids.entity.push(mm[1]);}
  const nom=id=>nombreDeId(id,plan);for(const k of Object.keys(ids))ids[k]=[...new Set(ids[k])];
  const incluye=[];
  ids.item.forEach(id=>{if(!(r.conteo.habilidades||[]).some(h=>h.startsWith(nom(id)+":")))incluye.push("Ítem «"+nom(id)+"»");});ids.block.forEach(id=>incluye.push("Bloque «"+nom(id)+"»"));ids.entity.forEach(id=>incluye.push("Criatura «"+nom(id)+"»"));
  [...new Set(r.conteo.habilidades||[])].forEach(h=>incluye.push(h));
  const prueba=["Abre el archivo .mcaddon con Minecraft: se importa solo.","Crea un mundo nuevo (o edita uno), entra a «Add-ons» y activa el Behavior Pack y el Resource Pack de este add-on."];
  if(plan.poderesJugador&&plan.poderesJugador.length)prueba.push("Crea un mundo en supervivencia con el add-on activado: los poderes se activan solos al entrar (no necesitas objetos).");
  if(plan.poderesJugador&&plan.poderesJugador.includes("vuelo"))prueba.push("Vuelo: salta dos veces rápido; salto = subir, agacharte = bajar, correr = avanzar muy rápido.");
  if(plan.kit)prueba.push("Entra al mundo: la primera vez aparecen cofres a tu lado con el kit.");
  ids.item.forEach(id=>prueba.push("Para tener «"+nom(id)+"»: `/give @s "+id+"`"));
  ids.block.forEach(id=>prueba.push("Para tener «"+nom(id)+"»: `/give @s "+id+"`"));
  ids.entity.forEach(id=>prueba.push("Para invocar «"+nom(id)+"»: `/summon "+id+"`"));
  if(r.files.some(f=>/ego_pod_/.test(f.path)&&/volando/.test(String(f.content))))prueba.push("Para volar: lleva el objeto en el inventario y haz clic derecho con él en la mano; salta para subir y agáchate para bajar.");
  return {nombre:plan.nombre,incluye:incluye.slice(0,16),prueba:prueba.slice(0,12),revision:au?{cumplidos:au.cumplidos,total:au.total,faltan:au.faltan}:null,avisos:[...new Set(r.notas)].filter(x=>!/^Revisión final/.test(x)).slice(0,6)};
}

async function generarVocesAddon(plan,env){
  const out=[],fallos=[];if(!(plan.sonidos&&plan.sonidos.length))return {out,fallos};
  if(!env.AI){fallos.push("sin Workers AI para generar voces");return {out,fallos};}
  const model=String(env.TTS_MODEL||"@cf/deepgram/aura-2-es");
  for(const s of plan.sonidos.slice(0,4)){
    try{
      let a=await Promise.race([env.AI.run(model,{text:s.texto,speaker:String(env.TTS_SPEAKER||"estrella"),encoding:"linear16",container:"wav"}),tmoMc(40000)]);
      if(a&&typeof a==="object"&&!(a instanceof Uint8Array)&&!(a instanceof ArrayBuffer)&&!(typeof ReadableStream!=="undefined"&&a instanceof ReadableStream))a=a.audio||a.audio_data||a;
      if(typeof ReadableStream!=="undefined"&&a instanceof ReadableStream)a=await new Response(a).arrayBuffer();
      if(typeof a==="string"){const bin=atob(a);const u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);a=u;}
      if(a instanceof ArrayBuffer)a=new Uint8Array(a);
      if(!(a instanceof Uint8Array)||a.length<200){fallos.push("«"+s.nombre+"»: el modelo no devolvió audio");continue;}
      if(!(a[0]===0x52&&a[1]===0x49&&a[2]===0x46&&a[3]===0x46)){fallos.push("«"+s.nombre+"»: el audio no vino en formato WAV (Minecraft no lo leería)");continue;}
      out.push({nombre:s.nombre,entidad:s.entidad,texto:s.texto,bytes:a});
    }catch(e){fallos.push("«"+s.nombre+"»: "+String(e&&e.message||e).slice(0,80));}
  }
  return {out,fallos};
}
async function mcBuild(body,env,request){
  const prompt=String(body.prompt||"").slice(0,2000);
  const plan=limpiarPlan(body.plan,prompt);
  const entrada=[];const vistos=new Set();
  for(const f of (Array.isArray(body.files)?body.files:[]).slice(0,400)){
    const path=safeProjectPath(f&&f.path);
    if(!path||!/^(BP|RP)\//.test(path)||typeof f.content!=="string"||f.content.length>400000) continue;
    if(/manifest\.json$|\.(png|jpg|zip|mcaddon)$/i.test(path)) continue;
    vistos.add(path);entrada.push({path,content:f.content});
  }
  if(!entrada.length&&!(plan.poderesJugador&&plan.poderesJugador.length)&&!plan.kit) return json({error:"No hay archivos para armar el add-on."},400);
  try{
    plan._prompt=prompt;
    plan._modelos3d=(Array.isArray(body.modelos3d)?body.modelos3d:[]).slice(0,4).map(q=>({entidad:String(q&&q.entidad||""),partes:limpiarModelo3d(q&&q.partes)})).filter(q=>q.entidad&&q.partes.length>=3);
    const vz=await generarVocesAddon(plan,env);plan._voces=vz.out;
    const r=postprocesarAddon(entrada,plan,env.MC_SERVER_VERSION);
    for(const x of vz.fallos)r.notas.push("Voz: "+x);
    const ciclo=await cicloReparacionAutomatica(r.files,env,{minecraft:true});
    const validacion=ciclo.validacion||validarAddonEstructural(r.files);
    for(const x of ciclo.informe.cambios)r.notas.push(`Auto-reparación ronda ${x.ronda}: ${x.path}`);
    for(const x of ciclo.informe.avisosFinales)r.notas.push("Auto-reparación: "+x);
    for(const x of validacion.errores)r.notas.push("Validación pendiente: "+x);
    for(const x of validacion.avisos)r.notas.push("Revisión: "+x);
    const readme=r.files.find(f=>/^BP\/README\.md$/i.test(f.path));
    if(readme)readme.content+="\n\n## Validación estructural de EGO AI\n- Resultado: "+(validacion.ok?"sin errores estructurales detectados":"se detectaron problemas que debes revisar")+"\n- Archivos revisados: "+validacion.archivos+"\n"+[...validacion.errores,...validacion.avisos].map(x=>"- "+x).join("\n")+"\n- Esta revisión estática no sustituye la importación y prueba dentro de Minecraft.\n";
    const au=await auditarAddon(plan,r.files,r.conteo.habilidades,env);
    if(au&&au.faltan.length)r.notas.unshift("Revisión final: no pude confirmar "+au.faltan.length+" de "+au.total+" cosas que pediste → "+au.faltan.slice(0,3).join(" · "));
    const zip=await createZip(r.files);
    const nombre="ego-"+slugAscii(plan.nombre);
    const c=r.conteo;
    const resumen=`${plan.nombre}: ${c.items} ítem(s), ${c.bloques} bloque(s), ${c.criaturas} criatura(s), ${c.scripts} script(s), ${c.texturas} textura(s) PNG`+(c.habilidades&&c.habilidades.length?". Habilidades programadas: "+c.habilidades.join("; "):"")+(au?". Revisión final: "+au.cumplidos+" de "+au.total+" cosas pedidas verificadas dentro del archivo":"");
    return new Response(zip,{status:200,headers:{...corsPara(request,env),"Content-Type":"application/zip","Content-Disposition":`attachment; filename="${nombre}.mcaddon"`,"X-EGO-Files":String(r.files.length),"X-EGO-Model":"por-partes","X-EGO-Avisos":String(r.notas.length),"X-EGO-Notas":encodeURIComponent(r.notas.slice(0,6).join(" | ").slice(0,1500)),"X-EGO-Validacion":encodeURIComponent(JSON.stringify(validacion).slice(0,5000)),"X-EGO-Reparacion":encodeURIComponent(JSON.stringify(ciclo.informe).slice(0,3000)),"X-EGO-Resumen":encodeURIComponent(resumen),"X-EGO-Ficha":encodeURIComponent(JSON.stringify(fichaAddon(plan,r,au)).slice(0,6000)),"Cache-Control":"no-store"}});
  }catch(e){
    console.error("mc_build",String(e&&e.message||e).slice(0,200));
    return json({error:"No se pudo armar el add-on.",detail:String(e&&e.message||e).slice(0,160)},500);
  }
}


const MODELO_MOONDREAM = "@cf/moondream/moondream3.1-9B-A2B";
async function moondreamVision(messages, env) {
  let img = "", preg = "";
  for (let i = messages.length - 1; i >= 0 && (!img || !preg); i--) {
    const c = messages[i]?.content;
    if (!Array.isArray(c)) { if (messages[i]?.role === "user" && !preg && typeof c === "string") preg = c; continue; }
    if (!img) img = (c.find(p => p?.type === "image_url")?.image_url?.url) || "";
    if (!preg && messages[i].role === "user") preg = (c.find(p => p?.type === "text")?.text) || "";
  }
  if (!img) throw new Error("sin imagen para Moondream");
  const r = await env.AI.run(MODELO_MOONDREAM, { task: "query", image: img, question: String(preg || "Describe la imagen en detalle.").slice(0, 1500), reasoning: false, max_tokens: 1500 });
  const t = String(r?.answer || "").trim();
  if (!t) throw new Error("Moondream no devolvió texto");
  return { content: t, model: MODELO_MOONDREAM };
}
async function cfVision(messages, env) {
  let ultimo = null;
  if (veniceKey(env) && env.VENICE_FIRST !== "0") { try { const v = await veniceVision(messages, env); if (v.content) return v; } catch (e) { ultimo = e; } }
  if (env.AI) {
    const ult = JSON.stringify((messages[messages.length - 1] || {}).content || "").slice(0, 4000);
    const descriptiva = /(qu[eé] (?:hay|es|ves|aparece|objeto|animal|cosa)|descr[ií]b|cu[aá]nt[oa]s|d[oó]nde|identifica|qui[eé]n|color|ropa|lugar|what is|describe)/i.test(ult) && !/(ecuaci|resuelve|ejercicio|problema|c[oó]digo|error|lee el texto|transcribe|\d\s*[+\-*\/=])/i.test(ult);
    const orden = descriptiva ? ["moondream", "qwen"] : ["qwen", "moondream"];
    for (const quien of orden) {
      try {
        const r = quien === "qwen" ? await cfChat(CF_MODELS.vision[0], messages, env, 4000) : await moondreamVision(messages, env);
        if (r.content) return r;
        ultimo = new Error("el modelo de visión no devolvió texto");
      } catch (e) { ultimo = e; }
    }
  }
  if (routerApiKey(env)) {
    try { return await visionOpenRouter(messages, env); } catch (e) { ultimo = e; }
  }
  throw ultimo || new Error("visión no disponible");
}

// ---------- Imágenes y fotogramas de video ----------
const MAX_IMAGENES = 12;          // máximo de imágenes/fotogramas por petición
const MAX_IMG_CHARS = 1500000;    // tamaño máximo de cada imagen (texto base64)
const RX_DATA_IMG = /^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+\/=]+$/;

// Solo se aceptan imágenes incrustadas (data:image/...) y de tamaño razonable; nunca enlaces externos.
function limpiarImagenes(msgs) {
  let cupo = MAX_IMAGENES;
  const out = msgs.slice();
  for (let i = out.length - 1; i >= 0; i--) {
    const m = out[i];
    if (!Array.isArray(m?.content)) continue;
    const partes = m.content.slice();
    for (let j = partes.length - 1; j >= 0; j--) {
      if (partes[j]?.type !== "image_url") continue;
      const u = String(partes[j].image_url?.url || "");
      if (cupo > 0 && u.length <= MAX_IMG_CHARS && RX_DATA_IMG.test(u)) cupo--;
      else partes[j] = { type: "text", text: "[imagen omitida]" };
    }
    out[i] = { ...m, content: partes };
  }
  return out;
}
const tieneImagen = m => Array.isArray(m?.content) && m.content.some(p => p?.type === "image_url");

const INSTR_LECTURA =
  "Eres el módulo de visión de EGO AI. Mira las imágenes con mucha atención y entrega SOLO una lectura fiel, sin resolver nada todavía:\n" +
  "1) TEXTO VISIBLE: transcribe con exactitud todo el texto (código con su indentación, mensajes de error, ecuaciones, números, etiquetas). Fórmulas en texto o LaTeX simple. Marca [ilegible] lo que no se lea.\n" +
  "2) QUÉ SE VE: describe la escena, la interfaz, el gráfico, el diagrama o el circuito y su estado.\n" +
  "3) Si son fotogramas de un video: recórrelos EN ORDEN con su marca de tiempo si viene, di qué cambia de uno a otro y qué errores o comportamientos raros se notan.\n" +
  "No inventes nada que no se vea.";

// Paso 1 (visión): leer la imagen. Devuelve el texto de la lectura o null.
async function leerVisual(msgs, env, pregunta) {
  const ult = msgs[msgs.length - 1];
  const partes = (Array.isArray(ult.content) ? ult.content : []).filter(p => p?.type === "image_url");
  if (!partes.length) return null;
  const txt = textOf(ult.content);
  const r = await cfChat(CF_MODELS.vision[0], [
    { role: "system", content: INSTR_LECTURA },
    { role: "user", content: [{ type: "text", text: "Contexto de lo que pregunta el usuario (solo para saber qué detalles importan):\n" + String(pregunta || txt).slice(0, 1500) }, ...partes] }
  ], env, 3500);
  return r.content && r.content.length > 20 ? r.content : null;
}

// Paso 2: el modelo fuerte recibe la lectura como texto (sin imágenes) junto con la pregunta.
function conLectura(msgs, lectura) {
  const quitar = m => Array.isArray(m?.content) ? { ...m, content: textOf(m.content) } : m;
  const out = msgs.map(quitar);
  const i = out.length - 1;
  out[i] = { ...out[i], content: String(out[i].content || "") + "\n\n[LECTURA DE LA IMAGEN O VIDEO, hecha por tu módulo de visión; puede tener errores de lectura, y si algo es dudoso o ilegible dilo]:\n" + lectura };
  return out;
}

// ---------- Qué tipo de tarea es (para elegir el modelo) ----------
const RX_CODIGO = /c[oó]digo|program|script|funci[oó]n|\bbug\b|\berror\b|compil|algoritm|\bapi\b|\bsql\b|react|java|python|kotlin|c\+\+|rust|\bgit\b|regex|depur|refactor|html|css|\bapp\b|aplicaci|juego|videojuego|p[aá]gina web|sitio web|framework|librer[ií]a|base de datos|backend|frontend|array|bucle|exception|undefined|\bnull\b|npm|android|capacitor|worker|endpoint|json|servidor|debug|interfaz|landing/i;
const RX_MATE = /matem|calcul|ecuaci|integral|derivad|l[ií]mite|[aá]lgebra|geometr|trigonom|probabilid|estad[ií]stic|demuestr|demostraci|teorema|f[oó]rmula|f[ií]sic|qu[ií]mic|biolog|astronom|cient[ií]f|despej|simplific|factoriz|matriz|vector|logaritm|[0-9]\s*[-+*\/^×÷=]\s*[0-9]|sqrt|ra[ií]z cuadrada|porcentaje|velocidad|aceleraci|fuerza|energ[ií]a|[aá]tomo|mol[eé]cul|c[eé]lula|gravedad|cu[aá]ntic|relatividad|resuelv|resolver/i;
function tipoTarea(text) {
  const t = String(text || "");
  if (RX_CODIGO.test(t)) return "codigo";
  if (RX_MATE.test(t)) return "razonar";
  return t.length < 80 ? "rapido" : "razonar";
}

async function runDiag(env, correoUsuario) {
  return {
    version: "14.23.0",
    enLinea: true,
    memoriaPersonal: !!env.EGO_MEMORY,
    biblioteca: !!env.EGO_BIBLIOTECA,
    perfiles: !!env.EGO_PERFILES,
    cfAi: !!env.AI,
    lecciones: (await leerIndiceLecciones(env)).length,
    embeddings: (await embeber(env, ["prueba"])) ? "ok" : "no responde (se usa búsqueda por palabras clave)",
    revisionDeCalidad: REVISAR,
    ensenarSoloConTokenFirebase: true,
    modelos: { codigo: CF_MODELS.codigo[0], razonar: CF_MODELS.razonar[0], vision: CF_MODELS.vision[0] },
    generaImagenes: !!(env.AI || (routerApiKey(env) && env.OPENROUTER_IMAGE_MODEL)),
    editaImagenes: !!env.AI,
    generaTexturas: !!env.AI,
    generaVoz: !!env.AI,
    generaProyectos: !!(env.AI || routerApiKey(env)),
    fallbackOpenRouterConfigurado: !!routerApiKey(env), modelosOpenRouterGratis: OR_FREE,
    limiteCuerpoBytes: Number(env.MAX_BODY_BYTES || 6000000)
  };
}

// ============================================================
// 🧰 GENERACIÓN DE IMÁGENES Y PROYECTOS DESCARGABLES
// ============================================================

function respuestaJsonError(msg, status=400) { return json({ error: msg }, status); }

function promptImagenProfesional(prompt, body = {}) {
  const style = String(body.style || "").trim().slice(0, 100);
  const quality = "Composición intencional, sujeto claro, anatomía y perspectiva coherentes, iluminación consistente, detalles limpios, sin artefactos, sin marcas de agua, sin texto ilegible.";
  return [prompt, style ? `Estilo visual: ${style}.` : "", quality].filter(Boolean).join("\n\n").slice(0, 7000);
}

function leerImagenBase64(input) {
  const raw = String(input || "").trim();
  const m = raw.match(/^data:(image\/(?:png|jpeg|webp));base64,([\s\S]+)$/i);
  if (m) return { mime: m[1].toLowerCase(), b64: m[2].replace(/\s/g, "") };
  if (/^[A-Za-z0-9+/=\r\n]+$/.test(raw)) return { mime: "image/png", b64: raw.replace(/\s/g, "") };
  return null;
}

function imagenResultado(result, model) {
  let image = typeof result === "string" ? result : (result?.image || result?.images?.[0] || result?.data?.[0]?.b64_json || "");
  if (image instanceof Uint8Array) image = bytesToBase64(image);
  if (image instanceof ArrayBuffer) image = bytesToBase64(new Uint8Array(image));
  if (typeof image !== "string" || !image) return null;
  if (/^https:\/\//i.test(image)) return { imageUrl: image, model, mimeType: "image/png" };
  if (image.startsWith("data:image/")) return { image, model, mimeType: image.slice(5, image.indexOf(";")) };
  return { image: `data:image/png;base64,${image}`, model, mimeType: "image/png" };
}


// FLUX.2 [klein] 4B en Workers AI recibe "multipart" (prompt, width, height, input_image_0...).
const MODELOS_IMG = ["@cf/black-forest-labs/flux-2-klein-9b", "@cf/black-forest-labs/flux-2-klein-4b"];
const cadenaImg = (env, extra) => [...new Set([String(env.IMAGE_MODEL || "").trim(), ...(env.IMAGE_MODEL ? [] : MODELOS_IMG)].filter(Boolean))];
const dimImg = (v, d) => { const n = Math.round(Number(v) / 16) * 16; return Number.isFinite(n) && n >= 256 ? Math.min(n, 1536) : d; };
async function correrFlux(env, model, prompt, width, height, ref) {
  const form = new FormData();
  form.append("prompt", prompt);
  form.append("width", String(width));
  form.append("height", String(height));
  if (ref) form.append("input_image_0", new Blob([ref.bytes], { type: ref.mime }), ref.nombre);
  const ser = new Response(form);
  try {
    return await env.AI.run(model, { multipart: { body: ser.body, contentType: ser.headers.get("content-type") } });
  } catch (e1) {
    if (ref) throw e1;                                   // la edición no tiene alternativa en JSON
    console.warn("flux_multipart", String(e1?.message || e1).slice(0, 140));
    return await env.AI.run(model, { prompt, width, height });
  }
}


// Reescribe la idea del usuario (en cualquier idioma) como un prompt profesional en inglés para FLUX.
async function mejorarPromptImagen(prompt, env) {
  if (!env.AI || prompt.length > 1200) return prompt;
  try {
    const r = await cfChat(MODELO_RAPIDO, [
      { role: "system", content: "You are an expert prompt engineer for FLUX text-to-image models. Rewrite the user's idea (any language) as ONE detailed English prompt of 60 to 110 words: main subject and action, setting, composition and camera angle, lens, lighting, color palette, art style, and quality cues (sharp focus, natural anatomy, coherent perspective, clean details). Keep EVERY detail the user asked for and never contradict it. Do not put any written words or text inside the image unless the user explicitly asks. Output ONLY the prompt, with no quotes or explanations." },
      { role: "user", content: prompt }
    ], env, 300);
    const t = String(r.content || "").replace(/^["'\s]+|["'\s]+$/g, "").replace(/\s+/g, " ");
    return t.length >= 30 && t.length <= 1600 ? t : prompt;
  } catch { return prompt; }
}

async function generarImagen(body, env) {
  const prompt = String(body.prompt || "").trim().slice(0, 5000);
  if (!prompt) return respuestaJsonError("Falta prompt.");
  const mejorado = body.mejorar === false ? prompt : await mejorarPromptImagen(prompt, env);
  const enhanced = promptImagenProfesional(mejorado, body);
  // Workers AI FLUX.2 Klein ofrece generación y edición con referencia. Se usa primero
  // si está disponible; se conserva el fallback de proveedores ya configurado.
  if (veniceKey(env) && env.VENICE_IMAGE_FIRST !== "0") {
    const v = await veniceImagen(env, enhanced, dimImg(body.width, 1024), dimImg(body.height, 1024));
    if (v) return json(v);
  }
  if (env.AI) {
    for (const model of cadenaImg(env)) {
      try {
        const result = await correrFlux(env, model, enhanced, dimImg(body.width, 1024), dimImg(body.height, 1024));
        const out = imagenResultado(result, model);
        if (out) return json(out);
      } catch (e) { console.warn("cf_image_generate", model, String(e?.message || e).slice(0, 160)); }
    }
    // Respaldo: FLUX.1 schnell (JSON simple) si el modelo principal falla o se queda sin cuota.
    if (!env.IMAGE_MODEL) {
      try {
        const r2 = await env.AI.run("@cf/black-forest-labs/flux-1-schnell", { prompt: enhanced.slice(0, 2000), steps: 8 });
        const out2 = imagenResultado(r2, "@cf/black-forest-labs/flux-1-schnell");
        if (out2) return json({ ...out2, respaldo: true });
      } catch (e) { console.warn("cf_image_schnell", String(e?.message || e).slice(0, 160)); }
    }
  }
  if (routerApiKey(env) && env.OPENROUTER_IMAGE_MODEL) {
    try {
      const response=await fetch("https://openrouter.ai/api/v1/images",{method:"POST",headers:{"Authorization":`Bearer ${routerApiKey(env)}`,"Content-Type":"application/json","HTTP-Referer":env.OPENROUTER_SITE_URL||"https://ego-ai.app","X-Title":"EGO AI"},body:JSON.stringify({model:env.OPENROUTER_IMAGE_MODEL,prompt:enhanced,aspect_ratio:String(body.aspect_ratio||"1:1")})});
      const data=await response.json().catch(()=>({}));
      const image=data?.data?.[0]?.b64_json;
      if(response.ok && image) return json({image:`data:${data.data[0].media_type||"image/png"};base64,${image}`,model:`openrouter:${env.OPENROUTER_IMAGE_MODEL}`,mimeType:data.data[0].media_type||"image/png"});
    } catch(e){console.warn("openrouter_image",String(e?.message||e).slice(0,150));}
  }
  if (env.HF_TOKEN && env.HF_IMAGE_MODEL) {
    try {
      const model = String(env.HF_IMAGE_MODEL).replace(/^\/+|\/+$/g, "");
      const response = await fetch(`https://router.huggingface.co/hf-inference/models/${model}`, {method:"POST",headers:{"Authorization":`Bearer ${env.HF_TOKEN}`,"Content-Type":"application/json","Accept":"image/*"},body:JSON.stringify({inputs:enhanced})});
      if (response.ok) { const mime=response.headers.get("content-type")||"image/png"; const bytes=new Uint8Array(await response.arrayBuffer()); if(bytes.length&&mime.startsWith("image/")) return json({image:`data:${mime};base64,${bytesToBase64(bytes)}`,model:`huggingface:${model}`,mimeType:mime}); }
    } catch(e){console.warn("hf_image",String(e?.message||e).slice(0,150));}
  }
  return respuestaJsonError("No se pudo generar la imagen. Comprueba la cuota y el modelo configurado.",503);
}

async function editarImagen(body, env) {
  const prompt = String(body.prompt || body.instruction || "").trim().slice(0, 4000);
  const source = leerImagenBase64(body.image || body.input_image || body.editImage);
  if (!prompt) return respuestaJsonError("Describe qué quieres cambiar en la imagen.");
  if (!source) return respuestaJsonError("Envía la imagen original en image como data:image/...;base64,...");
  if (!env.AI) return respuestaJsonError("La edición de imagen requiere el binding Workers AI (AI).",503);
  let bytes;
  try { bytes = Uint8Array.from(atob(source.b64), c => c.charCodeAt(0)); }
  catch { return respuestaJsonError("La imagen base64 no es válida."); }
  if (bytes.byteLength > 2_000_000) return respuestaJsonError("La imagen para edición debe pesar menos de 2 MB. Redúcela en la app antes de enviarla.",413);
  const cadena = env.IMAGE_EDIT_MODEL ? [String(env.IMAGE_EDIT_MODEL)] : MODELOS_IMG;
  const promptEd = `Edit the provided photo. Keep EXACTLY the same person, face, hair, body, pose, clothing cut, camera framing, zoom level and background: the whole subject stays fully visible and nothing is cropped, zoomed or moved. Keep the same lighting, sharpness and photographic quality. Change ONLY this: ${prompt}. Do not add or remove people or objects that were not mentioned.`;
  const nombre = source.mime === "image/jpeg" ? "input.jpg" : source.mime === "image/webp" ? "input.webp" : "input.png";
  const fallos = [];
  for (const model of cadena) {
    try {
      const result = await correrFlux(env, model, promptEd, dimImg(body.width, 1024), dimImg(body.height, 768), { bytes, mime: source.mime, nombre });
      const out = imagenResultado(result, model);
      if (out) return json({...out, edited:true, preservesOriginalReference:true});
      fallos.push(model + ": sin imagen");
    } catch(e) { fallos.push(model + ": " + String(e?.message||e).slice(0,100)); console.error("image_edit", model, String(e?.message||e).slice(0,200)); }
  }
  return json({error:"No se pudo editar la imagen. Comprueba que el modelo admite edición y que la imagen sea compatible.",detail:fallos},503);
}

async function generarTextura(body, env) {
  const prompt = String(body.prompt || body.description || "").trim().slice(0,4000);
  if (!prompt) return respuestaJsonError("Describe la textura que quieres crear.");
  const size = [16,32,64,128,256].includes(Number(body.size)) ? Number(body.size) : 64;
  const texturePrompt = `Create a seamless, tileable Minecraft-style pixel-art texture atlas tile. Subject/material: ${prompt}. Requirements: orthographic flat 2D texture, square image, clean pixel clusters, no perspective, no lighting cast outside the texture, no border, no text, no watermark, repeatable edges on all four sides, game-ready UV texture. Target logical resolution ${size}x${size} pixels; keep pixel-art style and avoid blurry gradients.`;
  if (!env.AI) return respuestaJsonError("La generación de texturas requiere Workers AI (AI).",503);
  const model = String(env.TEXTURE_MODEL || env.IMAGE_MODEL || "@cf/black-forest-labs/flux-2-klein-4b");
  try {
    const result = await correrFlux(env, model, texturePrompt, 1024, 1024);
    const out = imagenResultado(result,model);
    if (!out) return json({error:"El modelo no devolvió una textura."},502);
    return json({...out,texture:true,logicalSize:size,format:"png",tileableRequested:true,notes:"La imagen es una textura 2D para aplicar a un modelo 3D. Verifica los bordes y conviértela a la resolución exacta con un editor de píxeles antes de incluirla en el pack."});
  } catch(e) {
    console.error("texture_generate",String(e?.message||e).slice(0,180));
    return json({error:"No se pudo generar la textura. Revisa la cuota o el modelo configurado.",model},503);
  }
}

function bytesToBase64(bytes) {
  let binary = "";
  for (let i=0; i<bytes.length; i+=0x8000) binary += String.fromCharCode(...bytes.subarray(i, i+0x8000));
  return btoa(binary);
}

async function generarVoz(body, env, request) {
  const text=String(body.text||"").trim().slice(0,4000);
  if(!text) return respuestaJsonError("Falta texto para convertir a voz.");
  if(!env.AI) return respuestaJsonError("Cloudflare Workers AI no está configurado.",503);
  const model=String(env.TTS_MODEL||"@cf/deepgram/aura-2-es");
  try {
    const result=await env.AI.run(model,{text,speaker:String(body.speaker||"estrella"),encoding:"mp3"});
    let audio=result;
    if(result && typeof result==="object" && !(result instanceof Uint8Array)) audio=result.audio||result.audio_data||result;
    if(audio instanceof ReadableStream) audio=new Response(audio).arrayBuffer().then(x=>new Uint8Array(x));
    if(audio && typeof audio.then==="function") audio=await audio;
    if(audio instanceof ArrayBuffer) audio=new Uint8Array(audio);
    if(!(audio instanceof Uint8Array)) return json({error:"El modelo TTS no devolvió audio binario.",model},502);
    if (body.forAddon || body.responseFormat === "json") {
      const filename = String(body.filename || "sounds/ego/voice.mp3").replace(/[^a-zA-Z0-9_./-]/g, "_").replace(/^\/+|\.\.+/g, "").slice(0,120);
      const soundName = String(body.soundName || "ego.voice").replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0,80);
      const definition = { format_version: "1.14.0", sound_definitions: { [soundName]: { category: "neutral", sounds: [{ name: filename.replace(/^sounds\//, "").replace(/\.mp3$/i, ""), volume: 1.0, pitch: 1.0 }] } } };
      return json({audio:`data:audio/mpeg;base64,${bytesToBase64(audio)}`,filename,model,soundName,soundDefinitions:definition});
    }
    return new Response(audio,{status:200,headers:{...corsPara(request,env),"Content-Type":"audio/mpeg","Content-Disposition":"attachment; filename=ego-voz.mp3","X-EGO-Model":model,"Cache-Control":"no-store"}});
  } catch(e) {
    console.error("tts",String(e?.message||e).slice(0,200));
    return json({error:"No se pudo generar voz. Comprueba el modelo TTS y la cuota.",model},503);
  }
}


// Lee la respuesta del modelo: formato por delimitadores (preferido) o JSON de respaldo.
function leerProyectoModelo(raw) {
  const t=String(raw||"").replace(/\r\n/g,"\n");
  const rxIni=/^===\s*ARCHIVO:\s*(.+?)\s*===\s*$/gm;
  const marcas=[]; let m;
  while ((m=rxIni.exec(t))) marcas.push({ruta:m[1].trim().replace(/^[`'"]+|[`'"]+$/g,""),ini:m.index,fin:m.index+m[0].length});
  if (marcas.length) {
    const nombre=(t.match(/^PROYECTO:\s*(.+)$/m)||[])[1]||"";
    const files=[]; const incompleto=!/===\s*FIN\s*===\s*$/.test(t.trim());
    marcas.forEach((mk,i)=>{
      const sig=i+1<marcas.length?marcas[i+1].ini:t.length;
      let c=t.slice(mk.fin,sig);
      const f=c.search(/^===\s*FIN\s*===\s*$/m);
      const terminado=f>=0; if(terminado) c=c.slice(0,f);
      if(!terminado && i===marcas.length-1 && incompleto) return; // último archivo cortado: se descarta
      c=c.replace(/^\n/,"").replace(/\s+$/,"")+"\n";
      const fence=c.match(/^```[a-zA-Z0-9]*\n([\s\S]*?)\n```\n?$/); if(fence) c=fence[1]+"\n";
      files.push({path:mk.ruta,content:c});
    });
    return {name:nombre.trim(),description:"",files};
  }
  const j=extractJson(t);
  if (j && Array.isArray(j.files)) return {name:j.name,description:j.description,files:j.files.filter(f=>f&&typeof f.path==="string")};
  return null;
}

function safeProjectPath(path) {
  const p = String(path || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!p || p.length > 180 || p.split("/").some(x => !x || x === "." || x === "..") || /[<>:"|?*\x00-\x1f]/.test(p)) return null;
  return p;
}

function extractJson(text) {
  let t = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(t); } catch {}
  const a=t.indexOf("{"); const b=t.lastIndexOf("}");
  if (a>=0 && b>a) { try { return JSON.parse(t.slice(a,b+1)); } catch {} }
  return null;
}

function planDesdeArchivosMinecraft(files, nombre, prompt){
  const plan={nombre:String(nombre||"Add-on EGO"),ns:"ego",resumen:String(prompt||"").slice(0,400),requisitos:[],objetos:[],partes:[],sonidos:[],_modelos3d:[]};
  for(const f of files||[]){
    if(typeof f?.path!=="string"||typeof f.content!=="string")continue;
    const esEntidad=/^BP\/entities\/.+\.json$/i.test(f.path),esItem=/^BP\/items\/.+\.json$/i.test(f.path),esBloque=/^BP\/blocks\/.+\.json$/i.test(f.path);
    if(!esEntidad&&!esItem&&!esBloque)continue;
    try{const j=JSON.parse(f.content);const root=esEntidad?j["minecraft:entity"]:esItem?j["minecraft:item"]:j["minecraft:block"];const id=String(root?.description?.identifier||"");if(!/^[a-z0-9_]+:[a-z0-9_]+$/.test(id))continue;
      const slug=id.split(":")[1];const nombreObj=tituloCaso(slug.replace(/_/g," "));
      plan.objetos.push({id,tipo:esEntidad?"entity":esItem?"item":"block",nombre:nombreObj,descripcion:String(root?.description?.menu_category?.group||"")});
      const ns=id.split(":")[0];if(plan.objetos.length===1)plan.ns=mcNs(ns);
    }catch{}
  }
  return plan;
}

function detectarTipoMinecraft(prompt, body = {}) {
  const t = normMc(String(prompt || ""));
  const explicit = normMc(String(body.minecraftKind || body.artifactType || ""));
  const allowed = new Set(["addon", "world", "behavior_pack", "resource_pack", "functions", "structures", "skin_pack", "command_project", "education_project"]);
  if (allowed.has(explicit)) return explicit;
  if (/\b(?:mundo|mapa|mapas|mapa de aventura|aventura|survival world|survival|world template|plantilla de mundo|minijuego|parkour|skyblock|oneblock|supervivencia)\b/.test(t)) return "world";
  if (/\b(?:add-?on|mcaddon)\b/.test(t)) return "addon";
  if (/\b(?:skin pack|paquete de skins|pack de skins|skins personalizadas)\b/.test(t)) return "skin_pack";
  if (/\b(?:estructura|estructuras|mcstructure|schematic|construccion|construcciones|edificio|edificios|casa|casas|castillo|castillos|ciudad|ciudades|base|bases|monumento|monumentos)\b/.test(t)) return "structures";
  if (/\b(?:comandos|command blocks|bloques de comandos|mcfunction|funciones de comandos|functions?|sistema de comandos|comandos personalizados)\b/.test(t)) return "functions";
  if (/\b(?:resource pack|texture pack|pack de recursos|pack de texturas|texturas|sonidos|audio|ui personalizada|interfaz personalizada)\b/.test(t)) return "resource_pack";
  if (/\b(?:behavior pack|behaviour pack|pack de comportamiento|scripts? de minecraft|script api|sistema de habilidades|mec[aá]nicas|mecanicas)\b/.test(t)) return "behavior_pack";
  if (/\b(?:education edition|minecraft education|leccion interactiva|lesson world)\b/.test(t)) return "education_project";
  return "addon";
}

function packManifest(nombre, descripcion, tipo, verSrv, rpUuid) {
  const uuid = nuevoUuid();
  const modules = tipo === "resources"
    ? [{ type: "resources", uuid: nuevoUuid(), version: [1, 0, 0] }]
    : tipo === "skin_pack"
      ? [{ type: "skin_pack", uuid: nuevoUuid(), version: [1, 0, 0] }]
      : [{ type: "data", uuid: nuevoUuid(), version: [1, 0, 0] }];
  const deps = [];
  if (tipo !== "resources" && rpUuid) deps.push({ uuid: rpUuid, version: [1, 0, 0] });
  if (tipo !== "resources" && modules[0].type === "data") {
    // El módulo script se añade únicamente cuando hay JavaScript real en el pack.
  }
  return { format_version: 2, header: { name: String(nombre).slice(0, 80), description: String(descripcion).slice(0, 240), uuid, version: [1, 0, 0], min_engine_version: [1, 21, 0] }, modules, dependencies: deps };
}

function pngDesdeTexto(valor) {
  if (valor instanceof Uint8Array) return valor.length > 8 && valor[0] === 137 && valor[1] === 80 && valor[2] === 78 && valor[3] === 71 ? valor : null;
  let s = String(valor || "").trim();
  const m = s.match(/^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/i);
  if (m) s = m[1];
  s = s.replace(/\s+/g, "");
  if (s.length < 24 || !/^[A-Za-z0-9+/]+={0,2}$/.test(s)) return null;
  try {
    const bin = atob(s), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.length > 8 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 ? bytes : null;
  } catch { return null; }
}

function limpiarArchivosPack(files, prefijo) {
  const out = [];
  for (const f of files || []) {
    if (!f || typeof f.path !== "string" || !(typeof f.content === "string" || f.content instanceof Uint8Array)) continue;
    let path = f.path.replace(/\\/g, "/");
    if (path.startsWith(prefijo + "/")) path = path.slice(prefijo.length + 1);
    if (!safeProjectPath(path) || /^manifest\.json$/i.test(path)) continue;
    let content = f.content;
    if (/\.png$/i.test(path) && typeof content === "string") content = pngDesdeTexto(content);
    out.push({ path, content });
  }
  return out;
}

async function crearMcpack(files, tipo, nombre, descripcion, verSrv, rpUuid) {
  const arr = limpiarArchivosPack(files, tipo === "resources" || tipo === "skin_pack" ? "RP" : "BP");
  if (!arr.length) throw new Error("El modelo no generó archivos de contenido para el pack " + tipo + ".");
  const js = arr.filter(f => /\.js$/i.test(f.path) && /^(?:scripts|script)\//i.test(f.path));
  const manifest = packManifest(nombre, descripcion, tipo, verSrv, rpUuid);
  if (js.length && tipo === "data") {
    manifest.modules.push({ type: "script", language: "javascript", entry: js[0].path, uuid: nuevoUuid(), version: [1, 0, 0] });
    manifest.dependencies.push({ module_name: "@minecraft/server", version: String(verSrv || "2.10.0") });
  }
  arr.unshift({ path: "manifest.json", content: JSON.stringify(manifest, null, 2) });
  return { bytes: await createZip(arr), manifest, files: arr };
}

function validarProyectoMinecraftGeneral(files, mcKind) {
  const errores = [], avisos = [];
  const rutas = new Set();
  for (const f of files || []) {
    if (!f || typeof f.path !== "string" || typeof f.content !== "string" || !safeProjectPath(f.path)) { errores.push("Hay un archivo con ruta o contenido inválido."); continue; }
    if (rutas.has(f.path)) errores.push("Ruta duplicada: " + f.path);
    rutas.add(f.path);
    if (/\.json$/i.test(f.path) && typeof f.content === "string" && !jsonTolerante(f.content).ok) errores.push(f.path + ": JSON inválido.");
    if (/\.png$/i.test(f.path) && !pngDesdeTexto(f.content)) errores.push(f.path + ": el contenido no es un PNG binario/base64 válido; no se puede importar como textura.");
    if (/\.js$/i.test(f.path)) {
      const bal = balanceJs(f.content); if (bal) errores.push(f.path + ": " + bal);
      for (const e of lintScriptApi(f.content, "2.10.0")) errores.push(f.path + ": " + e);
    }
    if (/\b(?:TODO|PLACEHOLDER|IMPLEMENTAR AQUI|YOUR_CODE_HERE)\b/i.test(f.content)) avisos.push(f.path + ": contiene un marcador que debe completarse.");
  }
  const tiene = (rx) => (files || []).some(f => rx.test(f.path));
  if (mcKind === "world" || mcKind === "education_project") {
    if (!tiene(/^BP\//i)) errores.push("Falta contenido de Behavior Pack (BP/).");
    if (!tiene(/^RP\//i)) errores.push("Falta contenido de Resource Pack (RP/).");
    if (!tiene(/^world_blueprint\/(?:world_plan|plan|blueprint)\.json$/i)) errores.push("Falta world_blueprint/world_plan.json.");
  } else if (mcKind === "resource_pack" || mcKind === "skin_pack") {
    if (!tiene(/^RP\//i)) errores.push("Falta contenido de Resource Pack (RP/).");
  } else if (mcKind === "structures") {
    if (!(files || []).length) errores.push("No se generaron planos de estructuras.");
  } else if (!tiene(/^BP\//i)) errores.push("Falta contenido de Behavior Pack (BP/).");
  if (mcKind === "skin_pack") {
    if (!tiene(/(?:^|\/)skins\.json$/i)) errores.push("Falta skins.json.");
    if (!(files || []).some(f => /\.png$/i.test(f.path) && !!pngDesdeTexto(f.content))) errores.push("Faltan texturas PNG binarias válidas para las skins.");
  }
  return { ok: errores.length === 0, errores: [...new Set(errores)].slice(0, 50), avisos: [...new Set(avisos)].slice(0, 30), archivos: rutas.size };
}

async function generarPaqueteMinecraftEspecial(files, mcKind, nombre, prompt, env, request) {
  const rpSource = files.filter(f => /^RP\//i.test(f.path));
  const bpSource = files.filter(f => /^BP\//i.test(f.path));
  const direct = files.filter(f => !/^(?:BP|RP)\//i.test(f.path));
  let bytes, filename, mime = "application/zip", artifact = mcKind, importable = "false", count = files.length;
  if (mcKind === "world" || mcKind === "education_project") {
    // Un .mcworld real necesita level.dat y una base LevelDB de chunks. No falsificamos esos binarios.
    if (!bpSource.length || !rpSource.length) return json({ error: "El kit de mundo quedó incompleto: faltan archivos reales de Behavior Pack o Resource Pack. No se creó un falso .mcworld.", artifact: "world_kit_incomplete" }, 422);
    const rp = await crearMcpack(rpSource, "resources", nombre + " - Resources", "Pack de recursos para el proyecto de mundo de EGO AI", env.MC_SERVER_VERSION);
    const bp = await crearMcpack(bpSource, "data", nombre + " - Behavior", "Pack de comportamiento para el proyecto de mundo de EGO AI", env.MC_SERVER_VERSION, rp.manifest.header.uuid);
    const blueprint = direct.filter(f => /^(?:world_blueprint|world|README)/i.test(f.path));
    if (!blueprint.some(f => /world_blueprint\/(?:world_plan|plan|blueprint)\.json$/i.test(f.path))) return json({ error: "El plano del mundo no está completo: falta world_blueprint/world_plan.json. No se empaquetó como mundo listo.", artifact: "world_blueprint_incomplete" }, 422);
    blueprint.push({ path: "README_MUNDO.md", content: `# ${nombre}\n\nEste paquete contiene los packs y el diseño del mundo, pero NO es un archivo .mcworld. Minecraft genera level.dat y la base LevelDB al crear el mundo desde el juego.\n\n1. Importa ${slugAscii(nombre)}_behavior.mcpack y ${slugAscii(nombre)}_resources.mcpack.\n2. Crea un mundo nuevo en Minecraft Bedrock.\n3. Activa ambos packs en ese mundo.\n4. Sigue el diseño, semilla, comandos y pasos de world_blueprint incluidos.\n\nSolicitud original: ${String(prompt).slice(0, 1500)}\n` });
    bytes = await createZip([
      { path: slugAscii(nombre) + "_behavior.mcpack", content: bp.bytes },
      { path: slugAscii(nombre) + "_resources.mcpack", content: rp.bytes },
      ...blueprint
    ]);
    filename = "ego-" + slugAscii(nombre) + "-world-kit.zip";
    artifact = mcKind === "education_project" ? "education_world_kit" : "world_kit";
    count = bp.files.length + rp.files.length + blueprint.length;
  } else if (mcKind === "resource_pack") {
    if (!rpSource.length) return json({ error: "El pack de recursos está incompleto: el modelo no generó archivos dentro de RP/. No se creó un .mcpack vacío.", artifact: "resource_pack_incomplete" }, 422);
    const rp = await crearMcpack(rpSource, "resources", nombre, "Pack de recursos generado por EGO AI", env.MC_SERVER_VERSION);
    bytes = rp.bytes; filename = "ego-" + slugAscii(nombre) + ".mcpack"; mime = "application/zip"; importable = "true"; count = rp.files.length;
  } else if (mcKind === "skin_pack") {
    const skinFiles = rpSource;
    if (!skinFiles.some(f => /(?:^|\/)skins\.json$/i.test(f.path)) || !skinFiles.some(f => /\.(?:png)$/i.test(f.path))) return json({ error: "El pack de skins no está completo: requiere skins.json y texturas PNG reales. No se entregó como importable.", artifact: "skin_pack_incomplete" }, 422);
    const rp = await crearMcpack(skinFiles, "skin_pack", nombre, "Pack de skins generado por EGO AI", env.MC_SERVER_VERSION);
    bytes = rp.bytes; filename = "ego-" + slugAscii(nombre) + "-skins.mcpack"; mime = "application/zip"; importable = "true"; count = rp.files.length;
  } else if (mcKind === "structures") {
    const blueprint = files.filter(f => !/\.(?:png|jpg|ogg|mcstructure)$/i.test(f.path));
    if (!blueprint.length) return json({ error: "No se generó ningún plano de estructura verificable.", artifact: "structure_blueprints_incomplete" }, 422);
    blueprint.push({ path: "README_ESTRUCTURAS.md", content: `# ${nombre}\n\nIncluye planos, medidas, materiales y/o comandos de construcción. Los archivos JSON descriptivos NO son binarios .mcstructure importables; para obtener una estructura .mcstructure, constrúyela en Minecraft y expórtala con un bloque de estructura.\n\nSolicitud: ${String(prompt).slice(0, 1500)}\n` });
    bytes = await createZip(blueprint); filename = "ego-" + slugAscii(nombre) + "-structures.zip"; count = blueprint.length; artifact = "structure_blueprints";
  } else {
    if (!bpSource.length) return json({ error: "El Behavior Pack está incompleto: el modelo no generó archivos dentro de BP/. No se creó un .mcpack vacío.", artifact: "behavior_pack_incomplete" }, 422);
    const bp = await crearMcpack(bpSource, "data", nombre, "Pack de comportamiento generado por EGO AI", env.MC_SERVER_VERSION);
    bytes = bp.bytes; filename = "ego-" + slugAscii(nombre) + ".mcpack"; mime = "application/zip"; importable = "true"; count = bp.files.length;
    artifact = mcKind === "functions" || mcKind === "command_project" ? "behavior_pack_functions" : "behavior_pack";
  }
  return new Response(bytes, { status: 200, headers: {
    ...corsPara(request, env), "Content-Type": mime,
    "Content-Disposition": `attachment; filename="${filename}"`,
    "X-EGO-Files": String(count), "X-EGO-Artifact": artifact,
    "X-EGO-Importable": importable,
    "X-EGO-Model": "minecraft-project-generator",
    "X-EGO-Resumen": encodeURIComponent(`${nombre}: tipo ${artifact}. ${importable === "true" ? "Paquete .mcpack importable en Minecraft Bedrock." : mcKind === "world" ? "Kit de mundo con dos packs importables y plano; no es .mcworld." : "Paquete de planos y recursos auxiliares; no es un .mcstructure binario."}`),
    "Cache-Control": "no-store"
  }});
}

async function generarProyecto(body, env, minecraft, request) {
  const prompt = String(body.prompt || body.description || "").trim().slice(0, 12000);
  if (!prompt) return respuestaJsonError("Falta prompt del proyecto.");
  const kind = minecraft ? String(body.packType || "behavior").slice(0, 30) : String(body.kind || "web").slice(0, 40);
  const mcKind = minecraft ? detectarTipoMinecraft(prompt, body) : "";
  if (minecraft && mcKind === "addon" && body.libre!==true) {
    if (body.avanzado===true || !(body.spec || esAddonSimple(prompt))) return json({avanzado:true,motivo:"El pedido necesita el generador por partes."});
    try {
      const r0 = await especificarAddon(prompt, env, body.spec);
      const spec = r0.spec;
      const files = construirAddonItem(spec, env.MC_SERVER_VERSION);
      const reparaciones = repararAddon(files, env.MC_SERVER_VERSION);
      const ciclo = await cicloReparacionAutomatica(files, env, { minecraft: true });
      const validacion = ciclo.validacion || validarAddonEstructural(files);
      const avisos = [...reparaciones, ...ciclo.informe.cambios.map(x=>`Auto-reparación (ronda ${x.ronda}): ${x.path}`), ...ciclo.informe.avisosFinales.map(x=>"Auto-reparación: "+x), ...validacion.errores.map(x=>"Validación pendiente: "+x), ...validacion.avisos.map(x=>"Revisión: "+x)];
      const readme = files.find(f=>/^BP\/README\.md$/i.test(f.path));
      if(readme && avisos.length) readme.content += "\n\n## Revisión de EGO AI\n"+avisos.map(x=>"- "+x).join("\n")+"\n";
      const zip = await createZip(files);
      return new Response(zip,{status:200,headers:{...corsPara(request,env),"Content-Type":"application/zip","Content-Disposition":`attachment; filename="ego-${spec.id}.mcaddon"`,"X-EGO-Avisos":String(avisos.length),"X-EGO-Validacion":encodeURIComponent(JSON.stringify(validacion).slice(0,5000)),"X-EGO-Reparacion":encodeURIComponent(JSON.stringify(ciclo.informe).slice(0,3000)),"X-EGO-Model":"plantilla-ego","X-EGO-Resumen":encodeURIComponent(`${spec.nombre} (${spec.tipo}, habilidad de ${spec.habilidad}, daño ${spec.danio}, id ego:${spec.id}; con textura PNG, receta, aura de partículas y habilidades${spec.buscar?", busca objetivo":""}${spec.velocidad?", velocidad al correr":""}; no incluye animación 3D del modelo)`),"X-EGO-Spec":encodeURIComponent(JSON.stringify(spec)),"X-EGO-NoAplicado":encodeURIComponent(r0.noAplicado.join(" | ")),"X-EGO-Files":String(files.length),"Cache-Control":"no-store"}});
    } catch(e) { console.error("tpl_addon",String(e?.message||e).slice(0,200)); return json({avanzado:true,motivo:"plantilla no disponible"}); }
  }
  const maxFiles = Math.max(1, Math.min(Number(body.maxFiles || (minecraft ? 50 : 35)), 50));
  const system = minecraft
    ? (mcKind === "addon" ? `Eres un ingeniero experto en Minecraft BEDROCK Edition (Android, Windows, consolas). NUNCA uses Java, Forge ni Fabric. Genera un ADD-ON COMPLETO.
Estructura obligatoria con DOS packs enlazados: carpeta "BP/" (behavior pack) y carpeta "RP/" (resource pack). Cada uno con su manifest.json (format_version 2, header con name, description, uuid, version [1,0,0], min_engine_version [1,26,50]; modules con su propio uuid distinto; SOLO el BP depende del RP (uuid del header del RP, version [1,0,0]); el RP NO depende de nada; el BP con script añade la dependencia {\"module_name\":\"@minecraft/server\",\"version\":\"${String(env.MC_SERVER_VERSION || "2.10.0")}\"}). Todos los UUID deben ser v4 válidos y DISTINTOS entre sí.
Ítems personalizados: BP/items/<nombre>.json con formato "minecraft:item" (format_version "1.21.0"), identificador con prefijo propio (por ejemplo ego:espada_trueno), componentes como minecraft:icon, minecraft:max_stack_size, minecraft:damage, minecraft:hand_equipped, minecraft:durability (NO uses minecraft:cooldown; el enfriamiento va en el script). El ícono es "minecraft:icon":{"textures":{"default":"nombre_corto"}} y ese nombre se define en RP/textures/item_texture.json. Textos en RP/texts/es_ES.lang y RP/texts/en_US.lang y RP/texts/languages.json.
Recursos gráficos: no escribas bytes binarios como texto. El postprocesador de EGO genera PNG de ítems, bloques e iconos. Cada entidad debe tener su propio client_entity, spawn_egg, geometría, textura y animación locomotora coherentes; no reutilices la misma geometría para criaturas distintas. Los iconos de armas de fuego, botiquines, granadas, munición y armaduras deben ser de su categoría y nunca una espada genérica. No finjas que existe un recurso si no se generó.
Efectos y comportamiento (rayos, partículas, sonidos, habilidades): usa Script API con "@minecraft/server" en BP/scripts/main.js (módulo "script" en el manifest con language "javascript", entry "scripts/main.js", y dependencia @minecraft/server con una version estable). Para rayos usa dimension.spawnEntity("minecraft:lightning_bolt", ubicacion) o /summon; para partículas dimension.spawnParticle o RP/particles; para sonidos world.playSound o dimension.playSound. Escucha eventos como world.afterEvents.itemUse y world.afterEvents.entityHitEntity y comprueba que el ítem sea el tuyo. Añade cooldown y no uses APIs inventadas. Explica en README.md si hay que activar Experimentos (Beta APIs) y cómo instalarlo.
Incluye todos los archivos con contenido completo, sin placeholders, sin binarios, sin rutas absolutas ni "..". Máximo ${maxFiles} archivos. packType=${kind}.` : `Eres un ingeniero especializado en Minecraft BEDROCK. Tipo de entrega: ${mcKind}. Nunca Java, Forge ni Fabric.

Reglas de salida según tipo:
- world/education_project: crea un KIT DE MUNDO, no finjas un .mcworld. Genera BP/ y RP/ con packs completos y enlazables, más world_blueprint/world_plan.json con nombre, bioma, semilla sugerida, spawn, reglas, zonas, estructuras, progresión, objetivos y pasos de montaje. Añade world_blueprint/README.md. El Worker empaquetará los dos packs como .mcpack dentro de un ZIP junto con el plano. No generes level.dat falso ni afirmes que es un mundo importable.
- behavior_pack/functions/command_project: crea un Behavior Pack Bedrock con manifest.json en BP/manifest.json, funciones .mcfunction en BP/functions/, scripts solo si se necesitan y JSON válidos. Comandos exclusivamente Bedrock.
- resource_pack: crea un Resource Pack en RP/ con manifest.json, texturas y referencias coherentes. No inventes binarios; describe los recursos binarios ausentes.
- skin_pack: crea la estructura del pack de skins Bedrock, manifest y skins.json; no declares PNG inexistentes.
- structures: crea planos verificables en JSON/Markdown y comandos Bedrock de construcción. No llames .mcstructure a un JSON de texto ni inventes el formato binario.
Todos los packs deben tener manifest v2, UUID v4 únicos, rutas relativas y archivos completos. Si hay JavaScript, declara módulo script y dependencia @minecraft/server con versión ${String(env.MC_SERVER_VERSION || "2.10.0")}. No uses APIs inventadas. Incluye README de instalación, compatibilidad y limitaciones. Máximo ${maxFiles} archivos. Solicitud exacta: ${prompt}`)
    : `Eres un arquitecto de software senior. Genera un proyecto ejecutable completo. Incluye README.md con instalación y ejecución, archivos de configuración, código completo y pruebas básicas cuando proceda. Elige una estructura simple y consistente con el stack solicitado. Máximo ${maxFiles} archivos. No incluyas placeholders, secretos, ni rutas absolutas.`;
  const FORMATO = `\n\nFORMATO DE RESPUESTA (obligatorio, sin Markdown, sin explicaciones antes ni después): la primera línea es "PROYECTO: nombre-corto-sin-espacios". Después, para CADA archivo, escribe una línea exacta "=== ARCHIVO: ruta/relativa.ext ===", luego el contenido completo del archivo tal cual (sin comillas ni escapes, sin bloques de código) y termina con la línea exacta "=== FIN ===". Incluye README.md.`;
  const guiaLec = minecraft && mcKind !== "addon" ? null : BASE_LECCIONES.find(l => l.titulo.startsWith(minecraft ? "Minecraft Bedrock" : "Apps y webs completas"));
  const guiaTxt = guiaLec ? "\n\nGUÍA TÉCNICA OBLIGATORIA (síguela):\n- " + guiaLec.reglas.join("\n- ") + (guiaLec.original ? "\n\n" + guiaLec.original : "") : "";
  const system2 = system + guiaTxt + FORMATO;
  const user = `Crea este proyecto con calidad profesional, funcional y adaptado a móvil cuando aplique. Solicitud: ${prompt}`;
  let model="", parsed=null; const intentos=[];
  try {
    const mensajes=[{role:"system",content:system2},{role:"user",content:user}];
    // En proyectos grandes el equipo genera y revisa una propuesta unificada antes del fallback legado.
    if (routerApiKey(env) && env.EGO_TEAM_MODE !== "0") {
      try {
        const equipo = await egoTeamChat(mensajes, env, 16000, minecraft ? `minecraft-bedrock-${mcKind}` : "software-project");
        if (equipo?.content) {
          const p = leerProyectoModelo(equipo.content);
          const valido = p && p.files.length && (!minecraft || p.files.some(f => /manifest\.json$/i.test(f.path)));
          if (valido) { parsed = p; model = equipo.model; }
          else intentos.push("equipo: formato de proyecto no válido; se usa el fallback");
        }
      } catch (e) {
        intentos.push("equipo: " + String(e?.message || e).slice(0, 90));
      }
    }
    const candidatos=[];
    if (!parsed && env.AI) {
      const cadena=env.PROJECT_CF_MODEL?[String(env.PROJECT_CF_MODEL),...CF_MODELS.codigo.filter(m=>m!==String(env.PROJECT_CF_MODEL))]:CF_MODELS.codigo;
      for (const m of cadena.slice(0,3)) candidatos.push({tipo:"cf",id:m});
    }
    if (!parsed && routerApiKey(env)) for (const m of openRouterCandidates(env,"code").slice(0,2)) candidatos.push({tipo:"or",id:m});
    if (!parsed && !candidatos.length) return respuestaJsonError("Configura Workers AI o OPENROUTER_API_KEY para generar proyectos.",503);
    const limite=Date.now()+230000;
    for (const c of (parsed ? [] : candidatos.slice(0,5))) {
      if (Date.now()>limite) { intentos.push("se agotó el tiempo"); break; }
      let raw="", etiqueta=c.tipo==="or"?`openrouter:${c.id}`:c.id;
      try {
        if (c.tipo==="cf") { const r=await cfChat(c.id,mensajes,env,12000); raw=r.content; }
        else {
          const r=await openRouterChat(mensajes,env,16000,c.id);
          raw=r.content;
        }
      } catch(err) { intentos.push(`${etiqueta.split("/").pop()}: ${String(err?.message||err).slice(0,90)}`); continue; }
      const p=leerProyectoModelo(raw);
      const ok=p && p.files.length && (!minecraft || p.files.some(f=>/manifest\.json$/i.test(f.path)));
      if (ok) { parsed=p; model=etiqueta; break; }
      intentos.push(`${etiqueta.split("/").pop()}: ${raw?`respuesta no válida (${raw.length} caracteres)`:"respuesta vacía"}`);
    }
    if(!parsed) return json({error:"Ningún modelo devolvió un proyecto válido. Intentos: "+intentos.join(" | ").slice(0,420)+". Prueba de nuevo o con una petición más concreta.",intentos},502);
    const files=[]; const seen=new Set();
    for(const f of parsed.files.slice(0,maxFiles)) {
      const path=safeProjectPath(f?.path);
      if(!path || seen.has(path) || typeof f.content!=="string") continue;
      seen.add(path); files.push({path,content:f.content.slice(0,300000)});
    }
    if(!files.length) return json({error:"El proyecto no contiene archivos válidos.",model},502);
    const name=String(parsed.name|| (minecraft?"ego-bedrock-addon":"ego-project")).replace(/[^\w.-]/g,"-").slice(0,60)||"ego-project";
    const readmeExists=files.some(f=>/^README\.md$/i.test(f.path));
    if(!readmeExists) files.push({path:"README.md",content:`# ${name}\n\n${String(parsed.description||prompt)}\n\nGenerado por EGO AI. Revisa y prueba el proyecto antes de publicarlo.\n`});
    if(minecraft && mcKind !== "addon") {
      const cicloGeneral = await cicloReparacionAutomatica(files, env, { minecraft: false });
      const revisionGeneral = validarProyectoMinecraftGeneral(files, mcKind);
      if (!revisionGeneral.ok) return json({ error: "El proyecto Minecraft no superó la revisión; no se empaquetó como terminado.", artifact: mcKind, validacion: revisionGeneral, reparacion: cicloGeneral.informe }, 422);
      return await generarPaqueteMinecraftEspecial(files, mcKind, name, prompt, env, request);
    }
    if(minecraft){
      // El README final lo construye postprocesarAddon dentro del BP; evita duplicarlo al reparar la raíz del .mcaddon.
      for(let i=files.length-1;i>=0;i--) if(/^README\.md$/i.test(files[i].path)) files.splice(i,1);
      const planGen=planDesdeArchivosMinecraft(files,name,prompt);
      const procesado=postprocesarAddon(files,planGen,env.MC_SERVER_VERSION);
      files.splice(0,files.length,...procesado.files);
    }
    const avisos=minecraft?repararAddon(files,env.MC_SERVER_VERSION):[];
    const ciclo=await cicloReparacionAutomatica(files,env,{minecraft});
    const validacion=ciclo.validacion||(minecraft?validarAddonEstructural(files):{ok:true,errores:[],avisos:[],archivos:files.length});
    avisos.push(...ciclo.informe.cambios.map(x=>`Auto-reparación ronda ${x.ronda}: ${x.path}`),...ciclo.informe.avisosFinales.map(x=>"Auto-reparación: "+x));
    if(minecraft) avisos.push(...validacion.errores.map(x=>"Validación pendiente: "+x),...validacion.avisos.map(x=>"Revisión: "+x));
    if(avisos.length){const ix=files.findIndex(f=>/(^|\/)README\.md$/i.test(f.path));if(ix>=0)files[ix].content+="\n\n## Avisos y validación de EGO AI\n"+avisos.map(a=>"- "+a).join("\n")+"\n- La validación estática no sustituye la importación y prueba dentro de Minecraft.\n";}
    const zip=await createZip(files);
    return new Response(zip,{status:200,headers:{...corsPara(request,env),"Content-Type":"application/zip","Content-Disposition":`attachment; filename="${name}${minecraft?".mcaddon":".zip"}"`,"X-EGO-Avisos":String(avisos.length),"X-EGO-Validacion":encodeURIComponent(JSON.stringify(validacion).slice(0,5000)),"X-EGO-Reparacion":encodeURIComponent(JSON.stringify(ciclo.informe).slice(0,3000)),"X-EGO-Model":model,"X-EGO-Files":String(files.length),...(minecraft?{"X-EGO-Artifact":"addon","X-EGO-Importable":"true"}:{}),"Cache-Control":"no-store"}});
  } catch(e) {
    console.error("project_generate",String(e?.message||e).slice(0,250));
    return json({error:"No se pudo generar el proyecto. Revisa la configuración del proveedor y los logs.",detail:String(e?.message||e).slice(0,180)},503);
  }
}


// ============================================================
// 🧱 CONSTRUCTOR DETERMINISTA DE ADD-ONS DE ÍTEMS (Minecraft Bedrock)
// El modelo solo decide nombre/tipo/habilidad/color; los archivos los arma el código,
// así el manifest, el ícono, la textura PNG y el script siempre salen correctos.
// ============================================================
function pngBytes(w,h,rgba){
  const enc=(s)=>Array.from(s).map(c=>c.charCodeAt(0));
  const raw=new Uint8Array(h*(1+w*4));
  for(let y=0;y<h;y++){raw[y*(1+w*4)]=0;raw.set(rgba.subarray(y*w*4,(y+1)*w*4),y*(1+w*4)+1);}
  // zlib con bloques "stored"
  const bloques=[];bloques.push(new Uint8Array([0x78,0x01]));
  let pos=0;
  while(pos<raw.length||pos===0){
    const n=Math.min(65535,raw.length-pos),ult=(pos+n>=raw.length)?1:0;
    bloques.push(new Uint8Array([ult,n&255,(n>>>8)&255,(~n)&255,((~n)>>>8)&255]));
    bloques.push(raw.subarray(pos,pos+n));pos+=n;if(ult)break;
  }
  let a=1,b=0;for(const v of raw){a=(a+v)%65521;b=(b+a)%65521;}
  bloques.push(new Uint8Array(u32(((b<<16)|a)>>>0).reverse()));
  const idat=concatBytes(bloques);
  const chunk=(tipo,datos)=>{const t=new Uint8Array(enc(tipo)),cuerpo=concatBytes([t,datos]);
    return concatBytes([new Uint8Array(u32(datos.length).reverse()),cuerpo,new Uint8Array(u32(crc32(cuerpo)).reverse())]);};
  const ihdr=new Uint8Array([...u32(w).reverse(),...u32(h).reverse(),8,6,0,0,0]);
  return concatBytes([new Uint8Array([137,80,78,71,13,10,26,10]),chunk("IHDR",ihdr),chunk("IDAT",idat),chunk("IEND",new Uint8Array(0))]);
}
function hexRgb(h){const n=parseInt(String(h).replace("#",""),16);return [(n>>16)&255,(n>>8)&255,n&255];}
function mezcla(c,t,k){return c.map((v,i)=>Math.max(0,Math.min(255,Math.round(v+(t[i]-v)*k))));}

const MC_PALETAS={
  rayo:{principal:"#9fd8ff",acento:"#ffe94a"},fuego:{principal:"#ff7a1a",acento:"#ffd23a"},
  hielo:{principal:"#9be7ff",acento:"#ffffff"},explosion:{principal:"#c9402b",acento:"#ffc94a"},
  veneno:{principal:"#6bd13a",acento:"#b14aff"},viento:{principal:"#c8f0e0",acento:"#7fe0ff"},
  curacion:{principal:"#ffe27a",acento:"#ff6f9c"}
};
const MC_COLORES={rojo:"#e0382e",azul:"#3b7bff",verde:"#38c24a",dorado:"#f2c230",amarillo:"#f2d630",morado:"#9a4be0",violeta:"#9a4be0",negro:"#2b2b33",blanco:"#f0f0f0",rosa:"#ff7fb5",naranja:"#ff8a1f",celeste:"#7fd6ff",plateado:"#cfd6dc"};

function dibujarIcono(tipo,principal,acento){
  const W=16,px=new Uint8Array(W*W*4);
  const P=hexRgb(principal),A=hexRgb(acento),CLARO=mezcla(P,[255,255,255],.55),OSC=mezcla(P,[0,0,0],.35);
  const MAD=[120,78,40],MADO=[78,48,24],OUT=[24,20,30];
  const set=(x,y,c)=>{if(x<0||y<0||x>=W||y>=W)return;const i=(y*W+x)*4;px[i]=c[0];px[i+1]=c[1];px[i+2]=c[2];px[i+3]=255;};
  const lleno=(x,y)=>x>=0&&y>=0&&x<W&&y<W&&px[(y*W+x)*4+3]>0;
  if(tipo==="hacha"){
    for(let i=0;i<10;i++){set(3+i,13-i,MAD);set(4+i,13-i,MADO);}
    for(let y=1;y<=7;y++)for(let x=8;x<=14;x++){const d=(x-8)+(y-1);if(d>=1&&d<=9&&!(x>11&&y>5)){set(x,y,d<4?CLARO:(d<7?P:OSC));}}
    set(2,14,MADO);
  } else if(tipo==="pico"){
    for(let i=0;i<10;i++){set(3+i,13-i,MAD);set(4+i,13-i,MADO);}
    const arco=[[3,5],[4,4],[5,3],[6,2],[7,2],[8,2],[9,2],[10,3],[11,4],[12,5],[13,7],[3,6],[12,6],[13,8],[4,5],[11,5],[5,4],[10,4],[6,3],[9,3],[7,3],[8,3]];
    arco.forEach(([x,y],k)=>set(x,y,(y<=2)?CLARO:(y<=3?P:OSC)));
    set(7,4,MAD);set(8,5,MAD);
  } else if(tipo==="vara"){
    for(let i=0;i<11;i++){set(2+i,14-i,MAD);set(3+i,14-i,MADO);}
    const cx=11,cy=4;
    for(let y=0;y<W;y++)for(let x=0;x<W;x++){const d=Math.hypot(x-cx,y-cy);
      if(d<=3.1)set(x,y,d<1.4?[255,255,255]:(d<2.3?A:P));}
    set(9,6,MADO);set(10,7,MADO);
  } else { // espada
    for(let i=0;i<9;i++){const x=13-i,y=2+i;set(x,y,P);set(x-1,y,i<5?CLARO:P);set(x+1,y,OSC);}
    set(14,1,CLARO);set(13,1,P);
    for(let j=0;j<5;j++){set(3+j,8+j,A);set(4+j,8+j,mezcla(A,[0,0,0],.3));}
    set(4,11,MAD);set(3,12,MAD);set(4,12,MADO);set(2,13,A);set(3,13,mezcla(A,[0,0,0],.3));
  }
  // contorno oscuro automático
  const marcar=[];for(let y=0;y<W;y++)for(let x=0;x<W;x++)if(!lleno(x,y)&&(lleno(x+1,y)||lleno(x-1,y)||lleno(x,y+1)||lleno(x,y-1)))marcar.push([x,y]);
  marcar.forEach(([x,y])=>set(x,y,OUT));
  return px;
}
function iconoPack(px16,fondo){
  const W=64,out=new Uint8Array(W*W*4),B=hexRgb(fondo);
  for(let y=0;y<W;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4,t=y/W,c=mezcla(B,[0,0,0],.45*t);out[i]=c[0];out[i+1]=c[1];out[i+2]=c[2];out[i+3]=255;
    const s=((y>>2)*16+(x>>2))*4;if(px16[s+3]){out[i]=px16[s];out[i+1]=px16[s+1];out[i+2]=px16[s+2];}}
  return out;
}

function slugAscii(t){return String(t||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"").slice(0,32)||"objeto";}
function tituloCaso(t){const x=String(t||"").trim().replace(/\s+/g," ").slice(0,40);return x.split(" ").map((w,i)=>(i>0&&/^(de|del|la|el|los|las|y|en|con|a|al|un|una)$/i.test(w))?w.toLowerCase():w.charAt(0).toUpperCase()+w.slice(1)).join(" ");}

const RX_MC_ITEM=/(espada|sable|hacha|pico|pala|vara|varita|bast[oó]n|cetro|arma|[ií]tem|objeto|herramienta|katana|lanza)/i;
const RX_MC_OTRO=/(mob|criatura|monstruo|entidad|bloque|dimensi[oó]n|bioma|armadura|aldean|jefe|boss|mascota|animal|mapa|estructura|casa|castillo|veh[ií]culo|mundo|comida|planta)/i;
function esAddonDeItem(prompt){return RX_MC_ITEM.test(prompt)&&!RX_MC_OTRO.test(prompt);}
const RX_MC_PESADO=/(pesad|enorme|gigante|sin l[ií]mites|muy complet|sistema de|jefe|boss|dimensi|bioma|armadura|varias? (espadas|armas|items|objetos|herramientas)|\bmuchos?\b|bloques? nuevos|avanzad)/i;
function esAddonSimple(prompt){const p=String(prompt||"");return esAddonDeItem(p)&&p.length<=520&&!RX_MC_PESADO.test(p);}

function detectarMc(texto){
  const t=String(texto||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");
  const o={};
  if(/hacha/.test(t))o.tipo="hacha";else if(/\bpico\b|\bpala\b/.test(t))o.tipo="pico";else if(/vara|varita|baston|cetro/.test(t))o.tipo="vara";else if(/espada|sable|katana/.test(t))o.tipo="espada";
  if(/trueno|rayo|relampago|tormenta|electric/.test(t))o.hab="rayo";
  else if(/\b(?:fuego|llamas?|lava|igne\w*|infern\w*|volcan\w*)\b/.test(t))o.hab="fuego";
  else if(/hielo|escarcha|congel|nieve|glaci/.test(t))o.hab="hielo";
  else if(/explos|tnt|bomba|dinamita/.test(t))o.hab="explosion";
  else if(/veneno|toxic|wither|plaga/.test(t))o.hab="veneno";
  else if(/viento|aire|salto|volar/.test(t))o.hab="viento";
  else if(/\b(?:cura\w*|vida|sagrad\w*|sanar|angel\w*|regener\w*)/.test(t))o.hab="curacion";
  for(const k of Object.keys(MC_COLORES)){const raiz=k.replace(/[oa]$/,"");if(new RegExp("\\b"+raiz+"(o|a|os|as)?\\b").test(t)){o.color=MC_COLORES[k];break;}}
  if(/mas (danio|fuerte|poder)|poderos|mas dano/.test(t))o.mas=4;
  if(/mortal|letal|brutal|devastador|asesin|matar/.test(t))o.mas=(o.mas||0)+6;
  if(/velocidad|rapid|correr|corriendo|veloz|agil|sprint/.test(t))o.vel=true;
  if(/menos (danio|dano)|mas debil/.test(t))o.mas=-3;
  return o;
}
function especificacionPorPalabras(prompt){
  const partes=String(prompt||"").split(/Cambios pedidos ahora:/i);
  const d={};let mas=0,cambioHab=false,vel=false;
  partes.forEach((p,i)=>{const x=detectarMc(p);if(x.mas)mas+=x.mas;delete x.mas;if(x.vel)vel=true;delete x.vel;if(i>0&&(x.hab||x.tipo))cambioHab=true;Object.assign(d,x);});
  const tipo=d.tipo||"espada",hab=d.hab||"rayo",pal=MC_PALETAS[hab];
  // un color pedido antes de cambiar de habilidad ya no aplica (ej. "azul" + "hazlo de fuego")
  let color=d.color||null;
  if(cambioHab&&color){const ult=detectarMc(partes[partes.length-1]);if(!ult.color)color=null;}
  const nm=partes[0].match(/(?:llamad[ao]|nombre[:\s]+|se llame)\s+["“']?([^"”'.,\n]{3,40})/i);
  const base0={espada:"Espada",hacha:"Hacha",pico:"Pico",vara:"Vara"}[tipo];
  const nomHab={rayo:["del Trueno","del Trueno"],fuego:["de Fuego","de Fuego"],hielo:["de Hielo","de Hielo"],explosion:["Explosiva","Explosivo"],veneno:["Venenosa","Venenoso"],viento:["del Viento","del Viento"],curacion:["Sagrada","Sagrado"]}[hab][tipo==="pico"?1:0];
  const dan0=tipo==="espada"?9:(tipo==="hacha"?10:(tipo==="pico"?6:5));
  const nombre=(nm&&!cambioHab)?tituloCaso(nm[1]):(base0+" "+nomHab);
  return {nombre,tipo,habilidad:hab,principal:color||pal.principal,acento:pal.acento,danio:Math.max(2,Math.min(20,dan0+mas)),durabilidad:1800,brillo:true,velocidad:vel};
}
function normMc(t){return String(t||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");}
// Opciones extra que se entienden por palabras (además de tipo, habilidad, color, daño y velocidad)
function detectarFlags(texto){
  const t=normMc(texto),o={};
  if(/(busca|buscar|persigu|objetivo|automatic|teledirig|auto-?apunt|enemigo mas cercano|siempre (le )?pegue)/.test(t))o.buscar=true;
  if(/(no (me|al jugador|a mi)\b|menos (el|al) que|excepto|salvo|sin (danar|herir|lastimar)|proteg|que no me)/.test(t))o.proteger=true;
  if(/(sin proteccion|que si me dane)/.test(t))o.proteger=false;
  const n=t.match(/(\d+)\s*rayos/);
  if(n)o.rayos=Math.max(1,Math.min(6,Number(n[1])));
  else if(/(varios|multiples|muchos|tormenta de|lluvia de|doble|triple) rayos/.test(t))o.rayos=3;
  if(/(irrompible|indestructible|infinit[ao]|nunca se rompe)/.test(t))o.durabilidad=32000;
  else if(/(mas|mayor) durabilidad|dure mas|dura mas|mas resistente/.test(t))o.durabilidad=5000;
  if(/(sin|menos) (espera|enfriamiento|cooldown|tiempo de espera)|(mas|muy) rapid[oa] (el|la) (rayo|habilidad|poder)|recarg\w+ rapid/.test(t))o.espera=20;
  else if(/(mas|mayor) (espera|enfriamiento|cooldown)/.test(t))o.espera=160;
  const nm=String(texto||"").match(/(?:ll[aá]mal[oa]|ponle (?:de )?nombre|que se llame|se llame|cambia(?:r)? el nombre a)\s+["“']?([^"”'.,\n]{3,40})/i);
  if(nm)o.nombre=tituloCaso(nm[1]);
  return o;
}
// Aplica los cambios pedidos sobre un add-on ya creado SIN cambiar su id; devuelve lo que no pudo aplicar.
function aplicarCambios(spec,texto){
  const s={...spec},noAplicado=[],aplicado=[];
  const clausulas=String(texto||"").split(/[.;\n]+|\s+y\s+(?=que\b|ademas\b|tambien\b|quiero\b)|\bademas\b/i).map(x=>x.trim()).filter(Boolean);
  for(const c of clausulas){
    const d=detectarMc(c),f=detectarFlags(c);
    const hay=d.tipo||d.hab||d.color||d.mas||d.vel||Object.keys(f).length;
    if(!hay){const pal=normMc(c).split(/\s+/).filter(w=>w.length>2&&!/^(que|con|para|las|los|una|uno|por|del|pero|mas|muy|todo|todos|bien|como|eso|esto|asi|solo|gracias|genial|bueno|vale|ahora|agregale|agrega|ponle|hazle|hazlo|cambia|cambiale|dale)$/.test(w));
      if(pal.length>=3)noAplicado.push(c.slice(0,140));continue;}
    aplicado.push(c);
    if(d.tipo)s.tipo=d.tipo;
    if(d.hab){s.habilidad=d.hab;s.acento=MC_PALETAS[d.hab].acento;if(!d.color)s.principal=MC_PALETAS[d.hab].principal;}
    if(d.color)s.principal=d.color;
    if(d.mas)s.danio=Math.max(2,Math.min(30,Number(s.danio||9)+d.mas));
    if(d.vel)s.velocidad=true;
    Object.assign(s,f);
  }
  return {spec:s,noAplicado,aplicado};
}
async function especificarAddon(prompt,env,prev){
  if(prev&&typeof prev==="object"&&prev.id&&MC_PALETAS[prev.habilidad]){
    const r=aplicarCambios(prev,String(prompt).split(/Cambios pedidos ahora:/i).pop());
    return r;
  }
  const s=especificacionPorPalabras(prompt);
  Object.assign(s,detectarFlags(prompt));
  if(/rayo|trueno|relampago/i.test(normMc(prompt))&&s.habilidad==="rayo"&&s.buscar===undefined)s.buscar=false;
  if(!env.AI||/Cambios pedidos ahora:/i.test(String(prompt))) return {spec:s,noAplicado:[]};
  try{
    const r=await cfChat((CF_MODELS.rapido&&CF_MODELS.rapido[0])||CF_MODELS.codigo[0],[
      {role:"system",content:"Devuelve SOLO un JSON válido, sin texto extra, con las claves: nombre (nombre corto en español del objeto, máx 30 caracteres), tipo (espada|hacha|pico|vara), habilidad (rayo|fuego|hielo|explosion|veneno|viento|curacion), color (hex como #RRGGBB, color principal del objeto), danio (número 3 a 16). Elige según la petición del usuario."},
      {role:"user",content:String(prompt).slice(0,600)}],env,400);
    const j=extractJson(r.content);
    if(j){
      if(typeof j.nombre==="string"&&j.nombre.trim().length>=3&&!detectarFlags(prompt).nombre)s.nombre=tituloCaso(j.nombre.replace(/[^\p{L}\p{N} '’-]/gu,""))||s.nombre;
      if(["espada","hacha","pico","vara"].includes(j.tipo)&&!detectarMc(prompt).tipo)s.tipo=j.tipo;
      if(MC_PALETAS[j.habilidad]&&!detectarMc(prompt).hab){s.habilidad=j.habilidad;s.acento=MC_PALETAS[j.habilidad].acento;if(!detectarMc(prompt).color)s.principal=MC_PALETAS[j.habilidad].principal;}
      if(/^#[0-9a-f]{6}$/i.test(String(j.color||""))&&!detectarMc(prompt).color)s.principal=j.color;
      const d=Number(j.danio);if(d>=3&&d<=16&&!detectarMc(prompt).mas)s.danio=Math.round(d);
    }
  }catch(e){}
  return {spec:s,noAplicado:[]};
}

const AURA={rayo:"minecraft:electric_spark_particle",fuego:"minecraft:basic_flame_particle",hielo:"minecraft:critical_hit_emitter",explosion:"minecraft:basic_smoke_particle",veneno:"minecraft:villager_angry",viento:"minecraft:basic_smoke_particle",curacion:"minecraft:villager_happy"};
function scriptHabilidad(s){
  const peligrosa=["rayo","fuego","explosion"].includes(s.habilidad)&&s.proteger!==false;
  const H={
    rayo:{usa:"obj",uso:'  lanzarRayos(p, lugar);\n  chispas(p.dimension, lugar, "minecraft:electric_spark_particle");\n  p.playSound("ambient.weather.thunder");',
          golpe:'  lanzarRayos(p, h.location);'},
    fuego:{usa:"obj",uso:'  protegerme(p);\n  cerca(p, lugar, 6).forEach((e) => e.setOnFire(8, true));\n  chispas(p.dimension, lugar, "minecraft:basic_flame_particle");\n  p.playSound("mob.blaze.shoot");',
          golpe:'  h.setOnFire(6, true);\n  chispas(h.dimension, h.location, "minecraft:basic_flame_particle");'},
    hielo:{usa:"obj",uso:'  cerca(p, lugar, 7).forEach((e) => e.addEffect("slowness", 120, { amplifier: 3 }));\n  chispas(p.dimension, lugar, "minecraft:critical_hit_emitter");\n  p.playSound("random.glass");',
          golpe:'  h.addEffect("slowness", 80, { amplifier: 2 });\n  chispas(h.dimension, h.location, "minecraft:critical_hit_emitter");'},
    explosion:{usa:"obj",uso:'  protegerme(p);\n  p.dimension.createExplosion(lugar, 3, { breaksBlocks: false, causesFire: false });',
          golpe:'  protegerme(p);\n  h.dimension.createExplosion(h.location, 1.5, { breaksBlocks: false, causesFire: false });'},
    veneno:{usa:"obj",uso:'  cerca(p, lugar, 6).forEach((e) => e.addEffect("poison", 140, { amplifier: 1 }));\n  chispas(p.dimension, lugar, "minecraft:villager_angry");',
          golpe:'  h.addEffect("poison", 100, { amplifier: 1 });'},
    viento:{usa:"nada",uso:'  p.addEffect("speed", 200, { amplifier: 2 });\n  p.addEffect("jump_boost", 200, { amplifier: 3 });\n  p.addEffect("slow_falling", 240, { amplifier: 0 });\n  p.playSound("mob.phantom.swoop");',
          golpe:'  h.addEffect("levitation", 30, { amplifier: 0 });'},
    curacion:{usa:"nada",uso:'  p.addEffect("regeneration", 200, { amplifier: 2 });\n  p.addEffect("absorption", 300, { amplifier: 1 });\n  chispas(p.dimension, p.location, "minecraft:villager_happy");\n  p.playSound("random.levelup");',
          golpe:'  p.addEffect("regeneration", 60, { amplifier: 1 });'}
  }[s.habilidad];
  const objetivo=H.usa==="obj"?'  const lugar = objetivo(p);\n  if (!lugar) return;\n':"";
  const rayos=Math.max(1,Math.min(6,Number(s.rayos)||1));
  const espera=Math.max(10,Math.min(600,Number(s.espera)||60));
  return [
    'import { world, system } from "@minecraft/server";',
    '',
    'const ITEM = "'+(s.ns||"ego")+':'+s.id+'";',
    'const ESPERA_USO = '+espera+'; // ticks (20 ticks = 1 s)',
    'const ESPERA_GOLPE = 15;',
    'const RAYOS = '+rayos+'; // cuántos rayos caen cada vez',
    'const BUSCAR_OBJETIVO = '+(s.buscar?"true":"false")+'; // si no apuntas a nadie, busca al enemigo más cercano',
    'const RADIO_BUSQUEDA = 24;',
    'const IGNORAR = ["minecraft:item", "minecraft:xp_orb", "minecraft:arrow", "minecraft:lightning_bolt", "minecraft:armor_stand", "minecraft:falling_block", "minecraft:area_effect_cloud"];',
    'const ultimoUso = new Map();',
    'const ultimoGolpe = new Map();',
    '',
    'function listo(mapa, id, espera) {',
    '  const t = system.currentTick;',
    '  if ((mapa.get(id) ?? -100000) + espera > t) return false;',
    '  mapa.set(id, t);',
    '  return true;',
    '}',
    'function chispas(dim, loc, id) {',
    '  try { dim.spawnParticle(id, loc); } catch (e) {}',
    '}',
    'function enMano(jugador) {',
    '  try {',
    '    const it = jugador.getComponent("minecraft:equippable")?.getEquipment("Mainhand");',
    '    return it?.typeId === ITEM;',
    '  } catch (e) { return false; }',
    '}',
    '// Protege a quien usa el arma (nunca se daña con sus propios rayos, fuego o explosiones)',
    'function protegerme(p) {',
    '  try {',
    '    p.addEffect("resistance", 100, { amplifier: 4, showParticles: false });',
    '    p.addEffect("fire_resistance", 100, { amplifier: 0, showParticles: false });',
    '  } catch (e) {}',
    '}',
    '// Elige el objetivo: lo que miras; si no hay nadie, el más cercano (sin contarte a ti); si no, el bloque que miras',
    'function objetivo(p) {',
    '  try {',
    '    const mirado = p.getEntitiesFromViewDirection({ maxDistance: 30 }).find((r) => r.entity.id !== p.id && !IGNORAR.includes(r.entity.typeId))?.entity;',
    '    if (mirado) return mirado.location;',
    '    if (BUSCAR_OBJETIVO) {',
    '      let mejor, mejorD = Infinity;',
    '      for (const e of p.dimension.getEntities({ location: p.location, maxDistance: RADIO_BUSQUEDA, excludeTypes: IGNORAR })) {',
    '        if (e.id === p.id) continue;',
    '        const dx = e.location.x - p.location.x, dy = e.location.y - p.location.y, dz = e.location.z - p.location.z;',
    '        const d = dx * dx + dy * dy + dz * dz;',
    '        if (d < mejorD) { mejorD = d; mejor = e; }',
    '      }',
    '      if (mejor) return mejor.location;',
    '    }',
    '    const b = p.getBlockFromViewDirection({ maxDistance: 30 })?.block;',
    '    if (b) return { x: b.location.x + 0.5, y: b.location.y + 1, z: b.location.z + 0.5 };',
    '  } catch (e) {}',
    '  return undefined;',
    '}',
    'function cerca(p, lugar, radio) {',
    '  try { return p.dimension.getEntities({ location: lugar, maxDistance: radio, excludeTypes: IGNORAR }).filter((e) => e.id !== p.id); }',
    '  catch (e) { return []; }',
    '}',
    'function lanzarRayos(p, lugar) {',
    '  protegerme(p);',
    '  const punto = { x: lugar.x, y: lugar.y, z: lugar.z };',
    '  for (let i = 0; i < RAYOS; i++) {',
    '    system.runTimeout(() => {',
    '      try { p.dimension.spawnEntity("minecraft:lightning_bolt", punto); } catch (e) {}',
    '    }, i * 6);',
    '  }',
    '}',
    '',
    '// Clic derecho: habilidad especial',
    'world.afterEvents.itemUse.subscribe((ev) => {',
    '  try {',
    '    if (ev.itemStack.typeId !== ITEM) return;',
    '    const p = ev.source;',
    '    if (!listo(ultimoUso, p.id, ESPERA_USO)) return;',
    objetivo_(H,objetivo),
    '    p.onScreenDisplay.setActionBar("'+s.nombre.replace(/[\\"]/g,"")+' ¡activada!");',
    '  } catch (e) {}',
    '});',
    '',
    '// Aura: mientras sostienes el objeto salen partículas'+(s.velocidad?' y corres más rápido':''),
    'system.runInterval(() => {',
    '  try {',
    '    for (const p of world.getAllPlayers()) {',
    '      if (!enMano(p)) continue;',
    (s.velocidad?'      p.addEffect("speed", 40, { amplifier: 1, showParticles: false });':'      // sin efecto pasivo'),
    '      chispas(p.dimension, { x: p.location.x, y: p.location.y + 1.2, z: p.location.z }, "'+AURA[s.habilidad]+'");',
    '    }',
    '  } catch (e) {}',
    '}, 10);',
    '',
    '// Al golpear: efecto extra',
    'world.afterEvents.entityHitEntity.subscribe((ev) => {',
    '  try {',
    '    const p = ev.damagingEntity;',
    '    if (p.typeId !== "minecraft:player" || !enMano(p)) return;',
    '    if (!listo(ultimoGolpe, p.id, ESPERA_GOLPE)) return;',
    '    const h = ev.hitEntity;',
    H.golpe,
    '  } catch (e) {}',
    '});',
    ''].join("\n");
}
function objetivo_(H,objetivo){return objetivo+H.uso;}

function construirAddonItem(s,version){
  if(!s.id)s.id=slugAscii(s.nombre);
  const id="ego:"+s.id, pId=crypto.randomUUID(), rId=crypto.randomUUID();
  const verSrv=String(version||"2.10.0");
  const pack=(nombre,desc,uuid,modulos,deps)=>JSON.stringify({format_version:2,metadata:{authors:["EGO AI"]},header:{name:nombre,description:desc,uuid,version:[1,0,0],min_engine_version:[1,26,50]},modules:modulos,...(deps?{dependencies:deps}:{})},null,2)+"\n";
  const px=dibujarIcono(s.tipo,s.principal,s.acento);
  const grupo={espada:"itemGroup.name.sword",hacha:"itemGroup.name.axe",pico:"itemGroup.name.pickaxe"}[s.tipo];
  const comp={
    "minecraft:icon":{textures:{default:"ego_"+s.id}},
    "minecraft:max_stack_size":1,
    "minecraft:hand_equipped":true,
    "minecraft:damage":s.danio,
    "minecraft:durability":{max_durability:Math.max(100,Math.min(32000,Number(s.durabilidad)||1800))}
  };
  if(s.brillo) comp["minecraft:glint"]=true;
  const item={format_version:"1.21.0","minecraft:item":{description:{identifier:id,menu_category:{category:"equipment",...(grupo?{group:grupo}:{})}},components:comp}};
  const nucleo={rayo:"minecraft:lightning_rod",fuego:"minecraft:blaze_rod",hielo:"minecraft:packed_ice",explosion:"minecraft:tnt",veneno:"minecraft:spider_eye",viento:"minecraft:feather",curacion:"minecraft:golden_apple"}[s.habilidad];
  const patron={espada:[" C "," D "," S "],hacha:["DC "," SD"," S "],pico:["DCD"," S "," S "],vara:["  C"," S ","S  "]}[s.tipo];
  const receta={format_version:"1.20.10","minecraft:recipe_shaped":{description:{identifier:"ego:"+s.id+"_receta"},tags:["crafting_table"],pattern:patron,key:{C:{item:nucleo},D:{item:"minecraft:diamond"},S:{item:"minecraft:stick"}},result:{item:id}}};
  const lang=(n)=>"item."+id+"="+n+"\nitem."+id+".name="+n+"\n";
  const readme="# "+s.nombre+"\n\nAdd-on para Minecraft Bedrock creado por EGO AI.\n\n## Instalar\n1. Abre este archivo .mcaddon (Minecraft lo importa solo).\n2. Crea o edita un mundo > Add-ons > activa el Behavior Pack y el Resource Pack de \""+s.nombre+"\".\n3. En el mundo escribe: /give @s "+id+"\n\n## Qué hace\n- Textura propia (PNG) y nombre en español e inglés.\n- Clic derecho: habilidad "+s.habilidad+" (espera de "+Math.round((Number(s.espera)||60)/20)+" s)"+(s.buscar?", busca al enemigo más cercano si no apuntas a nadie":"")+(["rayo","fuego","explosion"].includes(s.habilidad)?"; quien usa el arma queda protegido de sus propios efectos":"")+".\n- Al golpear: efecto extra de "+s.habilidad+".\n- Aura de partículas mientras lo sostienes"+(s.velocidad?" y velocidad extra al correr":"")+".\n- No incluye animación 3D propia del modelo (eso requiere un modelo con geometría); el ícono, los efectos y las partículas sí.\n- Receta de crafteo incluida (mesa de trabajo).\n\n## Si algo falla\n- Si el script no corre, abre BP/manifest.json y cambia la version de @minecraft/server ("+verSrv+") por una que tu juego soporte.\n- Para cambiar el ícono, reemplaza RP/textures/items/ego_"+s.id+".png (16x16).\n";
  return [
    {path:"BP/manifest.json",content:pack(s.nombre+" BP","Behavior pack: "+s.nombre,pId,[{type:"data",uuid:crypto.randomUUID(),version:[1,0,0]},{type:"script",language:"javascript",entry:"scripts/main.js",uuid:crypto.randomUUID(),version:[1,0,0]}],[{uuid:rId,version:[1,0,0]},{module_name:"@minecraft/server",version:verSrv}])},
    {path:"BP/items/"+s.id+".json",content:JSON.stringify(item,null,2)+"\n"},
    {path:"BP/recipes/"+s.id+".json",content:JSON.stringify(receta,null,2)+"\n"},
    {path:"BP/scripts/main.js",content:scriptHabilidad(s)},
    {path:"BP/pack_icon.png",content:pngBytes(64,64,iconoPack(px,s.principal))},
    {path:"RP/manifest.json",content:pack(s.nombre+" RP","Resource pack: "+s.nombre,rId,[{type:"resources",uuid:crypto.randomUUID(),version:[1,0,0]}],null)},
    {path:"RP/pack_icon.png",content:pngBytes(64,64,iconoPack(px,s.principal))},
    {path:"RP/textures/item_texture.json",content:JSON.stringify({resource_pack_name:"ego",texture_name:"atlas.items",texture_data:{["ego_"+s.id]:{textures:"textures/items/ego_"+s.id}}},null,2)+"\n"},
    {path:"RP/textures/items/ego_"+s.id+".png",content:pngBytes(16,16,px)},
    {path:"RP/texts/languages.json",content:'["en_US","es_ES"]\n'},
    {path:"RP/texts/en_US.lang",content:lang(s.nombre)},
    {path:"RP/texts/es_ES.lang",content:lang(s.nombre)},
    {path:"BP/README.md",content:readme}
  ];
}


// Ciclo de reparación asistida: revisa JS/JSON, aplica parches acotados y vuelve a validar.
// Solo modifica archivos existentes; máximo dos rondas. No ejecuta Minecraft ni simula pruebas reales.
async function cicloReparacionAutomatica(files, env, opciones = {}) {
  const informe = { habilitado: !!routerApiKey(env) && env.EGO_AUTO_REPAIR !== "0", rondas: 0, cambios: [], erroresFinales: [], avisosFinales: [], estado: "omitido" };
  if (!Array.isArray(files) || !informe.habilitado) {
    const v = opciones.minecraft ? validarAddonEstructural(files) : null;
    if (v) { informe.erroresFinales = v.errores; informe.avisosFinales = v.avisos; }
    return { validacion: v, informe };
  }
  const maxRondas = Math.max(1, Math.min(Number(env.EGO_AUTO_REPAIR_ROUNDS || 2), 2));
  let validacion = opciones.minecraft ? validarAddonEstructural(files) : { ok: true, errores: [], avisos: [], archivos: files.length };
  for (let ronda = 1; ronda <= maxRondas; ronda++) {
    const candidatos = files.filter(f => f && typeof f.content === "string" && (/\.js$/i.test(f.path) || /\.json$/i.test(f.path)));
    if (!candidatos.length) break;
    // Enfoca los archivos citados por el validador; si no hay errores, revisa los scripts generados.
    const rutasError = [...validacion.errores, ...validacion.avisos].map(x => {
      const m = String(x).match(/(?:en |: )((?:BP|RP)\/[^ :]+\.(?:json|js))/i); return m && m[1];
    }).filter(Boolean);
    let objetivo = rutasError.length ? candidatos.filter(f => rutasError.includes(f.path)) : candidatos.filter(f => /\.js$/i.test(f.path) && (!opciones.minecraft || /(^|\/)scripts?\//i.test(f.path)));
    if (!objetivo.length && validacion.errores.length) objetivo = candidatos.filter(f => /\.json$/i.test(f.path));
    objetivo = objetivo.slice(0, 12);
    if (!objetivo.length) break;
    const snapshot = objetivo.map(f => ({ path: f.path, content: f.content.slice(0, 18000) }));
    const estadoAntes = new Map(files.map(f => [f.path, f.content]));
    const erroresAntesSet = new Set(validacion?.errores || []);
    const diagnostico = [...validacion.errores.map(x => "ERROR: " + x), ...validacion.avisos.map(x => "AVISO: " + x)].join("\n").slice(0, 9000) || "No hay errores estructurales. Revisa los scripts buscando errores claros de sintaxis, referencias inexistentes, APIs incompatibles y fallos lógicos evidentes. No cambies código correcto.";
    const messages = [
      { role: "system", content: `Eres el reparador de código de EGO AI. Corrige SOLO errores demostrables en los archivos proporcionados. No reescribas el proyecto ni cambies su diseño. Conserva compatibilidad con Minecraft Bedrock y @minecraft/server ${String(env.MC_SERVER_VERSION || "2.10.0")}. Devuelve ÚNICAMENTE JSON válido con esta forma: {"patches":[{"path":"ruta exacta existente","content":"contenido COMPLETO corregido del archivo"}]}. Si no puedes justificar una corrección, devuelve {"patches":[]}. No añadas archivos, no uses Markdown, no inventes APIs ni afirmes haber ejecutado pruebas.` },
      { role: "user", content: `RONDA ${ronda}. DIAGNÓSTICO:\n${diagnostico}\n\nARCHIVOS ACTUALES:\n${JSON.stringify(snapshot)}` }
    ];
    informe.rondas = ronda;
    try {
      const respuesta = await openRouterChat(messages, env, 7000, EGO_TEAM_MODELS.coder);
      const parsed = extractJson(respuesta.content);
      const patches = Array.isArray(parsed?.patches) ? parsed.patches : [];
      let aplicados = 0;
      for (const patch of patches.slice(0, 8)) {
        const path = safeProjectPath(patch && patch.path);
        if (!path || typeof patch.content !== "string" || patch.content.length > 300000 || !/\.(?:js|json)$/i.test(path)) continue;
        const original = files.find(f => f.path === path);
        if (!original || original.content === patch.content) continue;
        // Validación local del parche antes de aceptarlo.
        if (/\.json$/i.test(path) && !jsonTolerante(patch.content).ok) { informe.avisosFinales.push(`Parche rechazado en ${path}: JSON inválido.`); continue; }
        if (/\.js$/i.test(path) && (balanceJs(patch.content) || lintScriptApi(patch.content, String(env.MC_SERVER_VERSION||"2.10.0")).length)) { informe.avisosFinales.push(`Parche rechazado en ${path}: sintaxis/API no válida.`); continue; }
        // No se permite alterar otros archivos ni introducir contenido binario o rutas nuevas.
        original.content = patch.content;
        informe.cambios.push({ path, ronda, motivo: "parche del modelo reparador" });
        aplicados++;
      }
      if (!aplicados) break;
      validacion = opciones.minecraft ? validarAddonEstructural(files) : { ok: true, errores: [], avisos: [], archivos: files.length };
      const nuevosErrores = opciones.minecraft ? validacion.errores.filter(x => !erroresAntesSet.has(x)) : [];
      if (opciones.minecraft && nuevosErrores.length) {
        for (const f of files) if (estadoAntes.has(f.path)) f.content = estadoAntes.get(f.path);
        informe.cambios = informe.cambios.filter(x => x.ronda !== ronda);
        informe.avisosFinales.push(`Ronda ${ronda} revertida: el parche introdujo errores nuevos (${nuevosErrores.slice(0,2).join("; ")}).`);
        validacion = validarAddonEstructural(files);
        break;
      }
      if (validacion.ok && !validacion.errores.length) break;
    } catch (e) {
      informe.estado = "fallo_reparador";
      informe.avisosFinales.push("No se pudo ejecutar la reparación IA: " + String(e?.message || e).slice(0, 140));
      break;
    }
  }
  if (opciones.minecraft) validacion = validarAddonEstructural(files);
  informe.erroresFinales = validacion?.errores || [];
  informe.avisosFinales.push(...(validacion?.avisos || []));
  informe.estado = informe.erroresFinales.length ? (informe.cambios.length ? "reparado_parcial" : "pendiente") : (informe.cambios.length ? "reparado_y_validado" : "sin_cambios_necesarios");
  return { validacion, informe };
}

// Valida y repara el add-on: JSON de manifest, UUID v4 únicos y dependencias coherentes.
// Validación estructural local: no sustituye la prueba dentro de Minecraft.
function validarAddonEstructural(files) {
  const errores = [], avisos = [];
  const porRuta = new Map();
  for (const f of Array.isArray(files) ? files : []) {
    const path = safeProjectPath(f && f.path);
    if (!path) { errores.push("Hay una ruta de archivo insegura o inválida."); continue; }
    if (porRuta.has(path)) errores.push(`Ruta duplicada: ${path}`);
    else porRuta.set(path, f);
    if (typeof f.content !== "string" && !(f.content instanceof Uint8Array)) errores.push(`Contenido inválido: ${path}`);
    if (/\.png$/i.test(path)) {
      const b=f.content instanceof Uint8Array?f.content:null;
      const firma=b&&b.length>=24&&b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71&&b[4]===13&&b[5]===10&&b[6]===26&&b[7]===10;
      const w=firma?((b[16]<<24)|(b[17]<<16)|(b[18]<<8)|b[19])>>>0:0;
      const h=firma?((b[20]<<24)|(b[21]<<16)|(b[22]<<8)|b[23])>>>0:0;
      if(!firma||!w||!h) errores.push(`${path}: no contiene un PNG binario válido con dimensiones correctas.`);
    }
    if (/\.json$/i.test(path) && typeof f.content === "string") {
      try { JSON.parse(f.content); }
      catch (e) { errores.push(`JSON inválido en ${path}: ${String(e && e.message || e).slice(0, 110)}`); }
    }
  }
  const manifests = [];
  for (const [path, f] of porRuta) {
    if (!/(^|\/)manifest\.json$/i.test(path)) continue;
    let obj;
    try { obj = JSON.parse(f.content); } catch { continue; }
    manifests.push({ path, obj });
    if (!obj.header || !Array.isArray(obj.header.version) || !Array.isArray(obj.modules) || !obj.modules.length)
      errores.push(`${path}: faltan header, version o modules válidos.`);
    const packUuids = [obj.header, ...(Array.isArray(obj.modules) ? obj.modules : [])].map(x => x && x.uuid).filter(Boolean);
    if (packUuids.length !== 1 + (obj.modules || []).length) errores.push(`${path}: falta UUID en header o módulo.`);
    for (const x of packUuids) if (!RX_UUID4.test(String(x))) errores.push(`${path}: UUID no válido (${String(x).slice(0, 45)}).`);
    const scriptModules = (obj.modules || []).filter(m => m && m.type === "script");
    for (const mod of scriptModules) {
      const entry = String(mod.entry || "").replace(/^\/+/, "");
      const root = path.split("/")[0];
      if (!entry || !porRuta.has(`${root}/${entry}`)) errores.push(`${path}: el entry de script no existe (${entry || "vacío"}).`);
      if (!Array.isArray(obj.dependencies) || !obj.dependencies.some(d => d && d.module_name === "@minecraft/server" && d.version))
        errores.push(`${path}: falta dependencia versionada de @minecraft/server.`);
    }
  }
  const uuidOwners = new Map();
  for (const { path, obj } of manifests) {
    for (const x of [obj.header, ...(obj.modules || [])]) {
      const id = String(x && x.uuid || "").toLowerCase();
      if (!id) continue;
      if (uuidOwners.has(id)) errores.push(`UUID repetido en ${path} y ${uuidOwners.get(id)}.`);
      else uuidOwners.set(id, path);
    }
  }
  const rp = manifests.find(x => (x.obj.modules || []).some(m => m && m.type === "resources"));
  const bp = manifests.find(x => (x.obj.modules || []).some(m => m && (m.type === "data" || m.type === "script")));
  if (manifests.length && (!bp || !rp)) avisos.push("No se detectaron claramente los dos packs BP (behavior) y RP (resource). Revisa el tipo de pack solicitado.");
  if (bp && rp) {
    const deps = Array.isArray(bp.obj.dependencies) ? bp.obj.dependencies : [];
    if (!deps.some(d => d && d.uuid && String(d.uuid).toLowerCase() === String(rp.obj.header && rp.obj.header.uuid || "").toLowerCase()))
      errores.push("El Behavior Pack no declara dependencia del Resource Pack.");
    const rpDeps = Array.isArray(rp.obj.dependencies) ? rp.obj.dependencies : [];
    if (rpDeps.some(d => d && d.uuid && String(d.uuid).toLowerCase() === String(bp.obj.header && bp.obj.header.uuid || "").toLowerCase()))
      errores.push("Dependencia circular: el Resource Pack apunta al Behavior Pack.");
  }
  // Verifica las texturas declaradas en atlas de recursos.
  for (const atlasPath of ["RP/textures/item_texture.json", "RP/textures/terrain_texture.json"]) {
    const f = porRuta.get(atlasPath); if (!f || typeof f.content !== "string") continue;
    let atlas; try { atlas = JSON.parse(f.content); } catch { continue; }
    const data = atlas.texture_data || {};
    for (const [key, entry] of Object.entries(data)) {
      const raw = typeof entry === "string" ? entry : entry && entry.textures;
      const candidates = (Array.isArray(raw) ? raw : [raw]).filter(x => typeof x === "string");
      if (!candidates.length) { avisos.push(`${atlasPath}: la textura ${key} no contiene una ruta reconocible.`); continue; }
      for (const texture of candidates) {
        const clean = texture.replace(/^\//, "").replace(/\.(png|tga|jpg)$/i, "");
        if (!["png", "tga", "jpg"].some(ext => porRuta.has(`RP/${clean}.${ext}`)))
          errores.push(`${atlasPath}: falta el archivo de textura ${texture} (clave ${key}).`);
      }
    }
  }
  // Identificadores únicos en todo el Behavior Pack: un ID duplicado puede hacer que Minecraft ignore o mezcle recursos.
  const idsBP=new Map();
  for(const [path,f] of porRuta){if(!/^BP\/(items|blocks|entities)\/.+\.json$/i.test(path)||typeof f.content!=="string")continue;try{const j=JSON.parse(f.content);const root=j["minecraft:item"]||j["minecraft:block"]||j["minecraft:entity"];const id=root?.description?.identifier;if(!id)continue;const prev=idsBP.get(id);if(prev)errores.push(`Identificador duplicado ${id} en ${prev} y ${path}.`);else idsBP.set(id,path);}catch{}}
  // Valida bloques: material_instances -> clave del terrain atlas -> PNG existente.
  const atlasTerrain = (() => { const f=porRuta.get("RP/textures/terrain_texture.json"); if(!f||typeof f.content!=="string") return {}; try{return JSON.parse(f.content).texture_data||{};}catch{return {};} })();
  for(const [path,f] of porRuta){if(!/^BP\/blocks\/.+\.json$/i.test(path)||typeof f.content!=="string")continue;let o;try{o=JSON.parse(f.content)["minecraft:block"];}catch{continue;}const mi=o?.components?.["minecraft:material_instances"]||{};for(const [face,entry] of Object.entries(mi)){const key=entry?.texture;if(typeof key!=="string"||!key){errores.push(`${path}: material_instances ${face} no tiene clave de textura.`);continue;}if(!atlasTerrain[key])errores.push(`${path}: textura de bloque ${key} no está registrada en RP/textures/terrain_texture.json.`);}}
  // Valida iconos de ítems: JSON -> atlas -> PNG real.
  const atlasItems = (() => { const f=porRuta.get("RP/textures/item_texture.json"); if(!f||typeof f.content!=="string") return {}; try{return JSON.parse(f.content).texture_data||{};}catch{return {};} })();
  for (const [path,f] of porRuta) {
    if(!/^BP\/items\/.+\.json$/i.test(path)||typeof f.content!=="string") continue;
    let o; try{o=JSON.parse(f.content);}catch{continue;}
    const it=o["minecraft:item"]; const id=it?.description?.identifier; const icon=it?.components?.["minecraft:icon"];
    const key=typeof icon==="string"?icon:(icon?.textures?.default||icon?.texture||"");
    if(!key){errores.push(`${path}: el ítem ${id||"sin id"} no tiene icono declarado.`);continue;}
    const entry=atlasItems[key];
    if(!entry){errores.push(`${path}: el icono ${key} no está registrado en RP/textures/item_texture.json.`);continue;}
    const raw=typeof entry==="string"?entry:entry?.textures;
    const refs=(Array.isArray(raw)?raw:[raw]).filter(x=>typeof x==="string");
    if(!refs.length){errores.push(`${path}: la entrada de atlas ${key} no tiene ruta de textura.`);continue;}
    for(const ref of refs){const clean=ref.replace(/^\//,"").replace(/\.(png|tga|jpg)$/i,"");if(!["png","tga","jpg"].some(ext=>porRuta.has(`RP/${clean}.${ext}`)))errores.push(`${path}: falta el PNG de icono ${ref} (${key}).`);}
  }
  // Valida entidades de punta a punta: identifier BP == client_entity RP, geometría, textura, huevo y animaciones.
  const geometriaOwners=new Map(), texturaOwners=new Map();
  for (const [path,f] of porRuta) {
    if(!/^BP\/entities\/.+\.json$/i.test(path)||typeof f.content!=="string") continue;
    let bpEnt; try{bpEnt=JSON.parse(f.content)["minecraft:entity"];}catch{continue;}
    const id=bpEnt?.description?.identifier; if(!id){errores.push(`${path}: entidad sin identifier.`);continue;}
    const stem=path.split("/").pop().replace(/\.json$/i,"");
    const clientPath=`RP/entity/${stem}.entity.json`; const cf=porRuta.get(clientPath);
    if(!cf||typeof cf.content!=="string"){errores.push(`${path}: falta client_entity ${clientPath}; el huevo/representación visual no está enlazado.`);continue;}
    let ce; try{ce=JSON.parse(cf.content)["minecraft:client_entity"]?.description;}catch{errores.push(`${clientPath}: JSON de client_entity inválido.`);continue;}
    if(!ce||ce.identifier!==id) errores.push(`${clientPath}: identifier (${ce?.identifier||"vacío"}) no coincide con ${id}.`);
    if(!ce?.spawn_egg) errores.push(`${clientPath}: la entidad ${id} no declara spawn_egg.`);
    const geo=ce?.geometry?.default; const geoRef=typeof geo==="string"?geo:"";
    if(!geoRef) errores.push(`${clientPath}: no declara geometría propia.`);
    else {
      let encontrado=false,geoConExtremidades=false;
      for(const [gp,gf] of porRuta){if(!/^RP\/models\/entity\/.+\.geo\.json$/i.test(gp)||typeof gf.content!=="string")continue;try{const j=JSON.parse(gf.content);const g=(j["minecraft:geometry"]||[]).find(x=>x.description?.identifier===geoRef);if(g){encontrado=true;const bones=Array.isArray(g.bones)?g.bones:[];if(!bones.length||!bones.some(b=>Array.isArray(b.cubes)&&b.cubes.length))errores.push(`${gp}: geometría ${geoRef} no contiene huesos/cubos utilizables.`);geoConExtremidades=bones.some(b=>/^(pierna|brazo|pata)_/i.test(String(b.name||"")));const prev=geometriaOwners.get(geoRef);if(prev&&prev!==id)errores.push(`Geometría compartida ${geoRef} entre ${prev} y ${id}; cada criatura necesita modelo individual.`);else geometriaOwners.set(geoRef,id);break;}}catch{}}
      if(!encontrado) errores.push(`${clientPath}: no existe el archivo de geometría ${geoRef}.`);
      ce.__ego_geo_has_limbs=geoConExtremidades;
    }
    const tx=ce?.textures?.default; if(!tx) errores.push(`${clientPath}: falta textura default.`); else {
      const clean=String(tx).replace(/^\//,"").replace(/\.(png|tga|jpg)$/i,"");
      const exists=["png","tga","jpg"].some(ext=>porRuta.has(`RP/${clean}.${ext}`));
      if(!exists) errores.push(`${clientPath}: falta textura ${tx}.`);
      const prev=texturaOwners.get(clean);if(prev&&prev!==id) avisos.push(`Las entidades ${prev} y ${id} comparten textura ${tx}.`);else texturaOwners.set(clean,id);
    }
    const anims=ce?.animations||{}; const used=Array.isArray(ce?.scripts?.animate)?ce.scripts.animate:[];
    if(ce?.__ego_geo_has_limbs&&!used.length) errores.push(`${clientPath}: la geometría tiene extremidades móviles pero no tiene animación locomotora conectada.`);
    for(const alias of used){const animId=anims[alias];if(!animId){errores.push(`${clientPath}: script animate usa alias ${alias} sin declarar.`);continue;}let found=false;for(const [ap,af] of porRuta){if(!/^RP\/animations\/.+\.json$/i.test(ap)||typeof af.content!=="string")continue;try{if(JSON.parse(af.content).animations?.[animId]){found=true;break;}}catch{}}if(!found)errores.push(`${clientPath}: animación ${animId} no existe en RP/animations.`);}
  }
  // Scripts: errores sintácticos detectables y patrones API incompatibles no deben pasar como éxito.
  for(const [path,f] of porRuta){if(!/^BP\/scripts\/.+\.js$/i.test(path)||typeof f.content!=="string")continue;const bal=balanceJs(f.content);if(bal)errores.push(`${path}: posible error de sintaxis (${bal}).`);const lint=lintScriptApi(f.content,"2.10.0");for(const msg of lint.slice(0,4))errores.push(`${path}: ${msg}.`);}
  if (!manifests.length) errores.push("No se encontró ningún manifest.json.");
  return { ok: errores.length === 0, errores: [...new Set(errores)].slice(0, 80), avisos: [...new Set(avisos)].slice(0, 40), archivos: porRuta.size };
}

const RX_UUID4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function nuevoUuid(){return crypto.randomUUID();}
function repararAddon(files,verSrv){
  const avisos=[]; const usados=new Map(); const cambios=new Map();
  // Un .mcaddon son carpetas de packs en la raíz; los archivos sueltos de la raíz confunden a Minecraft.
  const carpetas=[...new Set(files.filter(f=>/^[^/]+\/manifest\.json$/i.test(f.path)).map(f=>f.path.split("/")[0]))];
  if(carpetas.length>=2){
    for(let k=files.length-1;k>=0;k--){
      const f=files[k]; if(f.path.includes("/")) continue;
      if(/^README\.md$/i.test(f.path)){ f.path=carpetas[0]+"/README.md"; }
      else { avisos.push(`Se quitó ${f.path} de la raíz (Minecraft solo espera las carpetas de los packs).`); files.splice(k,1); }
    }
  }
  const manifests=files.filter(f=>/(^|\/)manifest\.json$/i.test(f.path));
  if(!manifests.length) avisos.push("No se generó ningún manifest.json; el add-on no se podrá instalar.");
  const objs=[];
  for(const f of manifests){
    let o=null; try{o=JSON.parse(f.content);}catch{avisos.push(`${f.path} no es un JSON válido; corrígelo a mano.`);continue;}
    objs.push({f,o});
  }
  const ids=o=>[o?.header,...(Array.isArray(o?.modules)?o.modules:[])].filter(Boolean);
  for(const {f,o} of objs){
    for(const h of ids(o)){
      const u=String(h.uuid||"").toLowerCase();
      if(!RX_UUID4.test(u)||usados.has(u)){
        const n=nuevoUuid(); if(RX_UUID4.test(u)&&!cambios.has(u)) cambios.set(u,n);
        avisos.push(`UUID ${u?"repetido o inválido":"ausente"} en ${f.path}; se reemplazó por uno nuevo.`);
        h.uuid=n; usados.set(n,f.path);
      } else usados.set(u,f.path);
    }
  }
  // dependencias: el BP depende del RP (nunca al revés, sería circular) y el BP con script necesita @minecraft/server
  const esRP=o=>(o.modules||[]).some(m=>m&&m.type==="resources");
  const bp=objs.find(x=>!esRP(x.o)), rp=objs.find(x=>esRP(x.o));
  for(const x of objs){
    if(!Array.isArray(x.o.dependencies)) continue;
    const antes=x.o.dependencies.length;
    x.o.dependencies=x.o.dependencies.filter(d=>{
      if(!d) return false;
      if(d.module_name) return true;
      if(!d.uuid) return false;
      const dest=objs.find(y=>String(y.o.header?.uuid||"").toLowerCase()===String(d.uuid).toLowerCase());
      if(!dest) return false;
      if(dest===x) return false;
      if(x===rp&&dest===bp) return false;
      return true;
    });
    if(x.o.dependencies.length!==antes) avisos.push(`Se quitaron dependencias inválidas o circulares en ${x.f.path}.`);
  }
  if(bp&&rp&&!(bp.o.dependencies||[]).some(d=>d&&d.uuid&&String(d.uuid).toLowerCase()===String(rp.o.header.uuid).toLowerCase())){
    bp.o.dependencies=(bp.o.dependencies||[]).concat([{uuid:rp.o.header.uuid,version:rp.o.header.version||[1,0,0]}]);
    avisos.push("El Behavior Pack ahora depende del Resource Pack.");
  }
  if(bp&&(bp.o.modules||[]).some(m=>m&&m.type==="script")&&!(bp.o.dependencies||[]).some(d=>d&&d.module_name==="@minecraft/server")){
    bp.o.dependencies=(bp.o.dependencies||[]).concat([{module_name:"@minecraft/server",version:String(verSrv||"2.10.0")}]);
    avisos.push("Se añadió la dependencia @minecraft/server que faltaba.");
  }
  for(const x of objs) x.f.content=JSON.stringify(x.o,null,2)+"\n";
  // JSON restantes
  for(const f of files){ if(/\.json$/i.test(f.path)&&!/manifest\.json$/i.test(f.path)){ try{JSON.parse(f.content);}catch{ if(!/\/(lang|texts)\//.test(f.path)) avisos.push(`${f.path} no parece un JSON estricto (puede usar comentarios); revísalo si falla.`);} } }
  return avisos;
}

// ZIP clásico sin compresión (STORE), compatible con navegadores y Minecraft.
const CRC_TABLE = (()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);t[n]=c>>>0;}return t;})();
function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=CRC_TABLE[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function u16(n){return [n&255,(n>>>8)&255];} function u32(n){return [n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255];}
function concatBytes(parts){let len=parts.reduce((a,b)=>a+b.length,0),out=new Uint8Array(len),o=0;let pos=0;for(const p of parts){out.set(p,pos);pos+=p.length;}return out;}
async function createZip(files){
  const enc=new TextEncoder(), local=[], central=[];let offset=0;
  const ahora=new Date(), DT=((ahora.getUTCHours()<<11)|(ahora.getUTCMinutes()<<5)|(ahora.getUTCSeconds()>>1))&0xffff, DD=(((ahora.getUTCFullYear()-1980)<<9)|((ahora.getUTCMonth()+1)<<5)|ahora.getUTCDate())&0xffff;
  for(const f of files){const name=enc.encode(f.path),data=(typeof f.content==="string")?enc.encode(f.content):f.content,crc=crc32(data);
    const lh=new Uint8Array([...u32(0x04034b50),...u16(20),...u16(0x0800),...u16(0),...u16(DT),...u16(DD),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0),...name]);
    local.push(lh,data);
    const ch=new Uint8Array([...u32(0x02014b50),...u16(20),...u16(20),...u16(0x0800),...u16(0),...u16(DT),...u16(DD),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(offset),...name]);
    central.push(ch);offset+=lh.length+data.length;
  }
  const cd=concatBytes(central), end=new Uint8Array([...u32(0x06054b50),...u16(0),...u16(0),...u16(files.length),...u16(files.length),...u32(cd.length),...u32(offset),...u16(0)]);
  return concatBytes([...local,cd,end]);
}

// ============================================================
// 🚀 PRINCIPAL
// ============================================================

export default {
  async fetch(request, env) {
    try {
      const r = await manejar(request, env);
      const c = corsPara(request, env);
      if (c !== CORS) {
        const h = new Headers(r.headers);
        for (const k in c) h.set(k, c[k]);
        return new Response(r.body, { status: r.status, headers: h });
      }
      return r;
    } catch (e) {
      console.error("worker_unhandled", String(e && e.message || e).slice(0, 300));
      return json({ error: "Error interno del servidor. Revisa los logs del Worker." }, 500);
    }
  }
};

// ---------- Límite de peticiones (protege tu cuota de IA) ----------
// Se cuenta en la memoria del propio Worker (sin gastar escrituras de KV). Es aproximado: cada instancia de Cloudflare
// cuenta por separado y se reinicia si la instancia se recicla. Frena abusos evidentes; no es un límite exacto.
// Se puede cambiar con la variable LIMITE_POR_MINUTO (número). Con 0 se desactiva.
const LIMITE_DEFECTO = 30;
const _contador = new Map();
function limitar(request, env, ahora = Date.now()) {
  const max = env.LIMITE_POR_MINUTO !== undefined && env.LIMITE_POR_MINUTO !== "" ? Number(env.LIMITE_POR_MINUTO) : LIMITE_DEFECTO;
  if (!Number.isFinite(max) || max <= 0) return null;
  const id = request.headers.get("CF-Connecting-IP") || "sin-ip";
  const ventana = Math.floor(ahora / 60000);
  const e = _contador.get(id);
  if (!e || e.v !== ventana) {
    if (_contador.size > 5000) { for (const [k, x] of _contador) if (x.v !== ventana) _contador.delete(k); }
    _contador.set(id, { v: ventana, n: 1 });
    return null;
  }
  e.n++;
  if (e.n > max) return Math.max(1, 60 - Math.floor((ahora % 60000) / 1000));
  return null;
}

// CORS: por defecto abierto (como antes, para no romper la app). Para restringirlo crea la variable ALLOWED_ORIGINS
// con los orígenes separados por coma, por ejemplo: http://localhost,https://localhost,capacitor://localhost
function corsPara(request, env) {
  const lista = String(env.ALLOWED_ORIGINS || "").split(",").map(x => x.trim()).filter(Boolean);
  if (!lista.length) return CORS;
  const o = request.headers.get("Origin") || "";
  return { ...CORS, "Access-Control-Allow-Origin": lista.includes(o) ? o : lista[0], "Vary": "Origin" };
}

async function manejar(request, env) {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsPara(request, env) });
  const espera = limitar(request, env);
  if (espera) {
    return new Response(JSON.stringify({ error: "Demasiadas peticiones. Espera " + espera + " s e inténtalo de nuevo.", limite: true }), {
      status: 429, headers: { ...corsPara(request, env), "Content-Type": "application/json", "Retry-After": String(espera) }
    });
  }
  const url = new URL(request.url);
  const correoUsuario = obtenerCorreo(request, null);

  if (url.searchParams.get("web")) { const c = await contextoWeb(url.searchParams.get("web"), env, true); return json({ fuentes: c.fuentes, usadas: c.usadas, vista: c.texto.slice(0, 3000) }); }
  if (url.searchParams.has("venice")) {
    if (!veniceKey(env)) return json({ configurado: false, aviso: "Falta el secreto VENICE_API_KEY." });
    if (url.searchParams.get("venice") === "test") {
      try { const mod = (await veniceModelos(env, "code"))[0]; const t0 = Date.now(); const r = await veniceChat([{ role: "user", content: "Responde solo: ok" }], env, 30, mod); return json({ ok: true, modelo: mod, ms: Date.now() - t0, respuesta: String(r.content).slice(0, 40) }); }
      catch (e) { return json({ ok: false, error: String((e && e.message) || e).slice(0, 300), ayuda: "Venice rechazó la prueba: revisa saldo/créditos de la clave o el nombre del modelo." }); }
    }
    const cat = await veniceCatalogo(env);
    return json({ configurado: true, modelosEncontrados: cat.length, codigo: veniceRanking(cat, "code").slice(0, 5), razonamiento: veniceRanking(cat, "reasoning").slice(0, 5), chat: veniceRanking(cat, "chat").slice(0, 5), vision: veniceRanking(cat, "vision").slice(0, 5), imagenes: cat.map(veniceInfo).filter(i => i.tipo === "image").map(i => i.id).slice(0, 12), todos: cat.map(m => m && m.id).filter(Boolean).slice(0, 80) });
  }
  if (url.searchParams.has("health")) return json({
    ok: true, version: "14.23.0", projectValidator: true, autoRepair: true, aiConfigured: !!env.AI, veniceConfigured: !!veniceKey(env),
    memoryConfigured: !!env.EGO_MEMORY, libraryConfigured: !!env.EGO_BIBLIOTECA,
    openRouterFallbackConfigured: !!routerApiKey(env),
    teamConfigured: !!routerApiKey(env) && env.EGO_TEAM_MODE !== "0",
    teamMode: env.EGO_TEAM_MODE === "0" ? "off" : "on-if-router-key",
    teamModels: EGO_TEAM_MODELS,
    freeModels: OR_FREE
  });
  if (url.searchParams.get("diag")) return json(await runDiag(env, correoUsuario));

  // 🩺 Prueba real de la IA: abre  tu-worker.workers.dev/?probar=1  y te dice el motivo exacto si falla (p. ej. límite diario)
  if (url.searchParams.get("probar")) {
    // Cada prueba gasta uso de IA: solo corre con la clave secreta PROBAR_CLAVE (Cloudflare → Variables y secretos → Secreto).
    if (!env.PROBAR_CLAVE) return json({ aviso: "Crea el secreto PROBAR_CLAVE en Cloudflare y abre ?probar=TU_CLAVE" });
    if (url.searchParams.get("probar") !== env.PROBAR_CLAVE) return json({ error: "clave incorrecta" }, 403);
    const res = { modelos: {} };
    const todos = [...new Set([...CF_MODELS.codigo, ...CF_MODELS.razonar, ...CF_MODELS.rapido, ...CF_MODELS.vision, CF_MODELS.chat])];
    for (const m of todos) {
      try {
        const extra = /deepseek-v4/.test(m) ? { reasoning_effort: "low" } : {};
        const r = await cfChat(m, [{ role: "user", content: "Responde solo: ok" }], env, 64, extra);
        res.modelos[m] = "ok" + (r.content ? ": " + r.content.slice(0, 20) : " (sin texto)");
      } catch (e) { res.modelos[m] = "FALLA: " + String(e && e.message || e).slice(0, 160); }
    }
    res.embeddings = (await embeber(env, ["prueba"])) ? "ok" : "no responde";
    return json(res);
  }

  if (request.method !== "POST") {
    return new Response("🧠 EGO AI v14.24.0 — Código, matemáticas, ciencias y creación\n\n" +
      `📖 Biblioteca: ${env.EGO_BIBLIOTECA ? '✅' : '❌'}\n` +
      `👤 Perfiles: ${env.EGO_PERFILES ? '✅' : '❌'}\n` +
      "🔒 Enseñanza: solo el creador (sesión verificada)",
      { headers: { ...CORS, "Content-Type": "text/plain" } });
  }

  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return json({ error: "Content-Type debe ser application/json" }, 415);
  }
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  const maxBodyBytes = Number(env.MAX_BODY_BYTES || 6000000);
  if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) {
    return json({ error: "Solicitud demasiado grande", maxBytes: maxBodyBytes }, 413);
  }
  let rawBody;
  try { rawBody = await request.text(); }
  catch { return json({ error: "No se pudo leer el cuerpo" }, 400); }
  if (new TextEncoder().encode(rawBody).byteLength > maxBodyBytes) {
    return json({ error: "Solicitud demasiado grande", maxBytes: maxBodyBytes }, 413);
  }
  let body;
  try { body = JSON.parse(rawBody); }
  catch { return json({ error: "JSON inválido" }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "El cuerpo debe ser un objeto JSON" }, 400);

  const usuario = cleanUser(body.usuario || correoUsuario || "default");
  const textoUsuario = lastUserText(body.messages || []).text;

  // 🎓 COMANDOS DEL CREADOR: estudiar / borrar / listar lecciones.
  // SOLO con idToken de Firebase verificado del correo oficial. El encabezado X-Usuario-Correo
  // y el campo "correo" del cuerpo se ignoran por completo: se pueden falsificar.
  const PRE = `^[\\s"'“”‘’«»¡!¿]*`;
  const POST = `[\\s"'“”‘’«»]*$`;
  const FONDO = `(?:\\s+y\\s+(?:aprend[eé]lo|apr[eé]ndelo|estud[ií]alo|est[uú]dialo))?(?:\\s+(?:con|a)\\s+(?:profundidad|fondo))?`;
  const cmdEstudiar =
    textoUsuario.match(new RegExp(PRE + `(?:estudia|est[uú]dia|aprende|guarda en la biblioteca)(?:\\s+(?:esto|eso|lo siguiente|que))?${FONDO}\\s*:\\s*([\\s\\S]+?)` + POST, "i")) ||
    textoUsuario.match(new RegExp(PRE + `(?:estudia|est[uú]dia|aprende)\\s+(?:esto|eso|lo siguiente)${FONDO}[ \\t]*[\\r\\n]+([\\s\\S]+?)` + POST, "i"));
  const cmdBorrar = textoUsuario.match(new RegExp(PRE + `(?:borra|elimina)\\s+la\\s+lecci[oó]n\\s*:\\s*([\\s\\S]+?)` + POST, "i"));
  const cmdListar = RX_LISTAR.test(textoUsuario);

  let sesionAdmin = null;
  if (cmdEstudiar || cmdBorrar || cmdListar) sesionAdmin = await verificarAdmin(body.idToken);

  // Enseñar o borrar sin ser el creador verificado: no se guarda NADA en ninguna parte.
  if ((cmdEstudiar || cmdBorrar) && !sesionAdmin) {
    return json({ reply: MSG_NO_APRENDE, error: "no_autorizado" });
  }

  await sembrarBase(env);   // solo datos fijos de fábrica del propio código

  if (cmdBorrar) {
    const b = await borrarLeccion(env, cmdBorrar[1].trim(), sesionAdmin);
    return json({ reply: b ? `🗑️ Lección borrada: ${b.titulo}` : "No encontré una lección con ese nombre. Escribe \"¿Qué lecciones has estudiado?\" para ver la lista.", administrador: true });
  }
  if (cmdEstudiar) {
    const contenido = cmdEstudiar[1].trim();
    if (contenido.length < 20) return json({ reply: "Envíame el material completo después de los dos puntos y lo estudio a fondo.", administrador: true });
    const r = await guardarLeccion(env, contenido, sesionAdmin);
    if (!r) return json({ reply: "⚠️ La Biblioteca (EGO_BIBLIOTECA) no está conectada al Worker.", error: "sin_biblioteca" });
    return json({ reply: respuestaEstudio(r), administrador: true, tema: r.leccion.titulo, lecciones: r.total });
  }
  // 📋 Lista de lecciones: solo para el creador. Para cualquier otro es un mensaje de chat normal.
  if (cmdListar && sesionAdmin) {
    const idx = await leerIndiceLecciones(env);
    return json({ reply: idx.length ? "📚 Lecciones que he estudiado:\n" + idx.map((x, i) => `${i + 1}. ${x.titulo}`).join("\n") : "Todavía no me han enseñado lecciones.", administrador: true });
  }

  if (body.ping) return json({ 
    ok: true, v: "14.23.0", memoriaPersonal: !!env.EGO_MEMORY, biblioteca: !!env.EGO_BIBLIOTECA 
  });

  if (body.recall || body.action === "recall") {
    const memorias = await leerListaPersonal(env, usuario);
    const biblioteca = await leerBiblioteca(env);
    const lecs = await leerIndiceLecciones(env);
    const perfil = correoUsuario ? await leerPerfil(env, correoUsuario) : null;
    return json({
      reply: `📚 Lo que recuerdo:\n\n` +
        (lecs.length ? `=== LECCIONES ESTUDIADAS ===\n${lecs.map(x => x.titulo).join("\n")}\n\n` : "") +
        (biblioteca.length ? `=== CONOCIMIENTO COMPARTIDO ===\n${biblioteca.map(m => `${m.tema}: ${m.contenido}`).join("\n")}\n\n` : "") +
        (memorias.length ? `=== TUS RECUERDOS ===\n${memorias.map((m,i)=>`${i+1}. ${m.contenido}`).join("\n")}` : "Todavía no me has contado nada personal.") +
        (perfil?.nombre ? `\n👤 Tu nombre: ${perfil.nombre}` : ""),
      cantidadPersonal: memorias.length,
      cantidadBiblioteca: biblioteca.length + lecs.length
    });
  }

  if (body.forget && env.EGO_MEMORY) {
    await env.EGO_MEMORY.delete(`historial:${usuario}`);
    return json({ ok: true });
  }

  if (body.summarize) {
    const prev = String(body.prev || "").slice(0, 3000);
    const text = String(body.text || "").slice(0, 12000);
    try {
      const r = await cfChat(CF_MODELS.chat, [
        { role: "system", content: "Resume en español, en máximo 12 líneas." },
        { role: "user", content: (prev ? "Resumen previo:\n" + prev + "\n\n" : "") + "Conversación:\n" + text }
      ], env, 700);
      return json({ summary: r.content.trim() });
    } catch (e) { return json({ error: "Resumen: " + e.message }, 500); }
  }

  // Capacidades creativas: generación visual y proyectos empaquetados.
  if (body.action === "image_generate") return await generarImagen(body, env);
  if (body.action === "image_edit") return await editarImagen(body, env);
  if (body.action === "texture_generate") return await generarTextura(body, env);
  if (body.action === "tts" || body.action === "voice_generate" || body.action === "addon_voice") return await generarVoz(body, env, request);
  if (body.action === "web_search") { const q = String(body.query || "").slice(0, 300); if (!q) return json({ error: "Falta query" }, 400); const c = await contextoWeb(q, env, true); return json({ ok: true, fuentes: c.fuentes, usadas: c.usadas, contexto: c.texto }); }
  if (body.action === "mc_plan") return await mcPlan(body, env);
  if (body.action === "mc_part") return await mcPart(body, env);
  if (body.action === "mc_build") return await mcBuild(body, env, request);
  if (body.action === "project_generate" || body.action === "minecraft_generate") {
    return await generarProyecto(body, env, body.action === "minecraft_generate", request);
  }
  if (body.image || body.editImage) {
    return json({ error: "Usa action=image_generate para crear, action=image_edit con la imagen original para editar, o envía imágenes en messages para analizarlas." }, 400);
  }

  // ============================================================
  // 💬 CHAT PRINCIPAL
  // ============================================================

  const mensajes = Array.isArray(body.messages) ? body.messages : [];
  if (!mensajes.length) return json({ error: "Faltan los mensajes" }, 400);
  if (mensajes.length > 80) return json({ error: "Demasiados mensajes; máximo 80" }, 400);
  const rolesValidos = new Set(["system", "user", "assistant"]);
  for (const m of mensajes) {
    if (!m || typeof m !== "object" || !rolesValidos.has(m.role)) return json({ error: "Formato de mensajes inválido" }, 400);
    if (!(typeof m.content === "string" || Array.isArray(m.content))) return json({ error: "Contenido de mensaje inválido" }, 400);
    if (typeof m.content === "string" && m.content.length > 100000) return json({ error: "Un mensaje supera el límite de 100000 caracteres" }, 413);
  }
  const { text, hasImage } = lastUserText(mensajes);

  // 🧠 Aprendizaje personal
  const aprendidos = detectarAprendizaje(text);
  let memoriasPersonales = [], confirmacion = "";
  if (aprendidos.length && correoUsuario) {
    const g = await guardarAprendizajes(env, usuario, aprendidos);
    memoriasPersonales = g.lista;
    if (g.ok) confirmacion = `\n\n🧠 ¡Lo recordé al instante!`;
    const mNombre = text.match(/(?:[Mm]e llamo|[Mm]i nombre es)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)/);
    if (mNombre) await guardarPerfil(env, correoUsuario, { nombre: mNombre[1] });
  } else {
    memoriasPersonales = await leerListaPersonal(env, usuario);
  }

  // 📖 Cargar biblioteca y perfil
  const biblioteca = await leerBiblioteca(env);
  const perfil = correoUsuario ? await leerPerfil(env, correoUsuario) : null;

  // 🎓 Lecciones relacionadas con lo que pide (usa también el mensaje anterior si este es corto)
  const usuariosPrev = mensajes.filter(m => m?.role === "user").map(m => textOf(m.content));
  const consultaL = text.length < 60 ? usuariosPrev.slice(-3).join(" ") : text;
  const lecciones = await elegirLecciones(env, consultaL);

  // 📝 Contexto completo
  let contextoExtra = textoLecciones(lecciones);
  
  if (biblioteca.length > 0) {
    contextoExtra += `\n\n=== CONOCIMIENTO COMPARTIDO ===\n`;
    let usadoL = 0;
    biblioteca.forEach(t => {
      const linea = `${t.tema}: ${t.contenido}\n`;
      if (usadoL + linea.length > PRESUPUESTO_LEGADO) return;
      usadoL += linea.length;
      contextoExtra += linea;
    });
    contextoExtra += `===============================\n`;
  }

  if (memoriasPersonales.length > 0) {
    contextoExtra += `\n=== RECORDATORIOS PERSONALES ===\n${memoriasPersonales.map(m => `${m.tema}: ${m.contenido}`).join("\n")}\n================================\n`;
  }

  if (perfil && perfil.nombre) {
    contextoExtra += `\n👤 USUARIO: Se llama ${perfil.nombre}. Salúdalo por su nombre.\n`;
  } else if (perfil) {
    contextoExtra += `\n👤 Usuario con sesión iniciada.\n`;
  } else {
       contextoExtra += `\n👤 Sin sesión. No pidas datos personales.\n`;
  }

  // 💬 Armar mensajes
  const sistemaApp = mensajes.filter(m => m?.role === "system").map(m => textOf(m.content)).join("\n\n");
  const noSys = mensajes.filter(m => m?.role !== "system");
  // Los mensajes viejos muy largos (p. ej. lecciones pegadas) se recortan para no llenar el contexto
  const restoMsgs = noSys.map((m, i) => (i < noSys.length - 1 && typeof m.content === "string" && m.content.length > 4000)
    ? { ...m, content: m.content.slice(0, 1500) + "\n[…mensaje largo recortado…]" } : m);
  const sys = {
    role: "system",
    content: EGO_MANUAL + contextoExtra + (sistemaApp ? "\n\n" + sistemaApp : "")
  };
  const msgs = [sys, ...restoMsgs];

  // ⏱️ Medimos el tiempo para no encadenar una revisión si la respuesta ya tardó mucho
  const t0 = Date.now();
  // 🌐 Internet: si lo pides ("busca en internet…") o es algo que cambia (versiones, noticias, precios), consulta varias fuentes antes de responder
  let webFuentes = [];
  if (!hasImage && (body.web === true || (body.web !== false && (RX_WEB_PEDIDA.test(text) || (RX_WEB.test(text) && !RX_CONSTRUIR.test(text))) && RX_WEB.test(text) && text.length < 1500))) {
    try { const cw = await contextoWeb(text, env, body.web === true); if (cw.texto) { sys.content += cw.texto; webFuentes = cw.fuentes; } } catch (e) {}
  }
  const msgsL = limpiarImagenes(msgs);
  const conImagen = tieneImagen(msgsL[msgsL.length - 1]);
  const tipo = tipoTarea(text);
  const cadena = CF_MODELS[tipo === "razonar" ? "razonar" : tipo === "rapido" ? "rapido" : "codigo"];
  const base = { memoriaPersonal: memoriasPersonales.length, biblioteca: biblioteca.length };

  // 👁️ VISIÓN: imágenes y fotogramas de video
  if (conImagen) {
    if (!env.AI && !routerApiKey(env)) return json({ error: "Visión no disponible" }, 503);
    // Si piden resolver algo de código o matemáticas: visión lee → modelo fuerte resuelve
    if (RX_CODIGO.test(text) || RX_MATE.test(text)) {
      try {
        const lectura = await leerVisual(msgsL, env, text);
        if (lectura) {
          const r = await cfChatSeguro(cadena, conLectura(msgsL, lectura), env, 8000);
          return json({ reply: r.content + confirmacion, tipo: "imagen", modelo: r.model, lecturaVisual: true, fallos: r.fallos, ...base });
        }
      } catch {}
    }
    try {
      const r = await cfVision(msgsL, env);
      return json({ reply: r.content + confirmacion, tipo: "imagen", modelo: r.model, ...base });
    } catch (e) { return json({ error: "No pude leer la imagen ahora mismo (" + String(e.message || e).slice(0, 120) + "). Inténtalo de nuevo en un momento." }, 503); }
  }

  // 💬 RESPUESTA FINAL DEL CHAT
  if (!env.AI) return json({ error: "No hay modelos disponibles" }, 503);
  try {
    const r = await cfChatSeguro(cadena, msgsL, env, tipo === "rapido" ? 2000 : 8000);
    let revisado = false;
    // 🔎 Segunda pasada para construir código, apps y juegos: un revisor senior corrige y completa el borrador
    if (REVISAR && tipo === "codigo" && RX_CONSTRUIR.test(text) && r.content.length > 1200 && Date.now() - t0 < 70000) {
      try {
        const rev = await cfChatSeguro(CF_MODELS.codigo, [
          { role: "system", content:
            "Eres un revisor senior y exigente. Recibes la petición de un usuario y un BORRADOR de respuesta. Compáralo con las lecciones y criterios de calidad de abajo (si las hay). " +
            "Corrige errores (sintaxis, variables no definidas, partes omitidas, funciones faltantes), completa lo que falte y mejora la calidad. " +
            "Devuelve ÚNICAMENTE la versión final completa de la respuesta para el usuario, en español, sin comentarios sobre la revisión y sin recortar nada." + textoLecciones(lecciones) },
          { role: "user", content: "PETICIÓN:\n" + text.slice(0, 3000) + "\n\nBORRADOR:\n" + r.content }
        ], env, 8000);
        const f = String(rev.content || "").trim();
        if (f.length >= r.content.length * 0.75) { r.content = f; revisado = true; }
      } catch {}
    }
    return json({
      reply: r.content + confirmacion + (webFuentes.length ? "\n\n🌐 Fuentes consultadas:\n" + webFuentes.map(f => "- " + f.titulo + " — " + f.url).join("\n") : ""),
      fuentes: webFuentes,
      revisado,
      modelo: r.model,
      tipoTarea: tipo,
      fallos: r.fallos,
      ...base,
      leccionesUsadas: lecciones.map(l => l.titulo),
      tienePerfil: !!perfil,
      nombreUsuario: perfil?.nombre || null,
      fuente: "cloudflare"
    });
  } catch (e) {
    console.error("chat:", e && e.message);
    return json({ error: "Chat: " + String(e.message || e) }, 503);
  }
}
