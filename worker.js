/*
 * EGO AI — núcleo de ejecución y servicios
 *  - balanceJs reescrito: entiende regex literales, plantillas anidadas y comentarios (0 falsos positivos en 281 JS reales; el anterior daba 16).
 *  - Validador estructural con severidades: CRITICO (bloquea), ADVERTENCIA, INFORMATIVO. Solo lo crítico impide exportar.
 *  - Spawn rules de mobs vanilla (minecraft:*) aceptadas; client_entity se busca por identificador; eventos system.* reconocidos.
 *  - Reparación: paso determinista previo (JSON, entry del manifest, rutas de atlas, spawn_egg) + modelos reparadores con respaldo,
 *    creación de archivos faltantes permitidos, rechazo de parches destructivos, reversión si no hay progreso, historial y modelos usados.
 *  - Respuesta 422 con criticos[] {archivo, problema, causa, solucion}, advertencias[] y reparacion{}; cabeceras compactas (JSON válido).
 *  - v14.45: failover valida el formato de respuesta; auditoría semántica y reparación de requisitos; no empaqueta cobertura incompleta.
 *  - v14.46: registra fallos de módulos con proveedor, validación, tiempo y errores; alinea versión de health/diag/raíz.
 *  - Proveedores y secretos existentes conservados. Secretos de Cloudflare sin cambios.
 */
// ============================================================
// EGO AI WORKER v14.59.0 — BÚSQUEDA WEB REPARADA, MODELOS POR PROVEEDOR EN VIVO, ESQUEMA OFICIAL DE ENTIDADES, MEMORIA DEL CREADOR EN ADD-ONS, MEMORIA DE ERRORES, PARTÍCULAS OFICIALES (AURA VISIBLE), PODER REAL EN ARMADURAS, SIN COFRES NO PEDIDOS, BASE OFICIAL DE MOBS VANILLA, AUDITORÍA CON CÓDIGO REAL, REVISOR DE TIPOS CONTRA LA API OFICIAL DE MOJANG, REFERENCIA OFICIAL PARA LOS MODELOS, ESQUEMAS OFICIALES, ARREGLOS AUTOMÁTICOS DE EVENTOS, REPARADOR MÁS RÁPIDO, ARMADURA PUESTA, ÍCONOS POR PIEZA, SIN PODERES/KIT NO PEDIDOS, SIN ERRORES EN EL CHAT, GUÍA DE ERRORES REALES, PLANTILLAS DE RESPALDO, 7 AGENTES, MODELOS EN VIVO, ENTREGA PARCIAL, NORMALIZADOR DE ESQUEMAS BEDROCK
// ============================================================

// Cada cadena se prueba en orden: si un modelo falla (p. ej. tu plan de Cloudflare no lo incluye) pasa al siguiente.
const MODELO_RAPIDO = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
// Equipo colaborativo opcional: requiere ROUTER_API_KEY u OPENROUTER_API_KEY.
// Los IDs son los identificadores públicos de OpenRouter; no son modelos de Workers AI.
const EGO_TEAM_MODELS = {
  planner: "nvidia/nemotron-3-ultra-550b-a55b",
  reasoner: "deepseek/deepseek-v4.1-flash-1017",
  coder: "z-ai/glm-5.3-flash",
  auditor: "qwen/qwen3.8-27b",
  // v14.47.2: equipo ampliado a 7 agentes (cada uno con su especialidad)
  datos: "moonshotai/kimi-k3",          // escribe JSON de ítems/entidades/bloques/recetas
  api: "z-ai/glm-5.3-flash",  // revisor de compatibilidad con la API/versión
  reparador: "z-ai/glm-5.3"             // corrige los defectos que encuentran los revisores
};
// Preferencias por rol: el worker consulta el catálogo vivo de OpenRouter y elige el mejor modelo DISPONIBLE
// que coincida (según rankings de código de noviembre 2026: Kimi K3, GLM-5.3, DeepSeek V4.1 Flash, Qwen3.8).
const EGO_ROLE_PREF = {
  // v14.52: orden según SWE-bench (Morph, 9-nov-2026): DeepSeek V4 Pro 96.4 > GLM-5.3 95.4 > Kimi K3 93.4 > GLM-5.3-Flash 92.0 > DeepSeek V4 Flash 88.8
  planner:   [/deepseek-v4-pro/, /glm-5\.3(?!-flash)/, /kimi-k3/, /nemotron-3-ultra/],
  coder:     [/deepseek-v4-pro/, /glm-5\.3(?!-flash)/, /kimi-k3/, /glm-5\.3-flash/, /deepseek-v4\.1-flash/, /qwen3\.8/],
  datos:     [/kimi-k3/, /glm-5\.3(?!-flash)/, /deepseek-v4-pro/, /glm-5\.3-flash/, /deepseek-v4\.1-flash/],
  reasoner:  [/deepseek-v4-pro/, /kimi-k3/, /deepseek-v4\.1-flash/],
  auditor:   [/glm-5\.3(?!-flash)/, /qwen3\.8-27b/, /glm-5\.3-flash/, /deepseek-v4\.1-flash/],
  api:       [/glm-5\.3-flash/, /deepseek-v4\.1-flash/, /qwen3\.8/],
  reparador: [/deepseek-v4-pro/, /glm-5\.3(?!-flash)/, /kimi-k3/, /deepseek-v4\.1-flash/]
};
const CF_MODELS = {
  chat: MODELO_RAPIDO,   // resúmenes y tareas rápidas
  // Fallbacks ordenados: primero un modelo Cloudflare de disponibilidad amplia;
  // después Gemma/Qwen. DeepSeek queda al final porque puede no estar habilitado
  // en todas las cuentas. GLM-5.3 se omite aquí: puede requerir facturación de pago.
  // Cada modelo se prueba en runtime y un fallo pasa al siguiente.
  codigo:  [MODELO_RAPIDO, "@cf/google/gemma-4-26b-a4b-it", "@cf/qwen/qwen3.8-27b", "@cf/deepseek-ai/deepseek-v4.1-flash-1017"],
  razonar: [MODELO_RAPIDO, "@cf/google/gemma-4-26b-a4b-it", "@cf/qwen/qwen3.8-27b", "@cf/deepseek-ai/deepseek-v4.1-flash-1017"],
  rapido:  [MODELO_RAPIDO, "@cf/google/gemma-4-26b-a4b-it", "@cf/qwen/qwen3.8-27b"],
  vision:  ["@cf/qwen/qwen3.8-27b", "@cf/google/gemma-4-26b-a4b-it", MODELO_RAPIDO]
};

// Correo OFICIAL de EGO AI: solo con esta cuenta (sesión verificada por Google) se puede enseñar a EGO.
// Está fijo en el código a propósito: ninguna variable de entorno puede cambiarlo.
const ADMIN_CORREO = ["egoai.oficial2026", "gmail.com"].join("@");
const FIREBASE_PROJECT_ID = "ego-ai-724b8";
const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, X-Usuario-Correo, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
  "Access-Control-Expose-Headers": "Content-Disposition, X-EGO-Files, X-EGO-Model, X-EGO-Avisos, X-EGO-Resumen, X-EGO-Ficha, X-EGO-Spec, X-EGO-NoAplicado, X-EGO-Notas, X-EGO-Validacion, X-EGO-Reparacion, X-EGO-Cobertura, X-EGO-Parcial, X-EGO-Bytes, X-EGO-Limit, X-EGO-Safe, X-EGO-Tam, X-EGO-Dup, X-EGO-MaxFiles"
};

const MSG_NO_APRENDE = "EGO AI no puede aprender de los usuarios. Solo su creador puede enseñarle.";
const RX_LISTAR = /^[\s¿¡]*(?:qu[eé]\s+(?:lecciones\s+)?has\s+(?:estudiado|aprendido)|(?:mis\s+|las\s+)?lecciones(?:\s+estudiadas)?)[\s?!.]*$/i;

const EGO_MANUAL = `Eres EGO AI, una IA especializada en PROGRAMACIÓN, MATEMÁTICAS, CIENCIAS y CREACIÓN DE APPS Y JUEGOS. Habla en español de forma clara y directa.

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
    return { email: payload.email.trim().toLowerCase(), uid: payload.sub };
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

function obtenerToken(request, body) {
  const auth = String(request.headers.get("Authorization") || "");
  const bearer = auth.match(/^Bearer\s+(.+)$/i);
  return (bearer && bearer[1]) || body?.idToken || null;
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
// Cuatro especialistas trabajan en paralelo y un coordinador integra sus respuestas.
// Si uno o varios proveedores fallan, el equipo continúa con los que sí respondan;
// si falla la síntesis, se devuelve la mejor respuesta individual disponible.
async function egoTeamChat(messages, env, maxTokens, task = "reasoning") {
  if ((!routerApiKey(env) && !egoExternalProviders(env).length && !env.AI) || env.EGO_TEAM_MODE === "0") return null;

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
  const ejecutarRol = async ([key, rolePrompt], contextoExtra = "") => {
    const model = EGO_TEAM_MODELS[key];
    const mensajesRol = esProyecto
      ? (key === "coder" ? base : contextoNoImplementador).map(m => ({...m}))
      : base.map(m => ({...m}));
    if (esProyecto && contextoExtra) mensajesRol.push({ role: "user", content: `RESULTADOS DE ETAPAS ANTERIORES (úsalos como contexto, no los contradigas sin explicar):\n${contextoExtra.slice(0,18000)}` });
    const tokensRol = esProyecto ? (key === "coder" ? Math.max(5000, Math.min(14000, Math.floor(maxTokens * 0.78))) : 1800) : memberTokens;
    try {
      const r = await egoRoleChat(key, [
        { role: "system", content: `${rolePrompt}\nTarea: ${task}. No inventes pruebas ni APIs.` },
        ...mensajesRol
      ], env, tokensRol);
      return { key, model: r.model || model, content: String(r.content || "").trim(), fallos: r.fallos || [] };
    } catch (e) {
      return { key, model, content: "", error: String(e?.message || e).slice(0, 150) };
    }
  };
  let results;
  if (esProyecto) {
    // Secuencia real: plan -> revisión técnica -> implementación -> auditoría del resultado del implementador.
    results = [];
    let acumulado = "";
    for (const role of roles) {
      const r = await ejecutarRol(role, acumulado);
      results.push(r);
      if (r.content) acumulado += `\n\nETAPA ${r.key.toUpperCase()}:\n${r.content}`;
      // Si falla un rol, los demás continúan con el contexto disponible.
    }
  } else {
    results = await Promise.all(roles.map(role => ejecutarRol(role)));
  }

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
    const final = await egoRoleChat("planner", synthesisMessages, env, maxTokens);
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
  for (const m of cadena) {
    try {
      const extra = /deepseek-v4/.test(m) ? { reasoning_effort: "high" } : {};
      const r = await cfChat(m, messages, env, maxTokens, extra);
      if (r.content) return { ...r, fallos };
      fallos.push(m + ": respuesta vacía");
    } catch (e) { fallos.push(m + ": " + String(e && e.message || e).slice(0, 120)); }
  }
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

function clasificarErrorProveedor(status, detalle = "") {
  const s = Number(status)||0, d=String(detalle||"");
  if (s===400) return { tipo:"parametros", reintentar:false };
  if (s===401 || s===403) return { tipo:"autenticacion_permisos", reintentar:false };
  if (s===402) return { tipo:/max[_ ]tokens|only afford|fewer max_tokens|token budget/i.test(d)?"presupuesto_tokens":"creditos", reintentar:/max[_ ]tokens|only afford|fewer max_tokens|token budget/i.test(d) };
  if (s===404) return { tipo:"modelo_o_ruta", reintentar:false };
  if (s===408 || s===429 || s===500 || s===502 || s===503 || s===504) return { tipo:"temporal", reintentar:true };
  if (s===413) return { tipo:"solicitud_grande", reintentar:false };
  return { tipo:"proveedor", reintentar:false };
}
function pausa(ms) { return new Promise(resolve => setTimeout(resolve, Math.max(0, Math.min(2500, ms)))); }

async function openRouterChat(messages, env, maxTokens, model = env.OPENROUTER_MODEL, timeoutMs = 55000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(5000, Math.min(110000, Number(timeoutMs) || 55000)));
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
    // Un único reintento controlado para límites temporales; 402 solo se reduce si el proveedor menciona tokens.
    for (let intento = 0; intento < 2; intento++) {
      response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST", signal: controller.signal, headers,
        body: JSON.stringify({ model, messages: normalized, max_tokens: usado, temperature: 0.2 })
      });
      data = await response.json().catch(() => ({}));
      if (response.ok) break;
      const detalle = String(data?.error?.message || data?.message || "proveedor rechazó la solicitud");
      const clase = clasificarErrorProveedor(response.status, detalle);
      if (intento === 0 && response.status === 402 && clase.tipo === "presupuesto_tokens") {
        usado = Math.max(64, Math.min(255, Math.floor(usado * 0.35)));
        continue;
      }
      if (intento === 0 && clase.reintentar && response.status !== 402) {
        const retryAfter = Number(response.headers.get("Retry-After")) * 1000;
        await pausa(retryAfter || 650);
        continue;
      }
      throw new Error(`HTTP ${response.status} [${clase.tipo}]: ${detalle.slice(0, 180)}`);
    }
    if (!response?.ok) throw new Error(`HTTP ${response?.status || 502}: ${String(data?.error?.message || "proveedor rechazó la solicitud").slice(0, 180)}`);
    const content = salida(data);
    if (!content) throw new Error("respuesta vacía");
    return { content, model: `openrouter:${model}`, maxTokensUsados: usado };
  } finally { clearTimeout(timer); }
}

// ===== PROVEEDORES EXTERNOS ADICIONALES (claves independientes en Cloudflare) =====
// Orden predeterminado para esta instalación: Gemini -> Cohere -> SambaNova -> otros si se agregan.
// Hugging Face (HF_TOKEN) se conserva para la ruta de imágenes; no se fuerza como chat sin modelo/permisos confirmados.
// Todos los modelos son configurables por variables EGO_*_MODEL. Los IDs por defecto
// solo se usan donde existe una opción ampliamente documentada; SambaNova/NVIDIA
// exigen modelo explícito para evitar llamar IDs que no estén habilitados en la cuenta.
// v14.55: cada proveedor externo descubre en vivo sus modelos (GET /models) y se elige el mejor para código/razonamiento.
// Antes se usaba UN modelo fijo por proveedor (p. ej. SambaNova con Llama 3.3 aunque tenía DeepSeek V3.1).
const EGO_EXT_EXCLUIR=/embed|whisper|tts|guard|moderation|vision|\bvl\b|image|audio|rerank|ocr|live|transcribe|translate|omni|nano|banana|tiny|safeguard|flash-lite|-lite|(?:^|[-_/ ])(?:[1-9]|1[0-9])b(?:[^a-z\d]|$)|instruct-?0?[1-9]b/i;
const EGO_EXT_PREF={
  code:[/deepseek-v4(?!.*flash)/i,/glm-5\.3(?!-flash)/i,/kimi-k3/i,/gemini-3\.8-flash$/i,/devstral/i,/qwen-?3\.8|qwen3?-?coder|qwen3-?(?:235|480)/i,/gpt-oss-120b/i,/deepseek-v3\.2|deepseek-v3\.1|deepseek-v3/i,/codestral/i,/nemotron.*(?:super|ultra)/i,/mistral-(?:large|medium)/i,/llama.*(?:405|maverick|70b)/i],
  reasoning:[/gemini-4/i,/deepseek-v4(?!.*flash)/i,/glm-5\.3(?!-flash)/i,/kimi-k3/i,/gemini-3\.8-flash$/i,/gpt-oss-120b/i,/qwen-?3\.8|qwen3-?(?:235|480)/i,/deepseek-r1|deepseek-v3/i,/mistral-(?:large|medium)/i,/nemotron.*(?:super|ultra)/i,/llama.*(?:405|maverick|70b)/i]
};
async function egoExtDescubrir(env){
  try{
    const g=globalThis.__egoExtCache;
    if(g&&Date.now()-g.t<3600000)return;
    if(g&&g.run)return g.run;
    const defs=egoExternalProviders(env,"code",true).filter(d=>d.kind==="openai");
    if(!defs.length)return;
    const run=(async()=>{
      const m={};
      await Promise.all(defs.map(async d=>{
        const ctl=new AbortController();const tm=setTimeout(()=>ctl.abort(),3500);
        try{
          const r=await fetch(d.url.replace(/\/chat\/completions$/,"/models"),{headers:{"Authorization":"Bearer "+String(d.key).trim()},signal:ctl.signal});
          if(!r.ok)return;const j=await r.json();
          const ids=(Array.isArray(j.data)?j.data:Array.isArray(j.models)?j.models:[]).map(x=>String(x&&(x.id||x.name)||"").replace(/^models\//,"")).filter(Boolean);
          if(ids.length)m[d.id]=ids;
        }catch(_){}finally{clearTimeout(tm);}
      }));
      globalThis.__egoExtCache={t:Date.now(),m};
    })();
    globalThis.__egoExtCache={t:g?g.t:0,m:g?g.m:{},run};
    await Promise.race([run,new Promise(r=>setTimeout(r,4000))]);
  }catch(_){}
}
function egoExtElegir(id,task){
  const c=globalThis.__egoExtCache;const ids=c&&c.m&&c.m[id];if(!ids||!ids.length)return null;
  const malos=globalThis.__egoExtMalos||{};
  const pref=EGO_EXT_PREF[task==="code"?"code":"reasoning"];
  const pt=x=>{const i=pref.findIndex(rx=>rx.test(x));return i<0?99:i;};
  const cand=ids.filter(x=>!EGO_EXT_EXCLUIR.test(x)&&!(malos[id+":"+x]&&Date.now()-malos[id+":"+x]<3600000)).map(x=>({x,p:pt(x)})).filter(o=>o.p<99).sort((a,b)=>a.p-b.p);
  if(!cand.length)return null;
  return {model:cand[0].x,alts:cand.slice(1,3).map(o=>o.x)};
}
function egoExternalProviders(env, task="chat", sinDescubrir=false) {
  const defs = [
    { id:"gemini", key:env.GEMINI_API_KEY||env.GOOGLE_AI_STUDIO_API_KEY, model:env.EGO_GEMINI_MODEL||"gemini-3.8-flash", url:"https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", kind:"openai" },
    { id:"groq", key:env.GROQ_API_KEY, model:env.EGO_GROQ_MODEL||"openai/gpt-oss-120b", url:"https://api.groq.com/openai/v1/chat/completions", kind:"openai" },
    { id:"sambanova", key:env.SAMBANOVA_API_KEY, model:env.EGO_SAMBANOVA_MODEL||"Meta-Llama-3.3-70B-Instruct", url:"https://api.sambanova.ai/v1/chat/completions", kind:"openai" },
    { id:"nvidia", key:env.NVIDIA_NIM_API_KEY||env.NVIDIA_API_KEY, model:env.EGO_NVIDIA_MODEL, url:"https://integrate.api.nvidia.com/v1/chat/completions", kind:"openai" },
    { id:"cohere", key:env.COHERE_API_KEY, model:env.EGO_COHERE_MODEL||"command-a-03-2025", url:"https://api.cohere.com/v2/chat", kind:"cohere" },
    { id:"mistral", key:env.MISTRAL_API_KEY, model:env.EGO_MISTRAL_MODEL||"mistral-small-latest", url:"https://api.mistral.ai/v1/chat/completions", kind:"openai" },
    // v14.47: más proveedores gratuitos (solo se usan si existe su clave como secreto en Cloudflare)
    { id:"cerebras", key:env.CEREBRAS_API_KEY, model:env.EGO_CEREBRAS_MODEL||"gpt-oss-120b", url:"https://api.cerebras.ai/v1/chat/completions", kind:"openai" },
    { id:"codestral", key:env.CODESTRAL_API_KEY, model:env.EGO_CODESTRAL_MODEL||"codestral-latest", url:"https://codestral.mistral.ai/v1/chat/completions", kind:"openai" }
  ];
  const orden=String(env.EGO_PROVIDER_ORDER||"gemini,cerebras,codestral,groq,cohere,sambanova,nvidia,mistral").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
  const rank=new Map(orden.map((x,i)=>[x,i]));
  if(!sinDescubrir)for(const d of defs){
    const forzado=String(env["EGO_"+d.id.toUpperCase()+"_MODEL"]||"").trim();
    if(forzado||d.kind!=="openai")continue;
    const p=egoExtElegir(d.id,task==="code"?"code":"reasoning");
    if(p){d.model=p.model;d.alts=p.alts;}
  }
  return defs.filter(x=>String(x.key||"").trim() && (sinDescubrir || String(x.model||"").trim()))
    .sort((a,b)=>(rank.get(a.id)??99)-(rank.get(b.id)??99));
}
function contenidoCohere(data) {
  const c=data?.message?.content;
  if(Array.isArray(c)) return c.filter(x=>x?.type==="text"||typeof x?.text==="string").map(x=>x.text||"").join("\n").trim();
  return typeof c==="string"?c.trim():salida(data);
}
async function egoExternalChat(provider,messages,env,maxTokens=3000,timeoutMs=18000) {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),Math.max(4000,Math.min(60000,Number(timeoutMs)||18000)));
  try {
    const normalized=messages.map(m=>({role:["system","user","assistant"].includes(m?.role)?m.role:"user",content:typeof m?.content==="string"?m.content:textOf(m?.content)}));
    let headers={"Authorization":`Bearer ${String(provider.key).trim()}`,"Content-Type":"application/json"},body;
    if(provider.kind==="cohere") {
      body={model:provider.model,messages:normalized,max_tokens:Math.max(128,Math.min(4000,Number(maxTokens)||3000)),temperature:0.2};
    } else {
      body={model:provider.model,messages:normalized,max_tokens:Math.max(128,Math.min(16000,Number(maxTokens)||3000)),temperature:0.2};
    }
    const response=await fetch(provider.url,{method:"POST",headers,body:JSON.stringify(body),signal:controller.signal});
    const data=await response.json().catch(()=>({}));
    if(!response.ok) {
      const detail=String(data?.error?.message||data?.message||data?.detail||data?.error||"proveedor rechazó la solicitud").slice(0,180);
      const status=response.status;
      const category=status===401||status===403?"clave/permisos":status===402?"créditos":status===404?"modelo/ruta":status===429?"cuota 429":status>=500?"servicio temporal":"HTTP";
      if((status===404||(status===400&&/model/i.test(detail)))&&provider.alts&&provider.alts.length){
        (globalThis.__egoExtMalos=globalThis.__egoExtMalos||{})[provider.id+":"+provider.model]=Date.now();
        return await egoExternalChat({...provider,model:provider.alts[0],alts:provider.alts.slice(1)},messages,env,maxTokens,timeoutMs);
      }
      throw new Error(`${provider.id} HTTP ${status} [${category}]: ${detail}`);
    }
    const content=provider.kind==="cohere"?contenidoCohere(data):salida(data);
    if(!content) throw new Error(`${provider.id}: respuesta vacía o formato no reconocido`);
    return {content,model:`${provider.id}:${provider.model}`};
  } finally {clearTimeout(timer);}
}

// Orquestación real del equipo EGO: cada rol usa su modelo asignado y tiene
// un fallback explícito. Los fallbacks no sustituyen al modelo principal si este responde.
const EGO_ROLE_TASK = { planner: "reasoning", reasoner: "reasoning", coder: "code", auditor: "reasoning", datos: "code", api: "reasoning", reparador: "code" };
function externosParaModulo(env) { return Math.max(1, egoExternalProviders(env, "code").length); }
// v14.47: modelos :free de OpenRouter descubiertos en vivo (el catálogo gratuito rota seguido).
// Consulta pública (sin clave), se guarda 1 hora; si falla, se usan solo los IDs fijos.
async function orModelosGratis(task){
  try{
    const g=globalThis.__egoOrFreeCache;
    if(!g||Date.now()-g.t>3600000){
      const ctl=new AbortController(); const tm=setTimeout(()=>ctl.abort(),3500);
      let lista=[],todos=[];
      try{
        const r=await fetch("https://openrouter.ai/api/v1/models",{signal:ctl.signal});
        const d=await r.json();
        const texto=(d.data||[]).filter(m=>m&&typeof m.id==="string"&&Number(m.context_length||0)>=32000&&String((m.architecture&&m.architecture.modality)||"text->text").endsWith("->text")&&!/vl|vision|image|audio|embed|guard|safeguard/i.test(m.id));
        todos=texto.map(m=>m.id); lista=texto.filter(m=>/:free$/.test(m.id)).map(m=>m.id);
      } finally {clearTimeout(tm);}
      globalThis.__egoOrFreeCache={t:Date.now(),lista,todos};
    }
    const lista=globalThis.__egoOrFreeCache.lista||[];
    const pref=task==="code"
      ?[/coder|code|flint|devstral/i,/qwen/i,/kimi|glm|deepseek|minimax/i,/gpt-oss|nemotron|llama|mistral/i]
      :[/deepseek|kimi|glm|qwen|gpt-oss|nemotron/i,/./];
    const punt=(id)=>{const i=pref.findIndex(rx=>rx.test(id));return i<0?99:i;};
    return [...lista].sort((a,b)=>punt(a)-punt(b)).slice(0,4);
  }catch(_){ return []; }
}
async function egoRoleChat(role, messages, env, maxTokens = 3000, options = {}) {
  if (!routerApiKey(env) && !egoExternalProviders(env, EGO_ROLE_TASK[role]||"chat").length && !env.AI) throw new Error("No hay proveedores configurados: agrega claves API de Gemini, Groq, SambaNova, NVIDIA NIM, Cohere o Mistral, o conserva OpenRouter/Workers AI.");
  const task = EGO_ROLE_TASK[role] || "chat";
  await egoExtDescubrir(env);
  const envName = `EGO_${String(role).toUpperCase()}_MODEL`;
  const primary = String(env[envName] || EGO_TEAM_MODELS[role] || "").trim();
  const fallbacks = task === "code" ? [OR_FREE.code, OR_FREE.fallback] : [OR_FREE.reasoning, OR_FREE.fallback];
  const sinCred = !!(globalThis.__egoOrSinCredito && Date.now() - globalThis.__egoOrSinCredito < 120000);
  const esGratis = (m) => /:free$|^openrouter\/free$/.test(String(m));
  const dinamicos = routerApiKey(env) ? await orModelosGratis(task) : [];
  // Catálogo vivo: el modelo fijo solo se usa si existe; además se eligen los mejores disponibles para este rol.
  const todosOr = (globalThis.__egoOrFreeCache && globalThis.__egoOrFreeCache.todos) || [];
  const existe = (id) => !todosOr.length || todosOr.includes(id);
  const elegidos = [];
  if (todosOr.length) for (const rx of (EGO_ROLE_PREF[role] || [])) {
    const hallados = todosOr.filter(id => rx.test(id)).sort((a, b) => Number(esGratis(a)) - Number(esGratis(b)));
    for (const id of hallados) if (!elegidos.includes(id)) elegidos.push(id);
  }
  const forzado = String(env[envName] || "").trim();
  let models = [...new Set([forzado || (existe(primary) ? primary : ""), ...elegidos.slice(0, 3), fallbacks[0], ...dinamicos, fallbacks[1]].filter(m => m && (m === forzado || m === OR_FREE.fallback || existe(m))))];
  // Sin crédito en OpenRouter: los modelos de pago darían 402; se prueban solo los gratuitos.
  if (sinCred) models = models.filter(esGratis);
  const failures = [];
  // Un HTTP 200 con texto no equivale a una respuesta utilizable. Las tareas
  // estructuradas pueden aportar validateContent para que el failover continúe
  // cuando el proveedor no respeta el protocolo esperado.
  const responseIsUsable = (content, model) => {
    if (!content || !String(content).trim()) return false;
    if (typeof options.validateContent !== "function") return true;
    try { return options.validateContent(String(content), String(model || "")) === true; }
    catch (_) { return false; }
  };
  const bounded = Number.isFinite(Number(options.maxTotalMs));
  const deadline = bounded ? Date.now() + Math.max(5000, Number(options.maxTotalMs)) : Infinity;
  const maxModels = bounded ? Math.max(1, Math.min(models.length, Number(options.maxModels) || 2)) : Math.min(models.length, 3);
  const orBloqueado = !routerApiKey(env) || !models.length;
  if (sinCred && routerApiKey(env)) failures.push("OpenRouter sin crédito (402): se omiten los modelos de pago y se usan solo los :free");
  // Proveedores externos independientes: una clave/cuota agotada no bloquea las demás.
  // En tareas con presupuesto limitado se reparten los intentos para conservar tiempo para CF.
  const externos=egoExternalProviders(env,task);
  // Rotación circular: el offset cambia el PRIMER proveedor, pero nunca elimina
  // los proveedores posteriores. El código anterior usaba slice(offset), por lo
  // que cada reintento podía saltarse proveedores que aún no se habían probado.
  const nExternos=externos.length;
  const providerOffset=nExternos?((Math.floor(Number(options.providerOffset)||0)%nExternos)+nExternos)%nExternos:0;
  const externosOrdenados=nExternos?externos.map((_,i)=>externos[(providerOffset+i)%nExternos]):[];
  const requestedExternalCount = options.providerModels === undefined || options.providerModels === null
    ? externosOrdenados.length
    : Math.max(0, Math.floor(Number(options.providerModels) || 0));
  const maxExternos=bounded
    ? Math.max(0,Math.min(externosOrdenados.length,requestedExternalCount))
    : Math.min(externosOrdenados.length,3);
  for(let i=0;i<maxExternos && Date.now()<deadline;i++){
    const provider=externosOrdenados[i];
    const remaining=deadline-Date.now(); if(remaining<3500) break;
    const configuredTimeout=Number(options.providerTimeoutMs)||13000;
    const timeout=bounded?Math.max(4000,Math.min(remaining-2500,configuredTimeout)):18000;
    try{
      const r=await egoExternalChat(provider,messages,env,maxTokens,timeout);
      if(responseIsUsable(r.content, `${provider.id}:${provider.model}`)) return {...r,role,fallos:failures};
      failures.push(`${provider.id}: respuesta vacía o formato inválido; se continúa con el siguiente proveedor`);
    }catch(e){
      const em=String(e?.message||e); failures.push(`${provider.id}: ${em.slice(0,145)}`);
      // Los errores de un proveedor quedan aislados: se continúa con el siguiente.
    }
  }
  // Para tareas grandes se usa un presupuesto total: OpenRouter, proveedores externos y Workers AI.
  for (let i = 0; i < maxModels && i < models.length && !orBloqueado && Date.now() < deadline; i++) {
    try {
      const remaining = deadline - Date.now();
      const defaultTimeout = Math.min(100000, 25000 + Number(maxTokens || 3000) * 8);
      const timeout = bounded ? Math.max(5000, Math.min(remaining, Number(options.perModelMs) || 42000)) : (i === 0 ? defaultTimeout : Math.round(defaultTimeout * 0.6));
      const r = await openRouterChat(messages, env, maxTokens, models[i], timeout);
      if (responseIsUsable(r.content, models[i])) return { ...r, role, fallos: failures };
      failures.push(`${models[i]}: respuesta vacía o formato inválido`);
    } catch (e) {
      const em = String(e?.message || e);
      failures.push(`${models[i]}: ${em.slice(0, 120)}`);
      // 402 en un modelo de pago: se marca la falta de crédito y se sigue con los gratuitos (antes se abandonaba OpenRouter entero).
      if (/HTTP 402/.test(em)) { if (!esGratis(models[i])) { globalThis.__egoOrSinCredito = Date.now(); for (let j = models.length - 1; j > i; j--) if (!esGratis(models[j])) models.splice(j, 1); } else break; }
    }
  }
  if (env.AI && Date.now() < deadline && options.cfModels !== 0) {
    const cadenaBase = task === "code" ? CF_MODELS.codigo : CF_MODELS.razonar;
    const cantidad = bounded ? Math.max(1, Math.min(cadenaBase.length, Number(options.cfModels) || 1)) : 3;
    for (const id of cadenaBase.slice(0, cantidad)) {
      const remaining = deadline - Date.now();
      if (remaining < 5000) break;
      const cfTimeout = bounded ? Math.max(5000, Math.min(remaining, Number(options.cfTimeoutMs) || 30000)) : 70000;
      try {
        const r = await Promise.race([cfChat(id, messages, env, Math.min(Number(maxTokens || 3000), 8000)), tmoMc(cfTimeout)]);
        if (r && responseIsUsable(r.content, `cf:${id}`)) return { ...r, model: `cf:${id}`, role, fallos: failures };
        failures.push(`${id}: respuesta vacía o formato inválido`);
      } catch (e) { failures.push(`${id}: ${String(e?.message || e).slice(0, 80)}`); }
    }
  }
  throw new Error(`${role} no respondió dentro del presupuesto disponible: ${failures.join(" | ").slice(0, 420)}`);
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
// Declaraciones repetidas en el nivel superior de un módulo (p. ej. import { world } + const { world } = mc):
// es un SyntaxError y Minecraft NO carga ningún script del add-on. (No usa eval: no está permitido en Workers.)
function dupDeclTop(texto){
  const src=String(texto).replace(/\/\*[\s\S]*?\*\//g,"").replace(/\/\/[^\n]*/g,"").replace(/`(?:\\.|[^`\\])*`/g,'""').replace(/"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g,'""');
  let out="",d=0;
  for(let i=0;i<src.length;i++){
    const ch=src[i];
    if(ch==="{"){
      if(d===0&&/(?:import|const|let|var)\s*$/.test(out)){let k=0,j=i;for(;j<src.length;j++){if(src[j]==="{")k++;else if(src[j]==="}"){k--;if(k===0)break;}}out+=src.slice(i,j+1);i=j;continue;}
      d++;continue;
    }
    if(ch==="}"){if(d>0)d--;continue;}
    if(d===0)out+=ch;
  }
  const cuenta=new Map();const add=(n)=>{n=String(n||"").trim().split(/\s+as\s+/).pop().split(":").pop().split("=")[0].trim();if(/^[A-Za-z_$][\w$]*$/.test(n))cuenta.set(n,(cuenta.get(n)||0)+1);};
  for(const m of out.matchAll(/import\s*\{([^}]*)\}\s*from/g))m[1].split(",").forEach(add);
  for(const m of out.matchAll(/import\s*\*\s*as\s+([\w$]+)/g))add(m[1]);
  for(const m of out.matchAll(/import\s+([\w$]+)\s*(?:,|from)/g))add(m[1]);
  for(const m of out.matchAll(/\b(?:const|let)\s*\{([^}]*)\}\s*=/g))m[1].split(",").forEach(add);
  for(const m of out.matchAll(/\b(?:const|let)\s+([A-Za-z_$][\w$]*)/g))add(m[1]);
  for(const m of out.matchAll(/\bclass\s+([A-Za-z_$][\w$]*)/g))add(m[1]);
  return [...cuenta.entries()].filter(([,n])=>n>1).map(([k])=>k);
}
// ============================================================
// API OFICIAL DE MOJANG (datos) — @minecraft/server 2.10.0, de Mojang/bedrock-samples/metadata/script_modules
// ============================================================
const MC_API_T={"c":{"AimAssistCategory":{"p":{"defaultBlockPriority":"","defaultEntityPriority":"","identifier":""},"f":{"getBlockPriorities":"","getBlockTagPriorities":"","getEntityPriorities":"","getEntityTypeFamilyPriorities":""}},"AimAssistCategorySettings":{"p":{"defaultBlockPriority":"","defaultEntityPriority":"","identifier":""},"f":{"constructor":"AimAssistCategorySettings","getBlockPriorities":"","getBlockTagPriorities":"","getEntityPriorities":"","getEntityTypeFamilyPriorities":"","setBlockPriorities":"","setBlockTagPriorities":"","setEntityPriorities":"","setEntityTypeFamilyPriorities":""}},"AimAssistPreset":{"p":{"defaultItemSettings":"","handSettings":"","identifier":""},"f":{"getExcludedBlockTagTargets":"[","getExcludedBlockTargets":"[","getExcludedEntityTargets":"[","getExcludedEntityTypeFamilyTargets":"[","getItemSettings":"","getLiquidTargetingItems":"["}},"AimAssistPresetSettings":{"p":{"defaultItemSettings":"","handSettings":"","identifier":""},"f":{"constructor":"AimAssistPresetSettings","getExcludedBlockTagTargets":"[","getExcludedBlockTargets":"[","getExcludedEntityTargets":"[","getExcludedEntityTypeFamilyTargets":"[","getItemSettings":"","getLiquidTargetingItems":"[","setExcludedBlockTagTargets":"","setExcludedBlockTargets":"","setExcludedEntityTargets":"","setExcludedEntityTypeFamilyTargets":"","setItemSettings":"","setLiquidTargetingItems":""}},"AimAssistRegistry":{"p":{},"f":{"addCategory":"AimAssistCategory","addPreset":"AimAssistPreset","getCategories":"[AimAssistCategory","getCategory":"AimAssistCategory","getPreset":"AimAssistPreset","getPresets":"[AimAssistPreset"}},"BiomeType":{"p":{"id":""},"f":{"getTags":"[","hasTags":""}},"BiomeTypes":{"p":{},"f":{"get":"BiomeType","getAll":"[BiomeType"}},"Block":{"p":{"dimension":"Dimension","isAir":"","isLiquid":"","isValid":"","isWaterlogged":"","localizationKey":"","location":"Vector3","permutation":"BlockPermutation","type":"BlockType","typeId":"","x":"","y":"","z":""},"f":{"above":"Block","below":"Block","bottomCenter":"Vector3","canBeDestroyedByLiquidSpread":"","canContainLiquid":"","center":"Vector3","east":"Block","getComponent":"","getComponents":"[BlockComponent","getItemStack":"ItemStack","getLightLevel":"","getParts":"[Block","getRedstonePower":"","getSkyLightLevel":"","getTags":"[","hasComponent":"","hasTag":"","isLiquidBlocking":"","liquidCanFlowFromDirection":"","liquidSpreadCausesSpawn":"","matches":"","north":"Block","offset":"Block","setPermutation":"","setType":"","setWaterlogged":"","south":"Block","west":"Block"}},"BlockComponent":{"b":["Component"],"p":{"block":"Block"},"f":{}},"BlockComponentBlockBreakEvent":{"b":["BlockEvent"],"p":{"blockDestructionSource":"Block","brokenBlockPermutation":"BlockPermutation","entitySource":"Entity"},"f":{}},"BlockComponentBlockStateChangeEvent":{"b":["BlockEvent"],"p":{"previousPermutation":"BlockPermutation"},"f":{}},"BlockComponentEntityEvent":{"b":["BlockEvent"],"p":{"blockPermutation":"BlockPermutation","entitySource":"Entity","name":""},"f":{}},"BlockComponentEntityFallOnEvent":{"b":["BlockEvent"],"p":{"entity":"Entity","fallDistance":""},"f":{}},"BlockComponentOnPlaceEvent":{"b":["BlockEvent"],"p":{"previousBlock":"BlockPermutation"},"f":{}},"BlockComponentPlayerBreakEvent":{"b":["BlockEvent"],"p":{"brokenBlockPermutation":"BlockPermutation","player":"Player"},"f":{}},"BlockComponentPlayerInteractEvent":{"b":["BlockEvent"],"p":{"face":"Direction","faceLocation":"Vector3","player":"Player"},"f":{}},"BlockComponentPlayerPlaceBeforeEvent":{"b":["BlockEvent"],"p":{"cancel":"","face":"Direction","permutationToPlace":"BlockPermutation","player":"Player"},"f":{}},"BlockComponentRandomTickEvent":{"b":["BlockEvent"],"p":{},"f":{}},"BlockComponentRedstoneUpdateEvent":{"b":["BlockEvent"],"p":{"powerLevel":"","previousPowerLevel":""},"f":{}},"BlockComponentRegistry":{"p":{},"f":{"registerCustomComponent":""}},"BlockComponentStepOffEvent":{"b":["BlockEvent"],"p":{"entity":"Entity"},"f":{}},"BlockComponentStepOnEvent":{"b":["BlockEvent"],"p":{"entity":"Entity"},"f":{}},"BlockComponentTickEvent":{"b":["BlockEvent"],"p":{},"f":{}},"BlockContainerClosedAfterEvent":{"b":["BlockEvent"],"p":{"closeSource":"ContainerAccessSource"},"f":{}},"BlockContainerClosedAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"BlockContainerClosedAfterEvent"},"BlockContainerOpenedAfterEvent":{"b":["BlockEvent"],"p":{"openSource":"ContainerAccessSource"},"f":{}},"BlockContainerOpenedAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"BlockContainerOpenedAfterEvent"},"BlockCustomComponentInstance":{"b":["BlockComponent"],"p":{"customComponentParameters":"CustomComponentParameters"},"f":{}},"BlockDynamicPropertiesComponent":{"b":["BlockComponent"],"p":{},"f":{"get":"","set":"","totalByteCount":""}},"BlockEvent":{"p":{"block":"Block","dimension":"Dimension"},"f":{}},"BlockExplodeAfterEvent":{"b":["BlockEvent"],"p":{"explodedBlockPermutation":"BlockPermutation","source":"Entity"},"f":{}},"BlockExplodeAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"BlockExplodeAfterEvent"},"BlockFluidContainerComponent":{"b":["BlockComponent"],"p":{"fillLevel":"","fluidColor":"RGBA"},"f":{"addDye":"","getFluidType":"FluidType","setFluidType":"","setPotion":""}},"BlockInstrumentComponent":{"b":["BlockComponent"],"p":{},"f":{"getInstrumentName":"","playInstrumentSound":""}},"BlockInventoryComponent":{"b":["BlockComponent"],"p":{"container":"Container"},"f":{}},"BlockLocationIterator":{"p":{},"f":{}},"BlockMapColorComponent":{"b":["BlockComponent"],"p":{"color":"RGBA","tintedColor":"RGBA","tintMethod":"TintMethod"},"f":{}},"BlockMovableComponent":{"b":["BlockComponent"],"p":{"movementType":"MovementType","stickyType":"StickyType"},"f":{}},"BlockPermutation":{"p":{"localizationKey":"","type":"BlockType"},"f":{"canBeDestroyedByLiquidSpread":"","canContainLiquid":"","getAllStates":"","getItemStack":"ItemStack","getState":"","getTags":"[","hasTag":"","isLiquidBlocking":"","liquidSpreadCausesSpawn":"","matches":"","resolve":"","withState":""}},"BlockPistonComponent":{"b":["BlockComponent"],"p":{"isMoving":"","state":"BlockPistonState"},"f":{"getAttachedBlocks":"[Block","getAttachedBlocksLocations":"[Vector3"}},"BlockPrecipitationInteractionsComponent":{"b":["BlockComponent"],"p":{},"f":{"accumulatesSnow":"","isSnowLoggable":"","obstructsRain":""}},"BlockRecordPlayerComponent":{"b":["BlockComponent"],"p":{},"f":{"ejectRecord":"","getRecord":"ItemStack","isPlaying":"","pauseRecord":"","playRecord":"","setRecord":""}},"BlockRedstoneProducerComponent":{"b":["BlockComponent"],"p":{"power":""},"f":{"getConnectedFaces":"[Direction","getStronglyPoweredFace":"Direction"}},"BlockSignComponent":{"b":["BlockComponent"],"p":{"isWaxed":""},"f":{"getRawText":"RawText","getText":"","getTextDyeColor":"DyeColor","setText":"","setTextDyeColor":"","setWaxed":""}},"BlockStates":{"p":{},"f":{"get":"BlockStateType","getAll":"[BlockStateType"}},"BlockStateType":{"p":{"id":"","validValues":"["},"f":{}},"BlockType":{"p":{"id":"","localizationKey":""},"f":{}},"BlockTypes":{"p":{},"f":{"get":"BlockType","getAll":"[BlockType"}},"BlockVolume":{"b":["BlockVolumeBase"],"p":{"from":"Vector3","to":"Vector3"},"f":{"constructor":"BlockVolume","doesLocationTouchFaces":"","doesVolumeTouchFaces":"","intersects":"BlockVolumeIntersection"}},"BlockVolumeBase":{"p":{},"f":{"getBlockLocationIterator":"BlockLocationIterator","getCapacity":"","getClosest":"[Vector3","getFarthest":"[Vector3","getMax":"Vector3","getMin":"Vector3","getSpan":"Vector3","isInside":"","translate":""}},"ButtonPushAfterEvent":{"b":["BlockEvent"],"p":{"source":"Entity"},"f":{}},"ButtonPushAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"ButtonPushAfterEvent"},"Camera":{"p":{"isValid":""},"f":{"addShake":"","attachToEntity":"","clear":"","fade":"","playAnimation":"","setCamera":"","setDefaultCamera":"","setFov":"","stopShaking":""}},"CatmullRomSpline":{"p":{"controlPoints":"[Vector3"},"f":{"constructor":"CatmullRomSpline"}},"ClientSystemInfo":{"b":["SystemInfo"],"p":{"locale":"","maxRenderDistance":"","platformType":"PlatformType"},"f":{}},"CommandResult":{"p":{"successCount":""},"f":{}},"Component":{"p":{"isValid":"","typeId":""},"f":{}},"Container":{"p":{"containerRules":"ContainerRules","emptySlotsCount":"","isValid":"","size":"","weight":""},"f":{"addItem":"ItemStack","clearAll":"","contains":"","find":"","findLast":"","firstEmptySlot":"","firstItem":"","getItem":"ItemStack","getSlot":"ContainerSlot","moveItem":"","setItem":"","swapItems":"","transferItem":"ItemStack"}},"ContainerSlot":{"p":{"amount":"","isStackable":"","isValid":"","keepOnDeath":"","lockMode":"ItemLockMode","maxAmount":"","nameTag":"","type":"ItemType","typeId":""},"f":{"clearDynamicProperties":"","getCanDestroy":"[","getCanPlaceOn":"[","getDynamicProperty":"","getDynamicPropertyIds":"[","getDynamicPropertyTotalByteCount":"","getItem":"ItemStack","getLore":"[","getRawLore":"[RawMessage","getTags":"[","hasItem":"","hasTag":"","isStackableWith":"","setCanDestroy":"","setCanPlaceOn":"","setDynamicProperties":"","setDynamicProperty":"","setItem":"","setLore":""}},"CustomCommandOrigin":{"p":{"initiator":"Entity","sourceBlock":"Block","sourceEntity":"Entity","sourceType":"CustomCommandSource"},"f":{}},"CustomCommandRegistry":{"p":{},"f":{"registerCommand":"","registerEnum":""}},"CustomComponentParameters":{"p":{"params":""},"f":{}},"DamagedByEntityCondition":{"b":["LootItemCondition"],"p":{"entityType":""},"f":{}},"DataDrivenEntityTriggerAfterEvent":{"p":{"entity":"Entity","eventId":""},"f":{"getModifiers":"[DefinitionModifier"}},"DataDrivenEntityTriggerAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"DataDrivenEntityTriggerAfterEvent"},"Dimension":{"p":{"heightRange":"NumberRange","id":"","localizationKey":""},"f":{"calculateClosestBiomeFromSeed":"Vector3","cloneBlocks":"","containsBiomes":"","containsBlock":"","createExplosion":"","fillBlocks":"ListBlockVolume","getBiome":"BiomeType","getBlock":"Block","getBlockAbove":"Block","getBlockBelow":"Block","getBlockFromRay":"BlockRaycastHit","getBlocks":"ListBlockVolume","getEntities":"[Entity","getEntitiesAtBlockLocation":"[Entity","getEntitiesFromRay":"[EntityRaycastHit","getLightLevel":"","getPlayers":"[Player","getSkyLightLevel":"","getTopmostBlock":"Block","isChunkLoaded":"","placeFeature":"","placeFeatureRule":"","playSound":"SoundInstance","runCommand":"CommandResult","setBlockPermutation":"","setBlockType":"","setWeather":"","spawnEntity":"Entity","spawnItem":"Entity","spawnParticle":""}},"DimensionRegistry":{"p":{},"f":{"registerCustomDimension":""}},"DimensionType":{"p":{"typeId":""},"f":{}},"DimensionTypes":{"p":{},"f":{"get":"DimensionType","getAll":"[DimensionType"}},"Effect":{"p":{"amplifier":"","displayName":"","duration":"","isValid":"","typeId":""},"f":{}},"EffectAddAfterEvent":{"p":{"effect":"Effect","entity":"Entity"},"f":{}},"EffectAddAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"EffectAddAfterEvent"},"EffectAddBeforeEvent":{"p":{"cancel":"","duration":"","effectType":"","entity":"Entity"},"f":{}},"EffectAddBeforeEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"EffectAddBeforeEvent"},"EffectType":{"p":{},"f":{"getName":""}},"EffectTypes":{"p":{},"f":{"get":"EffectType","getAll":"[EffectType"}},"EmptyLootItem":{"b":["LootPoolEntry"],"p":{},"f":{}},"EnchantInfo":{"p":{"enchantment":"","range":"NumberRange"},"f":{}},"EnchantmentType":{"p":{"id":"","maxLevel":""},"f":{"constructor":"EnchantmentType"}},"EnchantmentTypes":{"p":{},"f":{"get":"EnchantmentType","getAll":"[EnchantmentType"}},"EnchantRandomEquipmentFunction":{"b":["LootItemFunction"],"p":{"chance":""},"f":{}},"EnchantRandomlyFunction":{"b":["LootItemFunction"],"p":{"treasure":""},"f":{}},"EnchantWithLevelsFunction":{"b":["LootItemFunction"],"p":{"levels":"NumberRange","treasure":""},"f":{}},"Entity":{"p":{"dimension":"Dimension","id":"","isClimbing":"","isFalling":"","isInWater":"","isOnGround":"","isSleeping":"","isSneaking":"","isSprinting":"","isSwimming":"","isValid":"","localizationKey":"","location":"Vector3","nameplateDepthTested":"","nameplateRenderDistance":"","nameTag":"","scoreboardIdentity":"ScoreboardIdentity","typeId":""},"f":{"addEffect":"Effect","addItem":"ItemStack","addTag":"","applyDamage":"","applyImpulse":"","applyKnockback":"","clearDynamicProperties":"","clearVelocity":"","extinguishFire":"","getAABB":"AABB","getAllBlocksStandingOn":"[Block","getBlockFromViewDirection":"BlockRaycastHit","getBlockStandingOn":"Block","getComponent":"","getComponents":"[EntityComponent","getDynamicProperty":"","getDynamicPropertyIds":"[","getDynamicPropertyTotalByteCount":"","getEffect":"Effect","getEffects":"[Effect","getEntitiesFromViewDirection":"[EntityRaycastHit","getHeadLocation":"Vector3","getProperty":"","getRotation":"Vector2","getTags":"[","getVelocity":"Vector3","getViewDirection":"Vector3","hasComponent":"","hasTag":"","kill":"","lookAt":"","matches":"","playAnimation":"","remove":"","removeEffect":"","removeTag":"","resetProperty":"","runCommand":"CommandResult","setDynamicProperties":"","setDynamicProperty":"","setOnFire":"","setProperty":"","setRotation":"","teleport":"","triggerEvent":"","tryTeleport":""}},"EntityAddRiderComponent":{"b":["EntityComponent"],"p":{"entityType":"","spawnEvent":""},"f":{}},"EntityAgeableComponent":{"b":["EntityComponent"],"p":{"duration":"","growUp":"Trigger","transformToItem":""},"f":{"getDropItems":"[","getFeedItems":"[EntityDefinitionFeedItem"}},"EntityAttributeComponent":{"b":["EntityComponent"],"p":{"currentValue":"","defaultValue":"","effectiveMax":"","effectiveMin":""},"f":{"resetToDefaultValue":"","resetToMaxValue":"","resetToMinValue":"","setCurrentValue":""}},"EntityBaseMovementComponent":{"b":["EntityComponent"],"p":{"maxTurn":""},"f":{}},"EntityBreathableComponent":{"b":["EntityComponent"],"p":{"breathesAir":"","breathesLava":"","breathesSolids":"","breathesWater":"","generatesBubbles":"","inhaleTime":"","suffocateTime":"","totalSupply":""},"f":{"getBreatheBlocks":"[BlockPermutation","getNonBreatheBlocks":"[BlockPermutation"}},"EntityCanClimbComponent":{"b":["EntityComponent"],"p":{},"f":{}},"EntityCanFlyComponent":{"b":["EntityComponent"],"p":{},"f":{}},"EntityCanPowerJumpComponent":{"b":["EntityComponent"],"p":{},"f":{}},"EntityColor2Component":{"b":["EntityComponent"],"p":{"value":"PaletteColor"},"f":{}},"EntityColorComponent":{"b":["EntityComponent"],"p":{"value":""},"f":{}},"EntityComponent":{"b":["Component"],"p":{"entity":"Entity"},"f":{}},"EntityContainerClosedAfterEvent":{"p":{"closeSource":"ContainerAccessSource","entity":"Entity"},"f":{}},"EntityContainerClosedAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"EntityContainerClosedAfterEvent"},"EntityContainerOpenedAfterEvent":{"p":{"entity":"Entity","openSource":"ContainerAccessSource"},"f":{}},"EntityContainerOpenedAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"EntityContainerOpenedAfterEvent"},"EntityDefinitionFeedItem":{"p":{"growth":"","item":"","resultItem":""},"f":{}},"EntityDieAfterEvent":{"p":{"damageSource":"EntityDamageSource","deadEntity":"Entity"},"f":{}},"EntityDieAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"EntityDieAfterEvent"},"EntityEnderInventoryComponent":{"b":["EntityComponent"],"p":{"container":"Container"},"f":{}},"EntityEquippableComponent":{"b":["EntityComponent"],"p":{"totalArmor":"","totalToughness":""},"f":{"getEquipment":"ItemStack","getEquipmentSlot":"ContainerSlot","setEquipment":""}},"EntityExhaustionComponent":{"b":["EntityAttributeComponent"],"p":{},"f":{}},"EntityFireImmuneComponent":{"b":["EntityComponent"],"p":{},"f":{}},"EntityFloatsInLiquidComponent":{"b":["EntityComponent"],"p":{},"f":{}},"EntityFlyingSpeedComponent":{"b":["EntityComponent"],"p":{"value":""},"f":{}},"EntityFrictionModifierComponent":{"b":["EntityComponent"],"p":{"value":""},"f":{}},"EntityHasMarkVariantCondition":{"b":["LootItemCondition"],"p":{"value":""},"f":{}},"EntityHasVariantCondition":{"b":["LootItemCondition"],"p":{"value":""},"f":{}},"EntityHealableComponent":{"b":["EntityComponent"],"p":{"forceUse":""},"f":{"getFeedItems":"[FeedItem"}},"EntityHealAfterEvent":{"p":{"healedEntity":"Entity","healing":"","healSource":"EntityHealSource"},"f":{}},"EntityHealAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"EntityHealAfterEvent"},"EntityHealBeforeEvent":{"p":{"cancel":"","healedEntity":"Entity","healing":"","healSource":"EntityHealSource"},"f":{}},"EntityHealBeforeEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"EntityHealBeforeEvent"},"EntityHealSource":{"p":{"cause":"EntityHealCause"},"f":{}},"EntityHealthChangedAfterEvent":{"p":{"entity":"Entity","newValue":"","oldValue":""},"f":{}},"EntityHealthChangedAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"EntityHealthChangedAfterEvent"},"EntityHealthComponent":{"b":["EntityAttributeComponent"],"p":{},"f":{}},"EntityHitBlockAfterEvent":{"p":{"blockFace":"Direction","damagingEntity":"Entity","hitBlock":"Block","hitBlockPermutation":"BlockPermutation"},"f":{}},"EntityHitBlockAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"EntityHitBlockAfterEvent"},"EntityHitEntityAfterEvent":{"p":{"damagingEntity":"Entity","hitEntity":"Entity"},"f":{}},"EntityHitEntityAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"EntityHitEntityAfterEvent"},"EntityHungerComponent":{"b":["EntityAttributeComponent"],"p":{},"f":{}},"EntityHurtAfterEvent":{"p":{"damage":"","damageSource":"EntityDamageSource","hurtEntity":"Entity"},"f":{}},"EntityHurtAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"EntityHurtAfterEvent"},"EntityHurtBeforeEvent":{"p":{"cancel":"","damage":"","damageSource":"EntityDamageSource","hurtEntity":"Entity"},"f":{}},"EntityHurtBeforeEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"EntityHurtBeforeEvent"},"EntityInventoryComponent":{"b":["EntityComponent"],"p":{"additionalSlotsPerStrength":"","canBeSiphonedFrom":"","container":"Container","containerType":"","inventorySize":"","private":"","restrictToOwner":""},"f":{}},"EntityIsBabyComponent":{"b":["EntityComponent"],"p":{},"f":{}},"EntityIsChargedComponent":{"b":["EntityComponent"],"p":{},"f":{}},"EntityIsChestedComponent":{"b":["EntityComponent"],"p":{},"f":{}},"EntityIsDyeableComponent":{"b":["EntityComponent"],"p":{},"f":{}},"EntityIsHiddenWhenInvisibleComponent":{"b":["EntityComponent"],"p":{},"f":{}},"EntityIsIgnitedComponent":{"b":["EntityComponent"],"p":{},"f":{}},"EntityIsIllagerCaptainComponent":{"b":["EntityComponent"],"p":{},"f":{}},"EntityIsSaddledComponent":{"b":["EntityComponent"],"p":{},"f":{}},"EntityIsShakingComponent":{"b":["EntityComponent"],"p":{},"f":{}},"EntityIsShearedComponent":{"b":["EntityComponent"],"p":{},"f":{}},"EntityIsStackableComponent":{"b":["EntityComponent"],"p":{},"f":{}},"EntityIsStunnedComponent":{"b":["EntityComponent"],"p":{},"f":{}},"EntityIsTamedComponent":{"b":["EntityComponent"],"p":{},"f":{}},"EntityItemComponent":{"b":["EntityComponent"],"p":{"itemStack":"ItemStack"},"f":{}},"EntityItemDropAfterEvent":{"p":{"entity":"Entity","items":"[Entity"},"f":{}},"EntityItemDropAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"EntityItemDropAfterEvent"},"EntityItemPickupAfterEvent":{"p":{"entity":"Entity","items":"[ItemStack"},"f":{}},"EntityItemPickupAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"EntityItemPickupAfterEvent"},"EntityItemPickupBeforeEvent":{"p":{"cancel":"","entity":"Entity","item":"Entity"},"f":{}},"EntityItemPickupBeforeEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"EntityItemPickupBeforeEvent"},"EntityKilledCondition":{"b":["LootItemCondition"],"p":{"entityType":""},"f":{}},"EntityLavaMovementComponent":{"b":["EntityAttributeComponent"],"p":{},"f":{}},"EntityLeashableComponent":{"b":["EntityComponent"],"p":{"canBeStolen":"","hardDistance":"","isLeashed":"","leashHolder":"Entity","leashHolderEntityId":"","maxDistance":"","softDistance":""},"f":{"leashTo":"","unleash":""}},"EntityLoadAfterEvent":{"p":{"entity":"Entity"},"f":{}},"EntityLoadAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"EntityLoadAfterEvent"},"EntityMarkVariantComponent":{"b":["EntityComponent"],"p":{"value":""},"f":{}},"EntityMovementAmphibiousComponent":{"b":["EntityBaseMovementComponent"],"p":{},"f":{}},"EntityMovementBasicComponent":{"b":["EntityBaseMovementComponent"],"p":{},"f":{}},"EntityMovementComponent":{"b":["EntityAttributeComponent"],"p":{},"f":{}},"EntityMovementFlyComponent":{"b":["EntityBaseMovementComponent"],"p":{},"f":{}},"EntityMovementGenericComponent":{"b":["EntityBaseMovementComponent"],"p":{},"f":{}},"EntityMovementGlideComponent":{"b":["EntityBaseMovementComponent"],"p":{"speedWhenTurning":"","startSpeed":""},"f":{}},"EntityMovementHoverComponent":{"b":["EntityBaseMovementComponent"],"p":{},"f":{}},"EntityMovementJumpComponent":{"b":["EntityBaseMovementComponent"],"p":{},"f":{}},"EntityMovementSkipComponent":{"b":["EntityBaseMovementComponent"],"p":{},"f":{}},"EntityMovementSwayComponent":{"b":["EntityBaseMovementComponent"],"p":{"swayAmplitude":"","swayFrequency":""},"f":{}},"EntityNavigationClimbComponent":{"b":["EntityNavigationComponent"],"p":{},"f":{}},"EntityNavigationComponent":{"b":["EntityComponent"],"p":{"avoidDamageBlocks":"","avoidPortals":"","avoidSun":"","avoidWater":"","canBreach":"","canBreakDoors":"","canFloat":"","canJump":"","canOpenDoors":"","canOpenIronDoors":"","canPassDoors":"","canPathFromAir":"","canPathOverLava":"","canPathOverWater":"","canSink":"","canSwim":"","canWalk":"","canWalkInLava":"","isAmphibious":""},"f":{}},"EntityNavigationFloatComponent":{"b":["EntityNavigationComponent"],"p":{},"f":{}},"EntityNavigationFlyComponent":{"b":["EntityNavigationComponent"],"p":{},"f":{}},"EntityNavigationGenericComponent":{"b":["EntityNavigationComponent"],"p":{},"f":{}},"EntityNavigationHoverComponent":{"b":["EntityNavigationComponent"],"p":{},"f":{}},"EntityNavigationWalkComponent":{"b":["EntityNavigationComponent"],"p":{},"f":{}},"EntityOnFireComponent":{"b":["EntityComponent"],"p":{"onFireTicksRemaining":""},"f":{}},"EntityProjectileComponent":{"b":["EntityComponent"],"p":{"airInertia":"","catchFireOnHurt":"","critParticlesOnProjectileHurt":"","destroyOnProjectileHurt":"","gravity":"","hitEntitySound":"","hitGroundSound":"","hitParticle":"","lightningStrikeOnHit":"","liquidInertia":"","onFireTime":"","owner":"Entity","shouldBounceOnHit":"","stopOnHit":""},"f":{"shoot":""}},"EntityPushThroughComponent":{"b":["EntityComponent"],"p":{"value":""},"f":{}},"EntityRemoveAfterEvent":{"p":{"removedEntityId":"","typeId":""},"f":{}},"EntityRemoveAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"EntityRemoveAfterEvent"},"EntityRemoveBeforeEvent":{"p":{"removedEntity":"Entity"},"f":{}},"EntityRemoveBeforeEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"EntityRemoveBeforeEvent"},"EntityRideableComponent":{"b":["EntityComponent"],"p":{"controllingSeat":"","crouchingSkipInteract":"","interactText":"","passengerMaxWidth":"","pullInEntities":"","riderCanInteract":"","seatCount":""},"f":{"addRider":"","ejectRider":"","ejectRiders":"","getFamilyTypes":"[","getRiders":"[Entity","getSeats":"[Seat"}},"EntityRidingComponent":{"b":["EntityComponent"],"p":{"entityRidingOn":"Entity"},"f":{}},"EntitySaturationComponent":{"b":["EntityAttributeComponent"],"p":{},"f":{}},"EntityScaleComponent":{"b":["EntityComponent"],"p":{"value":""},"f":{}},"EntitySkinIdComponent":{"b":["EntityComponent"],"p":{"value":""},"f":{}},"EntitySpawnAfterEvent":{"p":{"cause":"EntityInitializationCause","entity":"Entity"},"f":{}},"EntitySpawnAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"EntitySpawnAfterEvent"},"EntityStartSneakingAfterEvent":{"p":{"entity":"Entity"},"f":{}},"EntityStartSneakingAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"EntityStartSneakingAfterEvent"},"EntityStopSneakingAfterEvent":{"p":{"entity":"Entity"},"f":{}},"EntityStopSneakingAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"EntityStopSneakingAfterEvent"},"EntityStrengthComponent":{"b":["EntityComponent"],"p":{"max":"","value":""},"f":{}},"EntityTameableComponent":{"b":["EntityComponent"],"p":{"getTameItems":"[ItemStack","isTamed":"","probability":"","tamedToPlayer":"Player","tamedToPlayerId":""},"f":{"tame":""}},"EntityTamedAfterEvent":{"p":{"entity":"Entity","tamingEntity":"Entity"},"f":{}},"EntityTamedAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"EntityTamedAfterEvent"},"EntityTamedBeforeEvent":{"p":{"cancel":"","entity":"Entity","tamingEntity":"Entity"},"f":{}},"EntityTamedBeforeEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"EntityTamedBeforeEvent"},"EntityTameMountComponent":{"b":["EntityComponent"],"p":{"isTamed":"","isTamedToPlayer":"","tamedToPlayer":"Player","tamedToPlayerId":""},"f":{"tame":"","tameToPlayer":""}},"EntityType":{"p":{"id":"","localizationKey":""},"f":{}},"EntityTypeFamilyComponent":{"b":["EntityComponent"],"p":{},"f":{"getTypeFamilies":"[","hasTypeFamily":""}},"EntityTypes":{"p":{},"f":{"get":"EntityType","getAll":"[EntityType"}},"EntityUnderwaterMovementComponent":{"b":["EntityAttributeComponent"],"p":{},"f":{}},"EntityUpgradeAfterEvent":{"p":{"entity":"Entity","upgradeId":""},"f":{"getModifiers":"[DefinitionModifier"}},"EntityUpgradeAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"EntityUpgradeAfterEvent"},"EntityVariantComponent":{"b":["EntityComponent"],"p":{"value":""},"f":{}},"EntityWantsJockeyComponent":{"b":["EntityComponent"],"p":{},"f":{}},"EntityWaypoint":{"b":["Waypoint"],"p":{"entity":"Entity","entityRules":"EntityVisibilityRules"},"f":{"constructor":"EntityWaypoint"}},"ExplorationMapFunction":{"b":["LootItemFunction"],"p":{"destination":""},"f":{}},"ExplosionAfterEvent":{"p":{"dimension":"Dimension","source":"Entity"},"f":{"getImpactedBlocks":"[Block"}},"ExplosionAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"ExplosionAfterEvent"},"ExplosionBeforeEvent":{"b":["ExplosionAfterEvent"],"p":{"cancel":""},"f":{"setImpactedBlocks":""}},"ExplosionBeforeEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"ExplosionBeforeEvent"},"ExplosionDecayFunction":{"b":["LootItemFunction"],"p":{},"f":{}},"FeedItem":{"p":{"healAmount":"","item":"","resultItem":""},"f":{"getEffects":"[FeedItemEffect"}},"FeedItemEffect":{"p":{"amplifier":"","chance":"","duration":"","name":""},"f":{}},"FillContainerFunction":{"b":["LootItemFunction"],"p":{"lootTable":""},"f":{}},"FluidContainer":{"p":{},"f":{}},"FogSettings":{"p":{},"f":{"getStack":"[","getTags":"[","pop":"","push":"","remove":"","setStack":""}},"GameRuleChangeAfterEvent":{"p":{"rule":"GameRule","value":""},"f":{}},"GameRuleChangeAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"GameRuleChangeAfterEvent"},"GameRules":{"p":{"commandBlockOutput":"","commandBlocksEnabled":"","doDayLightCycle":"","doEntityDrops":"","doFireTick":"","doImmediateRespawn":"","doInsomnia":"","doLimitedCrafting":"","doMobLoot":"","doMobSpawning":"","doTileDrops":"","doWeatherCycle":"","drowningDamage":"","fallDamage":"","fireDamage":"","freezeDamage":"","functionCommandLimit":"","keepInventory":"","maxCommandChainLength":"","mobGriefing":"","naturalRegeneration":"","playersSleepingPercentage":"","projectilesCanBreakBlocks":"","pvp":"","randomTickSpeed":"","recipesUnlock":"","respawnBlocksExplode":"","sendCommandFeedback":"","showBorderEffect":"","showCoordinates":"","showDaysPlayed":"","showDeathMessages":"","showRecipeMessages":"","showTags":"","spawnRadius":"","tntExplodes":"","tntExplosionDropDecay":""},"f":{}},"InputInfo":{"p":{"lastInputModeUsed":"InputMode","touchOnlyAffectsHotbar":""},"f":{"getButtonState":"ButtonState","getMovementVector":"Vector2"}},"IsBabyCondition":{"b":["LootItemCondition"],"p":{},"f":{}},"ISerializable":{"p":{},"f":{}},"ItemBlockDynamicPropertiesComponent":{"b":["ItemComponent"],"p":{},"f":{"get":"","set":"","totalByteCount":""}},"ItemBookComponent":{"b":["ItemComponent"],"p":{"author":"","contents":"[","isSigned":"","pageCount":"","rawContents":"[RawMessage","title":""},"f":{"getPageContent":"","getRawPageContent":"RawMessage","insertPage":"","removePage":"","setContents":"","setPageContent":"","signBook":""}},"ItemCompleteUseAfterEvent":{"p":{"itemStack":"ItemStack","source":"Player","useDuration":""},"f":{}},"ItemCompleteUseAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"ItemCompleteUseAfterEvent"},"ItemCompleteUseEvent":{"p":{"itemStack":"ItemStack","source":"Player"},"f":{}},"ItemComponent":{"b":["Component"],"p":{},"f":{}},"ItemComponentBeforeDurabilityDamageEvent":{"p":{"attackingEntity":"Entity","durabilityDamage":"","hitEntity":"Entity","itemStack":"ItemStack"},"f":{}},"ItemComponentCompleteUseEvent":{"b":["ItemCompleteUseEvent"],"p":{},"f":{}},"ItemComponentConsumeEvent":{"p":{"itemStack":"ItemStack","source":"Entity"},"f":{}},"ItemComponentHitEntityEvent":{"p":{"attackingEntity":"Entity","hadEffect":"","hitEntity":"Entity","itemStack":"ItemStack"},"f":{}},"ItemComponentMineBlockEvent":{"p":{"block":"Block","itemStack":"ItemStack","minedBlockPermutation":"BlockPermutation","source":"Entity"},"f":{}},"ItemComponentRegistry":{"p":{},"f":{"registerCustomComponent":""}},"ItemComponentUseEvent":{"p":{"itemStack":"ItemStack","source":"Player"},"f":{}},"ItemComponentUseOnEvent":{"b":["ItemUseOnEvent"],"p":{"source":"Entity","usedOnBlockPermutation":"BlockPermutation"},"f":{}},"ItemCompostableComponent":{"b":["ItemComponent"],"p":{"compostingChance":""},"f":{}},"ItemCooldownComponent":{"b":["ItemComponent"],"p":{"cooldownCategory":"","cooldownTicks":""},"f":{"getCooldownTicksRemaining":"","isCooldownCategory":"","startCooldown":""}},"ItemCustomComponentInstance":{"b":["ItemComponent"],"p":{"customComponentParameters":"CustomComponentParameters"},"f":{}},"ItemDurabilityComponent":{"b":["ItemComponent"],"p":{"damage":"","maxDurability":"","unbreakable":""},"f":{"getDamageChance":"","getDamageChanceRange":"NumberRange"}},"ItemDyeableComponent":{"b":["ItemComponent"],"p":{"color":"RGB","defaultColor":"RGB"},"f":{}},"ItemEnchantableComponent":{"b":["ItemComponent"],"p":{"slots":"[EnchantmentSlot"},"f":{"addEnchantment":"","addEnchantments":"","canAddEnchantment":"","getEnchantment":"Enchantment","getEnchantments":"[Enchantment","hasEnchantment":"","removeAllEnchantments":"","removeEnchantment":""}},"ItemFoodComponent":{"b":["ItemComponent"],"p":{"canAlwaysEat":"","nutrition":"","saturationModifier":"","usingConvertsTo":""},"f":{}},"ItemInventoryComponent":{"b":["ItemComponent"],"p":{"container":"Container"},"f":{}},"ItemPotionComponent":{"b":["ItemComponent"],"p":{"potionDeliveryType":"PotionDeliveryType","potionEffectType":"PotionEffectType"},"f":{}},"ItemReleaseUseAfterEvent":{"p":{"itemStack":"ItemStack","source":"Player","useDuration":""},"f":{}},"ItemReleaseUseAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"ItemReleaseUseAfterEvent"},"ItemStack":{"p":{"amount":"","isStackable":"","keepOnDeath":"","localizationKey":"","lockMode":"ItemLockMode","maxAmount":"","nameTag":"","type":"ItemType","typeId":"","weight":""},"f":{"clearDynamicProperties":"","clone":"ItemStack","constructor":"ItemStack","getCanDestroy":"[","getCanPlaceOn":"[","getComponent":"","getComponents":"[ItemComponent","getDynamicProperty":"","getDynamicPropertyIds":"[","getDynamicPropertyTotalByteCount":"","getLore":"[","getRawLore":"[RawMessage","getTags":"[","hasComponent":"","hasTag":"","isStackableWith":"","matches":"","setCanDestroy":"","setCanPlaceOn":"","setDynamicProperties":"","setDynamicProperty":"","setLore":""}},"ItemStartUseAfterEvent":{"p":{"itemStack":"ItemStack","source":"Player","useDuration":""},"f":{}},"ItemStartUseAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"ItemStartUseAfterEvent"},"ItemStartUseOnAfterEvent":{"p":{"block":"Block","blockFace":"Direction","itemStack":"ItemStack","source":"Player"},"f":{}},"ItemStartUseOnAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"ItemStartUseOnAfterEvent"},"ItemStopUseAfterEvent":{"p":{"itemStack":"ItemStack","source":"Player","useDuration":""},"f":{}},"ItemStopUseAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"ItemStopUseAfterEvent"},"ItemStopUseOnAfterEvent":{"p":{"block":"Block","itemStack":"ItemStack","source":"Player"},"f":{}},"ItemStopUseOnAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"ItemStopUseOnAfterEvent"},"ItemType":{"p":{"id":"","localizationKey":""},"f":{}},"ItemTypes":{"p":{},"f":{"get":"ItemType","getAll":"[ItemType"}},"ItemUseAfterEvent":{"p":{"itemStack":"ItemStack","source":"Player"},"f":{}},"ItemUseAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"ItemUseAfterEvent"},"ItemUseBeforeEvent":{"b":["ItemUseAfterEvent"],"p":{"cancel":""},"f":{}},"ItemUseBeforeEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"ItemUseBeforeEvent"},"ItemUseOnEvent":{"p":{"block":"Block","blockFace":"Direction","faceLocation":"Vector3","itemStack":"ItemStack"},"f":{}},"KilledByEntityCondition":{"b":["LootItemCondition"],"p":{"entityType":""},"f":{}},"KilledByPlayerCondition":{"b":["LootItemCondition"],"p":{},"f":{}},"KilledByPlayerOrPetsCondition":{"b":["LootItemCondition"],"p":{},"f":{}},"LeverActionAfterEvent":{"b":["BlockEvent"],"p":{"isPowered":"","player":"Player"},"f":{}},"LeverActionAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"LeverActionAfterEvent"},"LinearSpline":{"p":{"controlPoints":"[Vector3"},"f":{"constructor":"LinearSpline"}},"ListBlockVolume":{"b":["BlockVolumeBase"],"p":{},"f":{"add":"","constructor":"ListBlockVolume","remove":""}},"LocationWaypoint":{"b":["Waypoint"],"p":{},"f":{"constructor":"LocationWaypoint","setDimensionLocation":""}},"LocatorBar":{"p":{"count":"","maxCount":""},"f":{"addWaypoint":"","getAllWaypoints":"[Waypoint","hasWaypoint":"","removeAllWaypoints":"","removeWaypoint":""}},"LootingEnchantFunction":{"b":["LootItemFunction"],"p":{"count":"NumberRange"},"f":{}},"LootItem":{"b":["LootPoolEntry"],"p":{"conditions":"[LootItemCondition","functions":"[LootItemFunction","name":"ItemType"},"f":{}},"LootItemCondition":{"p":{},"f":{}},"LootItemFunction":{"p":{"conditions":"[LootItemCondition"},"f":{}},"LootPool":{"p":{"bonusRolls":"NumberRange","conditions":"[LootItemCondition","entries":"[LootPoolEntry","rolls":"NumberRange","tiers":"LootPoolTiers"},"f":{}},"LootPoolEntry":{"p":{"quality":"","subTable":"LootPoolEntry","weight":""},"f":{}},"LootPoolTiers":{"p":{"bonusChance":"","bonusRolls":"","initialRange":""},"f":{}},"LootTable":{"p":{"path":"","pools":"[LootPool"},"f":{}},"LootTableEntry":{"b":["LootPoolEntry"],"p":{"lootTable":"LootTable"},"f":{}},"LootTableManager":{"p":{},"f":{"generateLootFromBlock":"[ItemStack","generateLootFromBlockPermutation":"[ItemStack","generateLootFromBlockType":"[ItemStack","generateLootFromEntity":"[ItemStack","generateLootFromEntityType":"[ItemStack","generateLootFromTable":"[ItemStack","getLootTable":"LootTable"}},"LootTableReference":{"b":["LootPoolEntry"],"p":{"path":""},"f":{}},"MatchToolCondition":{"b":["LootItemCondition"],"p":{"count":"NumberRange","durability":"NumberRange","enchantments":"[EnchantInfo","itemName":"","itemTagsAll":"[","itemTagsAny":"[","itemTagsNone":"["},"f":{}},"MolangVariableMap":{"p":{},"f":{"constructor":"MolangVariableMap","setColorRGB":"","setColorRGBA":"","setFloat":"","setSpeedAndDirection":"","setVector3":""}},"PassengerOfEntityCondition":{"b":["LootItemCondition"],"p":{"entityType":""},"f":{}},"PistonActivateAfterEvent":{"b":["BlockEvent"],"p":{"isExpanding":"","piston":"BlockPistonComponent"},"f":{}},"PistonActivateAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"PistonActivateAfterEvent"},"Player":{"b":["Entity"],"p":{"camera":"Camera","clientSystemInfo":"ClientSystemInfo","commandPermissionLevel":"CommandPermissionLevel","fogSettings":"FogSettings","graphicsMode":"GraphicsMode","inputInfo":"InputInfo","inputPermissions":"PlayerInputPermissions","isEmoting":"","isFlying":"","isGliding":"","isJumping":"","level":"","locatorBar":"LocatorBar","name":"","onScreenDisplay":"ScreenDisplay","playerPermissionLevel":"PlayerPermissionLevel","selectedSlotIndex":"","totalXpNeededForNextLevel":"","xpEarnedAtCurrentLevel":""},"f":{"addExperience":"","addLevels":"","clearPropertyOverridesForEntity":"","getAimAssist":"PlayerAimAssist","getControlScheme":"ControlScheme","getGameMode":"GameMode","getItemCooldown":"","getSpawnPoint":"DimensionLocation","getTotalXp":"","playMusic":"","playSound":"SoundInstance","queueMusic":"","removePropertyOverrideForEntity":"","resetLevel":"","sendMessage":"","setControlScheme":"","setGameMode":"","setPropertyOverrideForEntity":"","setSpawnPoint":"","spawnParticle":"","startItemCooldown":"","stopMusic":""}},"PlayerAimAssist":{"p":{"settings":"PlayerAimAssistSettings"},"f":{"set":""}},"PlayerBreakBlockAfterEvent":{"b":["BlockEvent"],"p":{"brokenBlockPermutation":"BlockPermutation","itemStackAfterBreak":"ItemStack","itemStackBeforeBreak":"ItemStack","player":"Player"},"f":{}},"PlayerBreakBlockAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"PlayerBreakBlockAfterEvent"},"PlayerBreakBlockBeforeEvent":{"b":["BlockEvent"],"p":{"cancel":"","itemStack":"ItemStack","player":"Player"},"f":{}},"PlayerBreakBlockBeforeEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"PlayerBreakBlockBeforeEvent"},"PlayerButtonInputAfterEvent":{"p":{"button":"InputButton","newButtonState":"ButtonState","player":"Player"},"f":{}},"PlayerButtonInputAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"PlayerButtonInputAfterEvent"},"PlayerCancelBreakingBlockAfterEvent":{"b":["BlockEvent"],"p":{"blockPermutation":"BlockPermutation","breakProgress":"","face":"Direction","heldItemStack":"ItemStack","player":"Player"},"f":{}},"PlayerCancelBreakingBlockAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"PlayerCancelBreakingBlockAfterEvent"},"PlayerCursorInventoryComponent":{"b":["EntityComponent"],"p":{"item":"ItemStack"},"f":{"clear":""}},"PlayerDimensionChangeAfterEvent":{"p":{"fromDimension":"Dimension","fromLocation":"Vector3","player":"Player","toDimension":"Dimension","toLocation":"Vector3"},"f":{}},"PlayerDimensionChangeAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"PlayerDimensionChangeAfterEvent"},"PlayerEmoteAfterEvent":{"p":{"personaPieceId":"","player":"Player"},"f":{}},"PlayerEmoteAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"PlayerEmoteAfterEvent"},"PlayerGameModeChangeAfterEvent":{"p":{"fromGameMode":"GameMode","player":"Player","toGameMode":"GameMode"},"f":{}},"PlayerGameModeChangeAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"PlayerGameModeChangeAfterEvent"},"PlayerGameModeChangeBeforeEvent":{"p":{"cancel":"","fromGameMode":"GameMode","player":"Player","toGameMode":"GameMode"},"f":{}},"PlayerGameModeChangeBeforeEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"PlayerGameModeChangeBeforeEvent"},"PlayerHotbarSelectedSlotChangeAfterEvent":{"p":{"itemStack":"ItemStack","newSlotSelected":"","player":"Player","previousSlotSelected":""},"f":{}},"PlayerHotbarSelectedSlotChangeAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"PlayerHotbarSelectedSlotChangeAfterEvent"},"PlayerInputModeChangeAfterEvent":{"p":{"newInputModeUsed":"InputMode","player":"Player","previousInputModeUsed":"InputMode"},"f":{}},"PlayerInputModeChangeAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"PlayerInputModeChangeAfterEvent"},"PlayerInputPermissionCategoryChangeAfterEvent":{"p":{"category":"InputPermissionCategory","enabled":"","player":"Player"},"f":{}},"PlayerInputPermissionCategoryChangeAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"PlayerInputPermissionCategoryChangeAfterEvent"},"PlayerInputPermissions":{"p":{},"f":{"isPermissionCategoryEnabled":"","setPermissionCategory":""}},"PlayerInteractWithBlockAfterEvent":{"p":{"beforeItemStack":"ItemStack","block":"Block","blockFace":"Direction","faceLocation":"Vector3","isFirstEvent":"","itemStack":"ItemStack","player":"Player"},"f":{}},"PlayerInteractWithBlockAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"PlayerInteractWithBlockAfterEvent"},"PlayerInteractWithBlockBeforeEvent":{"p":{"block":"Block","blockFace":"Direction","cancel":"","faceLocation":"Vector3","isFirstEvent":"","itemStack":"ItemStack","player":"Player"},"f":{}},"PlayerInteractWithBlockBeforeEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"PlayerInteractWithBlockBeforeEvent"},"PlayerInteractWithEntityAfterEvent":{"p":{"beforeItemStack":"ItemStack","itemStack":"ItemStack","player":"Player","target":"Entity"},"f":{}},"PlayerInteractWithEntityAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"PlayerInteractWithEntityAfterEvent"},"PlayerInteractWithEntityBeforeEvent":{"p":{"cancel":"","itemStack":"ItemStack","player":"Player","target":"Entity"},"f":{}},"PlayerInteractWithEntityBeforeEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"PlayerInteractWithEntityBeforeEvent"},"PlayerInventoryItemChangeAfterEvent":{"p":{"beforeItemStack":"ItemStack","inventoryType":"PlayerInventoryType","itemStack":"ItemStack","player":"Player","slot":""},"f":{}},"PlayerInventoryItemChangeAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"PlayerInventoryItemChangeAfterEvent"},"PlayerJoinAfterEvent":{"p":{"playerId":"","playerName":""},"f":{}},"PlayerJoinAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"PlayerJoinAfterEvent"},"PlayerLeaveAfterEvent":{"p":{"playerId":"","playerName":""},"f":{}},"PlayerLeaveAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"PlayerLeaveAfterEvent"},"PlayerLeaveBeforeEvent":{"p":{"player":"Player"},"f":{}},"PlayerLeaveBeforeEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"PlayerLeaveBeforeEvent"},"PlayerPlaceBlockAfterEvent":{"b":["BlockEvent"],"p":{"player":"Player"},"f":{}},"PlayerPlaceBlockAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"PlayerPlaceBlockAfterEvent"},"PlayerSpawnAfterEvent":{"p":{"initialSpawn":"","player":"Player"},"f":{}},"PlayerSpawnAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"PlayerSpawnAfterEvent"},"PlayerStartBreakingBlockAfterEvent":{"b":["BlockEvent"],"p":{"blockPermutation":"BlockPermutation","face":"Direction","heldItemStack":"ItemStack","player":"Player"},"f":{}},"PlayerStartBreakingBlockAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"PlayerStartBreakingBlockAfterEvent"},"PlayerSwingStartAfterEvent":{"p":{"heldItemStack":"ItemStack","player":"Player","swingSource":"EntitySwingSource"},"f":{}},"PlayerSwingStartAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"PlayerSwingStartAfterEvent"},"PlayerWaypoint":{"b":["EntityWaypoint"],"p":{"playerRules":"PlayerVisibilityRules"},"f":{"constructor":"PlayerWaypoint"}},"PotionDeliveryType":{"p":{"id":""},"f":{}},"PotionEffectType":{"p":{"durationTicks":"","id":""},"f":{}},"Potions":{"p":{},"f":{"getAllDeliveryTypes":"[PotionDeliveryType","getAllEffectTypes":"[PotionEffectType","getDeliveryType":"PotionDeliveryType","getEffectType":"PotionEffectType","resolve":"ItemStack"}},"PressurePlatePopAfterEvent":{"b":["BlockEvent"],"p":{"previousRedstonePower":"","redstonePower":""},"f":{}},"PressurePlatePopAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"PressurePlatePopAfterEvent"},"PressurePlatePushAfterEvent":{"b":["BlockEvent"],"p":{"previousRedstonePower":"","redstonePower":"","source":"Entity"},"f":{}},"PressurePlatePushAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"PressurePlatePushAfterEvent"},"PrimitiveShape":{"p":{"attachedTo":"Entity","color":"RGBA","dimension":"Dimension","hasDuration":"","location":"Vector3","maximumRenderDistance":"","rotation":"Vector3","scale":"","timeLeft":"","totalTimeLeft":"","visibleTo":"[Player"},"f":{"remove":"","setLocation":""}},"PrimitiveShapesManager":{"p":{"maxShapes":""},"f":{"addText":"","getShapes":"[PrimitiveShape","removeAll":"","removeText":""}},"ProjectileHitBlockAfterEvent":{"p":{"dimension":"Dimension","hitVector":"Vector3","location":"Vector3","projectile":"Entity","source":"Entity"},"f":{"getBlockHit":"BlockHitInformation"}},"ProjectileHitBlockAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"ProjectileHitBlockAfterEvent"},"ProjectileHitEntityAfterEvent":{"p":{"dimension":"Dimension","hitVector":"Vector3","location":"Vector3","projectile":"Entity","source":"Entity"},"f":{"getEntityHit":"EntityHitInformation"}},"ProjectileHitEntityAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"ProjectileHitEntityAfterEvent"},"RandomAuxValueFunction":{"b":["LootItemFunction"],"p":{"values":"NumberRange"},"f":{}},"RandomBlockStateFunction":{"b":["LootItemFunction"],"p":{"blockState":"","values":"NumberRange"},"f":{}},"RandomChanceCondition":{"b":["LootItemCondition"],"p":{"chance":""},"f":{}},"RandomChanceWithLootingCondition":{"b":["LootItemCondition"],"p":{"chance":"","lootingMultiplier":""},"f":{}},"RandomDifficultyChanceCondition":{"b":["LootItemCondition"],"p":{"chances":"["},"f":{}},"RandomDyeFunction":{"b":["LootItemFunction"],"p":{},"f":{}},"RandomRegionalDifficultyChanceCondition":{"b":["LootItemCondition"],"p":{"maxChance":""},"f":{}},"Scoreboard":{"p":{},"f":{"addObjective":"ScoreboardObjective","clearObjectiveAtDisplaySlot":"ScoreboardObjective","getObjective":"ScoreboardObjective","getObjectiveAtDisplaySlot":"ScoreboardObjectiveDisplayOptions","getObjectives":"[ScoreboardObjective","getParticipants":"[ScoreboardIdentity","removeObjective":"","setObjectiveAtDisplaySlot":"ScoreboardObjective"}},"ScoreboardIdentity":{"p":{"displayName":"","id":"","isValid":"","type":"ScoreboardIdentityType"},"f":{"getEntity":"Entity"}},"ScoreboardObjective":{"p":{"displayName":"","id":"","isValid":""},"f":{"addScore":"","getParticipants":"[ScoreboardIdentity","getScore":"","getScores":"[ScoreboardScoreInfo","hasParticipant":"","removeParticipant":"","setScore":""}},"ScoreboardScoreInfo":{"p":{"participant":"ScoreboardIdentity","score":""},"f":{}},"ScreenDisplay":{"p":{"isValid":""},"f":{"getHiddenHudElements":"[HudElement","hideAllExcept":"","isForcedHidden":"","resetHudElementsVisibility":"","setActionBar":"","setHudVisibility":"","setTitle":"","updateSubtitle":""}},"ScriptEventCommandMessageAfterEvent":{"p":{"id":"","initiator":"Entity","message":"","sourceBlock":"Block","sourceEntity":"Entity","sourceType":"ScriptEventSource"},"f":{}},"ScriptEventCommandMessageAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"ScriptEventCommandMessageAfterEvent"},"Seat":{"p":{"lockRiderRotation":"","maxRiderCount":"","minRiderCount":"","position":"Vector3","seatRotation":""},"f":{}},"SetArmorTrimFunction":{"b":["LootItemFunction"],"p":{"material":"","pattern":""},"f":{}},"SetBannerDetailsFunction":{"b":["LootItemFunction"],"p":{"type":""},"f":{}},"SetBookContentsFunction":{"b":["LootItemFunction"],"p":{"author":"","pages":"[","title":""},"f":{}},"SetDataFromColorIndexFunction":{"b":["LootItemFunction"],"p":{},"f":{}},"SetItemCountFunction":{"b":["LootItemFunction"],"p":{"count":"NumberRange"},"f":{}},"SetItemDamageFunction":{"b":["LootItemFunction"],"p":{"damage":"NumberRange"},"f":{}},"SetItemDataFunction":{"b":["LootItemFunction"],"p":{"data":"NumberRange"},"f":{}},"SetItemLoreFunction":{"b":["LootItemFunction"],"p":{"lore":"["},"f":{}},"SetItemNameFunction":{"b":["LootItemFunction"],"p":{"name":""},"f":{}},"SetOminousBottleFunction":{"b":["LootItemFunction"],"p":{"amplifier":"NumberRange"},"f":{}},"SetPotionFunction":{"b":["LootItemFunction"],"p":{"id":""},"f":{}},"SetSpawnEggFunction":{"b":["LootItemFunction"],"p":{"id":""},"f":{}},"SetStewEffectFunction":{"b":["LootItemFunction"],"p":{"effects":"["},"f":{}},"ShutdownBeforeEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"ShutdownEvent"},"ShutdownEvent":{"p":{},"f":{}},"SmeltItemFunction":{"b":["LootItemFunction"],"p":{},"f":{}},"SoundCompletedAfterEvent":{"p":{"soundInstanceId":""},"f":{}},"SoundCompletedAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"SoundCompletedAfterEvent"},"SoundDefinition":{"p":{"durationInfo":"SoundDefinitionDurationInfo","musicInfo":"SoundDefinitionMusicInfo","soundEventId":"","tags":""},"f":{}},"SoundDefinitionRegistry":{"p":{},"f":{"getDefinitions":"[SoundDefinition"}},"SoundDurationInfo":{"p":{"duration":"","isActive":""},"f":{"getPlaybackPosition":""}},"SoundInstance":{"p":{"durationInfo":"SoundDurationInfo","id":"","recipient":"Player","soundEventId":""},"f":{"stop":""}},"SpecificEnchantFunction":{"b":["LootItemFunction"],"p":{"enchantments":"[EnchantInfo"},"f":{}},"StartupBeforeEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"StartupEvent"},"StartupEvent":{"p":{"blockComponentRegistry":"BlockComponentRegistry","customCommandRegistry":"CustomCommandRegistry","dimensionRegistry":"DimensionRegistry","itemComponentRegistry":"ItemComponentRegistry"},"f":{}},"Structure":{"b":["ISerializable"],"p":{"id":"","isValid":"","size":"Vector3"},"f":{"getBlockPermutation":"BlockPermutation","getIsWaterlogged":"","saveAs":"Structure","saveToWorld":"","setBlockPermutation":""}},"StructureManager":{"p":{},"f":{"createEmpty":"Structure","createFromWorld":"Structure","delete":"","get":"Structure","getPackStructureIds":"[","getWorldStructureIds":"[","place":"","placeJigsaw":"BlockBoundingBox","placeJigsawStructure":"BlockBoundingBox"}},"System":{"p":{"afterEvents":"SystemAfterEvents","beforeEvents":"SystemBeforeEvents","currentTick":"","isEditorWorld":"","serverSystemInfo":"SystemInfo"},"f":{"clearJob":"","clearRun":"","run":"","runInterval":"","runJob":"","runTimeout":"","sendScriptEvent":"","waitTicks":""}},"SystemAfterEvents":{"p":{"scriptEventReceive":"ScriptEventCommandMessageAfterEventSignal"},"f":{}},"SystemBeforeEvents":{"p":{"shutdown":"ShutdownBeforeEventSignal","startup":"StartupBeforeEventSignal"},"f":{}},"SystemInfo":{"p":{"memoryTier":"MemoryTier"},"f":{}},"TargetBlockHitAfterEvent":{"b":["BlockEvent"],"p":{"hitVector":"Vector3","previousRedstonePower":"","redstonePower":"","source":"Entity"},"f":{}},"TargetBlockHitAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"TargetBlockHitAfterEvent"},"TextPrimitive":{"b":["PrimitiveShape"],"p":{"backfaceVisible":"","backgroundColorOverride":"RGBA","depthTest":"","text":"","textBackfaceVisible":"","useRotation":""},"f":{"constructor":"TextPrimitive","setText":""}},"TickingAreaManager":{"p":{"chunkCount":"","maxChunkCount":""},"f":{"createTickingArea":"","getAllTickingAreas":"[TickingArea","getTickingArea":"TickingArea","hasCapacity":"","hasTickingArea":"","removeAllTickingAreas":"","removeTickingArea":""}},"Trigger":{"p":{"eventName":""},"f":{"constructor":"Trigger"}},"TripWireTripAfterEvent":{"b":["BlockEvent"],"p":{"isPowered":"","sources":"[Entity"},"f":{}},"TripWireTripAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"TripWireTripAfterEvent"},"Waypoint":{"p":{"color":"RGB","isEnabled":"","isValid":"","textureSelector":"WaypointTextureSelector"},"f":{"getDimensionLocation":"DimensionLocation","remove":""}},"WeatherChangeAfterEvent":{"p":{"dimension":"","newWeather":"WeatherType","previousWeather":"WeatherType"},"f":{}},"WeatherChangeAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"WeatherChangeAfterEvent"},"WeatherChangeBeforeEvent":{"p":{"cancel":"","duration":"","newWeather":"WeatherType","previousWeather":"WeatherType"},"f":{}},"WeatherChangeBeforeEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"WeatherChangeBeforeEvent"},"World":{"p":{"afterEvents":"WorldAfterEvents","beforeEvents":"WorldBeforeEvents","gameRules":"GameRules","isHardcore":"","primitiveShapesManager":"PrimitiveShapesManager","scoreboard":"Scoreboard","seed":"","soundDefinitionRegistry":"SoundDefinitionRegistry","structureManager":"StructureManager","tickingAreaManager":"TickingAreaManager"},"f":{"clearDynamicProperties":"","getAbsoluteTime":"","getAimAssist":"AimAssistRegistry","getAllPlayers":"[Player","getDay":"","getDefaultSpawnLocation":"Vector3","getDifficulty":"Difficulty","getDimension":"Dimension","getDynamicProperty":"","getDynamicPropertyIds":"[","getDynamicPropertyTotalByteCount":"","getEntity":"Entity","getLootTableManager":"LootTableManager","getMoonPhase":"MoonPhase","getPackSettings":"","getPlayers":"[Player","getTimeOfDay":"","playMusic":"","queueMusic":"","sendMessage":"","setAbsoluteTime":"","setDefaultSpawnLocation":"","setDifficulty":"","setDynamicProperties":"","setDynamicProperty":"","setTimeOfDay":"","stopMusic":""}},"WorldAfterEvents":{"p":{"blockContainerClosed":"BlockContainerClosedAfterEventSignal","blockContainerOpened":"BlockContainerOpenedAfterEventSignal","blockExplode":"BlockExplodeAfterEventSignal","buttonPush":"ButtonPushAfterEventSignal","dataDrivenEntityTrigger":"DataDrivenEntityTriggerAfterEventSignal","effectAdd":"EffectAddAfterEventSignal","entityContainerClosed":"EntityContainerClosedAfterEventSignal","entityContainerOpened":"EntityContainerOpenedAfterEventSignal","entityDie":"EntityDieAfterEventSignal","entityHeal":"EntityHealAfterEventSignal","entityHealthChanged":"EntityHealthChangedAfterEventSignal","entityHitBlock":"EntityHitBlockAfterEventSignal","entityHitEntity":"EntityHitEntityAfterEventSignal","entityHurt":"EntityHurtAfterEventSignal","entityItemDrop":"EntityItemDropAfterEventSignal","entityItemPickup":"EntityItemPickupAfterEventSignal","entityLoad":"EntityLoadAfterEventSignal","entityRemove":"EntityRemoveAfterEventSignal","entitySpawn":"EntitySpawnAfterEventSignal","entityStartSneaking":"EntityStartSneakingAfterEventSignal","entityStopSneaking":"EntityStopSneakingAfterEventSignal","entityTamed":"EntityTamedAfterEventSignal","entityUpgrade":"EntityUpgradeAfterEventSignal","explosion":"ExplosionAfterEventSignal","gameRuleChange":"GameRuleChangeAfterEventSignal","itemCompleteUse":"ItemCompleteUseAfterEventSignal","itemReleaseUse":"ItemReleaseUseAfterEventSignal","itemStartUse":"ItemStartUseAfterEventSignal","itemStartUseOn":"ItemStartUseOnAfterEventSignal","itemStopUse":"ItemStopUseAfterEventSignal","itemStopUseOn":"ItemStopUseOnAfterEventSignal","itemUse":"ItemUseAfterEventSignal","leverAction":"LeverActionAfterEventSignal","pistonActivate":"PistonActivateAfterEventSignal","playerBreakBlock":"PlayerBreakBlockAfterEventSignal","playerButtonInput":"PlayerButtonInputAfterEventSignal","playerCancelBreakingBlock":"PlayerCancelBreakingBlockAfterEventSignal","playerDimensionChange":"PlayerDimensionChangeAfterEventSignal","playerEmote":"PlayerEmoteAfterEventSignal","playerGameModeChange":"PlayerGameModeChangeAfterEventSignal","playerHotbarSelectedSlotChange":"PlayerHotbarSelectedSlotChangeAfterEventSignal","playerInputModeChange":"PlayerInputModeChangeAfterEventSignal","playerInputPermissionCategoryChange":"PlayerInputPermissionCategoryChangeAfterEventSignal","playerInteractWithBlock":"PlayerInteractWithBlockAfterEventSignal","playerInteractWithEntity":"PlayerInteractWithEntityAfterEventSignal","playerInventoryItemChange":"PlayerInventoryItemChangeAfterEventSignal","playerJoin":"PlayerJoinAfterEventSignal","playerLeave":"PlayerLeaveAfterEventSignal","playerPlaceBlock":"PlayerPlaceBlockAfterEventSignal","playerSpawn":"PlayerSpawnAfterEventSignal","playerStartBreakingBlock":"PlayerStartBreakingBlockAfterEventSignal","playerSwingStart":"PlayerSwingStartAfterEventSignal","pressurePlatePop":"PressurePlatePopAfterEventSignal","pressurePlatePush":"PressurePlatePushAfterEventSignal","projectileHitBlock":"ProjectileHitBlockAfterEventSignal","projectileHitEntity":"ProjectileHitEntityAfterEventSignal","soundCompleted":"SoundCompletedAfterEventSignal","targetBlockHit":"TargetBlockHitAfterEventSignal","tripWireTrip":"TripWireTripAfterEventSignal","weatherChange":"WeatherChangeAfterEventSignal","worldLoad":"WorldLoadAfterEventSignal"},"f":{}},"WorldBeforeEvents":{"p":{"effectAdd":"EffectAddBeforeEventSignal","entityHeal":"EntityHealBeforeEventSignal","entityHurt":"EntityHurtBeforeEventSignal","entityItemPickup":"EntityItemPickupBeforeEventSignal","entityRemove":"EntityRemoveBeforeEventSignal","entityTamed":"EntityTamedBeforeEventSignal","explosion":"ExplosionBeforeEventSignal","itemUse":"ItemUseBeforeEventSignal","playerBreakBlock":"PlayerBreakBlockBeforeEventSignal","playerGameModeChange":"PlayerGameModeChangeBeforeEventSignal","playerInteractWithBlock":"PlayerInteractWithBlockBeforeEventSignal","playerInteractWithEntity":"PlayerInteractWithEntityBeforeEventSignal","playerLeave":"PlayerLeaveBeforeEventSignal","weatherChange":"WeatherChangeBeforeEventSignal"},"f":{}},"WorldLoadAfterEvent":{"p":{},"f":{}},"WorldLoadAfterEventSignal":{"p":{},"f":{"subscribe":"","unsubscribe":""},"ev":"WorldLoadAfterEvent"}},"e":{"AimAssistTargetMode":{"Angle":"Angle","Distance":"Distance"},"BlockComponentTypes":{"DynamicProperties":"minecraft:dynamic_properties","FluidContainer":"minecraft:fluid_container","Instrument":"minecraft:instrument_sound","Inventory":"minecraft:inventory","MapColor":"minecraft:map_color","Movable":"minecraft:movable","Piston":"minecraft:piston","PrecipitationInteractions":"minecraft:precipitation_interactions","RecordPlayer":"minecraft:record_player","RedstoneProducer":"minecraft:redstone_producer","Sign":"minecraft:sign"},"BlockPistonState":{"Expanded":"Expanded","Expanding":"Expanding","Retracted":"Retracted","Retracting":"Retracting"},"BlockVolumeIntersection":{"Contains":1,"Disjoint":0,"Intersects":2},"BookErrorReason":{"ExceedsMaxPageLength":"ExceedsMaxPageLength","ExceedsMaxPages":"ExceedsMaxPages","ExceedsTitleLength":"ExceedsTitleLength"},"ButtonState":{"Pressed":"Pressed","Released":"Released"},"CameraShakeType":{"Positional":"Positional","Rotational":"Rotational"},"CloneMode":{"Copy":0,"ForceCopy":1,"Move":2},"CommandPermissionLevel":{"Admin":2,"Any":0,"GameDirectors":1,"Host":3,"Owner":4},"ContainerRulesErrorReason":{"BannedItem":"BannedItem","NestedStorageItem":"NestedStorageItem","NotAllowedItem":"NotAllowedItem","OverWeightLimit":"OverWeightLimit","ZeroWeightItem":"ZeroWeightItem"},"ControlScheme":{"CameraRelative":"CameraRelative","CameraRelativeStrafe":"CameraRelativeStrafe","LockedPlayerRelativeStrafe":"LockedPlayerRelativeStrafe","PlayerRelative":"PlayerRelative","PlayerRelativeStrafe":"PlayerRelativeStrafe"},"CustomCommandErrorReason":{"AlreadyRegistered":"AlreadyRegistered","EnumDependencyMissing":"EnumDependencyMissing","NamespaceMismatch":"NamespaceMismatch","ParameterLimit":"ParameterLimit","RegistryInvalid":"RegistryInvalid","RegistryReadOnly":"RegistryReadOnly"},"CustomCommandParamType":{"BlockType":"BlockType","Boolean":"Boolean","EntitySelector":"EntitySelector","EntityType":"EntityType","Enum":"Enum","Float":"Float","Integer":"Integer","ItemType":"ItemType","Location":"Location","PlayerSelector":"PlayerSelector","String":"String"},"CustomCommandSource":{"Block":"Block","Entity":"Entity","NPCDialogue":"NPCDialogue","Server":"Server"},"CustomCommandStatus":{"Failure":1,"Success":0},"CustomComponentNameErrorReason":{"DisallowedNamespace":2,"NoNamespace":1},"Difficulty":{"Easy":"Easy","Hard":"Hard","Normal":"Normal","Peaceful":"Peaceful"},"Direction":{"Down":"Down","East":"East","North":"North","South":"South","Up":"Up","West":"West"},"DisplaySlotId":{"BelowName":"BelowName","List":"List","Sidebar":"Sidebar"},"DyeColor":{"Black":"Black","Blue":"Blue","Brown":"Brown","Cyan":"Cyan","Gray":"Gray","Green":"Green","LightBlue":"LightBlue","Lime":"Lime","Magenta":"Magenta","Orange":"Orange","Pink":"Pink","Purple":"Purple","Red":"Red","Silver":"Silver","White":"White","Yellow":"Yellow"},"EasingType":{"InBack":"InBack","InBounce":"InBounce","InCirc":"InCirc","InCubic":"InCubic","InElastic":"InElastic","InExpo":"InExpo","InOutBack":"InOutBack","InOutBounce":"InOutBounce","InOutCirc":"InOutCirc","InOutCubic":"InOutCubic","InOutElastic":"InOutElastic","InOutExpo":"InOutExpo","InOutQuad":"InOutQuad","InOutQuart":"InOutQuart","InOutQuint":"InOutQuint","InOutSine":"InOutSine","InQuad":"InQuad","InQuart":"InQuart","InQuint":"InQuint","InSine":"InSine","Linear":"Linear","OutBack":"OutBack","OutBounce":"OutBounce","OutCirc":"OutCirc","OutCubic":"OutCubic","OutElastic":"OutElastic","OutExpo":"OutExpo","OutQuad":"OutQuad","OutQuart":"OutQuart","OutQuint":"OutQuint","OutSine":"OutSine","Spring":"Spring"},"EnchantmentSlot":{"ArmorFeet":"ArmorFeet","ArmorHead":"ArmorHead","ArmorLegs":"ArmorLegs","ArmorTorso":"ArmorTorso","Axe":"Axe","Bow":"Bow","CarrotStick":"CarrotStick","CosmeticHead":"CosmeticHead","Crossbow":"Crossbow","Elytra":"Elytra","FishingRod":"FishingRod","Flintsteel":"Flintsteel","Hoe":"Hoe","MeleeSpear":"MeleeSpear","Pickaxe":"Pickaxe","Shears":"Shears","Shield":"Shield","Shovel":"Shovel","Spear":"Spear","Sword":"Sword"},"EntityAttachPoint":{"Body":"Body","BreathingPoint":"BreathingPoint","DropAttachPoint":"DropAttachPoint","ExplosionPoint":"ExplosionPoint","Eyes":"Eyes","Feet":"Feet","Head":"Head","Mouth":"Mouth","WeaponAttachPoint":"WeaponAttachPoint"},"EntityComponentTypes":{"AddRider":"minecraft:addrider","Ageable":"minecraft:ageable","Breathable":"minecraft:breathable","CanClimb":"minecraft:can_climb","CanFly":"minecraft:can_fly","CanPowerJump":"minecraft:can_power_jump","Color":"minecraft:color","Color2":"minecraft:color2","CursorInventory":"minecraft:cursor_inventory","EnderInventory":"minecraft:ender_inventory","Equippable":"minecraft:equippable","Exhaustion":"minecraft:player.exhaustion","FireImmune":"minecraft:fire_immune","FloatsInLiquid":"minecraft:floats_in_liquid","FlyingSpeed":"minecraft:flying_speed","FrictionModifier":"minecraft:friction_modifier","Healable":"minecraft:healable","Health":"minecraft:health","Hunger":"minecraft:player.hunger","Inventory":"minecraft:inventory","IsBaby":"minecraft:is_baby","IsCharged":"minecraft:is_charged","IsChested":"minecraft:is_chested","IsDyeable":"minecraft:is_dyeable","IsHiddenWhenInvisible":"minecraft:is_hidden_when_invisible","IsIgnited":"minecraft:is_ignited","IsIllagerCaptain":"minecraft:is_illager_captain","IsSaddled":"minecraft:is_saddled","IsShaking":"minecraft:is_shaking","IsSheared":"minecraft:is_sheared","IsStackable":"minecraft:is_stackable","IsStunned":"minecraft:is_stunned","IsTamed":"minecraft:is_tamed","Item":"minecraft:item","LavaMovement":"minecraft:lava_movement","Leashable":"minecraft:leashable","MarkVariant":"minecraft:mark_variant","Movement":"minecraft:movement","MovementAmphibious":"minecraft:movement.amphibious","MovementBasic":"minecraft:movement.basic","MovementFly":"minecraft:movement.fly","MovementGeneric":"minecraft:movement.generic","MovementGlide":"minecraft:movement.glide","MovementHover":"minecraft:movement.hover","MovementJump":"minecraft:movement.jump","MovementSkip":"minecraft:movement.skip","MovementSway":"minecraft:movement.sway","NavigationClimb":"minecraft:navigation.climb","NavigationFloat":"minecraft:navigation.float","NavigationFly":"minecraft:navigation.fly","NavigationGeneric":"minecraft:navigation.generic","NavigationHover":"minecraft:navigation.hover","NavigationWalk":"minecraft:navigation.walk","OnFire":"minecraft:onfire","Projectile":"minecraft:projectile","PushThrough":"minecraft:push_through","Rideable":"minecraft:rideable","Riding":"minecraft:riding","Saturation":"minecraft:player.saturation","Scale":"minecraft:scale","SkinId":"minecraft:skin_id","Strength":"minecraft:strength","Tameable":"minecraft:tameable","TameMount":"minecraft:tamemount","TypeFamily":"minecraft:type_family","UnderwaterMovement":"minecraft:underwater_movement","Variant":"minecraft:variant","WantsJockey":"minecraft:wants_jockey"},"EntityDamageCause":{"anvil":"anvil","blockExplosion":"blockExplosion","campfire":"campfire","charging":"charging","contact":"contact","drowning":"drowning","entityAttack":"entityAttack","entityExplosion":"entityExplosion","fall":"fall","fallingBlock":"fallingBlock","fire":"fire","fireTick":"fireTick","fireworks":"fireworks","flyIntoWall":"flyIntoWall","freezing":"freezing","lava":"lava","lightning":"lightning","maceSmash":"maceSmash","magic":"magic","magma":"magma","none":"none","override":"override","piston":"piston","projectile":"projectile","ramAttack":"ramAttack","selfDestruct":"selfDestruct","sonicBoom":"sonicBoom","soulCampfire":"soulCampfire","stalactite":"stalactite","stalagmite":"stalagmite","starve":"starve","suffocation":"suffocation","temperature":"temperature","thorns":"thorns","void":"void","wither":"wither"},"EntityHealCause":{"Heal":"Heal","Regeneration":"Regeneration","SelfHeal":"SelfHeal","TotemOfUndying":"TotemOfUndying"},"EntityInitializationCause":{"Born":"Born","Event":"Event","Loaded":"Loaded","Spawned":"Spawned","Transformed":"Transformed"},"EntitySwingSource":{"Attack":"Attack","Build":"Build","DropItem":"DropItem","Event":"Event","Interact":"Interact","Mine":"Mine","None":"None","ThrowItem":"ThrowItem","UseItem":"UseItem"},"EquipmentSlot":{"Chest":"Chest","Feet":"Feet","Head":"Head","Legs":"Legs","Mainhand":"Mainhand","Offhand":"Offhand"},"FluidType":{"Lava":"Lava","Potion":"Potion","PowderSnow":"PowderSnow","Water":"Water"},"GameMode":{"Adventure":"Adventure","Creative":"Creative","Spectator":"Spectator","Survival":"Survival"},"GameRule":{"CommandBlockOutput":"commandBlockOutput","CommandBlocksEnabled":"commandBlocksEnabled","DoDayLightCycle":"doDayLightCycle","DoEntityDrops":"doEntityDrops","DoFireTick":"doFireTick","DoImmediateRespawn":"doImmediateRespawn","DoInsomnia":"doInsomnia","DoLimitedCrafting":"doLimitedCrafting","DoMobLoot":"doMobLoot","DoMobSpawning":"doMobSpawning","DoTileDrops":"doTileDrops","DoWeatherCycle":"doWeatherCycle","DrowningDamage":"drowningDamage","FallDamage":"fallDamage","FireDamage":"fireDamage","FreezeDamage":"freezeDamage","FunctionCommandLimit":"functionCommandLimit","KeepInventory":"keepInventory","MaxCommandChainLength":"maxCommandChainLength","MobGriefing":"mobGriefing","NaturalRegeneration":"naturalRegeneration","PlayersSleepingPercentage":"playersSleepingPercentage","ProjectilesCanBreakBlocks":"projectilesCanBreakBlocks","Pvp":"pvp","RandomTickSpeed":"randomTickSpeed","RecipesUnlock":"recipesUnlock","RespawnBlocksExplode":"respawnBlocksExplode","SendCommandFeedback":"sendCommandFeedback","ShowBorderEffect":"showBorderEffect","ShowCoordinates":"showCoordinates","ShowDaysPlayed":"showDaysPlayed","ShowDeathMessages":"showDeathMessages","ShowRecipeMessages":"showRecipeMessages","ShowTags":"showTags","SpawnRadius":"spawnRadius","TntExplodes":"tntExplodes","TntExplosionDropDecay":"tntExplosionDropDecay"},"GraphicsMode":{"Deferred":"Deferred","Fancy":"Fancy","RayTraced":"RayTraced","Simple":"Simple"},"HeldItemOption":{"AnyItem":"AnyItem","NoItem":"NoItem"},"HudElement":{"AirBubbles":9,"Armor":1,"Crosshair":4,"Health":6,"HorseHealth":10,"Hotbar":5,"Hunger":8,"ItemText":12,"PaperDoll":0,"ProgressBar":7,"StatusEffects":11,"ToolTips":2,"TouchControls":3},"HudVisibility":{"Hide":0,"Reset":1},"InputButton":{"Jump":"Jump","Sneak":"Sneak"},"InputMode":{"Gamepad":"Gamepad","KeyboardAndMouse":"KeyboardAndMouse","MotionController":"MotionController","Touch":"Touch"},"InputPermissionCategory":{"Camera":1,"Dismount":8,"Jump":6,"LateralMovement":4,"Mount":7,"MoveBackward":10,"MoveForward":9,"MoveLeft":11,"Movement":2,"MoveRight":12,"Sneak":5},"ItemComponentTypes":{"BlockDynamicProperties":"minecraft:block_actor_dynamic_properties","Book":"minecraft:book","Compostable":"minecraft:compostable","Cooldown":"minecraft:cooldown","Durability":"minecraft:durability","Dyeable":"minecraft:dyeable","Enchantable":"minecraft:enchantable","Food":"minecraft:food","Inventory":"minecraft:inventory","Potion":"minecraft:potion"},"ItemLockMode":{"inventory":"inventory","none":"none","slot":"slot"},"LiquidSettings":{"ApplyWaterlogging":"ApplyWaterlogging","IgnoreWaterlogging":"IgnoreWaterlogging"},"LiquidType":{"Water":"Water"},"LocatorBarErrorReason":{"WaypointAlreadyExists":"WaypointAlreadyExists","WaypointLimitExceeded":"WaypointLimitExceeded","WaypointNotFound":"WaypointNotFound"},"MemoryTier":{"High":3,"Low":1,"Mid":2,"SuperHigh":4,"SuperLow":0},"MoonPhase":{"FirstQuarter":2,"FullMoon":0,"LastQuarter":6,"NewMoon":4,"WaningCrescent":3,"WaningGibbous":1,"WaxingCrescent":5,"WaxingGibbous":7},"MovementType":{"Immovable":"Immovable","Popped":"Popped","Push":"Push","PushPull":"PushPull"},"NamespaceNameErrorReason":{"DisallowedNamespace":"DisallowedNamespace","NoNamespace":"NoNamespace"},"ObjectiveSortOrder":{"Ascending":0,"Descending":1},"PaletteColor":{"Black":15,"Blue":11,"Brown":12,"Cyan":9,"Gray":7,"Green":13,"LightBlue":3,"Lime":5,"Magenta":2,"Orange":1,"Pink":6,"Purple":10,"Red":14,"Silver":8,"White":0,"Yellow":4},"PlatformType":{"Console":"Console","Desktop":"Desktop","Mobile":"Mobile"},"PlayerInventoryType":{"Hotbar":"Hotbar","Inventory":"Inventory"},"PlayerPermissionLevel":{"Custom":3,"Member":1,"Operator":2,"Visitor":0},"PlayerSplitScreenSlot":{"First":"First","Fourth":"Fourth","Second":"Second","Third":"Third"},"ScoreboardIdentityType":{"Entity":"Entity","FakePlayer":"FakePlayer","Player":"Player"},"ScriptEventSource":{"Block":"Block","Entity":"Entity","NPCDialogue":"NPCDialogue","Server":"Server"},"SignSide":{"Back":"Back","Front":"Front"},"StickyType":{"None":"None","Same":"Same"},"StructureAnimationMode":{"Blocks":"Blocks","Layers":"Layers","None":"None"},"StructureMirrorAxis":{"None":"None","X":"X","XZ":"XZ","Z":"Z"},"StructureRotation":{"None":"None","Rotate180":"Rotate180","Rotate270":"Rotate270","Rotate90":"Rotate90"},"StructureSaveMode":{"Memory":"Memory","World":"World"},"TickingAreaErrorReason":{"IdentifierAlreadyExists":"IdentifierAlreadyExists","OverChunkLimit":"OverChunkLimit","SideLengthExceeded":"SideLengthExceeded","UnknownIdentifier":"UnknownIdentifier"},"TimeOfDay":{"Day":1000,"Midnight":18000,"Night":13000,"Noon":6000,"Sunrise":23000,"Sunset":12000},"TintMethod":{"BirchFoliage":"BirchFoliage","DefaultFoliage":"DefaultFoliage","DryFoliage":"DryFoliage","EvergreenFoliage":"EvergreenFoliage","Grass":"Grass","None":"None","Water":"Water"},"WaypointTexture":{"Circle":"minecraft:circle","SmallSquare":"minecraft:small_square","SmallStar":"minecraft:small_star","Square":"minecraft:square"},"WeatherType":{"Clear":"Clear","Rain":"Rain","Thunder":"Thunder"}},"i":{"AABB":["center","extent"],"AnimationOptions":["animation","totalTimeSeconds"],"BiomeFilter":["excludeBiomes","excludeTags","includeBiomes","includeTags"],"BiomeSearchOptions":["boundingSize"],"BlockBoundingBox":["max","min"],"BlockContainerAccessEventOptions":["accessSourceFilter","blockFilter"],"BlockCustomComponent":["beforeOnPlayerPlace","onBlockStateChange","onBreak","onEntity","onEntityFallOn","onPlace","onPlayerBreak","onPlayerInteract","onRandomTick","onRedstoneUpdate","onStepOff","onStepOn","onTick"],"BlockEventOptions":["blockTypes","permutations"],"BlockFillOptions":["blockFilter","ignoreChunkBoundErrors"],"BlockFilter":["excludePermutations","excludeTags","excludeTypes","includePermutations","includeTags","includeTypes"],"BlockHitInformation":["block","face","faceLocation"],"BlockQueryOptions":["closest","farthest","location"],"BlockRaycastHit":["block","face","faceLocation"],"BlockRaycastOptions":["includeLiquidBlocks","includePassableBlocks","maxDistance"],"CameraAttachOptions":["entity","locator"],"CameraFadeOptions":["fadeColor","fadeTime"],"CameraFadeTimeOptions":["fadeInTime","fadeOutTime","holdTime"],"CameraFixedBoomOptions":["entityOffset","viewOffset"],"CameraFovOptions":["easeOptions","fov"],"CameraSetFacingOptions":["easeOptions","facingEntity","location"],"CameraSetLocationOptions":["easeOptions","location"],"CameraSetPosOptions":["easeOptions","facingLocation","location"],"CameraSetRotOptions":["easeOptions","location","rotation"],"CameraShakeOptions":["duration","intensity","type"],"CameraTargetOptions":["offsetFromTargetCenter","targetEntity"],"ContainerAccessSource":["entity"],"ContainerAccessSourceFilter":["entityFilter"],"ContainerRules":["allowedItems","allowNestedStorageItems","bannedItems","weightLimit"],"CustomCommand":["cheatsRequired","description","mandatoryParameters","name","optionalParameters","permissionLevel"],"CustomCommandParameter":["name","type"],"CustomCommandResult":["message","status"],"CustomTexture":["iconHeight","iconWidth","path"],"DefinitionModifier":["addedComponentGroups","removedComponentGroups"],"DimensionLocation":["dimension","x","y","z"],"EaseOptions":["easeTime","easeType"],"Enchantment":["level","type"],"EntityApplyDamageByProjectileOptions":["damagingEntity","damagingProjectile"],"EntityApplyDamageOptions":["cause","damagingEntity"],"EntityContainerAccessEventOptions":["accessSourceFilter","entityFilter"],"EntityDamageSource":["cause","damagingEntity","damagingProjectile"],"EntityDataDrivenTriggerEventOptions":["entities","entityTypes","eventTypes"],"EntityEffectOptions":["amplifier","showParticles"],"EntityEventOptions":["entities","entityTypes"],"EntityFilter":["excludeFamilies","excludeGameModes","excludeNames","excludeTags","excludeTypes","families","gameMode","maxHorizontalRotation","maxLevel","maxVerticalRotation","minHorizontalRotation","minLevel","minVerticalRotation","name","propertyOptions","scoreOptions","tags","type"],"EntityHealEventOptions":["allowedHealCauses","entityFilter"],"EntityHitInformation":["entity"],"EntityHurtAfterEventOptions":["allowedDamageCauses","entities","entityFilter","entityTypes"],"EntityHurtBeforeEventOptions":["allowedDamageCauses","entityFilter"],"EntityItemDropEventOptions":["entityFilter","itemFilter"],"EntityItemPickupEventOptions":["entityFilter","itemFilter"],"EntityQueryOptions":["closest","farthest","location","maxDistance","minDistance","volume"],"EntityQueryPropertyOptions":["exclude","propertyId","value"],"EntityQueryScoreOptions":["exclude","maxScore","minScore","objective"],"EntityRaycastHit":["distance","entity"],"EntityRaycastOptions":["ignoreBlockCollision","includeLiquidBlocks","includePassableBlocks","maxDistance"],"EntitySneakingChangedEventOptions":["entityFilter"],"EntityTamedEventOptions":["entityFilter","tamingEntityFilter"],"EntityVisibilityRules":["showDead","showInvisible","showSneaking"],"EqualsComparison":["equals"],"ExplosionOptions":["allowUnderwater","breaksBlocks","causesFire","source"],"GetBlocksStandingOnOptions":["blockFilter","ignoreThinBlocks"],"GreaterThanComparison":["greaterThan"],"GreaterThanOrEqualsComparison":["greaterThanOrEquals"],"HotbarEventOptions":["allowedSlots"],"InputEventOptions":["buttons","state"],"InventoryItemEventOptions":["allowedSlots","excludeItems","excludeTags","ignoreQuantityChange","includeItems","includeTags","inventoryType"],"ItemCustomComponent":["onBeforeDurabilityDamage","onCompleteUse","onConsume","onHitEntity","onMineBlock","onUse","onUseOn"],"ItemFilter":["includeTypes"],"JigsawPlaceOptions":["includeEntities","keepJigsaws","liquidSettings"],"JigsawStructurePlaceOptions":["ignoreStartHeight","includeEntities","keepJigsaws","liquidSettings"],"LessThanComparison":["lessThan"],"LessThanOrEqualsComparison":["lessThanOrEquals"],"MusicOptions":["fade","loop","volume"],"NotEqualsComparison":["notEquals"],"PlayAnimationOptions":["blendOutTime","controller","nextState","players","stopExpression"],"PlayerAimAssistSettings":["distance","presetId","targetMode","viewAngle"],"PlayerBreakingBlockEventOptions":["blockFilter","playerFilter"],"PlayerSoundOptions":["location","pitch","volume"],"PlayerSwingEventOptions":["heldItemOption","swingSource"],"PlayerVisibilityRules":["showHidden","showSpectator","showSpectatorToSpectator"],"PrimitiveShapeQueryOptions":["attachedTo","location","maxDistance","minDistance"],"ProgressKeyFrame":["alpha","easingFunc","timeSeconds"],"ProjectileShootOptions":["uncertainty"],"RangeComparison":["lowerBound","upperBound"],"RawMessage":["rawtext","score","text","translate","with"],"RawMessageScore":["name","objective"],"RawText":["rawtext"],"RGB":["blue","green","red"],"RGBA":["alpha"],"RotationKeyFrame":["easingFunc","rotation","timeSeconds"],"ScoreboardObjectiveDisplayOptions":["objective","sortOrder"],"ScriptEventMessageFilterOptions":["namespaces"],"SoundDefinitionDurationInfo":["duration"],"SoundDefinitionFilter":["artists","genres","maxDuration","minDuration","moods","tags","titles"],"SoundDefinitionMusicInfo":["artist","genres","moods","title"],"SpawnEntityOptions":["initialPersistence","initialRotation","spawnEvent"],"SplineAnimation":["progressKeyFrames","rotationKeyFrames"],"StructureCreateOptions":["includeBlocks","includeEntities","saveMode"],"StructurePlaceOptions":["animationMode","animationSeconds","includeBlocks","includeEntities","integrity","integritySeed","mirror","rotation","waterlogged"],"TeleportOptions":["checkForBlocks","dimension","facingLocation","forceProvidedPositionOnDimensionChange","keepVelocity","rotation"],"TickingArea":["boundingBox","chunkCount","dimension","identifier","isFullyLoaded"],"TickingAreaOptions":["dimension","from","to"],"TitleDisplayOptions":["fadeInDuration","fadeOutDuration","stayDuration","subtitle"],"Vector2":["x","y"],"Vector3":["x","y","z"],"VectorXZ":["x","z"],"WaypointTextureBounds":["lowerBound","texture","upperBound"],"WaypointTextureSelector":["textureBoundsList"],"WorldSoundOptions":["isBroadcast","pitch","volume"]},"f":[],"k":{},"cid":{"minecraft:dynamic_properties":["BlockDynamicPropertiesComponent"],"minecraft:fluid_container":["BlockFluidContainerComponent"],"minecraft:instrument_sound":["BlockInstrumentComponent"],"minecraft:inventory":["BlockInventoryComponent","EntityInventoryComponent","ItemInventoryComponent"],"minecraft:map_color":["BlockMapColorComponent"],"minecraft:movable":["BlockMovableComponent"],"minecraft:piston":["BlockPistonComponent"],"minecraft:precipitation_interactions":["BlockPrecipitationInteractionsComponent"],"minecraft:record_player":["BlockRecordPlayerComponent"],"minecraft:redstone_producer":["BlockRedstoneProducerComponent"],"minecraft:sign":["BlockSignComponent"],"minecraft:addrider":["EntityAddRiderComponent"],"minecraft:ageable":["EntityAgeableComponent"],"minecraft:breathable":["EntityBreathableComponent"],"minecraft:can_climb":["EntityCanClimbComponent"],"minecraft:can_fly":["EntityCanFlyComponent"],"minecraft:can_power_jump":["EntityCanPowerJumpComponent"],"minecraft:color2":["EntityColor2Component"],"minecraft:color":["EntityColorComponent"],"minecraft:ender_inventory":["EntityEnderInventoryComponent"],"minecraft:equippable":["EntityEquippableComponent"],"minecraft:player.exhaustion":["EntityExhaustionComponent"],"minecraft:fire_immune":["EntityFireImmuneComponent"],"minecraft:floats_in_liquid":["EntityFloatsInLiquidComponent"],"minecraft:flying_speed":["EntityFlyingSpeedComponent"],"minecraft:friction_modifier":["EntityFrictionModifierComponent"],"minecraft:healable":["EntityHealableComponent"],"minecraft:health":["EntityHealthComponent"],"minecraft:player.hunger":["EntityHungerComponent"],"minecraft:is_baby":["EntityIsBabyComponent"],"minecraft:is_charged":["EntityIsChargedComponent"],"minecraft:is_chested":["EntityIsChestedComponent"],"minecraft:is_dyeable":["EntityIsDyeableComponent"],"minecraft:is_hidden_when_invisible":["EntityIsHiddenWhenInvisibleComponent"],"minecraft:is_ignited":["EntityIsIgnitedComponent"],"minecraft:is_illager_captain":["EntityIsIllagerCaptainComponent"],"minecraft:is_saddled":["EntityIsSaddledComponent"],"minecraft:is_shaking":["EntityIsShakingComponent"],"minecraft:is_sheared":["EntityIsShearedComponent"],"minecraft:is_stackable":["EntityIsStackableComponent"],"minecraft:is_stunned":["EntityIsStunnedComponent"],"minecraft:is_tamed":["EntityIsTamedComponent"],"minecraft:item":["EntityItemComponent"],"minecraft:lava_movement":["EntityLavaMovementComponent"],"minecraft:leashable":["EntityLeashableComponent"],"minecraft:mark_variant":["EntityMarkVariantComponent"],"minecraft:movement.amphibious":["EntityMovementAmphibiousComponent"],"minecraft:movement.basic":["EntityMovementBasicComponent"],"minecraft:movement":["EntityMovementComponent"],"minecraft:movement.fly":["EntityMovementFlyComponent"],"minecraft:movement.generic":["EntityMovementGenericComponent"],"minecraft:movement.glide":["EntityMovementGlideComponent"],"minecraft:movement.hover":["EntityMovementHoverComponent"],"minecraft:movement.jump":["EntityMovementJumpComponent"],"minecraft:movement.skip":["EntityMovementSkipComponent"],"minecraft:movement.sway":["EntityMovementSwayComponent"],"minecraft:navigation.climb":["EntityNavigationClimbComponent"],"minecraft:navigation.float":["EntityNavigationFloatComponent"],"minecraft:navigation.fly":["EntityNavigationFlyComponent"],"minecraft:navigation.generic":["EntityNavigationGenericComponent"],"minecraft:navigation.hover":["EntityNavigationHoverComponent"],"minecraft:navigation.walk":["EntityNavigationWalkComponent"],"minecraft:onfire":["EntityOnFireComponent"],"minecraft:projectile":["EntityProjectileComponent"],"minecraft:push_through":["EntityPushThroughComponent"],"minecraft:rideable":["EntityRideableComponent"],"minecraft:riding":["EntityRidingComponent"],"minecraft:player.saturation":["EntitySaturationComponent"],"minecraft:scale":["EntityScaleComponent"],"minecraft:skin_id":["EntitySkinIdComponent"],"minecraft:strength":["EntityStrengthComponent"],"minecraft:tameable":["EntityTameableComponent"],"minecraft:tamemount":["EntityTameMountComponent"],"minecraft:type_family":["EntityTypeFamilyComponent"],"minecraft:underwater_movement":["EntityUnderwaterMovementComponent"],"minecraft:variant":["EntityVariantComponent"],"minecraft:wants_jockey":["EntityWantsJockeyComponent"],"minecraft:block_actor_dynamic_properties":["ItemBlockDynamicPropertiesComponent"],"minecraft:book":["ItemBookComponent"],"minecraft:compostable":["ItemCompostableComponent"],"minecraft:cooldown":["ItemCooldownComponent"],"minecraft:durability":["ItemDurabilityComponent"],"minecraft:dyeable":["ItemDyeableComponent"],"minecraft:enchantable":["ItemEnchantableComponent"],"minecraft:food":["ItemFoodComponent"],"minecraft:potion":["ItemPotionComponent"],"minecraft:cursor_inventory":["PlayerCursorInventoryComponent"]},"o":{"system":"System","world":"World"}};
// ===== EGO: REVISOR DE TIPOS CONTRA LA API OFICIAL DE MOJANG (@minecraft/server 2.10.0) =====
// Datos: MC_API_T (extraídos de Mojang/bedrock-samples/metadata/script_modules). Sin eval, sin TypeScript.
const TT_JS_OBJ=new Set(["toString","valueOf","hasOwnProperty","constructor","toJSON","isPrototypeOf","propertyIsEnumerable","toLocaleString","__proto__"]);
const TT_KW=new Set(["if","else","for","while","do","return","typeof","new","const","let","var","function","class","import","export","from","await","async","switch","case","break","continue","try","catch","finally","throw","in","of","instanceof","delete","void","this","null","undefined","true","false","default","yield","super","extends","static","get","set"]);
const TT_HINTS={families:"usa entity.matches({ families: [\"monster\"] })",runCommandAsync:"usa runCommand (runCommandAsync fue eliminado)",length:"los contenedores usan .size; los arrays sí tienen .length",currentValue:"",hurtEntity:"en entityHitEntity se llama hitEntity",damagingEntity:"en entityHurt/entityDie está en event.damageSource.damagingEntity",inventory:"usa entity.getComponent(\"minecraft:inventory\").container",health:"usa entity.getComponent(\"minecraft:health\")",equipment:"usa entity.getComponent(\"minecraft:equippable\").getEquipment(\"Head\")",getInventory:"usa getComponent(\"minecraft:inventory\").container",giveItem:"usa container.addItem(new ItemStack(...))",setHealth:"usa getComponent(\"minecraft:health\").setCurrentValue(n)",getHealth:"usa getComponent(\"minecraft:health\").currentValue",sendChatMessage:"usa sendMessage",message:"el mensaje de chat se llama event.message en chatSend (beforeEvents)",getName:"usa .name (Player) o .nameTag",getLocation:"usa .location (propiedad, no método)",getPosition:"usa .location",getDimension:"usa .dimension (propiedad) o world.getDimension(id)",teleportTo:"usa entity.teleport(location, options)",addPotionEffect:"usa entity.addEffect(tipo, duración, {amplifier})",setVelocity:"usa applyImpulse(vector) o clearVelocity()",getVelocity:"existe getVelocity() en Entity",getItemInHand:"usa getComponent(\"minecraft:equippable\").getEquipment(\"Mainhand\")",getHeldItem:"usa getComponent(\"minecraft:equippable\").getEquipment(\"Mainhand\")",selectedItem:"usa container.getItem(player.selectedSlotIndex)",heldItem:"usa getComponent(\"minecraft:equippable\").getEquipment(\"Mainhand\")",mainHandItem:"usa getComponent(\"minecraft:equippable\").getEquipment(\"Mainhand\")"};
function ttMiembro(api,T,n){ // devuelve {k:"p"|"f",t:tipo} o null
  const vis=new Set();let cola=[T];
  while(cola.length){const c=cola.shift();if(vis.has(c))continue;vis.add(c);const o=api.c[c];if(!o)continue;
    if(o.p&&Object.prototype.hasOwnProperty.call(o.p,n))return{k:"p",t:o.p[n]};
    if(o.f&&Object.prototype.hasOwnProperty.call(o.f,n))return{k:"f",t:o.f[n]};
    if(o.b)for(const b of o.b)cola.push(b);}
  return null;
}
function ttTodosMiembros(api,T){const out=new Set(),vis=new Set();let cola=[T];while(cola.length){const c=cola.shift();if(vis.has(c))continue;vis.add(c);const o=api.c[c];if(!o)continue;for(const k of Object.keys(o.p||{}))out.add(k);for(const k of Object.keys(o.f||{}))out.add(k);if(o.b)for(const b of o.b)cola.push(b);}return [...out];}
function ttLev(a,b){if(Math.abs(a.length-b.length)>3)return 9;const d=[];for(let i=0;i<=a.length;i++){d[i]=[i];}for(let j=1;j<=b.length;j++)d[0][j]=j;for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return d[a.length][b.length];}
function ttSugerir(api,T,n){
  const todos=ttTodosMiembros(api,T),low=n.toLowerCase();
  const cerca=todos.filter(m=>m.toLowerCase().includes(low)||low.includes(m.toLowerCase())||ttLev(m.toLowerCase(),low)<=2).slice(0,4);
  const otras=[];for(const c of Object.keys(api.c)){const o=api.c[c];if((o.p&&Object.prototype.hasOwnProperty.call(o.p,n))||(o.f&&Object.prototype.hasOwnProperty.call(o.f,n))){otras.push(c);if(otras.length>=3)break;}}
  let s="";if(TT_HINTS[n])s+=" → "+TT_HINTS[n]+".";
  if(cerca.length)s+=" ¿Quisiste decir: "+cerca.join(", ")+"?";
  if(otras.length)s+=" (existe en "+otras.join(", ")+")";
  if(!s)s=" Miembros reales de "+T+": "+todos.slice(0,25).join(", ")+(todos.length>25?"…":"");
  return s;
}
function ttLimpiar(texto){ // conserva posiciones; comentarios→espacios; strings→"___" (mismo largo)
  const t=String(texto);let o="";let i=0;const n=t.length;
  while(i<n){const c=t[i],d=t[i+1];
    if(c==="/"&&d==="/"){while(i<n&&t[i]!=="\n"){o+=" ";i++;}continue;}
    if(c==="/"&&d==="*"){while(i<n&&!(t[i]==="*"&&t[i+1]==="/")){o+=t[i]==="\n"?"\n":" ";i++;}o+="  ";i+=2;continue;}
    if(c==='"'||c==="'"){const q=c;o+=q;i++;while(i<n&&t[i]!==q&&t[i]!=="\n"){if(t[i]==="\\"){o+="__";i+=2;continue;}o+="_";i++;}if(t[i]===q){o+=q;i++;}continue;}
    if(c==="`"){o+="`";i++;while(i<n&&t[i]!=="`"){if(t[i]==="\\"){o+="__";i+=2;continue;}if(t[i]==="$"&&t[i+1]==="{"){// expresión dentro de plantilla: se conserva como código
          o+="${";i+=2;let dep=1;while(i<n&&dep>0){if(t[i]==="{")dep++;else if(t[i]==="}"){dep--;if(!dep)break;}o+=t[i];i++;}o+="}";i++;continue;}
        o+=t[i]==="\n"?"\n":"_";i++;}o+="`";i++;continue;}
    o+=c;i++;}
  return o;
}
function ttParen(lim,i){ // i apunta a "(" → índice del ")" que cierra (o -1)
  let d=0;for(let k=i;k<lim.length;k++){const c=lim[k];if(c==="(")d++;else if(c===")"){d--;if(!d)return k;}}return -1;
}
function ttLlave(lim,i){let d=0;for(let k=i;k<lim.length;k++){const c=lim[k];if(c==="{")d++;else if(c==="}"){d--;if(!d)return k;}}return -1;}
function ttCadena(lim,orig,i,api,env,prob,linea,chk){
  // lee una cadena a.b(c).d desde i; devuelve {tipo,fin}. tipo=null si desconocido
  const n=lim.length;
  const m=/^[A-Za-z_$][\w$]*/.exec(lim.slice(i,i+80));if(!m)return{tipo:null,fin:i+1};
  let start=m[0];let p=i+start.length;let T=null;
  if(env.__ns&&start===env.__ns){const mn=/^\s*\.\s*([A-Za-z_$][\w$]*)/.exec(lim.slice(p,p+80));if(mn&&api.o&&Object.prototype.hasOwnProperty.call(api.o,mn[1])){start=mn[1];p+=mn[0].length;}else return{tipo:null,fin:p};}
  if(Object.prototype.hasOwnProperty.call(env,start))T=env[start];
  else if(api.o&&Object.prototype.hasOwnProperty.call(api.o,start)&&!env.__locales.has(start))T=api.o[start];
  else if(api.e&&api.e[start]&&!env.__locales.has(start)){ // Enum.Miembro
    const mm=/^\s*\.\s*([A-Za-z_$][\w$]*)/.exec(lim.slice(p,p+80));
    if(mm){if(!Object.prototype.hasOwnProperty.call(api.e[start],mm[1]))prob.push("línea "+linea(i)+": "+start+"."+mm[1]+" no existe en el enum "+start+" (valores: "+Object.keys(api.e[start]).slice(0,12).join(", ")+")");return{tipo:null,fin:p+mm[0].length,enum:start+"."+mm[1]};}
    return{tipo:null,fin:p};}
  let desconocido=(T===null||T===undefined||T==="");
  let ultimo=start;
  for(;;){
    let q=p;while(q<n&&/\s/.test(lim[q]))q++;
    let op=null;
    if(lim[q]==="?"&&lim[q+1]==="."){op="?.";q+=2;}else if(lim[q]==="."&&lim[q+1]!=="."){op=".";q+=1;}
    else if(lim[q]==="["&&!desconocido){ // índice
      const cierre=lim.indexOf("]",q);if(cierre<0)break;
      if(typeof T==="string"&&T[0]==="[")T=T.slice(1);else T="";
      desconocido=!T;p=cierre+1;continue;}
    else break;
    while(q<n&&/\s/.test(lim[q]))q++;
    const mm=/^[A-Za-z_$#][\w$]*/.exec(lim.slice(q,q+80));if(!mm)break;
    const nombre=mm[0];let r=q+nombre.length;let rr=r;while(rr<n&&/\s/.test(lim[rr]))rr++;
    const llama=lim[rr]==="(";let fin=r,args="";
    if(llama){const c=ttParen(lim,rr);if(c<0)break;args=orig.slice(rr+1,c);fin=c+1;}
    if(!desconocido&&typeof T==="string"&&T&&T[0]!=="["&&api.c[T]){
      if((nombre==="getComponent"||nombre==="hasComponent")&&llama){
        let id=null;const sm=/^\s*(["'])([^"']+)\1\s*$/.exec(args);
        if(sm)id=sm[2];else{const em=/^\s*([A-Za-z_$][\w$]*)\s*\.\s*([A-Za-z_$][\w$]*)\s*$/.exec(args);if(em&&api.e[em[1]]&&api.e[em[1]][em[2]])id=api.e[em[1]][em[2]];}
        if(id){const pref=/^(Entity|Player)/.test(T)?"Entity":(/^Item/.test(T)?"Item":(/^Block/.test(T)?"Block":""));
          const cand=(api.cid[id]||[]);const cl=cand.find(x=>pref&&x.startsWith(pref))||(!pref?cand[0]:null);
          if(!cl&&id.startsWith("minecraft:"))prob.push("línea "+linea(q)+": getComponent(\""+id+"\") no existe para "+T+(cand.length?" (ese componente es de: "+cand.join(", ")+")":" (no hay componente con ese id en la API 2.10.0)"));
          if(nombre==="getComponent"){T=cl||"";desconocido=!T;}else{T="";desconocido=true;}
        }else{T="";desconocido=true;}
      }else{
        let mi=ttMiembro(api,T,nombre);
        if(!mi&&T==="Entity"){const mp=ttMiembro(api,"Player",nombre);if(mp){mi=mp;T="Player";}} // Entity que en realidad es jugador (suele comprobarse typeId)
        if(!mi){ if(!TT_JS_OBJ.has(nombre)&&!(!llama&&/^\s*=(?![=>])/.test(lim.slice(r,r+6))))prob.push("línea "+linea(q)+": «"+nombre+"»"+(llama?"()":"")+" NO EXISTE en "+T+"."+ttSugerir(api,T,nombre));
          T="";desconocido=true;}
        else{
          if(mi.k==="f"&&!llama){T="";desconocido=true;}
          else if(mi.k==="p"&&llama){T="";desconocido=true;}
          else{T=mi.t;desconocido=!T;}
          if(mi.k==="p"&&llama&&api.c[T]===undefined){}
        }
      }
    }else{desconocido=true;T="";}
    ultimo=nombre;p=fin;
  }
  return{tipo:desconocido?null:T,fin:p};
}
function lintTipadoOficial(texto,api){
  const inferido={};let fase=1;let prob=[];const orig=String(texto);const lim=ttLimpiar(orig);
  const lineas=[];for(let i=0;i<lim.length;i++)if(lim[i]==="\n")lineas.push(i);
  const linea=(pos)=>{let a=0,b=lineas.length;while(a<b){const m=(a+b)>>1;if(lineas[m]<pos)a=m+1;else b=m;}return a+1;};
  const base={__locales:new Set()};
  {const nsm=/\bimport\s*\*\s*as\s+([A-Za-z_$][\w$]*)\s+from\s*["']@minecraft\/server["']/.exec(lim)||/\bimport\s*\*\s*as\s+([A-Za-z_$][\w$]*)\s+from\s*___/.exec(lim);const nsm2=/\bimport\s*\*\s*as\s+([A-Za-z_$][\w$]*)\s+from\s*["'][_]+["']/.exec(lim);const alias=(nsm&&nsm[1])||(nsm2&&/@minecraft\/server["']/.test(orig.slice(nsm2.index,nsm2.index+nsm2[0].length+2))&&nsm2[1]);if(alias)base.__ns=alias;}
  // nombres declarados localmente que podrían ocultar world/system/clases
  for(const m of lim.matchAll(/\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g))base.__locales.add(m[1]);
  for(const m of lim.matchAll(/\bimport\s*\{([^}]*)\}/g))for(const x of m[1].split(","))base.__locales.delete(x.trim().split(/\s+as\s+/).pop());
  for(const m of lim.matchAll(/\bimport\s*\{([^}]*)\}\s*from/g))for(const x of m[1].split(",")){const as=x.trim().split(/\s+as\s+/);if(as.length>1&&api.o&&api.o[as[0]])base[as[1]]=api.o[as[0]];}
  let visto=new Set();
  const mascara=(s,a,b)=>s.slice(0,a)+s.slice(a,b).replace(/[^\n]/g," ")+s.slice(b);
  const sitiosFn=[],padreFn=[];
  function region(limR,env,depth,off){
    if(depth>6)return limR;
    // 1) callbacks tipados: subscribe / forEach / map / filter / find / some / every
    const rx=/(?<![\w$.])([A-Za-z_$][\w$]*)/g;let mm;const sitios=[];
    const rxCall=/\.\s*(subscribe|forEach|map|filter|find|some|every|findLast|flatMap)\s*\(/g;
    let c;while((c=rxCall.exec(limR))){
      // cadena receptora: retroceder hasta el inicio de la cadena
      let s=c.index;
      // localizar inicio: escaneo hacia atrás sobre [\w$.?()\[\]] equilibrando
      let k=s-1,dep=0;while(k>=0){const ch=limR[k];if(ch===")"||ch==="]")dep++;else if(ch==="("||ch==="["){if(!dep)break;dep--;}else if(!dep&&!/[\w$.?\s]/.test(ch))break;k--;}
      let ini=k+1;while(ini<s&&/\s/.test(limR[ini]))ini++;
      const abre=c.index+c[0].length-1;const cierra=ttParen(limR,abre);if(cierra<0)continue;
      const cuerpoIni=abre+1;
      const pm=/^\s*(?:async\s+)?(?:function\s*[\w$]*\s*\(([^)]*)\)\s*\{?|\(([^)]*)\)\s*=>|([A-Za-z_$][\w$]*)\s*=>)/.exec(limR.slice(cuerpoIni,cierra));
      if(!pm)continue;
      const parametros=(pm[1]!==undefined?pm[1]:(pm[2]!==undefined?pm[2]:pm[3]))||"";
      let tParam=null;
      if(c[1]==="subscribe"){ // rec.fin debe llegar hasta .subscribe: el receptor es la cadena SIN .subscribe
        // recomputar tipo del receptor hasta antes de .subscribe
        const recStr=limR.slice(ini,c.index);const pr=ttCadena(recStr+" ",orig.slice(ini,c.index)+" ",0,api,env,[],()=>0,false);
        const tr=pr.tipo;if(tr&&api.c[tr]&&api.c[tr].ev)tParam=api.c[tr].ev;
      }else{const pr=ttCadena(limR.slice(ini,c.index)+" ",orig.slice(ini,c.index)+" ",0,api,env,[],()=>0,false);if(pr.tipo&&pr.tipo[0]==="[")tParam=pr.tipo.slice(1);}
      if(tParam&&!api.c[tParam])tParam=null;
      sitios.push({cuerpoIni,cierra,parametros,tParam,pm0:pm[0].length});
    }
    {
      const rxFn=/(?:\bfunction\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{|\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>\s*\{)/g;let fm;
      while((fm=rxFn.exec(limR))){const nombre=fm[1]||fm[3];const ps=(fm[2]!==undefined?fm[2]:fm[4]).split(",").map(x=>x.trim().split("=")[0].trim());const inf=(fase===2&&inferido[nombre])||[];
        const abre=fm.index+fm[0].length-1;const cierre=ttLlave(limR,abre);if(cierre<0)continue;
        const env2=Object.assign({},env);let alguno=false;
        ps.forEach((p,i)=>{if(!/^[A-Za-z_$][\w$]*$/.test(p))return;if(inf[i]&&inf[i]!=="?"&&api.c[inf[i]]){env2[p]=inf[i];alguno=true;}else if(Object.prototype.hasOwnProperty.call(env2,p)){env2[p]="";alguno=true;}});
        if(!alguno)continue;
        sitiosFn.push({cuerpoIni:abre+1,cierra:cierre,env2});}
    }
    for(const sf of sitiosFn.splice(0)){
      const cuerpo=limR.slice(sf.cuerpoIni,sf.cierra);
      const resto=region(cuerpo,sf.env2,depth+1,off+sf.cuerpoIni);
      analizar(resto,sf.env2,off+sf.cuerpoIni);
      padreFn.push([sf.cuerpoIni,sf.cierra]);
    }
    // procesar sitios (de dentro hacia fuera no es necesario: máscara del cuerpo en el padre)
    let padre=limR;
    for(const [a,b] of padreFn.splice(0))padre=mascara(padre,a,b);
    for(const st of sitios){
      const env2=Object.assign({},env);
      const par=st.parametros.trim();
      if(!st.tParam){for(const x of par.matchAll(/[A-Za-z_$][\w$]*/g))if(Object.prototype.hasOwnProperty.call(env2,x[0]))env2[x[0]]="";}
      else{
      const ds=/^\{([^}]*)\}$/.exec(par);
      if(ds){for(const it of ds[1].split(",")){const [a,b]=it.split(":").map(x=>x.trim().split("=")[0].trim());const nom=a;const alias=b||a;if(!nom)continue;const mi=ttMiembro(api,st.tParam,nom);
          if(!mi){prob.push("línea "+linea(off+st.cuerpoIni)+": el evento "+st.tParam+" NO tiene la propiedad «"+nom+"»."+ttSugerir(api,st.tParam,nom));}
          else if(mi.k==="p"&&mi.t)env2[alias]=mi.t;else env2[alias]="";}}
      else if(/^[A-Za-z_$][\w$]*$/.test(par.split("=")[0].trim()))env2[par.split("=")[0].trim()]=st.tParam;
      }
      const cuerpo=limR.slice(st.cuerpoIni,st.cierra);
      const resto=region(cuerpo,env2,depth+1,off+st.cuerpoIni);
      analizar(resto,env2,off+st.cuerpoIni);
      padre=mascara(padre,st.cuerpoIni,st.cierra);
    }
    return padre;
  }
  function analizar(limR,env,off){
    // off = posición de limR dentro del texto completo (para número de línea) ; limR ya tiene el mismo largo que el original en ese tramo
    const origR=orig.slice(off,off+limR.length);
    const e2=Object.assign({},env);
    // declaraciones: const X = cadena ; const {a,b} = cadena ; for (const X of cadena)
    const conflict=new Set();
    for(let pasada=0;pasada<3;pasada++){
      const rxD=/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?/g;let d;
      while((d=rxD.exec(limR))){const nm=d[1];const ini=d.index+d[0].length;if(!/[A-Za-z_$]/.test(limR[ini]||""))continue;
        const r=ttCadena(limR,origR,ini,api,e2,[],()=>0,false);
        // la cadena debe terminar la expresión
        let q=r.fin;while(q<limR.length&&/[ \t]/.test(limR[q]))q++;
        if(!r.tipo&&Object.prototype.hasOwnProperty.call(e2,nm))e2[nm]="";
        if(r.tipo&&/[;\n)}]|^$/.test(limR[q]||"\n")){
          if(e2[nm]!==undefined&&e2[nm]!==r.tipo&&!(env[nm]===e2[nm]&&pasada===0)){conflict.add(nm);}
          e2[nm]=r.tipo;}}
      const rxDs=/\b(?:const|let|var)\s*\{([^}]*)\}\s*=\s*(?:await\s+)?/g;
      while((d=rxDs.exec(limR))){const ini=d.index+d[0].length;if(!/[A-Za-z_$]/.test(limR[ini]||""))continue;const r=ttCadena(limR,origR,ini,api,e2,[],()=>0,false);
        if(r.tipo&&api.c[r.tipo]){for(const it of d[1].split(",")){const [a,b]=it.split(":").map(x=>x.trim().split("=")[0].trim());if(!a)continue;const mi=ttMiembro(api,r.tipo,a);if(!mi&&!TT_JS_OBJ.has(a)){const msg="línea "+linea(d.index+off)+": desestructura «"+a+"» de un "+r.tipo+" y NO EXISTE."+ttSugerir(api,r.tipo,a);if(!visto.has(msg)){visto.add(msg);prob.push(msg);}}if(mi&&mi.k==="p"&&mi.t)e2[b||a]=mi.t;}}}
      const rxF=/\bfor\s*\(\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s+of\s+/g;
      while((d=rxF.exec(limR))){const ini=d.index+d[0].length;const r=ttCadena(limR,origR,ini,api,e2,[],()=>0,false);if(r.tipo&&r.tipo[0]==="[")e2[d[1]]=r.tipo.slice(1);else if(Object.prototype.hasOwnProperty.call(e2,d[1]))e2[d[1]]="";}
    }
    for(const nm of conflict)delete e2[nm];
    if(fase===1){
      const rxCall=/(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(/g;let cm;
      while((cm=rxCall.exec(limR))){const nm=cm[1];if(!locFn.has(nm)||TT_KW.has(nm))continue;if(/\b(?:function|new)\s+$/.test(limR.slice(Math.max(0,cm.index-9),cm.index)))continue;
        const ab=cm.index+cm[0].length-1;const ce=ttParen(limR,ab);if(ce<0)continue;
        const args=[];let dp=0,ini=ab+1;for(let k=ab+1;k<ce;k++){const ch=limR[k];if("([{".includes(ch))dp++;else if(")]}".includes(ch))dp--;else if(ch===","&&!dp){args.push([ini,k]);ini=k+1;}}args.push([ini,ce]);
        const arr=inferido[nm]||(inferido[nm]=[]);
        args.forEach(([a,b],i)=>{let t="?";const sub=limR.slice(a,b).trim();if(/^[A-Za-z_$][\w$]*(?:\s*(?:\?\.|\.)\s*[A-Za-z_$][\w$]*(?:\([^()]*\))?(?:\[[^\]]*\])?)*(?:\[[^\]]*\])?$/.test(sub)){const r=ttCadena(sub+" ",origR.slice(a,b).trim()+" ",0,api,e2,[],()=>0,false);if(r.tipo&&api.c[r.tipo])t=r.tipo;}
          if(arr[i]===undefined)arr[i]=t;else if(arr[i]!==t){arr[i]=(arr[i]==="?"||t==="?")?"?":(/^(Player|Entity)$/.test(arr[i]+t)&&arr[i]!==t?"Entity":"?");}});}
    }
    // validar todas las cadenas con tipo conocido
    const rx=/(?<![\w$.])([A-Za-z_$][\w$]*)/g;let m;
    while((m=rx.exec(limR))){
      if(TT_KW.has(m[1]))continue;
      // saltar nombres que son claves de objeto literal "{ clave:" o declaraciones/params
      const antes=limR.slice(Math.max(0,m.index-12),m.index);
      if(/\b(?:const|let|var|function|class|new)\s+$/.test(antes))continue;
      const tmp=[];
      const r=ttCadena(limR,origR,m.index,api,e2,tmp,(p)=>linea(p+off),false);
      for(const t of tmp){const mm2=/^línea (\d+)/.exec(t);const clave=t;if(!visto.has(clave)){visto.add(clave);prob.push(t);}}
      if(r.fin>m.index)rx.lastIndex=Math.max(rx.lastIndex,m.index+m[1].length);
    }
  }
  const locFn=new Set();
  for(const m of lim.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g))locFn.add(m[1]);
  for(const m of lim.matchAll(/\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g))locFn.add(m[1]);
  // fase 1: aprender de qué tipo son los argumentos con que se llama a las funciones propias
  region0();
  fase=2;prob=[];visto=new Set();
  region0();
  function region0(){const r=region(lim,base,0,0);analizar(r,base,0);}
  return [...new Set(prob)].slice(0,14);
}

// ===== ARREGLOS AUTOMÁTICOS (sin IA) de nombres de propiedades de eventos que los modelos inventan =====
const TT_RENOM={
  EntityHitEntityAfterEvent:{hurtEntity:"hitEntity",entity:"hitEntity",victim:"hitEntity",target:"hitEntity",damager:"damagingEntity",attacker:"damagingEntity",source:"damagingEntity"},
  EntityHurtAfterEvent:{entity:"hurtEntity",victim:"hurtEntity",target:"hurtEntity",damagingEntity:"damageSource.damagingEntity",attacker:"damageSource.damagingEntity",damager:"damageSource.damagingEntity",source:"damageSource.damagingEntity",cause:"damageSource.cause"},
  EntityDieAfterEvent:{entity:"deadEntity",victim:"deadEntity",killer:"damageSource.damagingEntity",attacker:"damageSource.damagingEntity",damagingEntity:"damageSource.damagingEntity",cause:"damageSource.cause"},
  ItemUseAfterEvent:{player:"source",entity:"source",user:"source",item:"itemStack"},
  ItemUseBeforeEvent:{player:"source",entity:"source",user:"source",item:"itemStack"},
  ItemStartUseAfterEvent:{player:"source",entity:"source",item:"itemStack"},
  ItemCompleteUseAfterEvent:{player:"source",entity:"source",item:"itemStack"},
  ItemReleaseUseAfterEvent:{player:"source",entity:"source",item:"itemStack"},
  ItemStopUseAfterEvent:{player:"source",entity:"source",item:"itemStack"},
  PlayerBreakBlockAfterEvent:{blockPermutation:"brokenBlockPermutation",brokenBlock:"brokenBlockPermutation"},
  PlayerPlaceBlockAfterEvent:{},
};
function ttArreglarEventos(texto,api){
  const orig=String(texto);const lim=ttLimpiar(orig);const cambios=[];const ed=[];
  const base={__locales:new Set()};
  for(const m of lim.matchAll(/\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g))base.__locales.add(m[1]);
  {const m=/\bimport\s*\*\s*as\s+([A-Za-z_$][\w$]*)\s+from\s*["']_+["']/.exec(lim);if(m&&/@minecraft\/server["']/.test(orig.slice(m.index,m.index+m[0].length+2)))base.__ns=m[1];}
  const rx=/\.\s*subscribe\s*\(/g;let c;
  while((c=rx.exec(lim))){
    let k=c.index-1,dep=0;while(k>=0){const ch=lim[k];if(ch===")"||ch==="]")dep++;else if(ch==="("||ch==="["){if(!dep)break;dep--;}else if(!dep&&!/[\w$.?\s]/.test(ch))break;k--;}
    let ini=k+1;while(ini<c.index&&/\s/.test(lim[ini]))ini++;
    const pr=ttCadena(lim.slice(ini,c.index)+" ",orig.slice(ini,c.index)+" ",0,api,base,[],()=>0,false);
    const sg=pr.tipo;const T=sg&&api.c[sg]&&api.c[sg].ev;if(!T||!TT_RENOM[T])continue;
    const abre=c.index+c[0].length-1;const cierra=ttParen(lim,abre);if(cierra<0)continue;
    const pm=/^\s*(?:async\s+)?(?:function\s*[\w$]*\s*\(([^)]*)\)\s*\{?|\(([^)]*)\)\s*=>|([A-Za-z_$][\w$]*)\s*=>)/.exec(lim.slice(abre+1,cierra));if(!pm)continue;
    const par=((pm[1]!==undefined?pm[1]:(pm[2]!==undefined?pm[2]:pm[3]))||"");
    const parPos=abre+1+pm[0].indexOf(par||"\u0000");
    const tabla=TT_RENOM[T];
    const falta=(n)=>!ttMiembro(api,T,n)&&Object.prototype.hasOwnProperty.call(tabla,n);
    const renDestruct=(texto2,pos0)=>{ // "a, b: x, c = 1" → edita ítems
      let off=0;for(const it of texto2.split(",")){const m=/^(\s*)([A-Za-z_$][\w$]*)(\s*(?::\s*[A-Za-z_$][\w$]*)?)(\s*=.*)?(\s*)$/s.exec(it);
        if(m&&falta(m[2])&&!tabla[m[2]].includes(".")){const nuevo=m[1]+tabla[m[2]]+(m[3].trim()?m[3]:": "+m[2])+(m[4]||"")+m[5];ed.push({a:pos0+off,b:pos0+off+it.length,r:nuevo});cambios.push("evento "+T+": «"+m[2]+"» → «"+tabla[m[2]]+"»");}
        off+=it.length+1;}
    };
    const ds=/^\s*\{([^}]*)\}\s*$/.exec(par);
    const cuerpoIni=abre+1+pm[0].length;
    if(ds){renDestruct(ds[1],parPos+par.indexOf("{")+1);}
    else{const pn=par.split("=")[0].trim();
      if(/^[A-Za-z_$][\w$]*$/.test(pn)){
        const cuerpo=lim.slice(cuerpoIni,cierra);
        const rp=new RegExp("(?<![\\w$.])"+pn.replace(/\$/g,"\\$")+"\\s*(\\?\\.|\\.)\\s*([A-Za-z_$][\\w$]*)","g");let m;
        while((m=rp.exec(cuerpo))){if(!falta(m[2]))continue;const nv=tabla[m[2]];const rr=pn+(nv.includes(".")?".":m[1])+nv.replace(".","?.");
          // no tocar asignaciones ev.x = ...
          const sig=cuerpo.slice(m.index+m[0].length).match(/^\s*(=)(?!=)/);if(sig)continue;
          ed.push({a:cuerpoIni+m.index,b:cuerpoIni+m.index+m[0].length,r:rr});cambios.push("evento "+T+": "+pn+"."+m[2]+" → "+rr);}
        // const { a, b } = ev;
        const rd=new RegExp("\\b(?:const|let|var)\\s*\\{([^}]*)\\}\\s*=\\s*"+pn.replace(/\$/g,"\\$")+"\\s*(?=[;\\n)])","g");let md;
        while((md=rd.exec(cuerpo))){const pos0=cuerpoIni+md.index+md[0].indexOf("{")+1;renDestruct(md[1],pos0);}
      }
    }
  }
  if(!ed.length)return{texto:orig,cambios:[]};
  ed.sort((x,y)=>y.a-x.a);let t=orig;let ult=Infinity;for(const e of ed){if(e.b>ult)continue;t=t.slice(0,e.a)+e.r+t.slice(e.b);ult=e.a;}
  return{texto:t,cambios:[...new Set(cambios)]};
}

// Referencia compacta de la API oficial para los modelos (se genera desde MC_API_T; así no puede inventar).
let __mcApiRef=null;
function mcApiReferencia(){
  if(__mcApiRef)return __mcApiRef;
  const A=MC_API_T,L=[];
  const evs=(clase,pref)=>{const o=A.c[clase];if(!o)return;const t=[];for(const [n,sg] of Object.entries(o.p||{})){const ev=A.c[sg]&&A.c[sg].ev;const ps=ev&&A.c[ev]?Object.keys(A.c[ev].p||{}):[];t.push(n+(ps.length?"{"+ps.join(","):"{")+"}");}L.push(pref+": "+t.join(" · "));};
  L.push("REFERENCIA OFICIAL @minecraft/server 2.10.0 (extraída de Mojang/bedrock-samples). USA SOLO ESTOS NOMBRES; si no está aquí, NO existe.");
  evs("WorldAfterEvents","world.afterEvents.<evento>.subscribe(ev=>…) con propiedades de ev");
  evs("WorldBeforeEvents","world.beforeEvents.<evento> (ev.cancel=true cancela)");
  evs("SystemAfterEvents","system.afterEvents");evs("SystemBeforeEvents","system.beforeEvents");
  const cl=(n)=>{const o=A.c[n];if(!o)return;const ps=Object.keys(o.p||{}),fs=Object.keys(o.f||{});L.push(n+(o.b&&o.b.length?" (hereda de "+o.b.join(",")+")":"")+": propiedades("+ps.join(",")+") métodos("+fs.join(",")+")");};
  for(const n of ["Entity","Player","ItemStack","Container","Dimension","Block","World","System"])cl(n);
  for(const n of ["EntityEquippableComponent","EntityHealthComponent","EntityInventoryComponent","ItemDurabilityComponent","EntityProjectileComponent"])cl(n);
  const ids={};for(const [id,cs] of Object.entries(A.cid))for(const c of cs){const g=/^(Entity|Item|Block)/.exec(c);if(g)(ids[g[1]]=ids[g[1]]||[]).push(id.replace("minecraft:",""));}
  for(const g of Object.keys(ids))L.push("getComponent(\"minecraft:ID\") válidos en "+g+": "+ids[g].join(","));
  L.push("Slots de EquipmentSlot: "+Object.values(A.e.EquipmentSlot||{}).join(","));
  L.push("PARTÍCULAS válidas para spawnParticle (usa \"minecraft:\"+nombre; cualquier otra NO se ve): "+MC_PARTICULAS.join(","));
  L.push("PEDIDOS DE PODER: si el usuario pide algo poderoso/invencible/que protege, impleméntalo con efectos reales (addEffect resistance amplifier hasta 4, regeneration, fire_resistance, strength) según piezas equipadas; la propiedad protection del ítem por sí sola es débil. Nunca añadas cofres, botín o kits que no se pidieron.");
  L.push("REGLAS EXTRA: ItemStack.amount se puede cambiar pero para CONSUMIR un objeto debes reasignar el stack: container.setItem(slot, nuevo) (si amount llega a 0 usa setItem(slot, undefined)); itemStack.amount-- NO modifica el inventario. Los mobs vanilla (minecraft:cow, minecraft:pig…) NO se redefinen: para cambiarles algo usa script (triggerEvent con eventos propios) y deja el comportamiento original. EntityVariantComponent.value y EntityMarkVariantComponent.value son solo lectura. Para escalar un mob usa component_groups con minecraft:scale activados por eventos propios; entity.triggerEvent(\"ns:evento\").");
  L.push("REGLAS: chatSend NO existe en 2.10.0 estable; runCommandAsync NO existe (usa runCommand); Entity NO tiene sendMessage (solo Player y World); Container NO tiene length (usa size); la salud es getComponent(\"minecraft:health\").currentValue; las familias se consultan con entity.matches({families:[\"monster\"]}); en entityHurt/entityDie el atacante es ev.damageSource.damagingEntity; en entityHitEntity son ev.damagingEntity y ev.hitEntity; playerSpawn/playerJoin NO tienen ev.player en playerJoin (solo playerId/playerName); la armadura puesta se lee con getComponent(\"minecraft:equippable\").getEquipment(\"Head\"|\"Chest\"|\"Legs\"|\"Feet\").");
  __mcApiRef=L.join("\n");return __mcApiRef;
}
function lintScriptApiTipado(texto,ver){
  const base=lintScriptApi(texto,ver);let t=[];
  try{if(/^2\.10(?:\.|$)/.test(String(ver||"2.10.0")))t=lintTipadoOficial(texto,MC_API_T);}catch(_){}
  return [...t,...base].slice(0,16);
}

function lintScriptApi(texto, verSrv="2.10.0"){
  const prob=[];const api=MC_API.act;
  for(const dd of dupDeclTop(texto))prob.push("declara «"+dd+"» más de una vez en el nivel superior (SyntaxError: no carga ningún script del add-on)");
  const es210=/^2\.10(?:\.|$)/.test(String(verSrv));
  const apiNo210=new Set(["spawnXp","fade","pause","resume","seek","setPitch","setVolume","lineGapHeight","getClock","worldClockOnPaused","worldClockOnResumed","worldClockOnTimeMarker","worldClockOnTimeModified","worldClockOnRestart","TimeMarker","TimeMarkerOptions","WorldClock","WorldClockAddTimeMarkerError","WorldClockEventOptions","WorldClockInvalidRegistryError","WorldClockInvalidTimeMarkerError","WorldClockNotFoundError","WorldClockOnPausedAfterEvent","WorldClockOnPausedAfterEventSignal","WorldClockOnRestartBeforeEvent","WorldClockOnRestartBeforeEventSignal","WorldClockOnResumedAfterEvent","WorldClockOnResumedAfterEventSignal","WorldClockOnTimeMarkerAfterEvent","WorldClockOnTimeMarkerAfterEventSignal","WorldClockOnTimeModifiedAfterEvent","WorldClockOnTimeModifiedAfterEventSignal","WorldClockRegistrationError","WorldClockRegistrationOptions","WorldClockRegistry","WorldClockReloadNewWorldClockError","WorldClockReloadTimeMarkerError","WorldClockRemoveMinecraftTimeMarkerError","WorldClockRewindError","WorldClockTimeMarkerEventOptions","WorldClockTimeMarkerNotFoundError","button1WithOptions","button2WithOptions"]);
  const sin=String(texto).replace(/\/\*[\s\S]*?\*\//g,"").replace(/\/\/[^\n]*/g,"").replace(/`(?:\\.|[^`\\])*`/g,'""').replace(/"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g,'""');
  if(/\bkillingBlow\s*\.\s*damagingEntity\b/.test(sin))prob.push("EntityDieAfterEvent no expone killingBlow.damagingEntity; usa event.damageSource?.damagingEntity");
  const conocidos=new Set([...api.members,...api.ui_members,...api.exports,...api.ui_exports,...MC_JS_CONOCIDOS]);
  if(es210)for(const n of apiNo210)conocidos.delete(n);
  const locales=new Set();
  for(const m of sin.matchAll(/(?:function\s+|class\s+|const\s+|let\s+|var\s+)([A-Za-z_$][\w$]*)/g))locales.add(m[1]);
  for(const m of sin.matchAll(/([A-Za-z_$][\w$]*)\s*(?::|\()\s*(?:async\s*)?(?:function|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/g))locales.add(m[1]);
  for(const m of sin.matchAll(/^\s*(?:async\s+|static\s+|get\s+|set\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/gm))locales.add(m[1]);
  for(const m of sin.matchAll(/[{,]\s*([A-Za-z_$][\w$]*)\s*(?=[:,}])/g))locales.add(m[1]);
  // nombres importados de cualquier módulo (default, namespace o con llaves) cuentan como declarados
  for(const m of String(texto).matchAll(/\bimport\s+([^;'"`]*?)\s+from\s*["'`]/g)){
    for(const x of m[1].replace(/[{}*]/g," ").split(/[\s,]+/))if(/^[A-Za-z_$][\w$]*$/.test(x)&&x!=="as"&&x!=="type")locales.add(x);
  }
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
    if(!lista.includes(m[2])&&!["startup","shutdown","scriptEventReceive"].includes(m[2]))prob.push("el evento "+m[1]+"."+m[2]+" no existe"+(m[1]==="beforeEvents"&&api.events.after.includes(m[2])?" (existe en afterEvents)":""));
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
//   Opcionales: TAVILY_API_KEY, BRAVE_API_KEY (más calidad). 
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
// v14.55.2: reconstruida — la función que coordina la búsqueda web había desaparecido (el chat nunca buscaba y ?web= / web_search daban error 500).
async function contextoWeb(q, env, forzar) {
  const consulta = String(q || "").replace(/\s+/g, " ").trim().slice(0, 300);
  const vacio = { texto: "", fuentes: [], usadas: [] };
  if (!consulta) return vacio;
  env = env || {};
  const esMc = /minecraft|bedrock|add-?on|@minecraft/i.test(consulta);
  const esDev = /\b(api|error|npm|javascript|typescript|python|react|android|capacitor|cloudflare|worker|git|html|css|sdk|librer[ií]a)\b/i.test(consulta);
  const tareas = [];
  if (env.TAVILY_API_KEY) tareas.push(["Tavily", webTavily(consulta, env)]);
  if (env.BRAVE_API_KEY) tareas.push(["Brave", webBrave(consulta, env)]);
  tareas.push(["DuckDuckGo", webDuck(consulta)]);
  tareas.push(["Wikipedia", webWiki(consulta)]);
  if (esMc || esDev) tareas.push(["Microsoft Learn", webLearn(consulta)]);
  if (esDev) { tareas.push(["GitHub", webGithub(consulta)]); tareas.push(["Stack Overflow", webStack(consulta)]); }
  if (/@[a-z0-9_.-]+\/[a-z0-9_.-]+/i.test(consulta)) tareas.push(["npm", webNpm(consulta)]);
  const res = await Promise.all(tareas.map(async ([n, p]) => { try { return [n, await p]; } catch (e) { return [n, []]; } }));
  const vistos = new Set(); const fuentes = []; const usadas = [];
  // Primero los buscadores generales (Tavily/Brave/DuckDuckGo), luego las fuentes especializadas
  for (const [n, lista] of res) {
    let aporto = false;
    for (const x of (Array.isArray(lista) ? lista : [])) {
      if (!x || !x.url || vistos.has(x.url) || fuentes.length >= 10) continue;
      vistos.add(x.url); fuentes.push({ titulo: String(x.titulo || x.url).slice(0, 140), url: x.url, resumen: String(x.resumen || "").slice(0, 400), fuente: x.fuente || n }); aporto = true;
    }
    if (aporto) usadas.push(n);
  }
  if (!fuentes.length) return vacio;
  // Lee el contenido de las 2 primeras páginas (solo si no es una API/JSON) para dar datos reales, no solo títulos
  const paginas = [];
  await Promise.all(fuentes.filter(f => !/api\.github\.com|registry\.npmjs\.org/.test(f.url)).slice(0, 2).map(async f => {
    try {
      const r = await webFetch(f.url, {}, 5000);
      const ct = String(r.headers && r.headers.get && r.headers.get("content-type") || "");
      if (!r.ok || !/text\/html|text\/plain/i.test(ct)) return;
      const t = webLimpiar(await r.text()).slice(0, 1800);
      if (t.length > 200) paginas.push({ titulo: f.titulo, url: f.url, texto: t });
    } catch (e) {}
  }));
  let texto = "\n\n=== RESULTADOS DE BÚSQUEDA WEB (" + new Date().toISOString().slice(0, 10) + ") ===\nUsa estos datos para responder con información actual; cita las fuentes y no inventes lo que no aparece aquí.\n";
  fuentes.forEach((f, i) => { texto += (i + 1) + ". " + f.titulo + " — " + f.url + (f.resumen ? "\n   " + f.resumen : "") + "\n"; });
  for (const p of paginas) texto += "\n--- Contenido de " + p.url + " ---\n" + p.texto + "\n";
  texto += "=== FIN DE LA BÚSQUEDA ===\n";
  return { texto: texto.slice(0, 9000), fuentes, usadas };
}
const RX_WEB_PEDIDA = /(internet|busca(?:r|me)?\b|investiga|la web|google)/i;
// Detecta consultas que dependen de información cambiante y pueden requerir búsqueda web.
const RX_WEB = /(noticias?|actualidad|hoy|ahora|esta semana|este mes|[uú]ltim[oa]s?|reciente|precio(?:s)?|cotizaci[oó]n|tipo de cambio|versi[oó]n(?:es)?|lanzamiento|disponibilidad|clima|pron[oó]stico|resultados|fecha de estreno|calendario)/i;
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
- No inventes componentes ni APIs. Si no estás seguro de algo, usa la opción más simple y segura que sí exista.
ERRORES REALES QUE YA OCURRIERON (no los repitas; Minecraft los rechaza o rompen el juego):
- Ítems: NO uses "minecraft:on_use", "minecraft:weapon", "minecraft:armor" ni "events". Armadura = "minecraft:wearable" con slot "slot.armor.head|chest|legs|feet". Un arma de fuego usa script (itemUse), no "minecraft:shooter".
- Bloques: no pongas "category" ni "properties" en description (usa "states"); sin "minecraft:creative_category".
- Entidades: health/movement/attack/scale son OBJETOS ({"value":..}, {"damage":..}), nunca números sueltos. Nada del Resource Pack en el BP (geometry, skin_id, animation_controller, sound_event, render_controller).
- Script: el daño se lee en event.damageSource.damagingEntity (NO event.damagingEntity); entityDie usa event.deadEntity, entityHurt usa event.hurtEntity, itemUse usa event.source. NO existen runCommandAsync, world.events, world.say. Usa runCommand y world.sendMessage.
- Armadura puesta: player.getComponent("minecraft:equippable").getEquipment("Head"|"Chest"|"Legs"|"Feet")?.typeId. NUNCA recorras el inventario para saber qué lleva puesto.
- Filtros de entidades: getEntities({location,maxDistance,families:["monster"],excludeTypes:["minecraft:player"]}). "minecraft:mob" NO es un tipo válido.
- No declares dos veces world/system/ItemStack (import { world } y const { world } = mc rompe TODOS los scripts). Un solo import al inicio.
- No inventes un sistema de vida propio con dynamic properties que mate al jugador; usa la vida real (minecraft:health, setCurrentValue / currentValue).
- No des premios en cada golpe (entityHurt): el botín va en loot_tables; en el script solo premia al morir (entityDie).
- No uses sonidos propios (ns:sonido) ni partículas inventadas: usa sonidos y partículas vanilla ("random.explode", "minecraft:totem_particle").
- Si el pedido no se puede hacer en Bedrock, dilo con "IMPOSIBLE:" y haz la alternativa real más cercana; no simules.`;
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

// v14.49.2: si una parte falló y un objeto del plan no quedó escrito, se genera con una plantilla válida
// (así el add-on nunca pierde en silencio un ítem/bloque/criatura que el usuario pidió).
function plantillaObjetoMc(o){
  const id=String(o.id), corto=id.split(":")[1]||id, n=normMc(corto+" "+(o.nombre||""));
  const tipo=String(o.tipo||"item").toLowerCase();
  if(/block|bloque/.test(tipo)){
    return {path:"BP/blocks/"+corto+".json",obj:{format_version:"1.21.0","minecraft:block":{description:{identifier:id,menu_category:{category:"construction"}},components:{"minecraft:material_instances":{"*":{texture:corto,render_method:"opaque"}},"minecraft:destructible_by_mining":{seconds_to_destroy:3},"minecraft:destructible_by_explosion":{explosion_resistance:6},"minecraft:friction":0.4,"minecraft:map_color":"#808080"}}}};
  }
  if(/entit|criatura|mob/.test(tipo)){
    const hostil=/zombi|zombie|monstruo|esqueleto|jefe|boss|demonio|araña|bestia|mutante|infectado|lobo_|vampiro|fantasma/.test(n);
    const c={"minecraft:type_family":{family:[corto,hostil?"monster":"mob"]},"minecraft:health":{value:hostil?30:12,max:hostil?30:12},"minecraft:collision_box":{width:0.6,height:1.9},"minecraft:movement":{value:0.25},"minecraft:movement.basic":{},"minecraft:navigation.walk":{can_path_over_water:false,avoid_water:true,can_break_doors:false},"minecraft:jump.static":{},"minecraft:physics":{},"minecraft:pushable":{is_pushable:true,is_pushable_by_piston:true},"minecraft:behavior.float":{priority:0},"minecraft:behavior.random_stroll":{priority:6,speed_multiplier:1},"minecraft:behavior.look_at_player":{priority:7,look_distance:8},"minecraft:behavior.random_look_around":{priority:9}};
    if(hostil){c["minecraft:attack"]={damage:4};c["minecraft:behavior.melee_attack"]={priority:3,speed_multiplier:1,track_target:true};c["minecraft:behavior.hurt_by_target"]={priority:1};c["minecraft:behavior.nearest_attackable_target"]={priority:2,must_see:true,reselect_targets:true,entity_types:[{filters:{test:"is_family",subject:"other",value:"player"},max_dist:24}]};c["minecraft:experience_reward"]={on_death:"5"};}
    return {path:"BP/entities/"+corto+".json",obj:{format_version:"1.21.0","minecraft:entity":{description:{identifier:id,is_spawnable:true,is_summonable:true,is_experimental:false},components:c}}};
  }
  const c={"minecraft:max_stack_size":64};
  let cat="items";
  if(/casco|helm|capucha|peto|pechera|chaleco|pantal|legging|greva|bota|boot/.test(n)){
    const slot=/casco|helm|capucha/.test(n)?"head":/pantal|legging|greva/.test(n)?"legs":/bota|boot/.test(n)?"feet":"chest";
    c["minecraft:max_stack_size"]=1;c["minecraft:durability"]={max_durability:300};c["minecraft:enchantable"]={slot:"armor_"+(slot==="chest"?"torso":slot),value:12};c["minecraft:wearable"]={slot:"slot.armor."+slot,protection:slot==="chest"?6:slot==="legs"?5:3};cat="equipment";
  }else if(/espada|hacha|pico|pala|azada|sword|axe|pickaxe|shovel|daga|lanza|martillo|arma|pistola|rifle|escopeta/.test(n)){
    c["minecraft:max_stack_size"]=1;c["minecraft:hand_equipped"]=true;c["minecraft:damage"]=6;c["minecraft:durability"]={max_durability:250};cat="equipment";
  }else if(/comida|manzana|pan|carne|sopa|galleta|fruta|pastel|botiquin_comida|enlatada/.test(n)){
    c["minecraft:food"]={nutrition:4,saturation_modifier:0.6,can_always_eat:false};c["minecraft:use_modifiers"]={use_duration:1.6,movement_modifier:0.35};
  }
  return {path:"BP/items/"+corto+".json",obj:{format_version:"1.21.0","minecraft:item":{description:{identifier:id,menu_category:{category:cat}},components:c}}};
}
function completarObjetosFaltantes(entrada,plan){
  const existentes=new Set();
  for(const f of entrada){
    if(!/^BP\/(items|blocks|entities)\/.+\.json$/.test(f.path))continue;
    try{const j=JSON.parse(f.content);const r=j["minecraft:item"]||j["minecraft:block"]||j["minecraft:entity"];const id=r&&r.description&&r.description.identifier;if(id)existentes.add(id);}catch(_){}
  }
  const hechos=[];
  for(const o of (Array.isArray(plan.objetos)?plan.objetos:[])){
    if(!o||typeof o.id!=="string"||!/^[a-z][a-z0-9_]*:[a-z0-9_]+$/.test(o.id)||existentes.has(o.id))continue;
    const t=plantillaObjetoMc(o);
    if(entrada.some(f=>f.path===t.path))continue;
    entrada.push({path:t.path,content:JSON.stringify(t.obj,null,2)+"\n"});hechos.push(o.id);
  }
  return hechos;
}

function mcNs(v){const s=String(v||"").toLowerCase().replace(/[^a-z0-9_]/g,"").slice(0,12);return /^[a-z][a-z0-9_]{1,11}$/.test(s)?s:"ego";}
function mcId(ns,v){const x=String(v||"").toLowerCase().replace(/^[^:]*:/,"").normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9_]+/g,"_").replace(/^_+|_+$/g,"").slice(0,40);return x?ns+":"+x:"";}
const MC_TIPOS_PARTE=["items","blocks","entities","script","recipes","loot","spawn","misc"];

// Plan de respaldo granular: evita enviar un proyecto grande como una única parte "Add-on completo".
function crearPartesRespaldoMinecraft(prompt){
  const t=normMc(String(prompt||""));
  const partes=[];
  const add=(titulo,tipo,detalle)=>partes.push({titulo,tipo,detalle:String(prompt||"").slice(0,1800)+"\n\nAlcance de esta parte: "+detalle,archivos:[]});
  if(/zombi|zombie|criatura|mutante|monstruo|jefe|boss|npc|superviviente|supervivientes/.test(t)){
    add("Entidades y criaturas","entities","Genera las entidades personalizadas pedidas, con identificadores consistentes, comportamiento Bedrock y recursos visuales conectados cuando correspondan.");
  }
  if(/arma|armas|pistola|rifle|escopeta|munici[oó]n|botiqu[ií]n|objeto|objetos|[ií]tem|bloque|bloques|equipo/.test(t)){
    add("Objetos, armas y bloques","items","Genera definiciones reales de objetos/bloques solicitados, iconos registrados, recetas y comportamiento coherente; no simules armas de fuego con golpes cuerpo a cuerpo.");
  }
  if(/supervivencia|sed|hambre|infecci[oó]n|herida|hemorragia|misi[oó]n|misiones|progresi[oó]n|habilidad|sistema|npc|superviviente|veh[ií]culo|evento|oleada|comercio/.test(t)){
    add("Sistemas y lógica de juego","script","Implementa los sistemas solicitados con estados, eventos, persistencia apropiada y conexión real con entidades/objetos. No incluyas funciones vacías ni afirmaciones no implementadas.");
  }
  if(/receta|crafteo|fabricaci[oó]n/.test(t)) add("Recetas","recipes","Implementa las recetas pedidas con IDs que existan en el proyecto.");
  if(/bot[ií]n|cofre|recompensa|loot|suministro/.test(t)) add("Botín y recompensas","loot","Implementa tablas de botín y conecta sus rutas a las entidades/cofres correspondientes.");
  if(/aparici[oó]n|spawn|oleada|noche|zombi|zombie|criatura|mutante/.test(t)) add("Aparición y progresión","spawn","Implementa reglas de aparición Bedrock compatibles y coherentes con la dificultad solicitada.");
  if(/estructura|hospital|laboratorio|comisar[ií]a|refugio|base militar|ciudad|edificio|mapa/.test(t)) add("Construcciones y estructuras","misc","Entrega estructuras únicamente en formatos realmente disponibles; si solo puedes crear planos o funciones de construcción, identifícalos como tales.");
  if(/textura|modelo|animaci[oó]n|sonido|voz|visual|apariencia/.test(t)) add("Recursos visuales y audio","misc","Conecta modelos, texturas, animaciones y sonidos reales; no declares recursos que no existan.");
  if(!partes.length) {
    add("Contenido principal","entities","Implementa el contenido principal solicitado con archivos completos.");
    add("Lógica y configuración","script","Conecta el comportamiento del proyecto mediante lógica Bedrock compatible.");
  }
  // Siempre separar los archivos base de recursos/registro del código de gameplay.
  if(partes.length<12 && !partes.some(x=>x.tipo==="misc")) add("Integración y recursos","misc","Conecta manifests, referencias, idioma, recursos y documentación del contenido generado.");
  return partes.slice(0,12);
}

const RX_3D=/(?:modelo\s*(?:3\s*d|propio|grande|personalizado|custom)|\b3\s*d\b|geometr[ií]a|jefe\s+(?:gigante|enorme|grande)|boss\s+gigante|dise[nñ]o\s+propio)/i;
function limpiarPlan(j,prompt){
  const base={nombre:"Add-on EGO",ns:"ego",resumen:String(prompt||"").slice(0,300),objetos:[],partes:[]};
  if(!j||typeof j!=="object") j={};
  base.nombre=tituloCaso(String(j.nombre||"Add-on EGO").replace(/[^\p{L}\p{N} '’-]/gu,""))||"Add-on EGO";
  base.ns=mcNs(j.ns);
  {const cnt={};for(const o of (Array.isArray(j.objetos)?j.objetos:[])){const mm=String(o&&o.id||"").match(/^([a-z][a-z0-9_]{1,12}):/i);if(mm){const k=mm[1].toLowerCase();cnt[k]=(cnt[k]||0)+1;}}const top=Object.entries(cnt).sort((a,b)=>b[1]-a[1])[0];if(top&&(base.ns==="ego"||!cnt[base.ns]))base.ns=mcNs(top[0]);}
  base.resumen=String(j.resumen||prompt||"").slice(0,400);
  base.requisitos=(Array.isArray(j.requisitos)?j.requisitos:[]).map(x=>String(x||"").trim().slice(0,500)).filter(Boolean).slice(0,40);
  {const pj=new Set((Array.isArray(j.poderes_jugador)?j.poderes_jugador:(Array.isArray(j.poderesJugador)?j.poderesJugador:[])).map(x=>normMc(x).replace(/[^a-z_]/g,"")).filter(x=>MC_PODERES_JUG[x]));for(const x of detectarPoderesJugador(prompt))pj.add(x);base.poderesJugador=[...pj];
    // si los efectos pertenecen a un objeto/armadura, NO se activan para todos desde que entran
    {const np=normMc(prompt);const eq=/(armadura|casco|pechera|botas|pantalon|espada|\barmas?\b|baston|varita|hacha|pico\b|escudo|anillo|corona|\bobjetos?\b|\bitems?\b)/.test(np);const ex=/(sin (?:objetos|items|armadura|nada)|desde que (?:entro|entras|empiez)|al entrar|permanente|siempre activ|poderes? (?:divinos?|de dios|del jugador|al jugador|para el jugador)|superpoderes?)/.test(np);if(eq&&!ex)base.poderesJugador=[];}}
  const sinObjExpl=/(?:no quiero|sin|nada de|no necesito)\s+(?:ning[uú]n\s+)?(?:objetos?|[ií]tems?|criaturas?|mobs?|bloques?|armas?)/i.test(String(prompt||""));
  // poderes para el jugador y NINGÚN pedido de criatura/objeto/arma/bloque → no se crean objetos ni criaturas (antes salió una criatura "Superman Player" que nadie pidió)
  const sinObj=sinObjExpl||(base.poderesJugador.length>0&&!/(criatura|\bmobs?\b|entidad|jefe|\bboss|\bnpc|enemigo|zombi|esqueleto|dragon|mascota|\barmas?\b|espada|armadura|casco|bloque|item|objeto|herramienta|varita|baston|\bpico\b|hacha|comida|mineral|mineria)/.test(normMc(prompt)));
  if(j.kit&&typeof j.kit==="object"&&/\b(?:cofres?|kit)\b/i.test(String(prompt||""))&&!/(?:sin|no\s+(?:quiero|necesito))\s+(?:el\s+|un\s+)?(?:cofres?|kit)\b/i.test(String(prompt||""))){const K=j.kit;base.kit={armadura:!!K.armadura,herramientas:!!K.herramientas,recursos:!!K.recursos,encantar:!!K.encantar,material:/diam/i.test(String(K.material))?"diamond":"netherite"};}
  const vistos=new Set();
  for(const o of (sinObj&&base.poderesJugador.length?[]:(Array.isArray(j.objetos)?j.objetos:[]).slice(0,60))){
    const id=mcId(base.ns,o&&o.id); const tipo=["item","block","entity"].includes(o&&o.tipo)?o.tipo:"item";
    if(!id||vistos.has(id)) continue; vistos.add(id);
    base.objetos.push({id,tipo,icono:["arma_fuego","pistola","rifle","escopeta","francotirador","botiquin","granada","municion","armadura","escudo","espada","hacha","pico","vara","reloj","libro","corona","botella","anillo","lingote","orbe","gema"].includes(normMc(o.icono))?normMc(o.icono):"",nombre:tituloCaso(String(o.nombre||id.split(":")[1].replace(/_/g," "))).slice(0,40),descripcion:String(o.descripcion||"").slice(0,300),habilidad:["rayo","fuego","hielo","explosion","veneno","viento","curacion","ninguna"].includes(normMc(o.habilidad))?normMc(o.habilidad):"",entrega:["kit","crafteo","creativo","botin","aparece"].includes(normMc(o.entrega))?normMc(o.entrega):"",rayos:Number(o.rayos)||0,espera:Number(o.espera)||0,poderes:(Array.isArray(o.poderes)?o.poderes:[]).map(x=>normMc(x).replace(/[^a-z_]/g,"")).filter(x=>MC_PODERES[x]).slice(0,8)});
  }
  for(const p of (sinObj&&base.poderesJugador.length?[]:(Array.isArray(j.partes)?j.partes:[])).slice(0,12)){
    if(/^(?:textur|sonid|sound|audio|icon|imagen)/i.test(String(p&&p.titulo||"").trim())&&!/(?:script|logic|comport)/i.test(String(p&&p.titulo||"")))continue; // EGO crea las texturas solo; los sonidos no se pueden generar
    if(p&&p.tipo==="modelo3d")continue;
    const tipo=MC_TIPOS_PARTE.includes(p&&p.tipo)?p.tipo:"misc";
    const arch=(Array.isArray(p&&p.archivos)?p.archivos:[]).map(x=>safeProjectPath(x)).filter(x=>x&&/^(BP|RP)\//.test(x)&&!/manifest\.json$|\.png$/i.test(x)).slice(0,12);
    base.partes.push({titulo:String((p&&p.titulo)||"Parte "+(base.partes.length+1)).slice(0,60),tipo,detalle:String((p&&p.detalle)||"").slice(0,1500),archivos:arch});
  }
  if(!base.partes.length&&!(sinObj&&base.poderesJugador.length)) base.partes=crearPartesRespaldoMinecraft(prompt);

  {const ents=base.objetos.filter(o=>o.tipo==="entity");const pedidos=new Map();
   for(const q of (Array.isArray(j.modelos3d)?j.modelos3d:[]).slice(0,12)){const id=mcId(base.ns,q&&(q.entidad||q.id));if(ents.some(e=>e.id===id))pedidos.set(id,String((q&&q.descripcion)||"").slice(0,500));}
   if(RX_3D.test(String(prompt||"")))for(const e of ents)if(!pedidos.has(e.id))pedidos.set(e.id,"");
   for(const [id,desc] of [...pedidos].slice(0,12)){const o=ents.find(e=>e.id===id);base.partes.push({titulo:"Modelo 3D: "+o.nombre,tipo:"modelo3d",detalle:desc||o.descripcion||"",archivos:[],entidad:id});}}
  base.sonidos=[];for(const s of (Array.isArray(j.sonidos)?j.sonidos:[]).slice(0,4)){const texto=String(s&&s.texto||"").replace(/[<>]/g," ").trim().slice(0,240);if(texto.length<3)continue;const nom=String(s&&s.nombre||"voz").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9_]/g,"_").slice(0,20)||"voz";const ent=s&&s.entidad?mcId(base.ns,s.entidad):"";base.sonidos.push({nombre:nom+(base.sonidos.length?"_"+base.sonidos.length:""),texto,entidad:ent});}
  if(j.revisionEquipo&&typeof j.revisionEquipo==="object")base.revisionEquipo={planner:String(j.revisionEquipo.planner||"").slice(0,100),reasoner:String(j.revisionEquipo.reasoner||"").slice(0,2500),auditor:String(j.revisionEquipo.auditor||"").slice(0,2500)};
  return base;
}
async function candidatosCodigo(env,rol){
  const c=[];
  for(const provider of egoExternalProviders(env,rol==="razonar"?"reasoning":"code")) c.push({tipo:"ext",id:provider.id,provider});
  if(rol==="razonar" && env.AI) for(const x of CF_MODELS.razonar.slice(0,3)) c.push({tipo:"cf",id:x});
  if(rol!=="razonar" && env.AI){
    const cad=env.PROJECT_CF_MODEL?[String(env.PROJECT_CF_MODEL),...CF_MODELS.codigo.filter(m=>m!==String(env.PROJECT_CF_MODEL))]:CF_MODELS.codigo;
    for(const m of cad.slice(0,4)) c.push({tipo:"cf",id:m});
  }
  const orEnPausa=globalThis.__egoOrSinCredito && Date.now()-globalThis.__egoOrSinCredito<120000;
  if(routerApiKey(env) && !orEnPausa) for(const m of openRouterCandidates(env,rol==="razonar"?"reasoning":"code").slice(0,3)) c.push({tipo:"or",id:m});
  return c;
}
async function llamarCodigo(env,mensajes,maxTok,desde,rol){
  const cands=await candidatosCodigo(env,rol); const fallos=[];
  if(!cands.length) throw new Error("Configura Workers AI o ROUTER_API_KEY/OPENROUTER_API_KEY.");
  for(let i=Math.min(desde||0,cands.length-1);i<cands.length;i++){
    const c=cands[i];
    try{
      let raw="";
      if(c.tipo==="cf") raw=(await cfChat(c.id,mensajes,env,maxTok)).content;
      else if(c.tipo==="ext") raw=(await egoExternalChat(c.provider,mensajes,env,maxTok,22000)).content;
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
    }catch(e){
      const em=String(e&&e.message||e);
      fallos.push(c.id.split("/").pop()+": "+em.slice(0,70));
      if(c.tipo==="or" && /HTTP 402|CRÉDITOS\/TOKENS INSUFICIENTES/.test(em)) { globalThis.__egoOrSinCredito=Date.now(); break; }
    }
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

// Pedido grande: varias partes pequeñas y paralelas (una parte gigante agota el tiempo). Solo la llama mcPlan, para que los índices del plan no cambien después.
function dividirTrabajoGrande(base,prompt){
  const grande=String(prompt||"").length>2200||(base.requisitos||[]).length>=8;
  if(!grande||!Array.isArray(base.partes))return base;
  const antes3d=base.partes.filter(p=>p.tipo==="modelo3d");
  base.partes=base.partes.filter(p=>p.tipo!=="modelo3d");
  for(const r of crearPartesRespaldoMinecraft(prompt)) if(!base.partes.some(p=>p.tipo===r.tipo)) base.partes.push(r);
  const si=base.partes.findIndex(p=>p.tipo==="script");
  if(si>=0&&base.partes.filter(p=>p.tipo==="script").length<2){
    const orig=base.partes[si];
    const contrato="ARQUITECTURA OBLIGATORIA DE SCRIPTS: BP/scripts/main.js SOLO contiene imports de efecto lateral (import \"./sistemas.js\"; import \"./eventos.js\";). Cada módulo se auto-registra al cargarse (suscribe sus propios eventos) y NO depende de exports de otros módulos; comparten datos solo con world/entity.getDynamicProperty y setDynamicProperty.";
    base.partes.splice(si,1,
      {titulo:"Núcleo: main.js y eventos base",tipo:"script",detalle:String(orig.detalle||"").slice(0,900)+"\n\n"+contrato+"\nEsta parte escribe BP/scripts/main.js y BP/scripts/eventos.js (eventos de jugador/entidad, daño y muerte).",archivos:["BP/scripts/main.js","BP/scripts/eventos.js"]},
      {titulo:"Sistemas de juego (módulo)",tipo:"script",detalle:String(orig.detalle||"").slice(0,900)+"\n\n"+contrato+"\nEsta parte escribe SOLO BP/scripts/sistemas.js (supervivencia, progresión, misiones y estados). NO escribas main.js.",archivos:["BP/scripts/sistemas.js"]});
  }
  base.partes=[...base.partes,...antes3d].slice(0,14);
  return base;
}

// v14.55: el aprendizaje del creador ahora también guía la CREACIÓN de add-ons (antes solo se usaba en el chat),
// y EGO recuerda los errores que más repite para avisarles a los modelos.
async function mcMemoriaCreador(env,prompt){
  let t="";
  try{
    const ls=await Promise.race([elegirLecciones(env,String(prompt||"").slice(0,1500)),new Promise(r=>setTimeout(()=>r([]),3000))]);
    if(ls&&ls.length){
      t+="\n\n=== LO QUE TU CREADOR TE ENSEÑÓ (aplícalo al diseñar y programar este add-on) ===\n";
      let usado=0;
      for(const l of ls.slice(0,4)){
        let s="### "+l.titulo+"\n"+(l.resumen?l.resumen+"\n":"")+(l.reglas&&l.reglas.length?l.reglas.slice(0,8).map(r=>"- "+r).join("\n")+"\n":"")+(l.calidad&&l.calidad.length?"Calidad: "+l.calidad.slice(0,5).join(" | ")+"\n":"");
        if(usado+s.length>3800)break; usado+=s.length; t+=s;
      }
      t+="=== FIN ===\n";
    }
  }catch(_){}
  try{
    if(env&&env.EGO_BIBLIOTECA){
      const raw=await Promise.race([env.EGO_BIBLIOTECA.get("mc_errores_frecuentes"),new Promise(r=>setTimeout(()=>r(null),1500))]);
      const m=raw?JSON.parse(raw):{};
      const top=Object.entries(m).filter(([k,v])=>v>=2).sort((a,b)=>b[1]-a[1]).slice(0,8);
      if(top.length)t+="\nERRORES QUE EGO REPITE MUCHO (NO los cometas): "+top.map(([k,v])=>k+" (x"+v+")").join("; ")+"\n";
    }
  }catch(_){}
  return t;
}
async function mcRegistrarErrores(env,cambios){
  try{
    if(!env||!env.EGO_BIBLIOTECA||!cambios||!cambios.length)return;
    const raw=await env.EGO_BIBLIOTECA.get("mc_errores_frecuentes");const m=raw?JSON.parse(raw):{};
    for(const c of cambios){
      const k=String(c.motivo||"").replace(/\bego:[\w]+|[\w\-]+:[\w\-]+/g,"id").replace(/[«»"'`].*?[«»"'`]/g,"").replace(/\d+/g,"N").split(/[—:(]/)[0].trim().slice(0,70);
      if(k.length<6)continue; m[k]=(m[k]||0)+1;
    }
    const e=Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,60);
    await env.EGO_BIBLIOTECA.put("mc_errores_frecuentes",JSON.stringify(Object.fromEntries(e)));
  }catch(_){}
}
async function mcPlan(body,env){
  const prompt=String(body.prompt||"").trim().slice(0,12000);
  if(!prompt) return respuestaJsonError("Falta prompt.");
  const sys=MC_GUIA_BASE+`\n\nTu tarea ahora: PLANIFICAR el add-on pedido. Devuelve SOLO un JSON (sin Markdown) con esta forma:
{"nombre":"Nombre del add-on","ns":"prefijo corto en minúsculas (por defecto ego)","resumen":"qué hace en 1-2 frases","requisitos":["una línea por cada cosa CONCRETA que pidió el usuario, con sus detalles; si algo no se puede hacer en Minecraft Bedrock, empieza la línea con IMPOSIBLE: y explica qué se hará en su lugar"],"objetos":[{"id":"ns:nombre_en_minusculas","tipo":"item|block|entity","nombre":"Nombre visible","descripcion":"cómo se comporta","icono":"arma_fuego|pistola|rifle|escopeta|francotirador|botiquin|municion|armadura|escudo|espada|hacha|pico|vara|reloj|libro|corona|botella|anillo|lingote|orbe|gema: cómo se ve el ítem","habilidad":"solo para ítems de arma/herramienta: rayo|fuego|hielo|explosion|veneno|viento|curacion|ninguna (EGO programa esa habilidad automáticamente: clic derecho + golpe)","entrega":"kit|crafteo|creativo|botin|aparece: DÓNDE y CUÁNDO recibe el jugador este objeto según el pedido (si dijo que viene en el cofre inicial, kit)","poderes":["solo si el ítem da poderes pasivos o de vuelo: vuelo|vision_nocturna|velocidad|fuerza|regeneracion|resistencia|salto|respirar_agua|sin_hambre|resistencia_fuego"]}],"kit":null,"poderes_jugador":[],"modelos3d":[],"sonidos":[],"partes":[{"titulo":"corto","tipo":"items|blocks|entities|script|recipes|loot|spawn","detalle":"instrucciones exactas y completas de lo que debe contener esta parte (comportamientos, números, ids que usa)","archivos":["BP/items/nombre.json"]}]}
ANÁLISIS PROFUNDO: antes de planificar, lee el pedido palabra por palabra y enumera en "requisitos" TODO lo que pidió (nada más, nada menos). Cada objeto, habilidad y parte del plan debe servir a un requisito. No interpretes a tu gusto: si el usuario no lo dijo, no lo agregues.
PODERES DEL JUGADOR: si el usuario quiere TENER poderes él mismo (inmortal, vida infinita, volar, velocidad, fuerza, daño infinito, aura, miedo en monstruos, aldeanos que lo adoran, destruir, levantar objetos, visión nocturna, saltar, respirar bajo el agua, sin hambre, inmune al fuego), ponlos en \"poderes_jugador\" usando SOLO estos nombres: inmortal, vida_infinita, vuelo, velocidad, fuerza, dano_infinito, aura, miedo_mobs, adoracion_aldeanos, destruccion, telekinesis, vision_nocturna, salto, respirar_agua, sin_hambre, resistencia_fuego. EGO los programa y se activan solos al entrar al mundo: NO crees ítems, criaturas ni scripts para eso. Si dijo que no quiere objetos, objetos=[] y partes=[].
MODELOS 3D: si el usuario pide un modelo 3D, un diseño propio, un jefe/criatura grande o que se vea diferente a los mobs del juego, pon en \"modelos3d\" una entrada por criatura: {\"entidad\":\"ns:id de un objeto tipo entity\",\"descripcion\":\"cómo se ve: forma, tamaño, colores, partes\"}. EGO diseña la geometría y la textura por su cuenta. SONIDOS Y VOCES: si pide que algo hable o tenga voz/sonido propio, pon en \"sonidos\" {\"nombre\":\"corto\",\"texto\":\"frase exacta que dirá (máx 240 caracteres)\",\"entidad\":\"ns:id opcional: suena cuando aparece\"}; EGO genera el audio con voz sintética.
ARQUITECTURA NPC INTELIGENTE EGO (OBLIGATORIA CUANDO EL PEDIDO INCLUYA COMPAÑEROS, ALIADOS, NPCs O CRIATURAS CON IA): diseña una arquitectura original por módulos, no copies código/assets/IDs de add-ons comerciales. Cada NPC debe tener rol explícito, estados (idle/follow/defend/combat/retreat/work), percepción por radio, prioridades, memoria persistente limitada y cooldowns. Usa componentes vanilla válidos para navegación, combate y objetivos; si requiere Script API, divide en BP/scripts/main.js + módulos pequeños autocontenidos importados desde main.js. Define claramente cómo se recluta/vincula al jugador, cómo evita atacar jugadores/aliados, cómo recupera seguimiento y cómo se limpia al morir/despawn. Para minería/recolección/construcción, implementa únicamente acciones compatibles y seguras con APIs verificadas; no simules que el NPC puede hacer tareas que el juego/API no permiten. Añade archivos de prueba/documentación con comandos y límites. Si el usuario pide compañeros inteligentes de supervivencia, incluye combate defensivo y seguimiento; no añadas funciones no pedidas.REGLA CLAVE: incluye SOLO lo que el usuario pidió, nada más (cero extras de ejemplo). EGO programa por su cuenta, sin que tú lo escribas: (a) las habilidades de armas (campo habilidad), (b) los poderes de un ítem (campo poderes: vuelo, visión nocturna, etc.), (c) el KIT INICIAL: si el usuario pide recibir al crear/entrar al mundo un cofre con armadura, herramientas o recursos, pon en el JSON "kit":{"armadura":true|false,"herramientas":true|false,"recursos":true|false,"encantar":true|false,"material":"netherite|diamond"} (si no lo pidió, "kit":null) y NO crees bloques, ítems ni scripts para eso. Solo crea los objetos personalizados que el usuario nombró (ej. el reloj o el amuleto).
Reglas: máximo 12 partes y 12 archivos por parte; separa en partes lógicas (ítems, bloques, criaturas, scripts, recetas, botín, aparición); cada parte debe poder escribirse sola usando los ids de "objetos"; los scripts van en BP/scripts/ (el principal es BP/scripts/main.js); no incluyas manifests ni imágenes. Sé fiel al pedido y no recortes funciones: si el usuario pide mucho, haz muchas partes.`;
  try{
    const memoriaMc=await mcMemoriaCreador(env,prompt);
    const mensajesPlan=[{role:"system",content:sys+memoriaMc},{role:"user",content:"Pedido del usuario:\n"+prompt}];
    // Planner diseña; reasoner y auditor revisan en paralelo. Sus observaciones
    // quedan adjuntas al plan para que el generador las respete en cada módulo.
    // v14.47: planificación con presupuesto fijo (antes sin límite: podía pasar de 165 s y la app abortaba)
    const r=await Promise.race([
      egoRoleChat("planner",mensajesPlan,env,6000,{maxTotalMs:85000,maxModels:3,perModelMs:40000,providerTimeoutMs:30000,providerModels:3,cfModels:1,cfTimeoutMs:35000,
        validateContent:(c)=>{try{const j=extractJson(c);return !!(j&&typeof j==="object"&&Array.isArray(j.partes||j.objetos||[]));}catch(_){return false;}}}),
      tmoMc(90000)
    ]);
    const plan=limpiarPlan(extractJson(r.content),prompt);
    const revisionMsgs=[
      {role:"system",content:"Eres el revisor técnico de un plan Minecraft Bedrock. Detecta requisitos omitidos, incompatibilidades y dependencias. Devuelve observaciones concretas y breves; no reescribas el plan."},
      {role:"user",content:"SOLICITUD:\n"+prompt+"\nPLAN:\n"+JSON.stringify(plan).slice(0,14000)}
    ];
    const [revTecnica,revAuditoria]=await Promise.all([
      Promise.race([egoRoleChat("reasoner",revisionMsgs,env,1600,{maxTotalMs:22000,maxModels:2,perModelMs:12000,providerTimeoutMs:12000,providerModels:1,cfModels:0}),tmoMc(24000)]).catch(e=>({content:"Revisión técnica no disponible: "+String(e.message||e).slice(0,120),fallos:[]})),
      Promise.race([egoRoleChat("auditor",[{role:"system",content:"Audita cobertura y coherencia del plan Minecraft Bedrock. Señala requisitos faltantes, partes mal separadas y dependencias. No inventes. Responde en puntos breves."},...revisionMsgs.slice(1)],env,1600,{maxTotalMs:22000,maxModels:2,perModelMs:12000,providerTimeoutMs:12000,providerModels:1,cfModels:0}),tmoMc(24000)]).catch(e=>({content:"Auditoría no disponible: "+String(e.message||e).slice(0,120),fallos:[]}))
    ]);
    plan.revisionEquipo={planner:r.model,reasoner:revTecnica.content,auditor:revAuditoria.content};
    const inferred=crearPartesRespaldoMinecraft(prompt);
    const tipos=new Set(plan.partes.filter(x=>x.tipo!=="misc").map(x=>x.tipo));
    const titulos=new Set(plan.partes.map(x=>normMc(x.titulo)));
    for(const parte of inferred){
      if(plan.partes.length>=12) break;
      const titulo=normMc(parte.titulo);
      if(parte.tipo==="misc" ? !titulos.has(titulo) : !tipos.has(parte.tipo)){
        plan.partes.push(parte); titulos.add(titulo); tipos.add(parte.tipo);
      }
    }
    dividirTrabajoGrande(plan,prompt);
    // Los manifests/imágenes los genera el código; y las instrucciones sobre cómo trabaja EGO no son requisitos del add-on.
    plan.partes=plan.partes.filter(p=>!(/^\s*manifests?\b/i.test(p.titulo)||(p.archivos&&p.archivos.length&&p.archivos.every(a=>/manifest\.json$|\.(png|jpg|ogg)$/i.test(a)))));
    if(Array.isArray(plan.requisitos))plan.requisitos=plan.requisitos.filter(x=>!/(recuperaci[oó]n de m[oó]dulos|proveedores? (disponibles|de ia)|cambia de proveedor|reintenta solamente|no reinicies|informe (final|detallado)|entrega en (un )?(único )?archivo|archivo \.?mcaddon|no simules|distingue entre c[oó]digo generado)/i.test(String(x)));
    return json({ok:true,plan,model:r.model,fallosModelos:r.fallos||[]});
  }catch(e){
    const plan=limpiarPlan(null,prompt);
    plan.partes=crearPartesRespaldoMinecraft(prompt);
    dividirTrabajoGrande(plan,prompt);
    return json({ok:true,plan,model:"plan-basico-granular",aviso:"El planificador IA no respondió; se creó un plan de respaldo dividido en módulos. Cada módulo debe validarse por separado.",detalle:String(e&&e.message||e).slice(0,160)});
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
function parsearSalidaMc(raw, verSrv="2.10.0"){
  const p=leerProyectoModelo(raw);const files=[],errores=[];const vistos=new Set();
  if(!p||!p.files.length)return {files,errores:["formato"]};
  for(const f of p.files){
    const path=safeProjectPath(f.path);
    if(!path||!/^(BP|RP)\//.test(path)||/manifest\.json$|\.(png|jpg|ogg|zip|mcaddon)$/i.test(path)||vistos.has(path)||typeof f.content!=="string")continue;
    vistos.add(path);
    if(/\.json$/i.test(path)){const t=jsonTolerante(f.content);if(!t.ok){errores.push(path);continue;}files.push({path,content:JSON.stringify(t.obj,null,2)+"\n"});}
    else if(/\.js$/i.test(path)){if(balanceJs(f.content)||lintScriptApi(f.content, verSrv).length){errores.push(path);continue;}files.push({path,content:f.content});}
    else if (f.content.length > 300000) errores.push(path + ": archivo supera 300000 caracteres; se rechaza completo para evitar truncamiento silencioso.");
    else files.push({path,content:f.content});
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
// ===== TEXTURAS CON DETALLE: cada cubo tiene su propio UV y se pinta con ruido, sombras, suciedad, sangre y rasgos =====
function hshT(a,b,c){let h=(Math.imul(a|0,374761393)+Math.imul(b|0,668265263)+Math.imul(c|0,2147483647))|0;h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967296;}
function vnT(x,y,s){const gx=Math.floor(x/4),gy=Math.floor(y/4),fx=x/4-gx,fy=y/4-gy;const a=hshT(gx,gy,s),b=hshT(gx+1,gy,s),c=hshT(gx,gy+1,s),d=hshT(gx+1,gy+1,s);return (a*(1-fx)+b*fx)*(1-fy)+(c*(1-fx)+d*fx)*fy;}
function empaquetarCaras(caras,W){
  const orden=caras.map((c,i)=>i).sort((i,j)=>caras[j].h-caras[i].h||caras[j].w-caras[i].w);
  let x=0,y=0,fila=0;
  for(const i of orden){const c=caras[i];if(c.w>W)return null;if(x+c.w>W){x=0;y+=fila;fila=0;}c.x=x;c.y=y;x+=c.w;fila=Math.max(fila,c.h);}
  return y+fila;
}
function construirModelo3d(geoId,partes){
  const ps=limpiarModelo3d(partes);if(ps.length<3)return null;
  const caras=[];
  ps.forEach((p,i)=>{const t=p.tam.map(v=>Math.max(1,Math.round(v)));
    for(const c of [["north",t[0],t[1]],["south",t[0],t[1]],["east",t[2],t[1]],["west",t[2],t[1]],["up",t[0],t[2]],["down",t[0],t[2]]])caras.push({i,n:c[0],w:c[1],h:c[2]});});
  let W=0;for(const cand of [64,128,256]){const alto=empaquetarCaras(caras,cand);if(alto!==null&&alto<=cand){W=cand;break;}}
  if(!W)return construirModelo3dPaleta(geoId,partes);
  const px=new Uint8Array(W*W*4);
  const SOMBRA={up:0.16,north:0.02,south:-0.07,east:-0.1,west:-0.1,down:-0.28};
  const esZ=/zombi|zombie|infect|mutante|cadaver/.test(geoId);
  const seed0=[...geoId].reduce((a,c)=>(a*31+c.charCodeAt(0))|0,7);
  const rgbDe=(h)=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
  const clamp=(v)=>Math.max(0,Math.min(255,Math.round(v)));
  const poner=(X,Y,r,g,b)=>{if(X<0||Y<0||X>=W||Y>=W)return;const o=(Y*W+X)*4;px[o]=clamp(r);px[o+1]=clamp(g);px[o+2]=clamp(b);px[o+3]=255;};
  const uvPorCubo=ps.map(()=>({}));
  for(const c of caras){
    const p=ps[c.i],base=rgbDe(p.color),brillo=/ojo|eye|brill|gema|runa|emblema/.test(p.nombre);
    uvPorCubo[c.i][c.n]={uv:[c.x,c.y],uv_size:[c.w,c.h]};
    const sd=seed0+c.i*977;
    const sangre=!brillo&&esZ&&/torso|peto|brazo|manga|cabeza|head|pierna/.test(p.nombre)&&hshT(c.i,c.n.length,seed0)<0.4;
    for(let v=0;v<c.h;v++)for(let u=0;u<c.w;u++){
      const X=c.x+u,Y=c.y+v;
      let k=brillo?0.04+(hshT(X,Y,sd)-0.5)*0.1:SOMBRA[c.n]+(hshT(X,Y,sd)-0.5)*0.16+(vnT(X,Y,sd+3)-0.5)*0.26-(v/Math.max(1,c.h))*0.1;
      if(!brillo&&c.w>2&&c.h>2&&(u===0||v===0||u===c.w-1||v===c.h-1))k-=0.11;
      px[(Y*W+X)*4+3]=255;
      poner(X,Y,base[0]*(1+k),base[1]*(1+k),base[2]*(1+k));
    }
    if(sangre&&c.w>=2&&c.h>=3){
      const n=1+Math.floor(hshT(c.i,c.w,seed0+9)*3);
      for(let q=0;q<n;q++){const cx=Math.floor(hshT(q,c.i,seed0+1)*c.w),cy=Math.floor(hshT(q,c.i,seed0+2)*c.h),r=1+Math.floor(hshT(q,c.n.length,seed0+5)*2);
        for(let dv=-r;dv<=r;dv++)for(let du=-r;du<=r;du++){if(du*du+dv*dv>r*r+1||hshT(du+9,dv+7,sd+q)<0.3)continue;const uu=cx+du,vv=cy+dv;if(uu<0||vv<0||uu>=c.w||vv>=c.h)continue;const m=0.55+hshT(uu,vv,sd+q)*0.35;poner(c.x+uu,c.y+vv,110*m+base[0]*0.15,16*m,16*m);}
        if(c.h-cy>3&&hshT(q,cx,sd)<0.5)poner(c.x+cx,c.y+cy+r+1,90,12,12);}
    }
    // rasgos de la cara frontal de la cabeza: boca con dientes y cejas
    if(c.n==="north"&&/^(cabeza|head)$/.test(p.nombre)&&c.w>=4&&c.h>=4){
      const yb=Math.floor(c.h*0.72),x0=Math.floor(c.w*0.2),x1=Math.ceil(c.w*0.8);
      for(let u=x0;u<x1;u++){poner(c.x+u,c.y+yb,38,10,10);if(u%2===0&&yb+1<c.h)poner(c.x+u,c.y+yb+1,214,208,186);}
      const ye=Math.floor(c.h*0.3);for(let u=x0;u<x1;u++)if(u!==Math.floor(c.w/2))poner(c.x+u,c.y+ye,base[0]*0.45,base[1]*0.45,base[2]*0.45);
    }
  }
  const nombres=new Set(ps.map(p=>p.nombre));
  let minX=1e9,maxX=-1e9,minY=1e9,maxY=-1e9,minZ=1e9,maxZ=-1e9;
  const bones=ps.map((p,i)=>{
    const t=p.tam.map(x=>Math.max(x,0));
    minX=Math.min(minX,p.origen[0]);maxX=Math.max(maxX,p.origen[0]+t[0]);minY=Math.min(minY,p.origen[1]);maxY=Math.max(maxY,p.origen[1]+t[1]);minZ=Math.min(minZ,p.origen[2]);maxZ=Math.max(maxZ,p.origen[2]+t[2]);
    const b={name:p.nombre,pivot:p.pivote||[p.origen[0]+t[0]/2,p.origen[1]+t[1]/2,p.origen[2]+t[2]/2],cubes:[{origin:p.origen,size:t,uv:uvPorCubo[i]}]};
    if(p.padre&&p.padre!==p.nombre&&nombres.has(p.padre))b.parent=p.padre;
    if(p.rot)b.rotation=p.rot;
    return b;
  });
  const ancho=Math.max(2,Math.ceil(Math.max(Math.abs(minX),Math.abs(maxX),Math.abs(minZ),Math.abs(maxZ))*2/16)+1),alto=Math.max(2,Math.ceil(maxY/16)+1);
  const geo={format_version:"1.12.0","minecraft:geometry":[{description:{identifier:geoId,texture_width:W,texture_height:W,visible_bounds_width:ancho,visible_bounds_height:alto,visible_bounds_offset:[0,alto/2,0]},bones}]};
  const FASE={pierna_i:1,pierna_d:-1,bota_i:1,bota_d:-1,brazo_i:-1,brazo_d:1,manga_i:-1,manga_d:1,hombrera_i:-1,hombrera_d:1,pata_di:1,pata_dd:-1,pata_ti:-1,pata_td:1};
  const ab={};for(const p of ps){const f=FASE[p.nombre]??(/^pata_/.test(p.nombre)?((Number((p.nombre.match(/\d+$/)||["0"])[0])%2)?-1:1):0);if(f){
    const brazo=/brazo|manga|hombrera/.test(p.nombre);const amp=brazo?28:36;
    const mov="Math.cos(query.modified_distance_moved * 38.17) * "+(f*(brazo&&esZ?6:amp))+" * query.modified_move_speed";
    ab[p.nombre]={rotation:[brazo&&esZ?"-80 + "+mov:mov,0,0]};}}
  const cols=new Set(ps.map(p=>p.color));
  return {geo:JSON.stringify(geo,null,2)+"\n",png:pngBytes(W,W,px),cubos:ps.length,colores:cols.size,alto:maxY-minY,ancho:Math.max(maxX-minX,maxZ-minZ),animados:Object.keys(ab).length,bonesAnim:ab,texturaPx:W};
}
function construirModelo3dPaleta(geoId,partes){
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
      // El modelador 3D usa la misma ruta acotada del equipo EGO: dos intentos breves,
      // sin recorrer la cadena larga de candidatos de llamarCodigo (causa del timeout de criaturas).
      const r=await egoRoleChat("coder",[{role:"system",content:MC_MODELADOR_SYS},{role:"user",content:user+(ult?"\n\nTu intento anterior falló: "+ult+". Devuelve el JSON completo otra vez, compacto y válido.":"")}],env,6500,{maxTotalMs:45000,maxModels:2,perModelMs:7000,providerModels:t>0?0:Math.min(2,egoExternalProviders(env,"code").length),providerTimeoutMs:8500,cfModels:1,cfTimeoutMs:5000,providerOffset:t*2});
      const j=extractJson(r.content);let ps=null;
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
async function mcPartImpl(body,env){
  const prompt=String(body.prompt||"").trim().slice(0,12000);
  const plan=limpiarPlan(body.plan,prompt);
  const i=Math.max(0,Math.min(plan.partes.length-1,Number(body.parte)||0));
  const pe=body.parteExtra&&typeof body.parteExtra==='object'?body.parteExtra:null;
  const parte=pe?{titulo:String(pe.titulo||"Completar").slice(0,60),tipo:MC_TIPOS_PARTE.includes(pe.tipo)?pe.tipo:"script",detalle:String(pe.detalle||"").slice(0,3000),archivos:[]}:plan.partes[i];
  if(parte&&parte.tipo==="modelo3d")return await mcModelo3d(parte,plan,prompt,env);
  const existentes=String(body.existentes||"").slice(0,14000);
  const previos=(Array.isArray(body.previos)?body.previos:[]).map(x=>String(x).slice(0,120)).slice(0,120);
  const memoriaPart=await mcMemoriaCreador(env,prompt+" "+(parte.titulo||""));
  const sys=MC_GUIA_BASE+"\n\n"+(MC_GUIAS[parte.tipo]||MC_GUIAS.misc)+
    (parte.tipo==="script"?"\n\n"+mcApiReferencia():"")+memoriaPart+"\n\nPLAN DEL ADD-ON (úsalo tal cual):\n"+JSON.stringify({nombre:plan.nombre,ns:plan.ns,resumen:plan.resumen,objetos:plan.objetos})+MC_FORMATO;
  const user=`Escribe SOLO los archivos de esta parte: "${parte.titulo}" (tipo ${parte.tipo}).\nQué debe contener: ${parte.detalle||plan.resumen}\n`+
    (plan.revisionEquipo?`\nREVISIONES DEL EQUIPO (resuelve observaciones pertinentes sin inventar requisitos):\n${JSON.stringify(plan.revisionEquipo).slice(0,5000)}\n`:"")+
    (parte.archivos.length?`Archivos esperados: ${parte.archivos.join(", ")}\n`:"Elige tú las rutas dentro de BP/ o RP/.\n")+
    (previos.length?`Archivos que ya existen en otras partes (no los repitas): ${previos.join(", ")}\n`:"")+
    (existentes?`\nARCHIVOS ACTUALES DEL ADD-ON (modifícalos o amplíalos; devuelve completos los que cambies):\n${existentes}\n`:"")+
    `\nPedido original del usuario (para mantener fidelidad):\n${prompt}`;
  let desde=0,errores=[],mejor=null,modelo="",fallosM=[];
  const t0=Date.now(),ligero=!!body.ligero,esEntidades=parte.tipo==="entities";
  const maxTokensParte=ligero?4200:(esEntidades?5200:7600);
  const timeoutParte=210000; // v14.47.2: más tiempo por parte (el frontend espera hasta 260 s)
  // Roles: JSON de datos → agente "datos"; scripts → agente "coder"
  const rolGen=parte.tipo==="script"?"coder":"datos";
  // Las partes de manifest/imágenes las genera el código: no hay nada que pedir a un modelo.
  if(/^\s*manifests?\b/i.test(parte.titulo)||(parte.archivos.length&&parte.archivos.every(a=>/manifest\.json$|\.(png|jpg|ogg)$/i.test(a)))){
    return json({ok:true,files:[],model:"generado-por-codigo",equipo:{},revisado:"los manifests, íconos y texturas los genera el código",fallosModelos:[],avisos:[],parte:i,titulo:parte.titulo});
  }
  const restante=(tope)=>Math.max(0,tope-(Date.now()-t0));
  // Hasta tres rondas: normal, compacta y compacta de rescate.
  // Cada ronda rota el punto de inicio de proveedores y conserva el mejor
  // resultado parcial validado para no perder archivos útiles.
  for(let intento=0;intento<3;intento++){
    const quedan=restante(timeoutParte);
    if(quedan<9000)break;
    let r;
    const compacto=intento>0||ligero;
    const userIntento=compacto
      ? (user.slice(0,22000)+
         "\n\nREINTENTO COMPACTO "+intento+": completa solo los archivos imprescindibles de esta parte. " +
         "No repitas archivos de otras partes, no añadas explicaciones ni comentarios. " +
         "Devuelve cada archivo completo con el formato exacto. Si no cabe todo, prioriza archivos funcionales y dependencias obligatorias.")
      : user;
    // v14.47: presupuestos coherentes con la salida pedida (antes 6.5–8.5 s por proveedor: imposible generar miles de tokens)
    const topeIntento=intento===0?110000:(intento===1?60000:40000);
    const presupuesto=Math.max(8000,Math.min(topeIntento,quedan-3500));
    const timeoutProveedor=Math.max(12000,Math.min(Math.floor(presupuesto*0.42),Math.floor(20000+maxTokensParte*6)));
    try{
      const resultado=await Promise.race([
        egoRoleChat(intento===0?rolGen:(intento===1?"coder":"reparador"),[
          {role:"system",content:sys+
            (compacto?"\n\nMODO COMPACTO DE RECUPERACIÓN: prioriza archivos esenciales completos, respuestas breves y dependencias correctas; no sacrifiques sintaxis ni referencias.":"")+
            (esEntidades?"\n\nMODO ENTIDADES ROBUSTO: cada entidad debe tener definición BP y sus referencias RP coherentes. No inventes recursos binarios.":"")},
          {role:"user",content:userIntento+(errores.length?"\n\nERRORES A CORREGIR:\n- "+errores.slice(0,8).join("\n- "):"")}
        ],env,maxTokensParte,{
          maxTotalMs:presupuesto,
          maxModels:4,
          perModelMs:Math.min(Math.floor(presupuesto*0.6),Math.floor(25000+maxTokensParte*8)),
          providerOffset:intento,
          providerModels:Math.min(3,egoExternalProviders(env,"code").length),
          validateContent:(content)=>{const parsed=leerProyectoModelo(content);return !!(parsed&&parsed.files&&parsed.files.length);},
          providerTimeoutMs:timeoutProveedor,
          cfModels:1,
          cfTimeoutMs:Math.min(40000,timeoutProveedor)
        }),
        tmoMc(Math.max(9000,presupuesto+1500))
      ]);
      r={raw:resultado.content,model:resultado.model,idx:0,fallos:resultado.fallos||[]};
    }catch(e){
      const tm=String(e&&e.message||e);
      errores.push("Intento "+(intento+1)+": "+tm.slice(0,180));
      if(restante(timeoutParte)>9000)continue;
      break;
    }
    modelo=r.model||modelo;
    fallosM=[...fallosM,...(r.fallos||[])].slice(-12);
    desde=r.idx||desde;
    const p=leerProyectoModelo(r.raw);
    const nuevosErrores=[],files=[];
    if(!p||!p.files.length){
      nuevosErrores.push("El proveedor no devolvió archivos con el formato '=== ARCHIVO: ruta ===' y '=== FIN ==='.");
    }else{
      const vistos=new Set();
      for(const f of p.files){
        const path=safeProjectPath(f.path);
        if(!path||!/^(BP|RP)\//.test(path)||/manifest\.json$|\.(png|jpg|ogg|zip|mcaddon)$/i.test(path)||vistos.has(path)||typeof f.content!=="string")continue;
        vistos.add(path);
        if(/\.json$/i.test(path)){
          const t=jsonTolerante(f.content);
          if(!t.ok){nuevosErrores.push(path+": JSON inválido ("+t.error+")");continue;}
          files.push({path,content:JSON.stringify(t.obj,null,2)+"\n"});
        }else if(/\.js$/i.test(path)){
          const bal=balanceJs(f.content);
          const apiVersion=String(env.MC_SERVER_VERSION||"2.10.0");
          const apiIssues=lintScriptApi(f.content,apiVersion);
          if(bal){nuevosErrores.push(path+": "+bal);continue;}
          if(apiIssues.length){for(const pr of apiIssues)nuevosErrores.push(path+": "+pr+". Usa solo la API oficial de @minecraft/server "+apiVersion+".");continue;}
          let tipados=[];try{if(/^2\.10(?:\.|$)/.test(apiVersion))tipados=lintTipadoOficial(f.content,MC_API_T);}catch(_){}
          if(tipados.length&&intento<2&&restante(timeoutParte)>40000){for(const pr of tipados)nuevosErrores.push(path+": "+pr);continue;}
          files.push({path,content:f.content});
        }else if(f.content.length>300000)nuevosErrores.push(path+": archivo supera 300000 caracteres; no se truncó.");
        else files.push({path,content:f.content});
      }
      if(!files.length&&!nuevosErrores.length)nuevosErrores.push("No devolviste archivos BP/ o RP/ válidos.");
    }
    if(!mejor||nuevosErrores.length<mejor.errores.length||
       (nuevosErrores.length===mejor.errores.length&&files.length>mejor.files.length))
      mejor={files,errores:nuevosErrores.slice()};
    errores=nuevosErrores;
    if(!errores.length&&files.length)break;
  }
  // ---- Reasoner + auditor independientes en paralelo; coder repara si hay defectos ----
  let revisado="", modelosRevision={};
  if(mejor&&mejor.files.length&&!ligero&&Date.now()-t0<120000&&["script","entities","items","blocks","recipes","loot","spawn","misc"].includes(parte.tipo)&&env.MC_CRITICO!=="0"){
    try{
      const texto=mejor.files.filter(f=>/\.(js|json)$/.test(f.path)).map(f=>"=== ARCHIVO: "+f.path+" ===\n"+f.content).join("\n").slice(0,16000);
      const reviewUser="REQUISITOS:\n"+((plan.requisitos||[]).map((x,k)=>(k+1)+". "+x).join("\n")||prompt.slice(0,1500))+"\n\nPLAN:\n"+JSON.stringify({objetos:plan.objetos,poderes_jugador:plan.poderesJugador,revisionEquipo:plan.revisionEquipo||null})+"\n\nARCHIVOS DE LA PARTE «"+parte.titulo+"»:\n"+texto;
      const [crit,razon,apir]=await Promise.all([
        Promise.race([egoRoleChat("auditor",[{role:"system",content:MC_CRITICO_SYS.replace("Minecraft Bedrock 1.26.52.x (@minecraft/server 2.10.0 estable)", "Minecraft Bedrock compatible con @minecraft/server "+String(env.MC_SERVER_VERSION||"2.10.0"))},{role:"user",content:reviewUser}],env,1800,{maxTotalMs:20000,maxModels:2,perModelMs:16000,cfModels:0}),tmoMc(20500)]).catch(e=>({content:"",model:"auditor-no-disponible",fallos:[String(e.message||e)]})),
        Promise.race([egoRoleChat("reasoner",[{role:"system",content:MC_CRITICO_SYS.replace("Minecraft Bedrock 1.26.52.x (@minecraft/server 2.10.0 estable)", "Minecraft Bedrock compatible con @minecraft/server "+String(env.MC_SERVER_VERSION||"2.10.0"))},{role:"user",content:reviewUser}],env,1800,{maxTotalMs:20000,maxModels:2,perModelMs:16000,cfModels:0}),tmoMc(20500)]).catch(e=>({content:"",model:"reasoner-no-disponible",fallos:[String(e.message||e)]})),
        // 3.er revisor, especializado en compatibilidad con la API y los formatos de Bedrock
        Promise.race([egoRoleChat("api",[{role:"system",content:MC_CRITICO_SYS.replace("Minecraft Bedrock 1.26.52.x (@minecraft/server 2.10.0 estable)", "Minecraft Bedrock compatible con @minecraft/server "+String(env.MC_SERVER_VERSION||"2.10.0"))+"\nTU ESPECIALIDAD: SOLO compatibilidad. Señala (a) propiedades/métodos de @minecraft/server que no existen o están en otro objeto (p. ej. damagingEntity va en damageSource, no en el evento), (b) componentes de JSON que no existen en BP o que pertenecen al RP, (c) campos viejos de ítems/entidades. Ignora estilo."+(parte.tipo==="script"?"\n\n"+mcApiReferencia():"")},{role:"user",content:reviewUser}],env,1800,{maxTotalMs:20000,maxModels:2,perModelMs:16000,cfModels:0}),tmoMc(20500)]).catch(e=>({content:"",model:"api-no-disponible",fallos:[String(e.message||e)]}))
      ]);
      modelosRevision={auditor:crit.model||"no disponible",reasoner:razon.model||"no disponible",api:apir.model||"no disponible"};
      const problemas=[];
      for(const rr of [crit,razon,apir]){
        const jc=extractJson(rr.content||"");
        if(jc&&Array.isArray(jc.problemas)) for(const x of jc.problemas){
          const item=String((x&&x.archivo?x.archivo+": ":"")+((x&&x.problema)||"")+(x&&x.arreglo?" → "+x.arreglo:"" )).slice(0,260);
          if(item.length>12&&!problemas.includes(item))problemas.push(item);
        }
      }
      const probs=problemas.slice(0,8);
      if(probs.length&&Date.now()-t0>175000){revisado="auditoría detectó "+probs.length+" problema(s); no hubo tiempo para repararlos en esta parte (la reparación final los reintenta)";}
      else if(probs.length&&Date.now()-t0<150000){
        const rr=await Promise.race([egoRoleChat("reparador",[{role:"system",content:sys},{role:"user",content:user+"\n\nTUS ARCHIVOS ACTUALES:\n"+texto+"\n\nEL EQUIPO DE AUDITORÍA ENCONTRÓ ESTOS PROBLEMAS CONCRETOS. Corrígelos y devuelve TODOS los archivos afectados completos:\n- "+probs.join("\n- ")}],env,6500,{maxTotalMs:45000,maxModels:2,perModelMs:30000,cfModels:0}),tmoMc(47000)]);
        const np=parsearSalidaMc(rr.content, env.MC_SERVER_VERSION||"2.10.0");
        if(np.files.length&&!np.errores.length){mejor={files:np.files,errores:[]};revisado="auditor y reasoner detectaron "+probs.length+" problema(s); coder aplicó una corrección que pasó la validación básica";}
        else revisado="auditoría detectó "+probs.length+" problema(s), pero la reparación no pasó; se conserva la versión anterior y se informa la limitación";
      }else revisado="revisado por auditor + reasoner + revisor de API";
    }catch(e){revisado="revisión colaborativa incompleta: "+String(e&&e.message||e).slice(0,120);}
  }
  if(!mejor||!mejor.files.length||mejor.errores.length) {
    const diagnostico={
      parte:parte.tipo,
      titulo:parte.titulo,
      modelo:modelo||"ninguno",
      duracionMs:Date.now()-t0,
      archivosValidosConservados:mejor?mejor.files.length:0,
      erroresValidacion:((mejor&&mejor.errores)||errores).slice(0,8),
      erroresProveedores:fallosM.slice(-10),
      reintentos:3
    };
    // Cloudflare Observability mostrará ahora la causa interna del 502, no solo POST /.
    console.error("EGO_ADDON_PART_FAILED",JSON.stringify(diagnostico).slice(0,5000));
    return json({
      error:"La parte «"+parte.titulo+"» no produjo un conjunto de archivos completamente válido después de los reintentos automáticos.",
      codigo:"proveedores_agotados_o_salida_invalida",
      detalle:[...diagnostico.erroresValidacion,...diagnostico.erroresProveedores].slice(0,10),
      diagnostico,
      archivosValidosConservados:diagnostico.archivosValidosConservados,
      parte:parte.tipo,
      reintentos:3
    },502);
  }
  return json({ok:true,files:mejor.files,model:modelo,equipo:{coder:modelo,...modelosRevision},revisado,fallosModelos:fallosM,avisos:[],parte:i,titulo:parte.titulo});
}
// Envoltura diagnóstica de mc_part: captura excepciones que antes escapaban
// antes del bloque try interno (memoria, bindings, normalización del plan, etc.).
// Nunca devuelve ni registra tokens, prompts completos ni secretos.
async function mcPart(body, env, request) {
  try {
    return await mcPartImpl(body, env);
  } catch (e) {
    const requestId = request && request.headers ? (request.headers.get("CF-Ray") || "sin-ray") : "sin-ray";
    const diagnostic = {
      requestId,
      action: "mc_part",
      name: String(e && e.name || "Error").slice(0, 80),
      message: String(e && e.message || e).slice(0, 500),
      stack: String(e && e.stack || "").slice(0, 1800)
    };
    console.error("EGO_MC_PART_UNHANDLED", JSON.stringify(diagnostic));
    return json({
      error: "Falló internamente la generación de esta parte del add-on.",
      codigo: "mc_part_internal_error",
      requestId,
      detalle: [diagnostic.name + ": " + diagnostic.message]
    }, 500);
  }
}

// Revisa llaves/paréntesis/comillas de un script (no ejecuta nada).
function balanceJs(src){
  // Comprueba llaves, paréntesis, corchetes, comillas y plantillas. Entiende comentarios, regex literales y ${...} anidados.
  src=String(src);
  const st=[],par={"}":"{",")":"(","]":"["},n=src.length,RXKW=new Set(["return","typeof","case","of","in","delete","void","throw","new","else","do","yield","await","instanceof"]);
  let i=0,pc="",pw="";
  const plantilla=()=>{ // i apunta justo después de ` o de } que cierra un ${...}
    while(i<n){const ch=src[i];
      if(ch==="\\"){i+=2;continue;}
      if(ch==="`"){i++;return true;}
      if(ch==="$"&&src[i+1]==="{"){i+=2;st.push("${");return true;}
      i++;}
    return false;
  };
  while(i<n){
    const c=src[i],d=src[i+1];
    if(c===" "||c==="\t"||c==="\n"||c==="\r"){i++;continue;}
    if(c==="/"&&d==="/"){while(i<n&&src[i]!=="\n")i++;continue;}
    if(c==="/"&&d==="*"){i=src.indexOf("*/",i+2);if(i<0)return "comentario sin cerrar";i+=2;continue;}
    if(c==="'"||c==='"'){const q=c;i++;while(i<n&&src[i]!==q&&src[i]!=="\n"){if(src[i]==="\\")i++;i++;}if(src[i]!==q)return "comillas sin cerrar";i++;pc=q;pw="";continue;}
    if(c==="`"){i++;const r=plantilla();if(!r&&i>=n)return "plantilla ` sin cerrar";if(!r)return "plantilla ` sin cerrar";pc="`";pw="";continue;}
    if(c==="/"){
      const esRegex=pc===""||"(,=:[!&|?{;+-*%<>~^".includes(pc)||(/[A-Za-z_$]/.test(pc)&&RXKW.has(pw));
      if(esRegex){let j=i+1,cls=false,ok=false;
        while(j<n&&src[j]!=="\n"){const ch=src[j];if(ch==="\\"){j+=2;continue;}if(ch==="[")cls=true;else if(ch==="]")cls=false;else if(ch==="/"&&!cls){ok=true;break;}j++;}
        if(ok){i=j+1;while(i<n&&/[a-z]/i.test(src[i]))i++;pc="/";pw="";continue;}
      }
      pc="/";pw="";i++;continue;
    }
    if(c==="{"||c==="("||c==="["){st.push(c);pc=c;pw="";i++;continue;}
    if(c==="}"||c===")"||c==="]"){
      const top=st.pop();
      if(c==="}"&&top==="${"){i++;if(!plantilla())return "plantilla ` sin cerrar";pc="`";pw="";continue;}
      if(top!==par[c])return "llaves o paréntesis desbalanceados";
      pc=c;pw="";i++;continue;
    }
    if(/[A-Za-z_$]/.test(c)){let j=i+1;while(j<n&&/[\w$]/.test(src[j]))j++;pw=src.slice(i,j);pc=src[j-1];i=j;continue;}
    if(/[0-9]/.test(c)){let j=i+1;while(j<n&&/[\w.]/.test(src[j]))j++;pc="0";pw="";i=j;continue;}
    pc=c;pw="";i++;
  }
  return st.length?"falta cerrar "+st.length+" llave(s) o paréntesis":"";
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
  if(/(casco|yelmo|helmet|capucha|\bcasque)/.test(n))return "casco";
  if(/(pechera|(?:^|[\s_])pecho(?:$|[\s_])|peto|coraza|chestplate|chaleco)/.test(n))return "pechera";
  if(/(pantalon|piernas|leggings|grebas|\bpants\b)/.test(n))return "pantalones";
  if(/(botas|\bbota\b|boots|zapatos)/.test(n))return "botas";
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
const SPR_ARMAS={"pistola": ["................", "................", "....KKKKKKKKKK..", "...KHLLLLLLLMMK.", "...KLMMMMMMMDDK.", "...KMDDDDDDDDDK.", "...KKKKKKKKKKK..", "....KDDKMK......", "....KwwDKK......", "....KwWwK.......", "....KwWwK.......", "....KwWwK.......", "....KwWwK.......", ".....KKKK.......", "................", "................"], "rifle": ["................", "................", "..........KK....", "KKKKKKKKKKHKKKK.", "KwwWDLLLLLLLLMMK", "KwWWKMMMMMMMMDDK", "KwWWDDDDDDDDDDK.", "KKKKKKKDKKKKKK..", "......KDKMK.....", "......KDDMK.....", "......KDDMK.....", ".......KKKK.....", "................", "................", "................", "................"], "escopeta": ["................", "................", "................", "KKKKKKKKKKKKKKK.", "KwwWKLLLLLLLLLMK", "KwWWKMMMMMMMMMDK", "KwWWKKKKKKKKKKK.", "KKKKKwwwwKDDDDK.", "....KKwWWwKKKKK.", "....KDKwwwK.....", ".....KKKKKK.....", "................", "................", "................", "................", "................"], "francotirador": ["................", "................", "......KKKK......", ".....KLHHLK.....", "KKKKKKMMMMKKKKK.", "KwwWDLLLLLLLLMMK", "KwWWKMMMMMMMMDDK", "KwWWDDDDDDDDDDK.", "KKKKKKKDKKKKKK..", "......KDKMK.....", "......KDDMK.....", ".......KKKK.....", "................", "................", "................", "................"], "arma_fuego": ["................", "................", "....KKKKKKKKKK..", "...KHLLLLLLLMMK.", "...KLMMMMMMMDDK.", "...KMDDDDDDDDDK.", "...KKKKKKKKKKK..", "....KDDKMK......", "....KwwDKK......", "....KwWwK.......", "....KwWwK.......", "....KwWwK.......", "....KwWwK.......", ".....KKKK.......", "................", "................"]};
const SPR_PAL={K:[22,22,28],D:[58,61,70],M:[93,98,110],L:[154,160,174],H:[214,218,228],W:[75,47,28],w:[122,77,43]};
function dibujarGenerico(tipo,principal,acento){
  if(["espada","hacha","pico","vara"].includes(tipo))return dibujarIcono(tipo,principal,acento);
  const W=16,px=new Uint8Array(W*W*4),P=hexRgb(principal),A=hexRgb(acento),CLARO=mezcla(P,[255,255,255],.55),OSC=mezcla(P,[0,0,0],.38),OUT=[24,20,30];
  const set=(x,y,c)=>{if(x<0||y<0||x>=W||y>=W)return;const i=(y*W+x)*4;px[i]=c[0];px[i+1]=c[1];px[i+2]=c[2];px[i+3]=255;};
  const lleno=(x,y)=>x>=0&&y>=0&&x<W&&y<W&&px[(y*W+x)*4+3]>0;
  if(["arma_fuego","pistola","rifle","escopeta","francotirador"].includes(tipo)){
    if(SPR_ARMAS[tipo]){SPR_ARMAS[tipo].forEach((fila,y)=>{for(let x=0;x<16;x++){const c=SPR_PAL[fila[x]];if(c)set(x,y,c);}});return px;}
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
  } else if(tipo==="casco"){
    for(let y=2;y<=12;y++){const hw=y<=3?3.2:(y<=5?4.8:5.6);for(let x=0;x<W;x++){const dx=Math.abs(x-7.5);if(dx<=hw&&!(y>=9&&dx<2.2))set(x,y,y<=3?CLARO:(x<7.5?P:OSC));}}
    for(let x=4;x<=11;x++){set(x,8,OSC);}
    for(let x=5;x<=10;x++){set(x,7,A);}
    for(let y=3;y<=6;y++){set(7,y,CLARO);set(8,y,CLARO);}
  } else if(tipo==="pechera"){
    for(let y=2;y<=5;y++)for(let x=1;x<=14;x++){if(!(y<=3&&x>=5&&x<=10))set(x,y,y===2?CLARO:(x<7.5?P:OSC));}
    for(let y=6;y<=13;y++)for(let x=3;x<=12;x++)set(x,y,(x===3||x===12||y===13)?OSC:(x<7.5?P:mezcla(P,[0,0,0],.12)));
    for(let y=6;y<=11;y++){set(7,y,A);set(8,y,A);}for(let x=5;x<=10;x++)set(x,8,A);
    for(let x=4;x<=11;x++)set(x,12,CLARO);
    for(let y=6;y<=9;y++){set(1,y,OSC);set(2,y,P);set(13,y,P);set(14,y,OSC);}
  } else if(tipo==="pantalones"){
    for(let x=3;x<=12;x++){set(x,2,CLARO);set(x,3,A);set(x,4,P);}
    for(let y=5;y<=14;y++){const gap=y>=8;for(let x=3;x<=7;x++){if(gap&&x>=7)continue;set(x,y,x===3?OSC:(y<=7?CLARO:P));}for(let x=8;x<=12;x++){if(gap&&x<=8)continue;set(x,y,x===12?OSC:(y<=7?P:OSC));}}
    for(let x=3;x<=6;x++)set(x,13,A);for(let x=9;x<=12;x++)set(x,13,A);
    set(5,9,CLARO);set(10,9,CLARO);
  } else if(tipo==="botas"){
    for(let y=3;y<=9;y++){for(let x=2;x<=6;x++)set(x,y,y===3?CLARO:(x===2?OSC:P));for(let x=9;x<=13;x++)set(x,y,y===3?CLARO:(x===13?OSC:P));}
    for(let y=10;y<=12;y++){for(let x=1;x<=7;x++)set(x,y,y===10?CLARO:(y===12?OSC:P));for(let x=8;x<=14;x++)set(x,y,y===10?CLARO:(y===12?OSC:P));}
    for(let y=5;y<=6;y++){for(let x=2;x<=6;x++)set(x,y,A);for(let x=9;x<=13;x++)set(x,y,A);}
    for(let x=1;x<=3;x++){set(x,13,OSC);}for(let x=11;x<=14;x++){set(x,13,OSC);}
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
  else if(/(asust|espant|ahuyent|intimid|aterr|miedo|huy(?:a|e)n|huir|me tem)/.test(t)&&/(monstruo|\bmobs?\b|enemigo|criatura|hostil|zombi)/.test(t))r.push("miedo_mobs");
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
    if(has("aura"))L.push('      p.runCommand("camerashake add @s 0.05 0.6 positional");',
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
    for(const k of [...mapa.keys()].filter(k=>/^BP\/scripts\/.+\.js$/.test(k))){const t=String(mapa.get(k));if(/minecraft:chest/.test(t)&&/initialSpawn|playerSpawn/.test(t)){mapa.delete(k);notas.push(k.replace("BP/","")+" se reemplazó por el kit inicial de EGO.");}}
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
      const nom=nombreDeId(ic.id,plan),col=colorDeNombre(nom+" "+((plan.objetos||[]).find(x=>x.id===ic.id)||{}).descripcion),px=dibujarGenerico(tipoIconoDe(nom+" "+ic.corto+" "+(((plan.objetos||[]).find(x=>x.id===ic.id)||{}).icono||"")+((((plan.objetos||[]).find(x=>x.id===ic.id)||{}).habilidad&&!/^\s*(ninguna|ninguno|none|no|null|-)?\s*$/i.test(String(((plan.objetos||[]).find(x=>x.id===ic.id)||{}).habilidad))&&!/(vara|baston|cetro|varita)/.test(normMc(nom)))?" espada":"")),col,mezcla(hexRgb(col),[255,255,255],.45).length?"#"+mezcla(hexRgb(col),[255,236,140],.6).map(v=>v.toString(16).padStart(2,"0")).join(""):"#ffffff");
      dat[ic.corto]={textures:"textures/items/"+ic.corto};
      mapa.set("RP/textures/items/"+ic.corto+".png",pngBytes(16,16,px));
      if(!primero)primero={px,col};
    }
    mapa.set("RP/textures/item_texture.json",JSON.stringify({resource_pack_name:ns,texture_name:"atlas.items",texture_data:dat},null,2)+"\n");
    png.push(...iconos.map(i=>i.corto));
    plan._icono=primero;
    // --- armaduras: attachable para que se vea PUESTA (formato de Bedrock Wiki, custom-armor)
    for(const ic of iconos){
      try{
        const it=leer("BP/items/"+ic.corto+".json"); const w=it&&it["minecraft:item"]&&it["minecraft:item"].components&&it["minecraft:item"].components["minecraft:wearable"];
        const sl=w&&String(w.slot||"");
        const mp={"slot.armor.head":["helmet","helmet_layer_visible","1"],"slot.armor.chest":["chestplate","chest_layer_visible","1"],"slot.armor.legs":["leggings","leg_layer_visible","2"],"slot.armor.feet":["boots","boot_layer_visible","1"]}[sl];
        if(!mp)continue;
        const ob=(plan.objetos||[]).find(x=>x.id===ic.id)||{};
        const col=colorDeNombre(nombreDeId(ic.id,plan)+" "+ob.descripcion),P=hexRgb(col),CL=mezcla(P,[255,255,255],.3),OS=mezcla(P,[0,0,0],.35);
        const tx=new Uint8Array(64*32*4);
        for(let y=0;y<32;y++)for(let x=0;x<64;x++){const i=(y*64+x)*4;const c=((x+y)%7===0)?CL:(((x*3+y*5)%11===0)?OS:P);tx[i]=c[0];tx[i+1]=c[1];tx[i+2]=c[2];tx[i+3]=255;}
        const rutaTx="textures/models/armor/"+ic.corto;
        mapa.set("RP/"+rutaTx+".png",pngBytes(64,32,tx));
        mapa.set("RP/attachables/"+ic.corto+".json",JSON.stringify({format_version:"1.8.0","minecraft:attachable":{description:{identifier:ic.id,materials:{default:"armor",enchanted:"armor_enchanted"},textures:{default:rutaTx,enchanted:"textures/misc/enchanted_actor_glint"},geometry:{default:"geometry.humanoid.armor."+mp[0]},scripts:{parent_setup:"variable."+mp[1]+" = 0.0;"},render_controllers:["controller.render.armor"]}}},null,2)+"\n");
        notas.push("«"+nombreDeId(ic.id,plan)+"»: se creó su modelo de armadura puesta (textura lisa generada).");
      }catch(_){}
    }
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
  // --- scripts: conservar los archivos con defectos detectables para que el ciclo
  // de reparación automática pueda corregirlos. No moverlos a cuarentena antes
  // de validar: eso ocultaba el error y eliminaba la funcionalidad del paquete.
  for(const k of [...mapa.keys()].filter(k=>/^BP\/scripts\/.+\.js$/.test(k))){
    const tx=String(mapa.get(k));const mal=lintScript(tx);const prs=lintScriptApiTipado(tx, verSrv||"2.10.0");
    if(mal||prs.length)notas.push(k.replace("BP/","")+" necesita reparación antes de activarse: "+(mal||prs.slice(0,3).join("; "))+". Se conserva en BP/scripts para que el validador y reparador puedan corregirlo.");
  }
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
        const llam=[...new Set([...t.matchAll(/\.(spawnParticle|addEffect|applyDamage|applyKnockback|setDynamicProperty|getDynamicProperty|runInterval|runTimeout|spawnEntity|dimension\.\w+|getComponent|setOnFire|teleport|addTag|removeTag|sendMessage|runCommand|setProperty|triggerEvent|getEquippable|setItem|clearVelocity|kill)\b/g)].map(x=>x[1]))].slice(0,20);
        const sinC=t.replace(/\/\*[\s\S]*?\*\//g,"").replace(/^\s*\/\/.*$/gm,"").replace(/\s+/g," ").trim();
        L.push("SCRIPT "+p.replace("BP/scripts/","")+" ("+t.length+" caracteres) eventos="+ev.join(",")+" efectos="+efx.join(",")+" ids="+ids.join(",")+" llamadas="+llam.join(",")+"\n   CÓDIGO: "+sinC.slice(0,650));
      }
    }catch(_){}
  }
  if(habilidades&&habilidades.length)L.push("HABILIDADES PROGRAMADAS POR EGO: "+habilidades.join(" | "));
  return L.join("\n").slice(0,14000);
}
async function auditarAddon(plan,files,habilidades,env){
  const req=plan.requisitos||[];
  if(!req.length)return null;
  try{
    const sys="Eres un auditor estricto de add-ons de Minecraft Bedrock. Recibes los REQUISITOS que pidió el usuario y el INVENTARIO real de lo que quedó dentro del add-on. Para cada requisito decide si el inventario lo cumple de verdad (existe el archivo/script/componente que lo implementa). Los scripts incluyen llamadas a la API y un extracto de CÓDIGO: si ahí se ve la lógica (partículas, efectos, eventos, daño, etc.) el requisito SÍ está cumplido; no lo marques como faltante por no verlo en otro archivo. Un efecto visual como aura/partículas se implementa con spawnParticle en un script. Sé honesto: si de verdad no hay archivo ni lógica que lo implemente, NO está cumplido. Si el requisito empieza con IMPOSIBLE:, márcalo como cumplido solo si el sustituto existe. Responde SOLO JSON: {\"cumplidos\":[números base 1],\"faltan\":[{\"n\":número,\"motivo\":\"en español, corto, qué falta\"}]}";
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
// ============================================================
// ENDURECIMIENTO v14.31 — correcciones determinísticas + módulos de juego probados
// Todo lo que sigue es código fijo (no depende del modelo): si el modelo se equivoca en
// recetas, loot, bloques, entidades o scripts, aquí se corrige o se reemplaza por un módulo que funciona.
// ============================================================
const HD_ARMAS=[
  {rx:/francotir|sniper/i,dmg:22,cd:40,rango:120,perdigones:1,desv:0,nombre:"Francotirador"},
  {rx:/escopet|shotgun/i,dmg:4,cd:25,rango:14,perdigones:6,desv:0.12,nombre:"Escopeta"},
  {rx:/rifle|fusil|metralla|smg|ak/i,dmg:5,cd:4,rango:64,perdigones:1,desv:0,nombre:"Rifle"},
  {rx:/pistol|revolver|arma_fuego|gun|pistola/i,dmg:6,cd:8,rango:48,perdigones:1,desv:0,nombre:"Pistola"}
];
const HD_CURA=[{rx:/botiquin|medkit|medicina|first_?aid/i,vida:12,cura:true},{rx:/venda|bandage|gasa/i,vida:4,cura:false}];
const HD_ARQUETIPOS=[
  [/alfa|alpha/,{hp:150,dmg:16,spd:0.3,kb:1,seg:64}],[/gigante|giant|titan/,{hp:120,dmg:14,spd:0.18,kb:1,seg:32}],
  [/mutante|mutant/,{hp:70,dmg:10,spd:0.25,kb:0.5,seg:32}],[/blindado|armored|tank/,{hp:60,dmg:5,spd:0.18,kb:0.9,seg:24}],
  [/militar|soldier/,{hp:40,dmg:6,spd:0.25,kb:0.3,seg:32}],[/brutal|brute/,{hp:45,dmg:8,spd:0.22,kb:0.6,seg:24}],
  [/cazador|hunter/,{hp:26,dmg:5,spd:0.3,kb:0,seg:48}],[/rastreador|tracker/,{hp:18,dmg:3,spd:0.3,kb:0,seg:64}],
  [/nocturno|night/,{hp:22,dmg:4,spd:0.27,kb:0,seg:32}],[/toxico|toxic|venen/,{hp:24,dmg:3,spd:0.23,kb:0,seg:24}],
  [/explosiv|bomb|kamikaze/,{hp:12,dmg:1,spd:0.3,kb:0,seg:24}],[/corredor|runner|rapido/,{hp:16,dmg:3,spd:0.34,kb:0,seg:28}],
  [/infectado|infected/,{hp:20,dmg:3,spd:0.22,kb:0,seg:24}],[/caminante|walker/,{hp:20,dmg:3,spd:0.2,kb:0,seg:24}]
];
const HD_RUINAS=[
  {rx:/hospital/i,tipo:"Hospital",muro:"minecraft:white_concrete",suelo:"minecraft:quartz_block",techo:"minecraft:light_gray_concrete",deco:"minecraft:red_concrete",
   botin:[["BOTIQUIN",1,2,0.8],["VENDA",2,4,0.9],["minecraft:golden_apple",1,1,0.15],["minecraft:iron_nugget",4,10,0.5]]},
  {rx:/laborator/i,tipo:"Laboratorio",muro:"minecraft:gray_concrete",suelo:"minecraft:green_concrete",techo:"minecraft:black_concrete",deco:"minecraft:glass_pane",
   botin:[["BOTIQUIN",1,1,0.5],["minecraft:potion",1,1,0.2],["minecraft:redstone",4,12,0.6],["minecraft:iron_ingot",2,6,0.6]]},
  {rx:/militar|bunker|base/i,tipo:"Base militar",muro:"minecraft:cobblestone",suelo:"minecraft:stone_bricks",techo:"minecraft:stone_bricks",deco:"minecraft:iron_bars",
   botin:[["ARMA",1,1,0.7],["minecraft:iron_nugget",12,32,0.95],["minecraft:iron_ingot",3,8,0.6],["BOTIQUIN",1,1,0.35]]},
  {rx:/.*/,tipo:"Refugio",muro:"minecraft:stone_bricks",suelo:"minecraft:cobblestone",techo:"minecraft:cobblestone",deco:"minecraft:cobweb",
   botin:[["VENDA",1,3,0.7],["minecraft:iron_nugget",4,10,0.6],["minecraft:bread",1,3,0.5]]}
];
function hdJson(f){ if(!f||typeof f.content!=="string")return null; const t=jsonTolerante(f.content); return t.ok?t.obj:null; }
function hdSnake(s){return String(s||"").split(":").pop();}

function endurecerAddonBedrock(files, plan){
  const cambios=[], generado=[];
  const nota=(p,m)=>cambios.push({path:p,motivo:m});
  const porRuta=()=>new Map(files.map(f=>[f.path,f]));
  const poner=(path,content)=>{const f=files.find(x=>x.path===path); if(f)f.content=content; else files.push({path,content});};
  const quitar=(path)=>{const i=files.findIndex(x=>x.path===path); if(i>=0)files.splice(i,1);};
  const guardar=(f,o)=>{f.content=JSON.stringify(o,null,2);};

  // ---- ítems cuyo "components" quedó fuera de minecraft:item (Minecraft los ignora)
  for(const f of files){
    if(!/^BP\/items\/[^/]+\.json$/.test(f.path))continue;
    const o=hdJson(f); if(!o||!o["minecraft:item"]||!o.components||typeof o.components!=="object")continue;
    const it=o["minecraft:item"]; it.components=Object.assign({},o.components,it.components||{}); delete o.components;
    guardar(f,o); nota(f.path,"los componentes del ítem estaban fuera de minecraft:item y se ignoraban; se movieron adentro");
  }
  // ---- inventario de lo que existe de verdad
  const items=new Set(),bloques=new Set(),entidades=new Map(),itemFile=new Map(),blockFile=new Map();
  for(const f of files){
    const o=hdJson(f); if(!o)continue;
    if(/^BP\/items\/[^/]+\.json$/.test(f.path)&&o["minecraft:item"]){const id=o["minecraft:item"].description?.identifier;if(id){items.add(id);itemFile.set(id,f);}}
    if(/^BP\/blocks\/[^/]+\.json$/.test(f.path)&&o["minecraft:block"]){const id=o["minecraft:block"].description?.identifier;if(id){bloques.add(id);blockFile.set(id,f);}}
    if(/^BP\/entities\/[^/]+\.json$/.test(f.path)&&o["minecraft:entity"]){const id=o["minecraft:entity"].description?.identifier;if(id)entidades.set(id,f);}
  }
  const propios=new Set([...items,...bloques]);
  const nsCont=new Map();for(const id of [...items,...bloques,...entidades.keys()]){const n=id.split(":")[0];nsCont.set(n,(nsCont.get(n)||0)+1);}
  const ns=[...nsCont.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||String(plan&&plan.ns||"ego");
  const sust=(id)=>{
    const s=String(id||""); if(!s.includes(":")||s.startsWith("minecraft:")||propios.has(s))return s;
    const n=hdSnake(s);
    if(/bandage|venda|gasa/i.test(n))return "minecraft:paper";
    if(/ammo|bala|muni|bullet/i.test(n))return "minecraft:iron_nugget";
    if(/wood|madera|plank/i.test(n))return "minecraft:planks";
    if(/cloth|tela|fabric/i.test(n))return "minecraft:string";
    return "minecraft:iron_ingot";
  };
  const itemMalo=(id)=>/^minecraft:(shotgun_ammo|bullet|ammo|ammunition)$/i.test(String(id||""))||(String(id||"").includes(":")&&!String(id).startsWith("minecraft:")&&!propios.has(id));

  // ---- 1) loot en la carpeta correcta (loot_tables) y sin NBT
  for(const f of [...files]){
    if(/^BP\/loot\/.+\.json$/i.test(f.path)){
      const np=f.path.replace(/^BP\/loot\//i,"BP/loot_tables/"); if(!files.some(x=>x.path===np)){f.path=np;nota(np,"el loot estaba en BP/loot; Minecraft solo lee BP/loot_tables");}
    }
  }
  const arreglarLoot=(f)=>{
    const o=hdJson(f); if(!o||!Array.isArray(o.pools))return;
    let ch=false;
    for(const pool of o.pools){
      if(!Array.isArray(pool.entries))continue;
      const antes=pool.entries.length;
      pool.entries=pool.entries.filter(e=>!(e&&e.type==="item"&&itemMalo(e.name)));
      if(pool.entries.length!==antes)ch=true;
      for(const e of pool.entries){
        if(Array.isArray(e.functions)){const n0=e.functions.length;e.functions=e.functions.filter(x=>x&&x.function!=="set_nbt"&&x.function!=="set_lore"&&!x.nbt);if(e.functions.length!==n0)ch=true;}
      }
    }
    const n0=o.pools.length; o.pools=o.pools.filter(p=>Array.isArray(p.entries)&&p.entries.length); if(o.pools.length!==n0)ch=true;
    if(ch){guardar(f,o);nota(f.path,"loot saneado: sin NBT y sin objetos que no existen");}
  };
  for(const f of files)if(/^BP\/loot_tables\/.+\.json$/i.test(f.path))arreglarLoot(f);

  // ---- 2) recetas
  for(const f of [...files]){
    if(!/^BP\/recipes\/.+\.json$/i.test(f.path))continue;
    const o=hdJson(f); if(!o)continue; let ch=false;
    const sh=o["minecraft:recipe_shaped"],sl=o["minecraft:recipe_shapeless"];
    const fixIng=(ing)=>{ if(ing&&typeof ing==="object"&&typeof ing.item==="string"){const n=sust(ing.item);if(n!==ing.item){ing.item=n;ch=true;}} };
    if(sh){
      if(Array.isArray(sh.pattern)){
        let rows=sh.pattern.map(r=>String(r)).slice(0,3); const w=Math.min(3,Math.max(...rows.map(r=>r.length)));
        rows=rows.map(r=>r.slice(0,w).padEnd(w," "));
        if(JSON.stringify(rows)!==JSON.stringify(sh.pattern)){sh.pattern=rows;ch=true;}
        const usados=new Set(rows.join("").replace(/ /g,"").split(""));
        sh.key=sh.key||{};
        for(const k of Object.keys(sh.key)){ if(!usados.has(k)){delete sh.key[k];ch=true;} else fixIng(sh.key[k]); }
        for(const u of usados){ if(!sh.key[u]){ sh.pattern=sh.pattern.map(r=>r.split(u).join(" ")); ch=true; } }
      }
      if(!Array.isArray(sh.tags)||!sh.tags.length){sh.tags=["crafting_table"];ch=true;}
      if(sh.result&&typeof sh.result==="object"){ if(sh.result.components){delete sh.result.components;ch=true;} if(!(sh.result.count>0)){sh.result.count=1;ch=true;} }
    }
    if(sl){ if(Array.isArray(sl.ingredients))sl.ingredients.forEach(fixIng); if(!Array.isArray(sl.tags)||!sl.tags.length){sl.tags=["crafting_table"];ch=true;} if(sl.result&&sl.result.components){delete sl.result.components;ch=true;} }
    const res=(sh||sl)&&((sh||sl).result||{}).item;
    if(res&&String(res).startsWith(ns+":")&&!propios.has(res)){quitar(f.path);nota(f.path,"se quitó la receta: fabrica "+res+", que no existe en el add-on");continue;}
    if(ch){guardar(f,o);nota(f.path,"receta corregida: filas de igual largo, ingredientes que existen y sin componentes inválidos");}
  }

  // ---- 3) bloques: sin componentes de script, con loot existente
  const lootSolo=(id)=>"BP/loot_tables/blocks/"+hdSnake(id)+".json";
  for(const [id,f] of blockFile){
    const o=hdJson(f); if(!o)continue; const b=o["minecraft:block"]; let ch=false;
    const c=b.components||{};
    for(const k of Object.keys(c)){ const v=JSON.stringify(c[k]); if(k==="minecraft:use"||/script:|"on_use"/.test(v)){delete c[k];ch=true;nota(f.path,"se quitó "+k+" (no es un componente válido de bloque; la interacción va en scripts)");} }
    if(c["minecraft:loot"]){
      const ruta="BP/"+String(c["minecraft:loot"]).replace(/^\//,"");
      if(!files.some(x=>x.path===ruta)){
        poner(lootSolo(id),JSON.stringify({pools:[{rolls:1,entries:[{type:"item",name:id,weight:1}]}]},null,2));
        c["minecraft:loot"]="loot_tables/blocks/"+hdSnake(id)+".json";ch=true;nota(lootSolo(id),"se generó la tabla de loot que el bloque pedía (suelta el propio bloque)");
      }
    }
    b.components=c; if(ch)guardar(f,o);
  }

  // ---- 4) entidades
  const zombis=[];let vehiculo=null,superv=null;
  const tabla=new Map();
  for(const [id,f] of entidades){
    const o=hdJson(f); if(!o)continue; const e=o["minecraft:entity"]; let ch=false;
    const cg=e.component_groups||{}; const usados=new Set();
    for(const ev of Object.values(e.events||{})){for(const k of ["add","remove"])for(const g of (ev?.[k]?.component_groups||[]))usados.add(g);
      for(const s of (ev?.sequence||[]))for(const k of ["add","remove"])for(const g of (s?.[k]?.component_groups||[]))usados.add(g);}
    for(const k of Object.keys(cg)){
      const raro=(k==="components"||k==="events"||k==="zombi_base")&&!usados.has(k);
      if(raro||(k==="components"||k==="events")){delete cg[k];ch=true;}
    }
    e.component_groups=cg; if(!Object.keys(cg).length)delete e.component_groups;
    const c=e.components||(e.components={});
    const n=hdSnake(id);
    if(/zombi|zombie/i.test(n)&&c["minecraft:health"])zombis.push({id,f,o,e,c,n});
    if(/automovil|vehiculo|vehicle|^car$|coche/i.test(n))vehiculo={id,f,o,e,c,n};
    if(/superviviente|survivor|aldeano|npc/i.test(n))superv={id,f,o,e,c,n};
    if(ch){guardar(f,o);nota(f.path,"grupos de componentes mal formados eliminados");}
  }
  // un "superviviente" que ataca jugadores es un enemigo, no un NPC amistoso: sin diálogo ni misión de protegerlo
  if(superv&&/"player"/.test(JSON.stringify(superv.c["minecraft:behavior.nearest_attackable_target"]||{})))superv=null;
  // zombis idénticos → estadísticas por arquetipo
  const firma=(z)=>[z.c["minecraft:health"]?.value,z.c["minecraft:attack"]?.damage,z.c["minecraft:movement"]?.value].join("/");
  const conteoFirma=new Map();for(const z of zombis)conteoFirma.set(firma(z),(conteoFirma.get(firma(z))||0)+1);
  const lootZ="BP/loot_tables/entities/"+ns+"_zombi.json";
  const tieneBot=[...items].find(i=>HD_CURA[0].rx.test(i)); const tieneVen=[...items].find(i=>HD_CURA[1].rx.test(i));
  let dropOk=false;
  for(const z of zombis){
    let ch=false;
    const arq=HD_ARQUETIPOS.find(a=>a[0].test(z.n));
    if(arq&&(conteoFirma.get(firma(z))||0)>=3){
      const a=arq[1];
      z.c["minecraft:health"]={value:a.hp,max:a.hp};
      z.c["minecraft:movement"]={value:a.spd};
      z.c["minecraft:attack"]={damage:a.dmg};
      if(a.kb)z.c["minecraft:knockback_resistance"]={value:a.kb};
      z.c["minecraft:follow_range"]={value:a.seg,max:a.seg};
      const t=z.c["minecraft:behavior.nearest_attackable_target"]; if(t&&Array.isArray(t.entity_types))for(const et of t.entity_types)et.max_dist=a.seg;
      if(/rastreador|tracker/.test(z.n)&&t)t.must_see=false;
      ch=true;
    }
    if(!z.c["minecraft:behavior.float"]){z.c["minecraft:behavior.float"]={priority:0};ch=true;}
    if(!z.c["minecraft:loot"]){z.c["minecraft:loot"]={table:"loot_tables/entities/"+ns+"_zombi.json"};dropOk=true;ch=true;}
    if(ch){guardar(z.f,z.o);nota(z.f.path,"estadísticas propias del tipo de zombi, caída de botín y comportamiento base");}
  }
  if(dropOk&&!files.some(x=>x.path===lootZ)){
    const pools=[{rolls:{min:0,max:2},entries:[{type:"item",name:"minecraft:rotten_flesh",weight:1}]},
      {rolls:1,conditions:[{condition:"random_chance",chance:0.5}],entries:[{type:"item",name:"minecraft:iron_nugget",weight:1,functions:[{function:"set_count",count:{min:1,max:4}}]}]}];
    if(tieneBot)pools.push({rolls:1,conditions:[{condition:"random_chance",chance:0.06}],entries:[{type:"item",name:tieneBot,weight:1}]});
    if(tieneVen)pools.push({rolls:1,conditions:[{condition:"random_chance",chance:0.12}],entries:[{type:"item",name:tieneVen,weight:1}]});
    poner(lootZ,JSON.stringify({pools},null,2));nota(lootZ,"botín de zombis: carne podrida, pepitas de hierro (munición) y curas");
  }
  if(vehiculo&&!vehiculo.c["minecraft:rideable"]){
    const c=vehiculo.c;
    delete c["minecraft:behavior.random_stroll"]; delete c["minecraft:behavior.look_at_player"]; delete c["minecraft:type_family"];
    c["minecraft:type_family"]={family:[ns+"_vehiculo","inanimate"]};
    c["minecraft:rideable"]={seat_count:2,family_types:["player"],interact_text:"action.interact.ride.horse",seats:[{position:[0,0.6,0.3],min_rider_count:0,max_rider_count:1},{position:[0,0.6,-0.5],min_rider_count:2,max_rider_count:2}]};
    c["minecraft:input_ground_controlled"]={};
    c["minecraft:movement"]={value:0.45}; c["minecraft:movement.basic"]={};
    c["minecraft:navigation.walk"]=c["minecraft:navigation.walk"]||{can_path_over_water:false,avoid_water:true};
    c["minecraft:jump.static"]={}; c["minecraft:physics"]={};
    c["minecraft:knockback_resistance"]={value:1};
    guardar(vehiculo.f,vehiculo.o);nota(vehiculo.f.path,"el vehículo ahora se puede montar y conducir (rideable + input_ground_controlled)");
  }
  if(superv&&!superv.c["minecraft:persistent"]){superv.c["minecraft:persistent"]={};superv.c["minecraft:nameable"]={};guardar(superv.f,superv.o);nota(superv.f.path,"el superviviente ya no desaparece solo");}

  // ---- 5) reglas de aparición de entidades que no existen
  for(const f of [...files]){
    if(!/^BP\/spawn_rules\/.+\.json$|^BP\/spawn\/.+\.json$/i.test(f.path))continue;
    const o=hdJson(f); const id=o?.["minecraft:spawn_rules"]?.description?.identifier;
    if(id&&!entidades.has(id)){quitar(f.path);nota(f.path,"se quitó la regla de aparición: la entidad "+id+" no existe");}
  }
  {
    const conRegla=new Set();
    for(const f of files){ if(/^BP\/spawn_rules\/.+\.json$|^BP\/spawn\/.+\.json$/i.test(f.path)){const o=hdJson(f);const id=o?.["minecraft:spawn_rules"]?.description?.identifier;if(id)conRegla.add(id);} }
    const PESO=[[/gigante|giant|alfa/,2],[/mutante|mutant/,5],[/blindado|armored/,8],[/brutal/,12],[/explosiv/,14],[/toxico|toxic/,16],[/cazador|hunter|rastreador|tracker/,12],[/nocturno|night/,24],[/corredor|runner/,30],[/infectado|infected/,25],[/caminante|walker/,70]];
    for(const z of zombis){
      if(conRegla.has(z.id))continue;
      const w=(PESO.find(x=>x[0].test(z.n))||[0,15])[1];
      const noche=/nocturno|night/.test(z.n);
      poner("BP/spawn_rules/"+z.n+".json",JSON.stringify({format_version:"1.8.0","minecraft:spawn_rules":{description:{identifier:z.id,population_control:"monster"},conditions:[{"minecraft:spawns_on_surface":{},"minecraft:brightness_filter":{min:0,max:noche?3:7,adjust_for_weather:false},"minecraft:weight":{default:w},"minecraft:herd":{min_size:1,max_size:/caminante|corredor|infectado/.test(z.n)?4:1},"minecraft:biome_filter":{test:"has_biome_tag",operator:"==",value:"overworld"}}]}},null,2));
      nota("BP/spawn_rules/"+z.n+".json","el zombi no tenía regla de aparición: no habría aparecido nunca en el mundo; se generó");
    }
  }
  // Minecraft lee spawn_rules/, no spawn/
  for(const f of files){ if(/^BP\/spawn\/[^/]+\.json$/i.test(f.path)){const np=f.path.replace(/^BP\/spawn\//i,"BP/spawn_rules/");if(!files.some(x=>x.path===np)){f.path=np;nota(np,"las reglas de aparición van en BP/spawn_rules");}} }

  // ---- 6) geometrías duplicadas (models/ y models/entity/)
  {
    const geoIds=(f)=>{const o=hdJson(f);if(!o)return [];const m=o["minecraft:geometry"];return Array.isArray(m)?m.map(g=>g?.description?.identifier).filter(Boolean):Object.keys(o).filter(k=>k.startsWith("geometry."));};
    const enEntity=new Set();for(const f of files)if(/^RP\/models\/entity\/.+\.geo\.json$/i.test(f.path))for(const g of geoIds(f))enEntity.add(g);
    for(const f of [...files]){ if(/^RP\/models\/[^/]+\.geo\.json$/i.test(f.path)){const ids=geoIds(f);if(ids.length&&ids.every(g=>enEntity.has(g))){quitar(f.path);nota(f.path,"geometría duplicada eliminada");}} }
  }

  // ---- 6b) eventos y propiedades de la API que el modelo suele inventar (hacen que el script entero falle al cargar)
  {
    const SOLO_AFTER=["entityHurt","entityHitEntity","entityHitBlock","entityDie","entitySpawn","playerSpawn","playerJoin","itemCompleteUse","itemReleaseUse","itemStartUse","itemStopUse","projectileHitEntity","projectileHitBlock","effectAdd2"];
    for(const f of files){
      if(!/^BP\/scripts\/.+\.js$/.test(f.path)||typeof f.content!=="string")continue;
      let t=f.content;const antes=t;const hechos=[];
      for(const ev of SOLO_AFTER){const rx=new RegExp("(world|system)\\.beforeEvents\\."+ev+"\\b","g");if(rx.test(t)){t=t.replace(rx,"$1.afterEvents."+ev);hechos.push("beforeEvents."+ev+" no existe, se usa afterEvents");}}
      if(/(\w+)\.damager\b/.test(t)){t=t.replace(/(\w+)\.damager\b/g,"$1.damageSource.damagingEntity");hechos.push("event.damager → event.damageSource.damagingEntity");}
      const rxIu=/(itemUse\.subscribe\(\s*\(?\s*(\w+)\s*\)?\s*=>\s*\{[\s\S]{0,500}?)\b\2\.player\b/g;
      if(rxIu.test(t)){t=t.replace(rxIu,(m,a,b)=>a+b+".source");hechos.push("itemUse: event.player → event.source");}
      if(t!==antes){f.content=t;nota(f.path,"API corregida: "+hechos.join("; "));}
    }
  }

  // ---- 7) scripts: importaciones que faltan y entrada principal
  const SRV=["world","system","ItemStack","GameMode","EquipmentSlot","EntityComponentTypes","EntityDamageCause","BlockPermutation","BlockVolume","MolangVariableMap"];
  const quitarCom=(t)=>String(t).replace(/\/\*[\s\S]*?\*\//g,"").replace(/\/\/[^\n]*/g,"").replace(/`(?:\\.|[^`\\])*`/g,'""').replace(/"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g,'""');
  for(const f of files){
    if(!/^BP\/scripts\/.+\.js$/.test(f.path)||typeof f.content!=="string")continue;
    const sin=quitarCom(f.content);
    const imp=sin.match(/import\s*\{[^}]*\}\s*from\s*["']@minecraft\/server["']/)||f.content.match(/import\s*\{([^}]*)\}\s*from\s*["']@minecraft\/server["']/);
    const m=f.content.match(/import\s*\{([^}]*)\}\s*from\s*["']@minecraft\/server["'];?/);
    const ya=new Set(m?m[1].split(",").map(s=>s.trim().split(/\s+as\s+/).pop()).filter(Boolean):[]);
    const locales=new Set();for(const x of sin.matchAll(/(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g))locales.add(x[1]);
    // nombres declarados por desestructuración: const { world, system } = mc;  (evita declararlos dos veces)
    for(const x of sin.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=/g))for(const n of x[1].split(","))locales.add(n.trim().split(/\s*:\s*/).pop().split("=")[0].trim());
    for(const x of f.content.matchAll(/import\s*\{([^}]*)\}\s*from\s*["'][^"']+["']/g))for(const n of x[1].split(","))ya.add(n.trim().split(/\s+as\s+/).pop());
    const faltan=SRV.filter(n=>!ya.has(n)&&!locales.has(n)&&new RegExp("(^|[^\\w$.])"+n+"\\b").test(sin));
    if(!faltan.length)continue;
    if(m){const lista=m[1].split(",").map(s=>s.trim()).filter(Boolean).concat(faltan);f.content=f.content.replace(m[0],"import { "+lista.join(", ")+" } from \"@minecraft/server\";");}
    else f.content="import { "+faltan.join(", ")+" } from \"@minecraft/server\";\n"+f.content;
    nota(f.path,"importaciones que faltaban: "+faltan.join(", "));
  }
  {
    const todos=new Set([...items,...bloques,...entidades.keys()]);
    const variantes=(r)=>[r.replace(/zombie/g,"zombi"),r.replace(/zombi(?!e)/g,"zombie"),r.replace(/hunter/g,"cazador"),r.replace(/runner/g,"corredor"),r.replace(/walker/g,"caminante"),r.replace(/toxic(?!o)/g,"toxico"),r.replace(/explosive/g,"explosivo")];
    for(const f of files){
      if(!/^BP\/scripts\/.+\.js$/.test(f.path)||typeof f.content!=="string")continue;
      let n=0;
      f.content=f.content.replace(/(["'])([a-z0-9_]+):([a-z0-9_]*)\1/g,(m,q,pre,r)=>{
        if(pre!==ns||todos.has(pre+":"+r))return m;
        for(const v of variantes(r)){
          if(v===r)continue;
          if(todos.has(pre+":"+v)||(v.endsWith("_")&&[...todos].some(t=>t.startsWith(pre+":"+v)))){n++;return q+pre+":"+v+q;}
        }
        return m;
      });
      if(n)nota(f.path,n+" identificador(es) no coincidían con los reales del add-on (p. ej. zombie_ vs zombi_) y se corrigieron");
    }
  }
  // misiones heredadas con errores de API → se reemplazan por el módulo probado
  const defectuoso=(t)=>/\b\w+\.inventory\b(?!\w)/.test(t)||/\{\s*damager\b/.test(t)||/event\.player\b[\s\S]{0,80}playerJoin|playerJoin[\s\S]{0,120}event\.player\b/.test(t);
  let reemplazaMisiones=false;
  for(const f of [...files]){
    if(!/^BP\/scripts\/[^/]+\.js$/.test(f.path)||typeof f.content!=="string")continue;
    if(/misi[oó]n|quest/i.test(f.content)&&defectuoso(f.content)){quitar(f.path);reemplazaMisiones=true;nota(f.path,"se reemplazó: usaba la API de Minecraft de forma incorrecta (inventory, damager, playerJoin.player)");}
  }

  // ---- 8) módulos de juego
  const scripts=()=>files.filter(f=>/^BP\/scripts\/[^/]+\.js$/.test(f.path)&&typeof f.content==="string");
  const yaEgo=(n)=>files.some(f=>f.path==="BP/scripts/"+n+".js");
  const existe=(rx)=>scripts().some(f=>!/\/(ego_[a-z]+|main)\.js$/.test(f.path)&&rx.test(f.content));
  const textoPlan=(String(plan&&plan._prompt||"")+" "+JSON.stringify(plan||{})).slice(0,12000);
  const J=(x)=>JSON.stringify(x);
  const armas=[...items].map(id=>{const a=HD_ARMAS.find(x=>x.rx.test(hdSnake(id)));return a?{id,...a,rx:undefined}:null;}).filter(Boolean);
  const curas=[...items].map(id=>{const c=HD_CURA.find(x=>x.rx.test(hdSnake(id)));return c?{id,vida:c.vida,cura:c.cura}:null;}).filter(Boolean);
  const zIds=zombis.map(z=>z.id);
  const tz=(rx)=>zombis.filter(z=>rx.test(z.n)).map(z=>z.id);
  const sonido=(()=>{const f=files.find(x=>x.path==="RP/sounds/sound_definitions.json");const o=hdJson(f);const k=o&&o.sound_definitions?Object.keys(o.sound_definitions):[];return k.find(x=>/disparo|shot|gun/i.test(x))||"";})();
  const usaInfeccion=(/infecc|infect/i.test(textoPlan)||zombis.some(z=>/infectado|infected/.test(z.n)))&&zIds.length&&!existe(/infecc[\s\S]{0,1500}(addEffect|addTag|applyDamage)|(addEffect|addTag|applyDamage)[\s\S]{0,1500}infecc/i);
  const modulos=[];


  if(armas.length&&!yaEgo("ego_armas")&&!existe(/itemUse[\s\S]{0,2500}(getEntitiesFromViewDirection|applyDamage)/)){
    const W={};for(const a of armas)W[a.id]={nombre:a.nombre,dano:a.dmg,espera:a.cd,rango:a.rango,perdigones:a.perdigones,desv:a.desv,tono:/francotir|sniper/i.test(a.nombre)?0.8:/rifle/i.test(a.nombre)?1.6:/escopet/i.test(a.nombre)?1.1:1.9,vol:/francotir|sniper/i.test(a.nombre)?1:/escopet/i.test(a.nombre)?0.9:0.6};
    const H={};for(const c of curas)H[c.id]={vida:c.vida,cura:c.cura};
    poner("BP/scripts/ego_armas.js",
'// Armas de fuego y curas (EGO AI): clic derecho con el arma para disparar; gasta munición del inventario.\n'+
'import { world, system } from "@minecraft/server";\n'+
'import { CFG, TAG_INF, contar, quitar, curarVida, aviso } from "./ego_nucleo.js";\n'+
'const ARMAS = '+J(W)+';\nconst CURAS = '+J(H)+';\nconst SONIDO = '+J(sonido)+';\nconst ultimo = new Map();\n'+
'function sonar(p, a) { try { p.playSound(SONIDO || "random.explode", { volume: SONIDO ? 1 : a.vol, pitch: SONIDO ? 1 : a.tono }); } catch (e) {} system.runTimeout(() => { try { p.playSound("random.click", { volume: 0.5, pitch: 1.3 }); } catch (e) {} }, 8); }\n'+
'function particula(dim, id, x, y, z) { try { dim.spawnParticle(id, { x: x, y: y, z: z }); } catch (e) {} }\n'+
'function efectos(p, a, dist, o, d, impacto) {\n'+
'  const dim = p.dimension;\n'+
'  particula(dim, "minecraft:basic_flame_particle", o.x + d.x * 0.9, o.y + d.y * 0.9 - 0.15, o.z + d.z * 0.9);\n'+
'  particula(dim, "minecraft:basic_smoke_particle", o.x + d.x * 1.1, o.y + d.y * 1.1 - 0.15, o.z + d.z * 1.1);\n'+
'  const n = Math.min(40, Math.floor(dist / 0.9));\n'+
'  for (let i = 2; i < n; i++) { const t = i * 0.9; particula(dim, "minecraft:basic_crit_particle", o.x + d.x * t, o.y + d.y * t - 0.1, o.z + d.z * t); }\n'+
'  if (impacto) { const x = o.x + d.x * dist, y = o.y + d.y * dist, z = o.z + d.z * dist; particula(dim, "minecraft:critical_hit_emitter", x, y, z); particula(dim, "minecraft:lava_particle", x, y, z); }\n'+
'}\n'+
'world.afterEvents.itemUse.subscribe((ev) => {\n'+
'  try {\n'+
'    const p = ev.source, id = ev.itemStack.typeId;\n'+
'    if (!p || p.typeId !== "minecraft:player") return;\n'+
'    const cura = CURAS[id];\n'+
'    if (cura) {\n'+
'      if (!quitar(p, id, 1)) return;\n'+
'      curarVida(p, cura.vida);\n'+
'      if (cura.cura && p.hasTag(TAG_INF)) { p.removeTag(TAG_INF); aviso(p, "§aInfección curada"); } else aviso(p, "§a+" + cura.vida / 2 + " corazones");\n'+
'      return;\n'+
'    }\n'+
'    const arma = ARMAS[id];\n'+
'    if (!arma) return;\n'+
'    const ahora = system.currentTick, clave = p.id + id, previo = ultimo.has(clave) ? ultimo.get(clave) : -999;\n'+
'    if (ahora - previo < arma.espera) return;\n'+
'    if (!quitar(p, CFG.armas.municion, 1)) { aviso(p, "§cSin munición (pepitas de hierro)"); ultimo.set(clave, ahora); return; }\n'+
'    ultimo.set(clave, ahora);\n'+
'    let origen = p.location, dir = { x: 0, y: 0, z: 1 };\n'+
'    try { origen = p.getHeadLocation(); dir = p.getViewDirection(); } catch (e) {}\n'+
'    sonar(p, arma);\n'+
'    const golpes = p.getEntitiesFromViewDirection({ maxDistance: arma.rango });\n'+
'    const blanco = golpes.find((g) => g.entity && g.entity.id !== p.id && g.entity.typeId !== "minecraft:item");\n'+
'    efectos(p, arma, blanco ? blanco.distance : Math.min(arma.rango, 30), origen, dir, !!blanco);\n'+
'    if (!blanco) return;\n'+
'    const caida = Math.max(0.25, 1 - blanco.distance / arma.rango);\n'+
'    const dano = arma.perdigones > 1 ? arma.dano * arma.perdigones * caida : arma.dano;\n'+
'    blanco.entity.applyDamage(dano, { cause: "entityAttack", damagingEntity: p });\n'+
'    try { p.playSound("random.orb", { volume: 0.4, pitch: 2 }); } catch (e) {}\n'+
'  } catch (e) { console.warn("ego_armas: " + e); }\n'+
'});\n');
    modulos.push("armas");generado.push("ego_armas.js (disparo con munición, daño por distancia, curas)");
  } else if(curas.length&&!yaEgo("ego_armas")&&!existe(/itemUse[\s\S]{0,1500}(setCurrentValue|health)/)){
    const H={};for(const c of curas)H[c.id]={vida:c.vida,cura:c.cura};
    poner("BP/scripts/ego_armas.js",
'import { world } from "@minecraft/server";\nimport { TAG_INF, quitar, curarVida, aviso } from "./ego_nucleo.js";\nconst CURAS = '+J(H)+';\n'+
'world.afterEvents.itemUse.subscribe((ev) => { try { const p = ev.source, c = CURAS[ev.itemStack.typeId]; if (!c || !p || p.typeId !== "minecraft:player") return; if (!quitar(p, ev.itemStack.typeId, 1)) return; curarVida(p, c.vida); if (c.cura && p.hasTag(TAG_INF)) p.removeTag(TAG_INF); aviso(p, "§aTe curaste"); } catch (e) {} });\n');
    modulos.push("curas");generado.push("ego_armas.js (curas)");
  }

  if(usaInfeccion&&!yaEgo("ego_infeccion")){
    const mult={};for(const z of zombis){ if(/toxico|infectado|mutante/.test(z.n))mult[z.id]=1.6; if(/explosiv/.test(z.n))mult[z.id]=0; }
    poner("BP/scripts/ego_infeccion.js",
'// Sistema de infección (EGO AI): los zombis pueden infectar; 3 etapas con síntomas; se cura con botiquín.\n'+
'import { world, system } from "@minecraft/server";\n'+
'import { CFG, TAG_INF, aviso } from "./ego_nucleo.js";\n'+
'const ZOMBIS = new Set('+J(zIds)+');\nconst MULT = '+J(mult)+';\nconst inicio = new Map(), ultimoDano = new Map(), etapaVista = new Map();\n'+
'export function infectar(p) { if (p.hasTag(TAG_INF)) return; p.addTag(TAG_INF); inicio.set(p.id, system.currentTick); etapaVista.set(p.id, 0); p.sendMessage("§2☣ Te infectaron. Busca un botiquín antes de que sea tarde."); }\n'+
'world.afterEvents.entityHitEntity.subscribe((ev) => {\n'+
'  try {\n'+
'    const a = ev.damagingEntity, v = ev.hitEntity;\n'+
'    if (!a || !v || v.typeId !== "minecraft:player" || !ZOMBIS.has(a.typeId)) return;\n'+
'    const m = MULT[a.typeId] === undefined ? 1 : MULT[a.typeId];\n'+
'    if (Math.random() < CFG.infeccion.probabilidad * m) infectar(v);\n'+
'  } catch (e) { console.warn("ego_infeccion: " + e); }\n'+
'});\n'+
'world.afterEvents.playerSpawn.subscribe((ev) => { try { if (!ev.initialSpawn && ev.player.hasTag(TAG_INF)) ev.player.removeTag(TAG_INF); } catch (e) {} });\n'+
'system.runInterval(() => {\n'+
'  for (const p of world.getAllPlayers()) {\n'+
'    try {\n'+
'      if (!p.hasTag(TAG_INF)) { inicio.delete(p.id); continue; }\n'+
'      if (!inicio.has(p.id)) inicio.set(p.id, system.currentTick);\n'+
'      const edad = system.currentTick - inicio.get(p.id);\n'+
'      const etapa = Math.min(3, Math.floor(edad / CFG.infeccion.etapaTicks) + 1);\n'+
'      aviso(p, "§2☣ Infección: etapa " + etapa + "/3");\n'+
'      if (etapaVista.get(p.id) !== etapa) { etapaVista.set(p.id, etapa); p.sendMessage(etapa === 1 ? "§eTe sientes débil..." : etapa === 2 ? "§6La fiebre sube, apenas puedes moverte." : "§cTu cuerpo se apaga. ¡Necesitas un botiquín YA!"); }\n'+
'      p.addEffect("weakness", 60, { amplifier: 0, showParticles: false });\n'+
'      if (etapa >= 2) { p.addEffect("slowness", 60, { amplifier: 0, showParticles: false }); p.addEffect("nausea", 100, { amplifier: 0, showParticles: false }); }\n'+
'      if (etapa >= 3 && system.currentTick - (ultimoDano.get(p.id) || 0) >= CFG.infeccion.intervaloDano) { ultimoDano.set(p.id, system.currentTick); p.applyDamage(CFG.infeccion.danoEtapa3, { cause: "magic" }); }\n'+
'    } catch (e) {}\n'+
'  }\n'+
'}, 20);\n');
    modulos.push("infeccion");generado.push("ego_infeccion.js (contagio por golpe, 3 etapas, cura con botiquín)");
  }

  const exp=tz(/explosiv|bomb|kamikaze/), tox=tz(/toxico|toxic|venen/), mut=tz(/mutante|mutant|alfa|gigante/);
  if((exp.length||tox.length||mut.length)&&!yaEgo("ego_zombis")&&!existe(/createExplosion/)){
    poner("BP/scripts/ego_zombis.js",
'// Habilidades especiales de zombis (EGO AI).\n'+
'import { world, system } from "@minecraft/server";\n'+
'const EXPLOSIVOS = '+J(exp)+', TOXICOS = '+J(tox)+', REGENERAN = '+J(mut)+';\n'+
'world.afterEvents.entityHitEntity.subscribe((ev) => { try { const a = ev.damagingEntity, v = ev.hitEntity; if (a && v && v.typeId === "minecraft:player" && TOXICOS.includes(a.typeId)) v.addEffect("poison", 100, { amplifier: 0 }); } catch (e) {} });\n'+
'system.runInterval(() => {\n'+
'  for (const p of world.getAllPlayers()) {\n'+
'    try {\n'+
'      for (const t of EXPLOSIVOS) for (const z of p.dimension.getEntities({ type: t, location: p.location, maxDistance: 2.6 })) { const loc = z.location, dim = z.dimension; z.remove(); dim.createExplosion(loc, 2.5, { breaksBlocks: false, causesFire: false }); }\n'+
'      for (const t of REGENERAN) for (const z of p.dimension.getEntities({ type: t, location: p.location, maxDistance: 48 })) z.addEffect("regeneration", 60, { amplifier: 0, showParticles: false });\n'+
'    } catch (e) {}\n'+
'  }\n'+
'}, 10);\n');
    modulos.push("zombis");generado.push("ego_zombis.js (explosivos, tóxicos, regeneración de mutantes)");
  }

  const quiereMisiones=reemplazaMisiones||/misi[oó]n|quest/i.test(textoPlan);
  if(quiereMisiones&&zombis.length&&!yaEgo("ego_misiones")&&!existe(/misi[oó]n|quest/i)){
    const z1=zombis.find(z=>/caminante|walker/.test(z.n))||zombis[0];
    const zg=zombis.find(z=>/gigante|mutante|brutal|alfa/.test(z.n));
    const wA=armas[0],wB=armas[1]||armas[0],wC=armas[armas.length-1];
    const botiq=tieneBot,m=[];const CFGAMMO=()=>"minecraft:iron_nugget";
    if(wA)m.push({id:"m1",texto:"Elimina 5 zombis ("+hdSnake(z1.id)+")",tipo:"matar",ent:z1.id,cant:5,premio:[[wA.id,1],[CFGAMMO(),12]]});
    m.push({id:"m2",texto:"Reúne 10 lingotes de hierro",tipo:"reunir",item:"minecraft:iron_ingot",cant:10,premio:wB?[[wB.id,1],[CFGAMMO(),16]]:[["minecraft:iron_sword",1]]});
    if(superv)m.push({id:"m3",texto:"Protege al superviviente 3 minutos (mantente a menos de 24 bloques)",tipo:"proteger",ent:superv.id,cant:180,premio:botiq?[[botiq,3]]:[["minecraft:golden_apple",1]]});
    if(zg)m.push({id:"m4",texto:"Derrota a "+hdSnake(zg.id),tipo:"matar",ent:zg.id,cant:1,premio:wC?[[wC.id,1],[CFGAMMO(),32]]:[["minecraft:diamond",2]]});
    poner("BP/scripts/ego_misiones.js",
'// Misiones (EGO AI). Progreso guardado en el jugador. Comando: /scriptevent ego:misiones\n'+
'import { world, system } from "@minecraft/server";\n'+
'import { contar, dar } from "./ego_nucleo.js";\n'+
'const MISIONES = '+J(m)+';\nconst estado = new Map();\n'+
'function cargar(p) { if (estado.has(p.id)) return estado.get(p.id); let o = {}; try { o = JSON.parse(p.getDynamicProperty("ego:misiones") || "{}"); } catch (e) { o = {}; } estado.set(p.id, o); return o; }\n'+
'function guardar(p) { try { p.setDynamicProperty("ego:misiones", JSON.stringify(estado.get(p.id) || {})); } catch (e) {} }\n'+
'function completar(p, m, o) { o[m.id] = { hecho: true }; guardar(p); p.sendMessage("§a✔ Misión completada: " + m.texto); for (const r of m.premio) { try { dar(p, r[0], r[1]); } catch (e) {} } p.sendMessage("§eRecompensa entregada."); }\n'+
'function avanzar(p, m, o, n) { const s = o[m.id] || { n: 0 }; if (s.hecho) return; s.n = n; o[m.id] = s; if (s.n >= m.cant) completar(p, m, o); else guardar(p); }\n'+
'world.afterEvents.entityDie.subscribe((ev) => {\n'+
'  try {\n'+
'    const k = ev.damageSource && ev.damageSource.damagingEntity;\n'+
'    if (!k || k.typeId !== "minecraft:player") return;\n'+
'    const o = cargar(k);\n'+
'    for (const m of MISIONES) { if (m.tipo !== "matar" || m.ent !== ev.deadEntity.typeId || (o[m.id] && o[m.id].hecho)) continue; const n = ((o[m.id] && o[m.id].n) || 0) + 1; avanzar(k, m, o, n); if (n < m.cant) k.sendMessage("§7" + m.texto + ": " + n + "/" + m.cant); }\n'+
'  } catch (e) { console.warn("ego_misiones: " + e); }\n'+
'});\n'+
'system.runInterval(() => {\n'+
'  for (const p of world.getAllPlayers()) {\n'+
'    try {\n'+
'      const o = cargar(p);\n'+
'      for (const m of MISIONES) {\n'+
'        if (o[m.id] && o[m.id].hecho) continue;\n'+
'        if (m.tipo === "reunir") { const n = contar(p, m.item); if (n >= m.cant) completar(p, m, o); }\n'+
'        else if (m.tipo === "proteger") { const cerca = p.dimension.getEntities({ type: m.ent, location: p.location, maxDistance: 24 }); if (cerca.length) avanzar(p, m, o, ((o[m.id] && o[m.id].n) || 0) + 1); }\n'+
'      }\n'+
'    } catch (e) {}\n'+
'  }\n'+
'}, 20);\n'+
'world.afterEvents.playerSpawn.subscribe((ev) => { try { if (ev.initialSpawn) ev.player.sendMessage("§6Escribe /scriptevent ego:misiones para ver tus misiones."); } catch (e) {} });\n'+
'system.afterEvents.scriptEventReceive.subscribe((ev) => {\n'+
'  try {\n'+
'    if (ev.id !== "ego:misiones" || !ev.sourceEntity || ev.sourceEntity.typeId !== "minecraft:player") return;\n'+
'    const p = ev.sourceEntity, o = cargar(p);\n'+
'    p.sendMessage("§6=== Misiones ===");\n'+
'    for (const m of MISIONES) { const s = o[m.id] || { n: 0 }; p.sendMessage((s.hecho ? "§a✔ " : "§f• ") + m.texto + (s.hecho ? "" : " §7(" + (m.tipo === "reunir" ? contar(p, m.item) : s.n) + "/" + m.cant + ")")); }\n'+
'  } catch (e) {}\n'+
'});\n');
    modulos.push("misiones");generado.push("ego_misiones.js ("+m.length+" misiones con progreso guardado y comando /scriptevent ego:misiones)");
  }

  const ruinas=[...bloques].map(id=>{const r=HD_RUINAS.find(x=>x.rx.test(hdSnake(id)));return /hospital|laborator|militar|bunker|refugio|ruina|casa|base/i.test(hdSnake(id))?{id,r}:null;}).filter(Boolean);
  if(ruinas.length&&zIds.length&&!yaEgo("ego_estructuras")&&!existe(/playerPlaceBlock[\s\S]{0,2500}setBlockType/)){
    const cfg={};
    for(const {id,r} of ruinas){
      cfg[id]={tipo:r.tipo,muro:r.muro,suelo:r.suelo,techo:r.techo,deco:r.deco,
        botin:r.botin.map(b=>{let it=b[0];if(it==="BOTIQUIN")it=tieneBot||"minecraft:golden_apple";else if(it==="VENDA")it=tieneVen||"minecraft:paper";else if(it==="ARMA")it=(armas[0]&&armas[0].id)||"minecraft:iron_sword";return [it,b[1],b[2],b[3]];})};
    }
    poner("BP/scripts/ego_estructuras.js",
'// Estructuras (EGO AI): ruinas 9x9 con tabique, cofres de botín y zombis. Aparecen solas cerca del jugador y al colocar el bloque.\n'+
'import { world, system, ItemStack } from "@minecraft/server";\n'+
'const RUINAS = '+J(cfg)+';\nconst ZOMBIS = '+J(zIds.filter(i=>!/explosiv/.test(i)))+';\n'+
'function azar(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }\n'+
'function* construir(dim, o, r) {\n'+
'  let n = 0;\n'+
'  const poner = (x, y, z, t) => { dim.setBlockType({ x: o.x + x, y: o.y + y, z: o.z + z }, t); n++; };\n'+
'  for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) {\n'+
'    poner(x, -2, z, r.suelo); poner(x, -1, z, r.suelo);\n'+
'    const borde = Math.abs(x) === 4 || Math.abs(z) === 4;\n'+
'    for (let y = 0; y <= 3; y++) {\n'+
'      if (borde) { const puerta = z === 4 && Math.abs(x) <= 1 && y <= 2; const ventana = y === 2 && ((Math.abs(x) === 4 && Math.abs(z) % 2 === 0) || (Math.abs(z) === 4 && Math.abs(x) % 2 === 0)); const roto = Math.random() < 0.12 && y >= 2; poner(x, y, z, puerta || roto ? "minecraft:air" : ventana ? r.deco : r.muro); }\n'+
'      else if (x === 0 && z >= -3 && z <= 1 && z !== -1 && y <= 2) poner(x, y, z, r.muro);\n'+
'      else poner(x, y, z, y === 3 && Math.random() < 0.08 ? "minecraft:cobweb" : "minecraft:air");\n'+
'    }\n'+
'    poner(x, 4, z, Math.random() < 0.8 ? r.techo : "minecraft:air");\n'+
'    if (n % 80 === 0) yield;\n'+
'  }\n'+
'  for (const c of [[-3, -3], [3, -3]]) {\n'+
'    const pos = { x: o.x + c[0], y: o.y, z: o.z + c[1] };\n'+
'    dim.setBlockType(pos, "minecraft:chest");\n'+
'    yield;\n'+
'    try { const cont = dim.getBlock(pos).getComponent("inventory").container; let slot = 0; for (const b of r.botin) { if (Math.random() > b[3]) continue; cont.setItem(slot, new ItemStack(b[0], azar(b[1], b[2]))); slot += azar(1, 3); if (slot >= cont.size) break; } } catch (e) {}\n'+
'  }\n'+
'  for (let i = 0; i < 3 && ZOMBIS.length; i++) { try { dim.spawnEntity(ZOMBIS[azar(0, ZOMBIS.length - 1)], { x: o.x + azar(-2, 2) + 0.5, y: o.y, z: o.z + azar(-2, 2) + 0.5 }); } catch (e) {} }\n'+
'}\n'+
'const TIPOS = Object.keys(RUINAS), ultima = new Map();\nlet total = 0;\n'+
'function superficie(dim, x, z) { try { const b = dim.getTopmostBlock({ x: x, z: z }); if (!b || /water|lava|leaves|ice|log/.test(b.typeId)) return null; return b.location.y + 1; } catch (e) { return null; } }\n'+
'system.runInterval(() => {\n'+
'  if (total >= 60) return;\n'+
'  for (const p of world.getAllPlayers()) {\n'+
'    try {\n'+
'      if (p.dimension.id.indexOf("overworld") < 0) continue;\n'+
'      const u = ultima.get(p.id);\n'+
'      if (u && Math.hypot(u.x - p.location.x, u.z - p.location.z) < 90) continue;\n'+
'      if (Math.random() > 0.35) continue;\n'+
'      const ang = Math.random() * Math.PI * 2, dist = 40 + Math.random() * 30;\n'+
'      const x = Math.floor(p.location.x + Math.cos(ang) * dist), z = Math.floor(p.location.z + Math.sin(ang) * dist);\n'+
'      const y = superficie(p.dimension, x, z);\n'+
'      if (y === null) continue;\n'+
'      ultima.set(p.id, { x: x, z: z }); total++;\n'+
'      system.runJob(construir(p.dimension, { x: x, y: y, z: z }, RUINAS[TIPOS[Math.floor(Math.random() * TIPOS.length)]]));\n'+
'    } catch (e) {}\n'+
'  }\n'+
'}, 400);\n'+
'world.afterEvents.playerPlaceBlock.subscribe((ev) => {\n'+
'  try {\n'+
'    const r = RUINAS[ev.block.typeId];\n'+
'    if (!r) return;\n'+
'    const dim = ev.dimension || ev.player.dimension, o = { x: ev.block.location.x, y: ev.block.location.y, z: ev.block.location.z };\n'+
'    ev.player.sendMessage("§7Levantando " + r.tipo + " abandonado...");\n'+
'    system.runJob(construir(dim, o, r));\n'+
'  } catch (e) { console.warn("ego_estructuras: " + e); }\n'+
'});\n');
    modulos.push("estructuras");generado.push("ego_estructuras.js (ruinas con cofres de botín y zombis; aparecen solas en el mundo y al colocar los bloques)");
  }

  if(superv&&zIds.length&&!yaEgo("ego_supervivientes")&&!existe(/playerInteractWithEntity/)){
    poner("BP/scripts/ego_supervivientes.js",
'// Supervivientes amistosos (EGO AI): hablan al interactuar.\n'+
'import { world } from "@minecraft/server";\n'+
'const ID = '+J(superv.id)+';\nconst FRASES = ["Los zombis atacan más de noche. No salgas sin munición.", "Las pepitas de hierro sirven de munición para las armas.", "Si te infectas, un botiquín es lo único que te salva.", "Los hospitales y laboratorios guardan botiquines.", "Escribe /scriptevent ego:misiones para ver qué necesito de ti."];\n'+
'world.afterEvents.playerInteractWithEntity.subscribe((ev) => { try { if (ev.target.typeId !== ID) return; ev.player.sendMessage("§b<Superviviente> §f" + FRASES[Math.floor(Math.random() * FRASES.length)]); } catch (e) {} });\n');
    modulos.push("supervivientes");generado.push("ego_supervivientes.js (diálogo del superviviente)");
  }

  if(modulos.some(m=>["armas","curas","infeccion","misiones"].includes(m))){
    poner("BP/scripts/ego_nucleo.js",
'// Núcleo compartido (EGO AI). Sin efectos secundarios: solo utilidades y configuración.\n'+
'import { ItemStack } from "@minecraft/server";\n'+
'export const CFG = {\n  infeccion: { probabilidad: 0.25, etapaTicks: 1200, danoEtapa3: 1, intervaloDano: 100 },\n  armas: { municion: "minecraft:iron_nugget" },\n  mensajes: true\n};\n'+
'export const TAG_INF = "ego_infectado";\n'+
'export function contenedor(p) { try { return p.getComponent("inventory").container; } catch (e) { return null; } }\n'+
'export function contar(p, id) { const c = contenedor(p); if (!c) return 0; let n = 0; for (let i = 0; i < c.size; i++) { const it = c.getItem(i); if (it && it.typeId === id) n += it.amount; } return n; }\n'+
'export function quitar(p, id, cant) { const c = contenedor(p); if (!c || contar(p, id) < cant) return false; let falta = cant; for (let i = 0; i < c.size && falta > 0; i++) { const it = c.getItem(i); if (!it || it.typeId !== id) continue; if (it.amount <= falta) { falta -= it.amount; c.setItem(i, undefined); } else { it.amount -= falta; c.setItem(i, it); falta = 0; } } return true; }\n'+
'export function dar(p, id, cant) { const c = contenedor(p); let resto = cant; while (resto > 0) { const n = Math.min(resto, 64); const it = new ItemStack(id, n); const sobra = c ? c.addItem(it) : it; if (sobra) p.dimension.spawnItem(sobra, p.location); resto -= n; } }\n'+
'export function curarVida(p, cantidad) { try { const h = p.getComponent("health"); h.setCurrentValue(Math.min(h.effectiveMax, h.currentValue + cantidad)); } catch (e) {} }\n'+
'export function aviso(p, texto) { try { p.onScreenDisplay.setActionBar(texto); } catch (e) {} }\n');
  generado.push("ego_nucleo.js (utilidades y configuración)");
  }

  // ---- 9) main.js importa todo (un script que nadie importa nunca se ejecuta)
  {
    const sc=scripts().filter(f=>f.path!=="BP/scripts/main.js");
    let main=files.find(f=>f.path==="BP/scripts/main.js");
    if(!main&&sc.length){main={path:"BP/scripts/main.js",content:""};files.push(main);nota(main.path,"se creó main.js que faltaba");}
    if(main&&typeof main.content!=="string")main.content="";
    if(main){
      const quedan=sc.filter(f=>!new RegExp("[\"']\\./"+f.path.split("/").pop().replace(".","\\.")+"[\"']").test(main.content)&&f.path.split("/").pop()!=="ego_nucleo.js");
      // quita imports a archivos que ya no existen
      main.content=main.content.split("\n").filter(l=>{const m=l.match(/^\s*import\s+(?:[^"']*from\s*)?["']\.\/([^"']+)["']/);return !m||files.some(x=>x.path==="BP/scripts/"+m[1]);}).join("\n");
      if(quedan.length){main.content=quedan.map(f=>'import "./'+f.path.split("/").pop()+'";').join("\n")+"\n"+main.content;nota(main.path,"main.js ahora importa: "+quedan.map(f=>f.path.split("/").pop()).join(", "));}
    }
  }

  // ---- 10) README honesto
  const rd=files.find(f=>/^BP\/README\.md$/i.test(f.path));
  if(rd&&typeof rd.content==="string"&&/Actúa como|Tu misión es|PROYECTO MINECRAFT/i.test(rd.content)){
    const i=rd.content.indexOf("## Instalar");
    if(i>0)rd.content=rd.content.split("\n").slice(0,1).join("\n")+"\n\nAdd-on para Minecraft Bedrock creado por EGO AI.\n\n"+(plan&&plan.resumen?String(plan.resumen).slice(0,500)+"\n\n":"")+rd.content.slice(i);
    nota(rd.path,"el README traía pegado el texto completo del pedido; se reemplazó por un resumen");
  }
  if(rd&&typeof rd.content==="string"&&(generado.length||cambios.length)){
    rd.content+="\n\n## Qué hace realmente este add-on (verificado por EGO AI)\n"+
      (generado.length?generado.map(g=>"- "+g).join("\n"):"- Contenido por datos (entidades, ítems, bloques, recetas).")+
      "\n- Munición de las armas: pepitas de hierro (`minecraft:iron_nugget`); los zombis las sueltan.\n- Las armas se usan con clic derecho (no hay modo automático al mantener).\n- El progreso de misiones se guarda en el jugador; el de infección usa una etiqueta y se reinicia la etapa si se recarga el mundo.\n"+
      "\n### Limitaciones conocidas\n- Revisión estática y pruebas con un simulador; no se probó dentro de Minecraft.\n- Las ruinas aparecen solas cerca del jugador (a 40-70 bloques, máx. 60 por sesión) y también al colocar el bloque; no son estructuras nativas del juego ni hay biomas nuevos.\n";
  }
  return {cambios,generado,modulos,ns};
}

// ===== v14.47: pulido final del add-on (reglas deterministas, idempotentes) =====
// Corrige errores que los modelos cometen una y otra vez y que Minecraft rechaza o que rompen la jugabilidad.
function pfFinBloque(src, ini){
  let d=0,q=null;
  for(let i=ini;i<src.length;i++){
    const ch=src[i];
    if(q){ if(ch==="\\"){i++;continue;} if(ch===q)q=null; continue; }
    if(ch==='"'||ch==="'"||ch==="`"){q=ch;continue;}
    if(ch==="/"&&src[i+1]==="/"){const n=src.indexOf("\n",i);if(n<0)return -1;i=n;continue;}
    if(ch==="/"&&src[i+1]==="*"){const n=src.indexOf("*/",i+2);if(n<0)return -1;i=n+1;continue;}
    if(ch==="(")d++; else if(ch===")"){d--; if(d===0)return i;}
  }
  return -1;
}
function pfQuitarSubs(content, rxHead, cond){
  let out=content,n=0,pos=0;
  for(let guard=0;guard<20;guard++){
    rxHead.lastIndex=pos; const m=rxHead.exec(out); if(!m)break;
    const ini=m.index+m[0].length-1, fin=pfFinBloque(out,ini);
    if(fin<0)break;
    let fin2=fin+1; if(out[fin2]===";")fin2++;
    const bloque=out.slice(m.index,fin2);
    if(cond(bloque)){ out=out.slice(0,m.index)+"// (EGO) bloque duplicado eliminado: otro módulo ya lo maneja"+out.slice(fin2); n++; pos=m.index+10; }
    else pos=fin2;
  }
  return {content:out,n};
}
const MC_SCHEMA_J={"item":["minecraft:allow_off_hand","minecraft:block_placer","minecraft:bundle_interaction","minecraft:can_destroy_in_creative","minecraft:compostable","minecraft:cooldown","minecraft:damage","minecraft:damage_absorption","minecraft:digger","minecraft:display_name","minecraft:durability","minecraft:durability_sensor","minecraft:dyeable","minecraft:enchantable","minecraft:entity_placer","minecraft:fire_resistant","minecraft:food","minecraft:fuel","minecraft:glint","minecraft:hand_equipped","minecraft:hover_text_color","minecraft:icon","minecraft:interact_button","minecraft:kinetic_weapon","minecraft:liquid_clipped","minecraft:max_stack_size","minecraft:piercing_weapon","minecraft:projectile","minecraft:rarity","minecraft:record","minecraft:repairable","minecraft:shooter","minecraft:should_despawn","minecraft:stacked_by_data","minecraft:storage_item","minecraft:storage_weight_limit","minecraft:storage_weight_modifier","minecraft:swing_duration","minecraft:swing_sounds","minecraft:tags","minecraft:throwable","minecraft:use_animation","minecraft:use_modifiers","minecraft:wearable","minecraft:custom_components"],"block":["minecraft:block_entity","minecraft:breathability","minecraft:chest_obstruction","minecraft:collision_box","minecraft:connection_rule","minecraft:crafting_table","minecraft:destructible_by_explosion","minecraft:destructible_by_mining","minecraft:destruction_particles","minecraft:display_name","minecraft:embedded_visual","minecraft:enchantment_power_transmitter","minecraft:entity_fall_on","minecraft:flammable","minecraft:flower_pottable","minecraft:friction","minecraft:geometry","minecraft:instrument_sound","minecraft:item_visual","minecraft:leashable","minecraft:light_dampening","minecraft:light_emission","minecraft:liquid_detection","minecraft:loot","minecraft:map_color","minecraft:material_instances","minecraft:movable","minecraft:neighbor_change","minecraft:on_fall_on","minecraft:on_interact","minecraft:on_placed","minecraft:on_player_destroyed","minecraft:on_player_placing","minecraft:on_step_off","minecraft:on_step_on","minecraft:placement_filter","minecraft:precipitation_interactions","minecraft:queued_ticking","minecraft:random_offset","minecraft:random_ticking","minecraft:redstone_conductivity","minecraft:redstone_consumer","minecraft:redstone_producer","minecraft:replaceable","minecraft:selection_box","minecraft:sound","minecraft:support","minecraft:tags","minecraft:tick","minecraft:transformation","minecraft:unit_cube","minecraft:vibration_properties","minecraft:custom_components"]}; // componentes oficiales (Mojang/bedrock-samples json_schemas: item 1.26.50, block_components 1.26.60)
const MC_PARTICULAS=["arrow_spell_emitter","balloon_gas_particle","basic_bubble_particle","basic_bubble_particle_manual","basic_crit_particle","basic_flame_particle","basic_portal_particle","basic_smoke_particle","biome_tinted_leaves_particle","bleach","block_destruct","block_slide","blue_flame_particle","breaking_item_icon","breaking_item_terrain","breeze_ground_particle","breeze_wind_explosion_emitter","bubble_column_bubble","bubble_column_down_particle","bubble_column_up_particle","camera_shoot_explosion","campfire_smoke_particle","campfire_tall_smoke_particle","candle_flame_particle","cauldron_bubble_particle","cauldron_splash_particle","cauldron_spell_emitter","cherry_leaves_particle","colored_flame_particle","conduit_particle","conduit_absorb_particle","conduit_attack_emitter","creaking_crumble_body","creaking_crumble_head","creaking_heart_trail","critical_hit_emitter","crop_growth_emitter","crop_growth_area_emitter","dolphin_move_particle","dragon_breath_fire","dragon_breath_lingering","dragon_breath_trail","dragon_death_explosion_emitter","dragon_destroy_block","dragon_dying_explosion","stalactite_lava_drip_particle","stalactite_water_drip_particle","dust_plume","electric_spark_particle","enchanting_table_particle","end_chest","endrod","elephant_tooth_paste_vapor_particle","evocation_fang_particle","evoker_spell","cauldron_explosion_emitter","death_explosion_emitter","egg_destroy_emitter","eyeofender_death_explode_particle","misc_fire_vapor_particle","explosion_particle","explosion_manual","eye_of_ender_bubble_particle","eyeblossom_close","eyeblossom_open","falling_border_dust_particle","falling_dust","falling_dust_concrete_powder_particle","falling_dust_dragon_egg_particle","falling_dust_gravel_particle","falling_dust_red_sand_particle","falling_dust_sand_particle","falling_dust_scaffolding_particle","falling_dust_top_snow_particle","firefly_particle","fish_hook_particle","fish_pos_particle","geyser_base","geyser_plume","geyser_poof","glow_particle","green_flame_particle","guardian_attack_particle","guardian_water_move_particle","heart_particle","honey_drip_particle","huge_explosion_lab_misc_emitter","huge_explosion_emitter","ice_evaporation_emitter","infested_ambient","infested_emitter","ink_emitter","knockback_roar_particle","lab_table_heatblock_dust_particle","lab_table_misc_mystical_particle","large_explosion","lava_drip_particle","lava_particle","llama_spit_smoke","magic_critical_hit_emitter","magnesium_salts_emitter","mob_block_spawn_emitter","mob_portal","mobflame_emitter","mobflame_single","mobspell_emitter","mobspell_ambient","mobspell_lingering","mycelium_dust_particle","nautilus_bubbles_particle","nectar_drip_particle","note_particle","noxious_gas_particle","obsidian_glow_dust_particle","obsidian_tear_particle","ominous_spawning_particle","oozing_ambient","oozing_emitter","orange_poplar_leaves_particle","pale_oak_leaves_particle","pause_mob_growth","phantom_trail_particle","portal_directional","portal_east_west","portal_north_south","portal_reverse_particle","raid_omen_ambient","raid_omen_emitter","rain_splash_particle","red_poplar_leaves_particle","redstone_ore_dust_particle","redstone_repeater_dust_particle","redstone_torch_dust_particle","redstone_wire_dust_particle","reset_mob_growth","rising_border_dust_particle","sculk_charge_particle","sculk_charge_pop_particle","sculk_sensor_redstone_particle","sculk_soul_particle","shriek_particle","shulker_bullet","silverfish_grief_emitter","small_flame_particle","small_soul_fire_flame","smash_ground_particle","smash_ground_particle_center","sneeze","snowflake_particle","sonic_explosion","soul_particle","sparkler_emitter","splash_spell_emitter","sponge_absorb_water_particle","spore_blossom_ambient_particle","spore_blossom_shower_particle","squid_flee_particle","squid_ink_bubble","squid_move_particle","stunned_emitter","sulfur_bubble_particle","sulfur_cube_goo","totem_particle","totem_manual","trial_omen_ambient","trial_omen_emitter","trial_omen_single","trial_spawner_detection","trial_spawner_detection_ominous","underwater_torch_particle","vault_connection_particle","vibration_signal","villager_angry","villager_happy","warden_dig","water_drip_particle","water_evaporation_actor_emitter","water_evaporation_bucket_emitter","water_evaporation_manual","water_splash_particle","water_splash_particle_manual","water_wake_particle","wax_particle","weaving_ambient","weaving_emitter","white_smoke_particle","wind_charged_ambient","wind_charged_emitter","wind_explosion_emitter","witchspell_emitter","wither_boss_invulnerable","yellow_poplar_leaves_particle"];
const MC_ENT_COMP=new Set(["minecraft:absorption","minecraft:addrider","minecraft:admire_item","minecraft:ageable","minecraft:air_drag_modifier","minecraft:ambient_sound_interval","minecraft:anger_level","minecraft:angry","minecraft:annotation.break_door","minecraft:annotation.open_door","minecraft:apply_knockback_rules","minecraft:area_attack","minecraft:attack","minecraft:attack_cooldown","minecraft:attack_damage","minecraft:balloon","minecraft:balloonable","minecraft:barter","minecraft:behavior.admire_item","minecraft:behavior.aquatic_charge_attack","minecraft:behavior.avoid_block","minecraft:behavior.avoid_mob_type","minecraft:behavior.barter","minecraft:behavior.beg","minecraft:behavior.break_door","minecraft:behavior.breed","minecraft:behavior.celebrate","minecraft:behavior.celebrate_survive","minecraft:behavior.charge_attack","minecraft:behavior.charge_held_item","minecraft:behavior.circle_around_anchor","minecraft:behavior.controlled_by_player","minecraft:behavior.croak","minecraft:behavior.defend_trusted_target","minecraft:behavior.defend_village_target","minecraft:behavior.delayed_attack","minecraft:behavior.dig","minecraft:behavior.door_interact","minecraft:behavior.dragonchargeplayer","minecraft:behavior.dragondeath","minecraft:behavior.dragonflaming","minecraft:behavior.dragonholdingpattern","minecraft:behavior.dragonlanding","minecraft:behavior.dragonscanning","minecraft:behavior.dragonstrafeplayer","minecraft:behavior.dragontakeoff","minecraft:behavior.drink_milk","minecraft:behavior.drink_potion","minecraft:behavior.drop_item_for","minecraft:behavior.eat_block","minecraft:behavior.eat_carried_item","minecraft:behavior.eat_mob","minecraft:behavior.emerge","minecraft:behavior.enderman_leave_block","minecraft:behavior.enderman_take_block","minecraft:behavior.equip_item","minecraft:behavior.explore_outskirts","minecraft:behavior.fertilize_farm_block","minecraft:behavior.find_cover","minecraft:behavior.find_mount","minecraft:behavior.find_underwater_treasure","minecraft:behavior.fire_at_target","minecraft:behavior.flee_sun","minecraft:behavior.float","minecraft:behavior.float_tempt","minecraft:behavior.float_wander","minecraft:behavior.follow_caravan","minecraft:behavior.follow_mob","minecraft:behavior.follow_owner","minecraft:behavior.follow_parent","minecraft:behavior.follow_target_captain","minecraft:behavior.follow_target_leader","minecraft:behavior.go_and_give_items_to_noteblock","minecraft:behavior.go_and_give_items_to_owner","minecraft:behavior.go_home","minecraft:behavior.guardian_attack","minecraft:behavior.harvest_farm_block","minecraft:behavior.hide","minecraft:behavior.hold_ground","minecraft:behavior.hover","minecraft:behavior.hurt_by_target","minecraft:behavior.inspect_bookshelf","minecraft:behavior.investigate_suspicious_location","minecraft:behavior.jump_around_target","minecraft:behavior.jump_to_block","minecraft:behavior.knockback_roar","minecraft:behavior.lay_down","minecraft:behavior.lay_egg","minecraft:behavior.leap_at_target","minecraft:behavior.look_at_entity","minecraft:behavior.look_at_player","minecraft:behavior.look_at_target","minecraft:behavior.look_at_trading_player","minecraft:behavior.make_love","minecraft:behavior.melee_attack","minecraft:behavior.melee_box_attack","minecraft:behavior.mingle","minecraft:behavior.mount_pathing","minecraft:behavior.move_around_target","minecraft:behavior.move_indoors","minecraft:behavior.move_outdoors","minecraft:behavior.move_through_village","minecraft:behavior.move_to_block","minecraft:behavior.move_to_land","minecraft:behavior.move_to_lava","minecraft:behavior.move_to_liquid","minecraft:behavior.move_to_poi","minecraft:behavior.move_to_random_block","minecraft:behavior.move_to_village","minecraft:behavior.move_to_water","minecraft:behavior.move_towards_dwelling_restriction","minecraft:behavior.move_towards_home_restriction","minecraft:behavior.move_towards_target","minecraft:behavior.nap","minecraft:behavior.nearest_attackable_target","minecraft:behavior.nearest_prioritized_attackable_target","minecraft:behavior.ocelot_sit_on_block","minecraft:behavior.ocelotattack","minecraft:behavior.offer_flower","minecraft:behavior.open_door","minecraft:behavior.owner_hurt_by_target","minecraft:behavior.owner_hurt_target","minecraft:behavior.panic","minecraft:behavior.pet_sleep_with_owner","minecraft:behavior.pickup_items","minecraft:behavior.place_block","minecraft:behavior.play","minecraft:behavior.play_dead","minecraft:behavior.player_ride_tamed","minecraft:behavior.raid_garden","minecraft:behavior.ram_attack","minecraft:behavior.random_breach","minecraft:behavior.random_fly","minecraft:behavior.random_hover","minecraft:behavior.random_look_around","minecraft:behavior.random_look_around_and_sit","minecraft:behavior.random_search_and_dig","minecraft:behavior.random_sitting","minecraft:behavior.random_stroll","minecraft:behavior.random_swim","minecraft:behavior.ranged_attack","minecraft:behavior.receive_love","minecraft:behavior.restrict_open_door","minecraft:behavior.restrict_sun","minecraft:behavior.rise_to_liquid_level","minecraft:behavior.roar","minecraft:behavior.roll","minecraft:behavior.run_around_like_crazy","minecraft:behavior.scared","minecraft:behavior.send_event","minecraft:behavior.share_items","minecraft:behavior.silverfish_merge_with_stone","minecraft:behavior.silverfish_wake_up_friends","minecraft:behavior.skeleton_horse_trap","minecraft:behavior.sleep","minecraft:behavior.slime_attack","minecraft:behavior.slime_float","minecraft:behavior.slime_keep_on_jumping","minecraft:behavior.slime_random_direction","minecraft:behavior.snacking","minecraft:behavior.sneeze","minecraft:behavior.sniff","minecraft:behavior.sonic_boom","minecraft:behavior.squid_dive","minecraft:behavior.squid_flee","minecraft:behavior.squid_idle","minecraft:behavior.squid_move_away_from_ground","minecraft:behavior.squid_out_of_water","minecraft:behavior.stalk_and_pounce_on_target","minecraft:behavior.stay_near_noteblock","minecraft:behavior.stay_while_sitting","minecraft:behavior.stomp_attack","minecraft:behavior.stomp_turtle_egg","minecraft:behavior.stroll_towards_village","minecraft:behavior.summon_entity","minecraft:behavior.swell","minecraft:behavior.swim_idle","minecraft:behavior.swim_up_for_breath","minecraft:behavior.swim_wander","minecraft:behavior.swim_with_entity","minecraft:behavior.swoop_attack","minecraft:behavior.take_block","minecraft:behavior.take_flower","minecraft:behavior.target_when_pushed","minecraft:behavior.teleport_to_owner","minecraft:behavior.tempt","minecraft:behavior.timer_flag_1","minecraft:behavior.timer_flag_2","minecraft:behavior.timer_flag_3","minecraft:behavior.trade_interest","minecraft:behavior.trade_with_player","minecraft:behavior.transport_items","minecraft:behavior.use_kinetic_weapon","minecraft:behavior.vex_copy_owner_target","minecraft:behavior.vex_random_move","minecraft:behavior.wither_random_attack_pos_goal","minecraft:behavior.wither_target_highest_damage","minecraft:behavior.work","minecraft:behavior.work_composter","minecraft:block_climber","minecraft:block_movement_slowdown_immunity","minecraft:block_sensor","minecraft:body_rotation_always_follows_head","minecraft:body_rotation_blocked","minecraft:boostable","minecraft:boss","minecraft:bounciness","minecraft:break_blocks","minecraft:breathable","minecraft:breedable","minecraft:bribeable","minecraft:bucketable","minecraft:buoyant","minecraft:burns_in_daylight","minecraft:can_climb","minecraft:can_fly","minecraft:can_join_raid","minecraft:can_power_jump","minecraft:can_stand_on_powder_snow","minecraft:cannot_be_attacked","minecraft:celebrate_hunt","minecraft:collision_box","minecraft:color","minecraft:color2","minecraft:combat_regeneration","minecraft:conditional_bandwidth_optimization","minecraft:custom_hit_test","minecraft:damage_over_time","minecraft:damage_sensor","minecraft:dash_action","minecraft:default_look_angle","minecraft:despawn","minecraft:dimension_bound","minecraft:drying_out_timer","minecraft:dweller","minecraft:economy_trade_table","minecraft:entity_armor_equipment_slot_mapping","minecraft:entity_sensor","minecraft:environment_sensor","minecraft:equip_item","minecraft:equipment","minecraft:equippable","minecraft:exhaustion_values","minecraft:experience_reward","minecraft:explode","minecraft:fire_immune","minecraft:floats_in_liquid","minecraft:flocking","minecraft:flying_speed","minecraft:follow_range","minecraft:follow_target_captain","minecraft:free_camera_controlled","minecraft:freezing_immune","minecraft:freezing_vulnerable","minecraft:friction_modifier","minecraft:game_event_movement_tracking","minecraft:genetics","minecraft:giveable","minecraft:ground_offset","minecraft:group_size","minecraft:grows_crop","minecraft:healable","minecraft:health","minecraft:heartbeat","minecraft:hide","minecraft:home","minecraft:horse.jump_strength","minecraft:hurt_on_condition","minecraft:ignore_cannot_be_attacked","minecraft:input_ground_controlled","minecraft:inside_block_notifier","minecraft:insomnia","minecraft:instant_despawn","minecraft:interact","minecraft:inventory","minecraft:is_baby","minecraft:is_charged","minecraft:is_chested","minecraft:is_collidable","minecraft:is_dyeable","minecraft:is_hidden_when_invisible","minecraft:is_ignited","minecraft:is_illager_captain","minecraft:is_pregnant","minecraft:is_saddled","minecraft:is_shaking","minecraft:is_sheared","minecraft:is_stackable","minecraft:is_stunned","minecraft:is_tamed","minecraft:item_controllable","minecraft:item_hopper","minecraft:jump.dynamic","minecraft:jump.static","minecraft:knockback_resistance","minecraft:lava_movement","minecraft:leashable","minecraft:leashable_to","minecraft:looked_at","minecraft:loot","minecraft:luck","minecraft:managed_wandering_trader","minecraft:mark_variant","minecraft:memory_behavior.flee_threat","minecraft:memory_behavior.follow_target","minecraft:memory_sensor.game_event","minecraft:memory_sensor.in_range_of_entity","minecraft:mob_effect","minecraft:mob_effect_immunity","minecraft:movement","minecraft:movement.amphibious","minecraft:movement.basic","minecraft:movement.dolphin","minecraft:movement.fly","minecraft:movement.generic","minecraft:movement.glide","minecraft:movement.hover","minecraft:movement.jump","minecraft:movement.skip","minecraft:movement.sway","minecraft:movement_sound_distance_offset","minecraft:nameable","minecraft:navigation.climb","minecraft:navigation.float","minecraft:navigation.fly","minecraft:navigation.generic","minecraft:navigation.hover","minecraft:navigation.swim","minecraft:navigation.walk","minecraft:not_pickable_from_inside","minecraft:npc","minecraft:offspring","minecraft:on_death","minecraft:on_equipment_changed","minecraft:on_friendly_anger","minecraft:on_hurt","minecraft:on_hurt_by_player","minecraft:on_ignite","minecraft:on_start_landing","minecraft:on_start_takeoff","minecraft:on_target_acquired","minecraft:on_target_escape","minecraft:on_wake_with_owner","minecraft:out_of_control","minecraft:peek","minecraft:persistent","minecraft:physics","minecraft:player.exhaustion","minecraft:player.experience","minecraft:player.hunger","minecraft:player.level","minecraft:player.saturation","minecraft:preferred_path","minecraft:projectile","minecraft:push_through","minecraft:pushable","minecraft:pushable_by_block","minecraft:pushable_by_entity","minecraft:raid_trigger","minecraft:rail_movement","minecraft:rail_sensor","minecraft:ravager_blocked","minecraft:reflect_projectiles","minecraft:renders_when_invisible","minecraft:rideable","minecraft:rotation_axis_aligned","minecraft:rotation_locked_to_vehicle","minecraft:scale","minecraft:scale_by_age","minecraft:scheduler","minecraft:shareables","minecraft:shooter","minecraft:sittable","minecraft:skin_id","minecraft:sound_volume","minecraft:spawn_egg_interaction","minecraft:spawn_entity","minecraft:spawn_on_death","minecraft:spell_effects","minecraft:strength","minecraft:suspect_tracking","minecraft:tameable","minecraft:tamemount","minecraft:target_nearby_sensor","minecraft:teleport","minecraft:tick_world","minecraft:timer","minecraft:trade_resupply","minecraft:trade_table","minecraft:trail","minecraft:transformation","minecraft:transient","minecraft:trust","minecraft:trusting","minecraft:type_family","minecraft:underwater_mount_breathing","minecraft:underwater_movement","minecraft:uses_legacy_ambient_sounds","minecraft:uses_legacy_friction","minecraft:uses_uniform_air_drag","minecraft:variable_max_auto_step","minecraft:variant","minecraft:vertical_movement_action","minecraft:vibration_damper","minecraft:vibration_listener","minecraft:walk_animation_speed","minecraft:wants_jockey","minecraft:water_movement","minecraft:wither_target_highest_damage"]);
const SOLO_RP_VAN=["minecraft:geometry","minecraft:skin_id","minecraft:animation_controller","minecraft:animations","minecraft:render_controller","minecraft:material","minecraft:variant_texture"];
const MC_VANILLA_J={"minecraft:cow":{"format_version":"1.26.10","minecraft:entity":{"description":{"identifier":"minecraft:cow","spawn_category":"creature","is_spawnable":true,"is_summonable":true,"properties":{"minecraft:climate_variant":{"type":"enum","values":["temperate","warm","cold"],"default":"temperate","client_sync":true},"minecraft:sound_variant":{"type":"enum","values":["default","moody"],"default":"default","client_sync":true}}},"component_groups":{"minecraft:cow_baby":{"minecraft:is_baby":{},"minecraft:scale":{"value":0.5},"minecraft:ageable":{"duration":1200,"feed_items":"wheat","pause_growth_items":["golden_dandelion"],"reset_growth_items":["golden_dandelion"],"grow_up":{"event":"minecraft:ageable_grow_up","target":"self"}},"minecraft:rideable":{"seat_count":1,"family_types":["baby_undead"],"seats":{"position":[0.0,1.0,0.0]}},"minecraft:behavior.follow_parent":{"priority":6,"speed_multiplier":1.1}},"minecraft:cow_adult":{"minecraft:leashable_to":{},"minecraft:experience_reward":{"on_bred":"Math.Random(1,7)","on_death":"query.last_hit_by_player ? Math.Random(1,3) : 0"},"minecraft:loot":{"table":"loot_tables/entities/cow.json"},"minecraft:rideable":{"seat_count":1,"family_types":["baby_undead"],"seats":{"position":[0.0,1.15,0.0]}},"minecraft:behavior.breed":{"priority":3,"speed_multiplier":1.0},"minecraft:breedable":{"require_tame":false,"breed_items":["wheat"],"breeds_with":{"minecraft:cow":{}}},"minecraft:interact":{"interactions":[{"on_interact":{"filters":{"all_of":[{"test":"is_family","subject":"other","value":"player"},{"test":"has_equipment","domain":"hand","subject":"other","value":"bucket:0"}]}},"use_item":true,"swing":true,"transform_to_item":"bucket:1","play_sounds":"milk","interact_text":"action.interact.milk"}]}}},"components":{"minecraft:offspring":{"offspring_pairs":{"minecraft:cow":"minecraft:cow"},"property_inheritance":{"minecraft:climate_variant":{}}},"minecraft:spawn_egg_interaction":{},"minecraft:is_hidden_when_invisible":{},"minecraft:type_family":{"family":["cow","mob"]},"minecraft:breathable":{"total_supply":15,"suffocate_time":0},"minecraft:navigation.walk":{"can_path_over_water":true,"avoid_water":true,"avoid_damage_blocks":true},"minecraft:movement.basic":{},"minecraft:jump.static":{},"minecraft:can_climb":{},"minecraft:collision_box":{"width":0.9,"height":1.3},"minecraft:nameable":{},"minecraft:health":{"value":10,"max":10},"minecraft:hurt_on_condition":{"damage_conditions":[{"filters":{"test":"in_lava","subject":"self","operator":"==","value":true},"cause":"lava","damage_per_tick":4}]},"minecraft:movement":{"value":0.25},"minecraft:despawn":{"despawn_from_distance":{}},"minecraft:behavior.float":{"priority":0},"minecraft:behavior.panic":{"priority":1,"speed_multiplier":1.25},"minecraft:behavior.mount_pathing":{"priority":2,"speed_multiplier":1.5,"target_dist":0.0,"track_target":true},"minecraft:behavior.breed":{"priority":3,"speed_multiplier":1.0},"minecraft:behavior.tempt":{"priority":4,"speed_multiplier":1.25,"items":["wheat"]},"minecraft:behavior.follow_parent":{"priority":5,"speed_multiplier":1.1},"minecraft:behavior.random_stroll":{"priority":6,"speed_multiplier":0.8},"minecraft:behavior.look_at_player":{"priority":7,"look_distance":6.0,"probability":0.02},"minecraft:behavior.random_look_around":{"priority":9},"minecraft:leashable":{},"minecraft:balloonable":{},"minecraft:physics":{},"minecraft:pushable_by_entity":{},"minecraft:pushable_by_block":{},"minecraft:conditional_bandwidth_optimization":{}},"events":{"minecraft:entity_spawned":{"sequence":[{"randomize":[{"weight":95,"trigger":"minecraft:spawn_adult"},{"weight":5,"add":{"component_groups":["minecraft:cow_baby"]}}]},{"first_valid":[{"filters":{"test":"has_biome_tag","value":"spawns_warm_variant_farm_animals"},"set_property":{"minecraft:climate_variant":"warm"}},{"filters":{"test":"has_biome_tag","value":"spawns_cold_variant_farm_animals"},"set_property":{"minecraft:climate_variant":"cold"}}]}]},"minecraft:entity_born":{"add":{"component_groups":["minecraft:cow_baby"]},"trigger":"minecraft:randomize_sound_variant"},"minecraft:entity_transformed":{"remove":{},"add":{"component_groups":["minecraft:cow_adult"]}},"minecraft:ageable_grow_up":{"remove":{"component_groups":["minecraft:cow_baby"]},"add":{"component_groups":["minecraft:cow_adult"]}},"minecraft:spawn_adult":{"add":{"component_groups":["minecraft:cow_adult"]},"trigger":"minecraft:randomize_sound_variant"},"minecraft:randomize_sound_variant":{"randomize":[{"weight":1,"set_property":{"minecraft:sound_variant":"default"}},{"weight":1,"set_property":{"minecraft:sound_variant":"moody"}}]}}}},"minecraft:pig":{"format_version":"1.26.50","minecraft:entity":{"description":{"identifier":"minecraft:pig","spawn_category":"creature","is_spawnable":true,"is_summonable":true,"properties":{"minecraft:climate_variant":{"type":"enum","values":["temperate","warm","cold"],"default":"temperate","client_sync":true},"minecraft:sound_variant":{"type":"enum","values":["default","big","mini"],"default":"default","client_sync":true}}},"component_groups":{"minecraft:pig_baby":{"minecraft:is_baby":{},"minecraft:scale":{"value":0.5},"minecraft:ageable":{"duration":1200,"feed_items":["carrot","beetroot","potato"],"pause_growth_items":["golden_dandelion"],"reset_growth_items":["golden_dandelion"],"grow_up":{"event":"minecraft:ageable_grow_up","target":"self"}},"minecraft:behavior.follow_parent":{"priority":6,"speed_multiplier":1.1}},"minecraft:pig_transform":{"minecraft:transformation":{"into":"minecraft:pig_zombie","transformation_sound":"mob.pig.death","delay":0.5}},"minecraft:pig_adult":{"minecraft:experience_reward":{"on_bred":"Math.Random(1,7)","on_death":"query.last_hit_by_player ? Math.Random(1,3) : 0"},"minecraft:loot":{"table":"loot_tables/entities/pig.json"},"minecraft:leashable_to":{},"minecraft:behavior.breed":{"priority":4,"speed_multiplier":1.0},"minecraft:breedable":{"require_tame":false,"breeds_with":{"minecraft:pig":{}},"breed_items":["carrot","beetroot","potato"]}},"minecraft:pig_unsaddled":{"minecraft:interact":{"interactions":[{"on_interact":{"filters":{"test":"has_equipment","subject":"other","domain":"hand","value":"saddle"},"event":"minecraft:on_saddled"},"use_item":true,"swing":true,"play_sounds":["saddle"],"interact_text":"action.interact.saddle"}]},"minecraft:rideable":{"seat_count":1,"family_types":["baby_undead"],"seats":{"position":[0.0,0.7,0.0]}}},"minecraft:pig_saddled":{"minecraft:is_saddled":{},"minecraft:loot":{"table":"loot_tables/entities/pig_saddled.json"},"minecraft:interact":{"interactions":[{"on_interact":{"filters":{"all_of":[{"test":"is_sneak_held","subject":"other","value":false},{"test":"has_equipment","subject":"other","domain":"hand","value":"shears"},{"test":"rider_count","subject":"self","operator":"equals","value":0}]},"event":"minecraft:on_unsaddled"},"hurt_item":1,"spawn_items":{"table":"loot_tables/entities/saddle.json"},"interact_text":"action.interact.removesaddle","play_sounds":["unsaddle"],"vibration":"shear"}]},"minecraft:boostable":{"speed_multiplier":1.35,"duration":3.0,"boost_items":[{"item":"carrotOnAStick","damage":2,"replace_item":"fishing_rod"}]},"minecraft:rideable":{"seat_count":1,"interact_text":"action.interact.ride.horse","family_types":["player"],"seats":{"position":[0.0,0.63,0.0]}},"minecraft:item_controllable":{"control_items":"carrotOnAStick"},"minecraft:behavior.controlled_by_player":{"priority":0}}},"components":{"minecraft:ambient_sound_interval":{"event_name":"ambient","event_names":[{"condition":"query.is_baby","event_name":"ambient.baby"}],"range":16.0,"value":6.0},"minecraft:is_hidden_when_invisible":{},"minecraft:damage_sensor":{"triggers":{"on_damage":{"filters":[{"test":"is_family","subject":"other","value":"lightning"},{"test":"is_difficulty","operator":"!=","value":"peaceful"}],"event":"become_zombie"},"deals_damage":"no"}},"minecraft:type_family":{"family":["pig","mob"]},"minecraft:breathable":{"total_supply":15,"suffocate_time":0},"minecraft:nameable":{},"minecraft:offspring":{"offspring_pairs":{"minecraft:pig":"minecraft:pig"},"property_inheritance":{"minecraft:climate_variant":{}}},"minecraft:spawn_egg_interaction":{},"minecraft:health":{"value":10,"max":10},"minecraft:hurt_on_condition":{"damage_conditions":[{"filters":{"test":"in_lava","subject":"self"},"cause":"lava","damage_per_tick":4}]},"minecraft:movement":{"value":0.25},"minecraft:navigation.walk":{"can_path_over_water":true,"avoid_water":true,"avoid_damage_blocks":true,"using_door_annotation":true},"minecraft:movement.basic":{},"minecraft:jump.static":{},"minecraft:can_climb":{},"minecraft:collision_box":{"width":0.9,"height":0.9},"minecraft:leashable":{},"minecraft:balloonable":{"mass":0.9},"minecraft:despawn":{"despawn_from_distance":{}},"minecraft:behavior.mount_pathing":{"priority":1,"speed_multiplier":1.25,"target_dist":0.0,"track_target":true},"minecraft:behavior.float":{"priority":2},"minecraft:behavior.panic":{"priority":3,"speed_multiplier":1.25},"minecraft:behavior.tempt":{"priority":5,"speed_multiplier":1.2,"items":["potato","carrot","beetroot","carrotOnAStick"]},"minecraft:behavior.random_stroll":{"priority":7,"speed_multiplier":1.0},"minecraft:behavior.look_at_player":{"priority":8,"look_distance":6.0,"probability":0.02},"minecraft:behavior.random_look_around":{"priority":9},"minecraft:physics":{},"minecraft:pushable_by_entity":{"presets":[{"filters":{"all_of":[{"test":"is_family","subject":"other","value":"sulfur_cube"},{"test":"enum_property","subject":"other","domain":"minecraft:sulfur_cube_archetype","operator":"not","value":"none"},{"test":"is_controlling_passenger_family","subject":"self","value":"player"}]},"push_mode":"none","require_collision_overlap":false}]},"minecraft:pushable_by_block":{},"minecraft:conditional_bandwidth_optimization":{}},"events":{"become_zombie":{"add":{"component_groups":["minecraft:pig_transform"]}},"minecraft:entity_spawned":{"sequence":[{"randomize":[{"weight":95,"trigger":"minecraft:spawn_adult"},{"weight":5,"add":{"component_groups":["minecraft:pig_baby"]}}]},{"first_valid":[{"filters":{"test":"has_biome_tag","value":"spawns_warm_variant_farm_animals"},"set_property":{"minecraft:climate_variant":"warm"}},{"filters":{"test":"has_biome_tag","value":"spawns_cold_variant_farm_animals"},"set_property":{"minecraft:climate_variant":"cold"}}]}]},"minecraft:entity_born":{"remove":{},"add":{"component_groups":["minecraft:pig_baby"]},"trigger":"minecraft:randomize_sound_variant"},"minecraft:ageable_grow_up":{"remove":{"component_groups":["minecraft:pig_baby"]},"add":{"component_groups":["minecraft:pig_adult","minecraft:pig_unsaddled"]}},"minecraft:on_saddled":{"remove":{"component_groups":["minecraft:pig_unsaddled"]},"add":{"component_groups":["minecraft:pig_saddled"]}},"minecraft:on_unsaddled":{"remove":{"component_groups":["minecraft:pig_saddled"]},"add":{"component_groups":["minecraft:pig_unsaddled"]}},"minecraft:spawn_adult":{"add":{"component_groups":["minecraft:pig_adult","minecraft:pig_unsaddled"]},"trigger":"minecraft:randomize_sound_variant"},"minecraft:randomize_sound_variant":{"randomize":[{"weight":1,"set_property":{"minecraft:sound_variant":"default"}},{"weight":1,"set_property":{"minecraft:sound_variant":"big"}},{"weight":1,"set_property":{"minecraft:sound_variant":"mini"}}]}}}},"minecraft:sheep":{"format_version":"1.26.60","minecraft:entity":{"description":{"identifier":"minecraft:sheep","spawn_category":"creature","is_spawnable":true,"is_summonable":true},"component_groups":{"minecraft:loot_sheared":{"minecraft:loot":{"table":"loot_tables/entities/sheep_sheared.json"}},"minecraft:loot_wooly":{"minecraft:loot":{"table":"loot_tables/entities/sheep.json"}},"minecraft:rideable_sheared":{"minecraft:rideable":{"seat_count":1,"family_types":["baby_undead"],"seats":[{"position":[0.0,0.9,0.0]}]}},"minecraft:rideable_wooly":{"minecraft:rideable":{"seat_count":1,"family_types":["baby_undead"],"seats":[{"position":[0.0,0.975,0.0]}]}},"minecraft:sheep_baby":{"minecraft:is_baby":{},"minecraft:scale":{"value":0.5},"minecraft:ageable":{"duration":1200,"feed_items":"wheat","pause_growth_items":["golden_dandelion"],"reset_growth_items":["golden_dandelion"],"grow_up":{"event":"minecraft:ageable_grow_up","target":"self"}},"minecraft:behavior.follow_parent":{"priority":6,"speed_multiplier":1.1},"minecraft:rideable":{"seat_count":1,"family_types":["baby_undead"],"seats":[{"position":[0.0,0.7,-0.3]}]}},"minecraft:sheep_adult":{"minecraft:experience_reward":{"on_bred":"Math.Random(1,7)","on_death":"query.last_hit_by_player ? Math.Random(1,3) : 0"},"minecraft:leashable_to":{},"minecraft:behavior.breed":{"priority":3,"speed_multiplier":1.0},"minecraft:breedable":{"require_tame":false,"breeds_with":{"minecraft:sheep":{}},"breed_items":["wheat"]}},"minecraft:sheep_dyeable":{"minecraft:is_dyeable":{"interact_text":"action.interact.dye"}},"minecraft:sheep_sheared":{"minecraft:is_sheared":{}},"minecraft:sheep_white":{"minecraft:color":{"value":0}},"minecraft:sheep_brown":{"minecraft:color":{"value":12}},"minecraft:sheep_black":{"minecraft:color":{"value":15}},"minecraft:sheep_gray":{"minecraft:color":{"value":7}},"minecraft:sheep_light_gray":{"minecraft:color":{"value":8}},"minecraft:sheep_pink":{"minecraft:color":{"value":6}},"minecraft:sheep_red":{"minecraft:color":{"value":14}},"minecraft:sheep_blue":{"minecraft:color":{"value":11}},"minecraft:sheep_light_blue":{"minecraft:color":{"value":3}},"minecraft:sheep_cyan":{"minecraft:color":{"value":9}},"minecraft:sheep_orange":{"minecraft:color":{"value":1}},"minecraft:sheep_yellow":{"minecraft:color":{"value":4}}},"components":{"minecraft:offspring":{"offspring_pairs":{"minecraft:sheep":"minecraft:sheep"},"combine_parent_colors":true},"minecraft:spawn_egg_interaction":{},"minecraft:is_hidden_when_invisible":{},"minecraft:type_family":{"family":["sheep","mob"]},"minecraft:breathable":{"total_supply":15,"suffocate_time":0},"minecraft:collision_box":{"width":0.9,"height":1.3},"minecraft:nameable":{},"minecraft:health":{"value":8,"max":8},"minecraft:hurt_on_condition":{"damage_conditions":[{"filters":{"test":"in_lava","subject":"self","operator":"==","value":true},"cause":"lava","damage_per_tick":4}]},"minecraft:movement":{"value":0.25},"minecraft:navigation.walk":{"can_path_over_water":true,"avoid_water":true},"minecraft:movement.basic":{},"minecraft:jump.static":{},"minecraft:can_climb":{},"minecraft:interact":{"interactions":[{"cooldown":2.5,"use_item":false,"swing":true,"hurt_item":1,"spawn_items":{"table":"loot_tables/entities/sheep_shear.json"},"play_sounds":["shear"],"interact_text":"action.interact.shear","vibration":"shear","on_interact":{"filters":{"all_of":[{"test":"has_equipment","subject":"other","domain":"hand","value":"shears"},{"test":"is_family","subject":"other","value":"player"},{"test":"has_component","operator":"!=","value":"minecraft:is_baby"},{"test":"has_component","value":"minecraft:is_dyeable"}]},"event":"minecraft:on_sheared","target":"self"}}]},"minecraft:leashable":{},"minecraft:balloonable":{"mass":0.75},"minecraft:despawn":{"despawn_from_distance":{}},"minecraft:behavior.float":{"priority":0},"minecraft:behavior.panic":{"priority":1,"speed_multiplier":1.25},"minecraft:behavior.mount_pathing":{"priority":2,"speed_multiplier":1.5,"target_dist":0.0,"track_target":true},"minecraft:behavior.tempt":{"priority":4,"speed_multiplier":1.25,"items":["wheat"]},"minecraft:behavior.follow_parent":{"priority":5,"speed_multiplier":1.1},"minecraft:behavior.eat_block":{"priority":6,"success_chance":"query.is_baby ? 0.02 : 0.001","time_until_eat":1.8,"eat_and_replace_block_pairs":[{"eat_block":"grass","replace_block":"dirt"},{"eat_block":"tallgrass","replace_block":"air"},{"eat_block":"short_dry_grass","replace_block":"air"},{"eat_block":"tall_dry_grass","replace_block":"air"}],"on_eat":{"event":"minecraft:on_eat_block","target":"self"}},"minecraft:behavior.random_stroll":{"priority":7,"speed_multiplier":0.8},"minecraft:behavior.look_at_player":{"priority":8,"look_distance":6.0,"probability":0.02},"minecraft:behavior.random_look_around":{"priority":9},"minecraft:physics":{},"minecraft:pushable_by_entity":{},"minecraft:pushable_by_block":{},"minecraft:conditional_bandwidth_optimization":{}},"events":{"minecraft:entity_spawned":{"sequence":[{"randomize":[{"weight":95,"remove":{},"trigger":"spawn_adult"},{"weight":5,"remove":{},"trigger":"spawn_baby"}]},{"first_valid":[{"filters":{"test":"has_biome_tag","value":"spawns_cold_variant_farm_animals"},"trigger":"minecraft:cold_color"},{"filters":{"test":"has_biome_tag","value":"spawns_warm_variant_farm_animals"},"trigger":"minecraft:warm_color"},{"trigger":"minecraft:temperate_color"}]}]},"spawn_adult":{"add":{"component_groups":["minecraft:sheep_adult","minecraft:sheep_dyeable","minecraft:rideable_wooly","minecraft:loot_wooly"]}},"spawn_baby":{"add":{"component_groups":["minecraft:sheep_baby","minecraft:sheep_dyeable"]}},"minecraft:entity_born":{"remove":{},"add":{"component_groups":["minecraft:sheep_baby","minecraft:sheep_dyeable","minecraft:sheep_white"]}},"minecraft:ageable_grow_up":{"remove":{"component_groups":["minecraft:sheep_baby"]},"add":{"component_groups":["minecraft:sheep_adult","minecraft:rideable_wooly","minecraft:loot_wooly"]}},"minecraft:on_sheared":{"remove":{"component_groups":["minecraft:sheep_dyeable","minecraft:loot_wooly"]},"add":{"component_groups":["minecraft:sheep_sheared","minecraft:rideable_sheared","minecraft:loot_sheared"]}},"minecraft:on_eat_block":{"sequence":[{"remove":{"component_groups":["minecraft:sheep_sheared"]},"add":{"component_groups":["minecraft:sheep_dyeable"]}},{"filters":{"subject":"self","test":"has_component","operator":"!=","value":"minecraft:is_baby"},"add":{"component_groups":["minecraft:rideable_wooly","minecraft:loot_wooly"]},"remove":{"component_groups":["minecraft:loot_sheared"]}}]},"wololo":{"add":{"component_groups":["minecraft:sheep_red"]}},"minecraft:temperate_color":{"randomize":[{"weight":81836,"add":{"component_groups":["minecraft:sheep_white"]}},{"weight":5000,"add":{"component_groups":["minecraft:sheep_black"]}},{"weight":5000,"add":{"component_groups":["minecraft:sheep_light_gray"]}},{"weight":5000,"add":{"component_groups":["minecraft:sheep_gray"]}},{"weight":3000,"add":{"component_groups":["minecraft:sheep_brown"]}},{"weight":164,"add":{"component_groups":["minecraft:sheep_pink"]}}]},"minecraft:cold_color":{"randomize":[{"weight":81836,"add":{"component_groups":["minecraft:sheep_black"]}},{"weight":5000,"add":{"component_groups":["minecraft:sheep_light_gray"]}},{"weight":5000,"add":{"component_groups":["minecraft:sheep_gray"]}},{"weight":5000,"add":{"component_groups":["minecraft:sheep_white"]}},{"weight":3000,"add":{"component_groups":["minecraft:sheep_brown"]}},{"weight":164,"add":{"component_groups":["minecraft:sheep_pink"]}}]},"minecraft:warm_color":{"randomize":[{"weight":81836,"add":{"component_groups":["minecraft:sheep_brown"]}},{"weight":5000,"add":{"component_groups":["minecraft:sheep_gray"]}},{"weight":5000,"add":{"component_groups":["minecraft:sheep_light_gray"]}},{"weight":5000,"add":{"component_groups":["minecraft:sheep_white"]}},{"weight":3000,"add":{"component_groups":["minecraft:sheep_black"]}},{"weight":164,"add":{"component_groups":["minecraft:sheep_pink"]}}]}}}},"minecraft:chicken":{"format_version":"1.26.50","minecraft:entity":{"description":{"identifier":"minecraft:chicken","spawn_category":"creature","is_spawnable":true,"is_summonable":true,"properties":{"minecraft:climate_variant":{"type":"enum","values":["temperate","warm","cold"],"default":"temperate","client_sync":true},"minecraft:sound_variant":{"type":"enum","values":["default","picky"],"default":"default","client_sync":true}}},"component_groups":{"minecraft:chicken_baby":{"minecraft:is_baby":{},"minecraft:scale":{"value":0.5},"minecraft:ageable":{"duration":1200,"feed_items":["wheat_seeds","beetroot_seeds","melon_seeds","pumpkin_seeds","pitcher_pod","torchflower_seeds"],"pause_growth_items":["golden_dandelion"],"reset_growth_items":["golden_dandelion"],"grow_up":{"event":"minecraft:ageable_grow_up","target":"self"}},"minecraft:behavior.follow_parent":{"priority":5,"speed_multiplier":1.1}},"minecraft:chicken_adult":{"minecraft:experience_reward":{"on_bred":"Math.Random(1,7)","on_death":"query.last_hit_by_player ? Math.Random(1,3) : 0"},"minecraft:loot":{"table":"loot_tables/entities/chicken.json"},"minecraft:leashable_to":{"unleash_on_removal":false},"minecraft:breedable":{"require_tame":false,"breeds_with":{"minecraft:chicken":{}},"breed_items":["wheat_seeds","beetroot_seeds","melon_seeds","pumpkin_seeds","pitcher_pod","torchflower_seeds"]},"minecraft:behavior.breed":{"priority":3,"speed_multiplier":1.0},"minecraft:rideable":{"seat_count":1,"family_types":["baby_undead"],"seats":{"position":[0.0,0.48,0.0]}},"minecraft:spawn_entity":{"entities":[{"min_wait_time":300,"max_wait_time":600,"spawn_sound":"plop","spawn_item":"egg","filters":[{"test":"rider_count","subject":"self","operator":"==","value":0},{"test":"enum_property","subject":"self","domain":"minecraft:climate_variant","value":"temperate"}]},{"min_wait_time":300,"max_wait_time":600,"spawn_sound":"plop","spawn_item":"brown_egg","filters":[{"test":"rider_count","subject":"self","operator":"==","value":0},{"test":"enum_property","subject":"self","domain":"minecraft:climate_variant","value":"warm"}]},{"min_wait_time":300,"max_wait_time":600,"spawn_sound":"plop","spawn_item":"blue_egg","filters":[{"test":"rider_count","subject":"self","operator":"==","value":0},{"test":"enum_property","subject":"self","domain":"minecraft:climate_variant","value":"cold"}]}]}}},"components":{"minecraft:ambient_sound_interval":{"event_name":"ambient","event_names":[{"condition":"query.is_baby","event_name":"ambient.baby"}],"range":16.0,"value":6.0},"minecraft:offspring":{"offspring_pairs":{"minecraft:chicken":"minecraft:chicken"},"property_inheritance":{"minecraft:climate_variant":{}}},"minecraft:spawn_egg_interaction":{},"minecraft:is_hidden_when_invisible":{},"minecraft:type_family":{"family":["chicken","mob"]},"minecraft:breathable":{"total_supply":15,"suffocate_time":0},"minecraft:collision_box":{"width":0.6,"height":0.8},"minecraft:nameable":{},"minecraft:health":{"value":4,"max":4},"minecraft:hurt_on_condition":{"damage_conditions":[{"filters":{"test":"in_lava","subject":"self","operator":"==","value":true},"cause":"lava","damage_per_tick":4}]},"minecraft:movement":{"value":0.25},"minecraft:damage_sensor":{"triggers":{"cause":"fall","deals_damage":"no"}},"minecraft:leashable":{"unleash_on_removal":false},"minecraft:balloonable":{"mass":0.5},"minecraft:navigation.walk":{"can_path_over_water":true,"avoid_damage_blocks":true,"using_door_annotation":true},"minecraft:movement.basic":{},"minecraft:jump.static":{},"minecraft:can_climb":{},"minecraft:despawn":{"despawn_from_distance":{}},"minecraft:behavior.float":{"priority":0},"minecraft:behavior.panic":{"priority":1,"speed_multiplier":1.5},"minecraft:behavior.mount_pathing":{"priority":2,"speed_multiplier":1.5,"target_dist":0.0,"track_target":true},"minecraft:behavior.tempt":{"priority":4,"speed_multiplier":1.0,"items":["wheat_seeds","beetroot_seeds","melon_seeds","pumpkin_seeds","pitcher_pod","torchflower_seeds"]},"minecraft:behavior.random_stroll":{"priority":6,"speed_multiplier":1.0},"minecraft:behavior.look_at_player":{"priority":7,"look_distance":6.0,"probability":0.02},"minecraft:behavior.random_look_around":{"priority":8},"minecraft:physics":{},"minecraft:pushable_by_entity":{},"minecraft:pushable_by_block":{},"minecraft:conditional_bandwidth_optimization":{},"minecraft:game_event_movement_tracking":{"emit_flap":true},"minecraft:uses_legacy_friction":{}},"events":{"minecraft:entity_spawned":{"sequence":[{"randomize":[{"weight":95,"trigger":"minecraft:spawn_adult"},{"weight":5,"add":{"component_groups":["minecraft:chicken_baby"]}}]},{"first_valid":[{"filters":{"test":"has_biome_tag","value":"spawns_warm_variant_farm_animals"},"set_property":{"minecraft:climate_variant":"warm"}},{"filters":{"test":"has_biome_tag","value":"spawns_cold_variant_farm_animals"},"set_property":{"minecraft:climate_variant":"cold"}}]}]},"minecraft:entity_born":{"remove":{},"add":{"component_groups":["minecraft:chicken_baby"]},"trigger":"minecraft:randomize_sound_variant"},"minecraft:ageable_grow_up":{"remove":{"component_groups":["minecraft:chicken_baby"]},"add":{"component_groups":["minecraft:chicken_adult"]}},"minecraft:spawn_adult":{"add":{"component_groups":["minecraft:chicken_adult"]},"trigger":"minecraft:randomize_sound_variant"},"minecraft:hatch_warm":{"set_property":{"minecraft:climate_variant":"warm"}},"minecraft:hatch_cold":{"set_property":{"minecraft:climate_variant":"cold"}},"minecraft:randomize_sound_variant":{"randomize":[{"weight":1,"set_property":{"minecraft:sound_variant":"default"}},{"weight":1,"set_property":{"minecraft:sound_variant":"picky"}}]}}}},"minecraft:wolf":{"format_version":"1.26.50","minecraft:entity":{"description":{"identifier":"minecraft:wolf","spawn_category":"creature","is_spawnable":true,"is_summonable":true,"properties":{"minecraft:is_armorable":{"type":"bool","client_sync":false,"default":false},"minecraft:has_increased_max_health":{"type":"bool","client_sync":false,"default":false},"minecraft:sound_variant":{"type":"enum","values":["default","big","cute","grumpy","mad","puglin","sad"],"default":"default","client_sync":true},"minecraft:was_upgraded_to_1_21_100":{"type":"bool","client_sync":false,"default":false}}},"component_groups":{"minecraft:wolf_baby":{"minecraft:is_baby":{},"minecraft:scale":{"value":0.5},"minecraft:ageable":{"duration":1200,"feed_items":["chicken","cooked_chicken","beef","cooked_beef","muttonRaw","muttonCooked","porkchop","cooked_porkchop","rabbit","cooked_rabbit","rotten_flesh"],"pause_growth_items":["golden_dandelion"],"reset_growth_items":["golden_dandelion"],"grow_up":{"event":"minecraft:ageable_grow_up","target":"self"}},"minecraft:behavior.panic":{"priority":1,"speed_multiplier":1.25}},"minecraft:wolf_adult":{"minecraft:experience_reward":{"on_bred":"Math.Random(1,7)","on_death":"query.last_hit_by_player ? Math.Random(1,3) : 0"},"minecraft:loot":{"table":"loot_tables/entities/wolf.json"},"minecraft:leashable_to":{"unleash_on_removal":false},"minecraft:breedable":{"require_tame":true,"require_full_health":true,"breeds_with":{"minecraft:wolf":{}},"breed_items":["chicken","cooked_chicken","beef","cooked_beef","muttonRaw","muttonCooked","porkchop","cooked_porkchop","rabbit","cooked_rabbit","rotten_flesh"]}},"minecraft:wolf_angry":{"minecraft:angry":{"duration":25,"broadcast_anger":true,"broadcast_range":20,"broadcast_anger_when_dying":false,"calm_event":{"event":"minecraft:on_calm","target":"self"}},"minecraft:on_target_acquired":{},"minecraft:rideable":{"seat_count":1,"family_types":["baby_undead"],"seats":{"position":[0.0,0.625,-0.1]}}},"minecraft:wolf_wild":{"minecraft:behavior.avoid_mob_type":{"priority":3,"entity_types":[{"filters":{"test":"is_family","subject":"other","value":"llama"},"max_dist":24,"walk_speed_multiplier":1.5,"sprint_speed_multiplier":1.5}],"probability_per_strength":0.14},"minecraft:tameable":{"probability":0.33,"tame_items":"bone","tame_event":{"event":"minecraft:on_tame","target":"self"}},"minecraft:behavior.nearest_attackable_target":{"priority":4,"reselect_targets":true,"must_see":true,"entity_types":[{"filters":{"any_of":[{"test":"is_family","subject":"other","value":"skeleton"},{"test":"is_family","subject":"other","value":"sheep"},{"test":"is_family","subject":"other","value":"rabbit"},{"test":"is_family","subject":"other","value":"fox"}]},"max_dist":16},{"filters":{"all_of":[{"test":"is_family","subject":"other","value":"baby_turtle"},{"test":"in_water","subject":"other","operator":"!=","value":true}]},"max_dist":16},{"filters":{"all_of":[{"test":"is_family","subject":"other","value":"skeleton"},{"test":"is_underwater","subject":"other","operator":"!=","value":true}]},"max_dist":16}]},"minecraft:on_target_acquired":{"event":"minecraft:become_angry","target":"self"},"minecraft:rideable":{"seat_count":1,"family_types":["baby_undead"],"seats":{"position":[0.0,0.625,-0.1]}}},"minecraft:wolf_increased_max_health":{"minecraft:health":{"value":40,"max":40}},"minecraft:on_tame_collar_color":{"minecraft:color":{"value":14}},"minecraft:wolf_tame":{"minecraft:is_tamed":{},"minecraft:attack":{"damage":4},"minecraft:behavior.teleport_to_owner":{"priority":1,"filters":{"any_of":[{"all_of":[{"test":"owner_distance","operator":">","value":12},{"test":"is_panicking"}]},{"all_of":[{"test":"owner_distance","operator":">","value":24},{"test":"has_target"}]}]}},"minecraft:behavior.owner_hurt_by_target":{"priority":1},"minecraft:behavior.breed":{"priority":2,"speed_multiplier":1.0},"minecraft:behavior.owner_hurt_target":{"priority":2},"minecraft:behavior.nearest_attackable_target":{"priority":5,"must_see":true,"entity_types":[{"filters":{"test":"is_family","subject":"other","value":"skeleton"},"max_dist":16}]},"minecraft:behavior.follow_owner":{"priority":6,"speed_multiplier":1.0,"start_distance":10,"stop_distance":2,"post_teleport_distance":-1,"ignore_vibration":true},"minecraft:sittable":{},"minecraft:is_dyeable":{"interact_text":"action.interact.dye"}},"minecraft:wolf_armorable":{"minecraft:interact":{"interactions":[{"on_interact":{"filters":{"all_of":[{"test":"has_equipment","subject":"self","domain":"armor","operator":"not","value":"wolf_armor"},{"test":"has_equipment","subject":"other","domain":"hand","value":"wolf_armor"},{"test":"is_family","subject":"other","value":"player"},{"test":"is_owner","subject":"other","value":true},{"test":"is_sneak_held","subject":"other","value":false}]},"target":"self"},"equip_item_slot":"slot.armor.body","play_sounds":["armor.equip_wolf"],"interact_text":"action.interact.equipwolfarmor"},{"on_interact":{"filters":{"all_of":[{"test":"has_equipment","subject":"self","domain":"armor","value":"wolf_armor"},{"test":"has_equipment","subject":"other","domain":"hand","value":"shears"},{"test":"is_family","subject":"other","value":"player"},{"test":"is_owner","subject":"other","value":true},{"test":"is_sneak_held","subject":"other","value":false}]},"target":"self"},"hurt_item":1,"drop_item_slot":"slot.armor.body","play_sounds":["armor.unequip_wolf"],"interact_text":"action.interact.removewolfarmor","vibration":"shear"},{"on_interact":{"filters":{"all_of":[{"test":"is_sitting","subject":"self"},{"test":"has_damaged_equipment","subject":"self","domain":"armor","value":"wolf_armor"},{"test":"is_family","subject":"other","value":"player"},{"test":"is_owner","subject":"other","value":true},{"test":"is_sneak_held","subject":"other","value":false},{"test":"has_equipment","domain":"hand","subject":"other","value":"armadillo_scute"}]},"target":"self"},"repair_entity_item":{"slot":"slot.armor.body","amount":8},"use_item":true,"swing":true,"play_sounds":["armor.repair_wolf"],"interact_text":"action.interact.repairwolfarmor"}]}},"minecraft:wolf_leashable":{"minecraft:leashable":{"on_leash":{"event":"minecraft:on_leash","target":"self"},"on_unleash":{"event":"minecraft:on_unleash","target":"self"},"unleash_on_removal":false}},"minecraft:wolf_pale":{"minecraft:variant":{"value":0}},"minecraft:wolf_ashen":{"minecraft:variant":{"value":1}},"minecraft:wolf_black":{"minecraft:variant":{"value":2}},"minecraft:wolf_chestnut":{"minecraft:variant":{"value":3}},"minecraft:wolf_rusty":{"minecraft:variant":{"value":4}},"minecraft:wolf_snowy":{"minecraft:variant":{"value":5}},"minecraft:wolf_spotted":{"minecraft:variant":{"value":6}},"minecraft:wolf_striped":{"minecraft:variant":{"value":7}},"minecraft:wolf_woods":{"minecraft:variant":{"value":8}}},"components":{"minecraft:ambient_sound_interval":{"event_name":"ambient","event_names":[{"condition":"query.is_baby","event_name":"ambient.baby"}],"range":16.0,"value":6.0},"minecraft:balloonable":{"mass":0.8},"minecraft:is_hidden_when_invisible":{},"minecraft:nameable":{},"minecraft:offspring":{"combine_parent_colors":true,"offspring_pairs":{"minecraft:wolf":"minecraft:wolf"}},"minecraft:spawn_egg_interaction":{},"minecraft:type_family":{"family":["wolf","mob"]},"minecraft:breathable":{"total_supply":15,"suffocate_time":0},"minecraft:collision_box":{"width":0.6,"height":0.8},"minecraft:health":{"value":8,"max":8},"minecraft:hurt_on_condition":{"damage_conditions":[{"filters":{"test":"in_lava","subject":"self","operator":"==","value":true},"cause":"lava","damage_per_tick":4}]},"minecraft:movement":{"value":0.3},"minecraft:navigation.walk":{"can_path_over_water":true,"avoid_damage_blocks":true,"using_door_annotation":true},"minecraft:movement.basic":{},"minecraft:jump.static":{},"minecraft:can_climb":{},"minecraft:attack":{"damage":3},"minecraft:healable":{"items":[{"item":"porkchop","heal_amount":6},{"item":"cooked_porkchop","heal_amount":16},{"item":"fish","heal_amount":4},{"item":"salmon","heal_amount":4},{"item":"clownfish","heal_amount":2},{"item":"pufferfish","heal_amount":2},{"item":"cooked_fish","heal_amount":10},{"item":"cooked_salmon","heal_amount":12},{"item":"beef","heal_amount":6},{"item":"cooked_beef","heal_amount":16},{"item":"chicken","heal_amount":4},{"item":"cooked_chicken","heal_amount":12},{"item":"muttonRaw","heal_amount":4},{"item":"muttonCooked","heal_amount":12},{"item":"rotten_flesh","heal_amount":8},{"item":"rabbit","heal_amount":6},{"item":"cooked_rabbit","heal_amount":10},{"item":"rabbit_stew","heal_amount":20}]},"minecraft:environment_sensor":{"triggers":[{"filters":{"all_of":[{"test":"bool_property","operator":"!=","domain":"minecraft:has_increased_max_health"},{"test":"has_component","value":"minecraft:is_tamed"}]},"event":"minecraft:increase_max_health"},{"filters":{"all_of":[{"test":"bool_property","operator":"!=","domain":"minecraft:is_armorable"},{"test":"has_component","operator":"!=","value":"minecraft:is_baby"},{"test":"has_component","value":"minecraft:is_tamed"}]},"event":"minecraft:become_armorable"},{"filters":{"test":"bool_property","operator":"!=","domain":"minecraft:was_upgraded_to_1_21_100"},"event":"minecraft:upgrade_to_1_21_100"}]},"minecraft:despawn":{"despawn_from_distance":{}},"minecraft:physics":{},"minecraft:pushable_by_entity":{},"minecraft:pushable_by_block":{},"minecraft:conditional_bandwidth_optimization":{},"minecraft:behavior.float":{"priority":0},"minecraft:behavior.mount_pathing":{"priority":1,"speed_multiplier":1.25,"target_dist":0,"track_target":true},"minecraft:behavior.panic":{"priority":2,"speed_multiplier":1.25,"damage_sources":["campfire","fire","fire_tick","freezing","lightning","lava","magma","temperature","soul_campfire"],"ignore_mob_damage":true},"minecraft:behavior.stay_while_sitting":{"priority":3},"minecraft:behavior.hurt_by_target":{"priority":3},"minecraft:behavior.leap_at_target":{"priority":4,"yd":0.4},"minecraft:behavior.melee_box_attack":{"priority":5},"minecraft:behavior.look_at_player":{"priority":6,"look_distance":6.0,"probability":0.02},"minecraft:behavior.random_stroll":{"priority":8,"speed_multiplier":1.0},"minecraft:behavior.beg":{"priority":9,"look_distance":8,"look_time":{"min":20,"max":40},"items":[{"name":"minecraft:bone"},{"name":"minecraft:porkchop"},{"name":"minecraft:cooked_porkchop"},{"name":"minecraft:chicken"},{"name":"minecraft:cooked_chicken"},{"name":"minecraft:beef"},{"name":"minecraft:cooked_beef"},{"name":"minecraft:rotten_flesh"},{"name":"minecraft:muttonraw"},{"name":"minecraft:muttoncooked"},{"name":"minecraft:rabbit"},{"name":"minecraft:cooked_rabbit"}]},"minecraft:uses_legacy_friction":{}},"events":{"minecraft:entity_spawned":{"sequence":[{"trigger":"minecraft:spawn_wild_baby_or_adult"},{"filters":{"all_of":[{"test":"has_biome_tag","value":"taiga"},{"test":"has_biome_tag","operator":"not","value":"cold"},{"test":"has_biome_tag","operator":"not","value":"mega"},{"test":"has_biome_tag","operator":"not","value":"mutated"}]},"add":{"component_groups":["minecraft:wolf_pale"]}},{"filters":{"all_of":[{"test":"has_biome_tag","value":"taiga"},{"test":"has_biome_tag","value":"cold"}]},"add":{"component_groups":["minecraft:wolf_ashen"]}},{"filters":{"all_of":[{"test":"has_biome_tag","value":"mega"},{"test":"has_biome_tag","value":"taiga"},{"test":"has_biome_tag","value":"forest"},{"test":"has_biome_tag","operator":"not","value":"mutated"}]},"add":{"component_groups":["minecraft:wolf_black"]}},{"filters":{"all_of":[{"test":"has_biome_tag","value":"mega"},{"test":"has_biome_tag","value":"taiga"},{"test":"has_biome_tag","value":"forest"},{"test":"has_biome_tag","value":"mutated"}]},"add":{"component_groups":["minecraft:wolf_chestnut"]}},{"filters":{"test":"has_biome_tag","value":"jungle"},"add":{"component_groups":["minecraft:wolf_rusty"]}},{"filters":{"test":"has_biome_tag","value":"grove"},"add":{"component_groups":["minecraft:wolf_snowy"]}},{"filters":{"test":"has_biome_tag","value":"savanna"},"add":{"component_groups":["minecraft:wolf_spotted"]}},{"filters":{"test":"has_biome_tag","value":"mesa"},"add":{"component_groups":["minecraft:wolf_striped"]}},{"filters":{"all_of":[{"test":"has_biome_tag","value":"forest"},{"test":"has_biome_tag","operator":"not","value":"birch"},{"test":"has_biome_tag","operator":"not","value":"taiga"},{"test":"has_biome_tag","operator":"not","value":"roofed"},{"test":"has_biome_tag","operator":"not","value":"mutated"},{"test":"has_biome_tag","operator":"not","value":"mountain"},{"test":"has_biome_tag","operator":"not","value":"dappled_forest"}]},"add":{"component_groups":["minecraft:wolf_woods"]}}]},"minecraft:entity_born":{"sequence":[{"filters":{"test":"is_tamed"},"trigger":"minecraft:spawn_tame_baby"},{"filters":{"test":"is_tamed","value":false},"trigger":"minecraft:spawn_wild_baby"}]},"minecraft:spawn_wild_pale":{"add":{"component_groups":["minecraft:wolf_pale"]},"trigger":"minecraft:spawn_wild_baby_or_adult"},"minecraft:spawn_wild_ashen":{"add":{"component_groups":["minecraft:wolf_ashen"]},"trigger":"minecraft:spawn_wild_baby_or_adult"},"minecraft:spawn_wild_black":{"add":{"component_groups":["minecraft:wolf_black"]},"trigger":"minecraft:spawn_wild_baby_or_adult"},"minecraft:spawn_wild_chestnut":{"add":{"component_groups":["minecraft:wolf_chestnut"]},"trigger":"minecraft:spawn_wild_baby_or_adult"},"minecraft:spawn_wild_rusty":{"add":{"component_groups":["minecraft:wolf_rusty"]},"trigger":"minecraft:spawn_wild_baby_or_adult"},"minecraft:spawn_wild_snowy":{"add":{"component_groups":["minecraft:wolf_snowy"]},"trigger":"minecraft:spawn_wild_baby_or_adult"},"minecraft:spawn_wild_spotted":{"add":{"component_groups":["minecraft:wolf_spotted"]},"trigger":"minecraft:spawn_wild_baby_or_adult"},"minecraft:spawn_wild_striped":{"add":{"component_groups":["minecraft:wolf_striped"]},"trigger":"minecraft:spawn_wild_baby_or_adult"},"minecraft:spawn_wild_woods":{"add":{"component_groups":["minecraft:wolf_woods"]},"trigger":"minecraft:spawn_wild_baby_or_adult"},"minecraft:spawn_wild_baby_or_adult":{"sequence":[{"randomize":[{"weight":9,"trigger":"minecraft:spawn_wild_adult"},{"weight":1,"trigger":"minecraft:spawn_wild_baby"}]}]},"minecraft:spawn_wild_baby":{"add":{"component_groups":["minecraft:wolf_baby","minecraft:wolf_wild","minecraft:wolf_leashable"]},"set_property":{"minecraft:was_upgraded_to_1_21_100":true},"trigger":"minecraft:randomize_sound_variant"},"minecraft:spawn_wild_adult":{"add":{"component_groups":["minecraft:wolf_adult","minecraft:wolf_wild","minecraft:wolf_leashable"]},"set_property":{"minecraft:was_upgraded_to_1_21_100":true},"trigger":"minecraft:randomize_sound_variant"},"minecraft:spawn_tame_baby":{"add":{"component_groups":["minecraft:wolf_baby","minecraft:wolf_tame","minecraft:wolf_leashable"]},"set_property":{"minecraft:was_upgraded_to_1_21_100":true},"trigger":"minecraft:randomize_sound_variant"},"minecraft:spawn_tame_adult":{"add":{"component_groups":["minecraft:wolf_adult","minecraft:wolf_tame","minecraft:wolf_leashable"]},"set_property":{"minecraft:was_upgraded_to_1_21_100":true},"trigger":"minecraft:randomize_sound_variant"},"minecraft:ageable_grow_up":{"remove":{"component_groups":["minecraft:wolf_baby"]},"add":{"component_groups":["minecraft:wolf_adult"]}},"minecraft:ageable_set_baby":{"remove":{"component_groups":["minecraft:wolf_adult"]},"add":{"component_groups":["minecraft:wolf_baby"]}},"minecraft:on_tame":{"remove":{"component_groups":["minecraft:wolf_wild"]},"add":{"component_groups":["minecraft:wolf_tame","minecraft:on_tame_collar_color"]}},"minecraft:increase_max_health":{"add":{"component_groups":["minecraft:wolf_increased_max_health"]},"set_property":{"minecraft:has_increased_max_health":true}},"minecraft:become_angry":{"remove":{"component_groups":["minecraft:wolf_wild","minecraft:wolf_leashable"]},"add":{"component_groups":["minecraft:wolf_angry"]}},"minecraft:on_calm":{"remove":{"component_groups":["minecraft:wolf_angry"]},"add":{"component_groups":["minecraft:wolf_wild","minecraft:wolf_leashable"]}},"minecraft:become_armorable":{"add":{"component_groups":["minecraft:wolf_armorable"]},"set_property":{"minecraft:is_armorable":true}},"minecraft:upgrade_to_1_21_100":{"sequence":[{"filters":{"test":"has_component","operator":"!=","value":"minecraft:angry"},"add":{"component_groups":["minecraft:wolf_leashable"]}},{"set_property":{"minecraft:was_upgraded_to_1_21_100":true}}]},"minecraft:randomize_sound_variant":{"randomize":[{"weight":1,"set_property":{"minecraft:sound_variant":"default"}},{"weight":1,"set_property":{"minecraft:sound_variant":"big"}},{"weight":1,"set_property":{"minecraft:sound_variant":"cute"}},{"weight":1,"set_property":{"minecraft:sound_variant":"grumpy"}},{"weight":1,"set_property":{"minecraft:sound_variant":"mad"}},{"weight":1,"set_property":{"minecraft:sound_variant":"puglin"}},{"weight":1,"set_property":{"minecraft:sound_variant":"sad"}}]}}}},"minecraft:cat":{"format_version":"1.26.50","minecraft:entity":{"description":{"identifier":"minecraft:cat","spawn_category":"creature","is_spawnable":true,"is_summonable":true,"properties":{"minecraft:sound_variant":{"type":"enum","values":["default","royal"],"default":"default","client_sync":true}}},"component_groups":{"minecraft:cat_baby":{"minecraft:is_baby":{},"minecraft:scale":{"value":0.4},"minecraft:ageable":{"duration":1200,"feed_items":["fish","salmon"],"pause_growth_items":["golden_dandelion"],"reset_growth_items":["golden_dandelion"],"grow_up":{"event":"minecraft:ageable_grow_up","target":"self"}}},"minecraft:cat_adult":{"minecraft:experience_reward":{"on_bred":"Math.Random(1,7)","on_death":"query.last_hit_by_player ? Math.Random(1,3) : 0"},"minecraft:loot":{"table":"loot_tables/entities/cat.json"},"minecraft:scale":{"value":0.8},"minecraft:leashable_to":{"unleash_on_removal":false},"minecraft:breedable":{"require_tame":true,"require_full_health":true,"allow_sitting":true,"breeds_with":{"minecraft:cat":{}},"breed_items":["fish","salmon"]},"minecraft:behavior.breed":{"priority":3,"speed_multiplier":1.0}},"minecraft:cat_wild":{"minecraft:health":{"value":10,"max":10},"minecraft:tameable":{"probability":0.33,"tame_items":["fish","salmon"],"tame_event":{"event":"minecraft:on_tame","target":"self"}},"minecraft:rideable":{"seat_count":1,"family_types":["baby_undead"],"seats":{"position":[0.0,0.35,0.0]}},"minecraft:behavior.nearest_attackable_target":{"priority":1,"reselect_targets":true,"within_radius":16.0,"entity_types":[{"filters":{"test":"is_family","subject":"other","value":"rabbit"},"max_dist":8},{"filters":{"all_of":[{"test":"is_family","subject":"other","value":"baby_turtle"},{"test":"in_water","subject":"other","operator":"!=","value":true}]},"max_dist":8}]},"minecraft:behavior.tempt":{"priority":5,"speed_multiplier":0.5,"within_radius":16,"can_get_scared":true,"tempt_sound":"tempt","sound_interval":[0,100],"items":["fish","salmon"]},"minecraft:behavior.avoid_mob_type":{"priority":6,"entity_types":[{"filters":{"test":"is_family","subject":"other","value":"player"},"max_dist":10,"walk_speed_multiplier":0.8,"sprint_speed_multiplier":1.33}]},"minecraft:behavior.move_towards_dwelling_restriction":{"priority":7}},"minecraft:cat_tame":{"minecraft:is_tamed":{},"minecraft:health":{"value":20,"max":20},"minecraft:color":{"value":14},"minecraft:sittable":{},"minecraft:is_dyeable":{"interact_text":"action.interact.dye"},"minecraft:on_wake_with_owner":{"event":"minecraft:pet_slept_with_owner","target":"self"},"minecraft:behavior.teleport_to_owner":{"priority":0,"filters":{"all_of":[{"test":"owner_distance","operator":">","value":12},{"test":"is_panicking"}]}},"minecraft:behavior.pet_sleep_with_owner":{"priority":2,"speed_multiplier":1.2,"search_height":10,"goal_radius":1.0},"minecraft:behavior.stay_while_sitting":{"priority":3},"minecraft:behavior.follow_owner":{"priority":4,"speed_multiplier":1.0,"start_distance":10,"stop_distance":2,"post_teleport_distance":-1,"ignore_vibration":true},"minecraft:behavior.tempt":{"priority":5,"speed_multiplier":0.5,"within_radius":16,"items":["fish","salmon"]},"minecraft:behavior.ocelot_sit_on_block":{"priority":7,"speed_multiplier":1.0}},"minecraft:cat_gift_for_owner":{"minecraft:behavior.drop_item_for":{"priority":1,"seconds_before_pickup":0.0,"cooldown":0.25,"drop_item_chance":0.7,"offering_distance":5.0,"minimum_teleport_distance":2.0,"max_head_look_at_height":10.0,"target_range":[5.0,5.0,5.0],"teleport_offset":[0.0,1.0,0.0],"time_of_day_range":{"min":0.74999,"max":0.8},"search_range":5,"search_height":2,"goal_radius":1.0,"entity_types":[{"filters":{"test":"is_family","subject":"other","value":"player"},"max_dist":6}],"loot_table":"loot_tables/entities/cat_gift.json","on_drop_attempt":{"event":"minecraft:cat_gifted_owner","target":"self"}}},"minecraft:cat_white":{"minecraft:variant":{"value":0}},"minecraft:cat_tuxedo":{"minecraft:variant":{"value":1}},"minecraft:cat_red":{"minecraft:variant":{"value":2}},"minecraft:cat_siamese":{"minecraft:variant":{"value":3}},"minecraft:cat_british":{"minecraft:variant":{"value":4}},"minecraft:cat_calico":{"minecraft:variant":{"value":5}},"minecraft:cat_persian":{"minecraft:variant":{"value":6}},"minecraft:cat_ragdoll":{"minecraft:variant":{"value":7}},"minecraft:cat_tabby":{"minecraft:variant":{"value":8}},"minecraft:cat_black":{"minecraft:variant":{"value":9}},"minecraft:cat_jellie":{"minecraft:variant":{"value":10}}},"components":{"minecraft:ambient_sound_interval":{"event_name":"ambient","event_names":[{"condition":"query.is_baby","event_name":"ambient.baby"}],"range":16.0,"value":6.0},"minecraft:offspring":{"offspring_pairs":{"minecraft:cat":"minecraft:cat"},"combine_parent_colors":true},"minecraft:spawn_egg_interaction":{},"minecraft:leashable":{"unleash_on_removal":false},"minecraft:balloonable":{"mass":0.6},"minecraft:is_hidden_when_invisible":{},"minecraft:attack_damage":{"value":4},"minecraft:nameable":{},"minecraft:type_family":{"family":["cat","mob"]},"minecraft:breathable":{"total_supply":15,"suffocate_time":0},"minecraft:collision_box":{"width":0.6,"height":0.7},"minecraft:healable":{"items":[{"item":"fish","heal_amount":2},{"item":"salmon","heal_amount":2}]},"minecraft:hurt_on_condition":{"damage_conditions":[{"filters":{"test":"in_lava","subject":"self","operator":"==","value":true},"cause":"lava","damage_per_tick":4}]},"minecraft:movement":{"value":0.3},"minecraft:navigation.walk":{"can_float":true,"avoid_water":true,"avoid_damage_blocks":true,"using_door_annotation":true},"minecraft:movement.basic":{},"minecraft:jump.static":{},"minecraft:can_climb":{},"minecraft:damage_sensor":{"triggers":{"cause":"fall","deals_damage":"no"}},"minecraft:dweller":{"dwelling_type":"village","dweller_role":"passive","update_interval_base":60,"update_interval_variant":40,"can_find_poi":false,"can_migrate":true,"first_founding_reward":0},"minecraft:despawn":{"despawn_from_distance":{}},"minecraft:physics":{},"minecraft:pushable_by_entity":{},"minecraft:pushable_by_block":{},"minecraft:conditional_bandwidth_optimization":{},"minecraft:behavior.float":{"priority":0},"minecraft:behavior.panic":{"priority":1,"speed_multiplier":1.25},"minecraft:behavior.mount_pathing":{"priority":1,"speed_multiplier":1.25,"target_dist":0,"track_target":true},"minecraft:behavior.leap_at_target":{"priority":3},"minecraft:behavior.ocelotattack":{"priority":4,"cooldown_time":1.0,"x_max_rotation":30.0,"y_max_head_rotation":30.0,"max_distance":15.0,"max_sneak_range":15.0,"max_sprint_range":4.0,"reach_multiplier":2.0,"sneak_speed_multiplier":0.6,"sprint_speed_multiplier":1.33,"walk_speed_multiplier":0.8},"minecraft:behavior.random_stroll":{"priority":8,"speed_multiplier":0.8},"minecraft:behavior.look_at_player":{"priority":9},"minecraft:uses_legacy_friction":{}},"events":{"minecraft:entity_spawned":{"sequence":[{"randomize":[{"weight":3,"remove":{},"add":{"component_groups":["minecraft:cat_adult","minecraft:cat_wild"]}},{"weight":1,"remove":{},"add":{"component_groups":["minecraft:cat_baby","minecraft:cat_wild"]}}]},{"randomize":[{"weight":15,"add":{"component_groups":["minecraft:cat_white"]}},{"weight":15,"add":{"component_groups":["minecraft:cat_tuxedo"]}},{"weight":15,"add":{"component_groups":["minecraft:cat_red"]}},{"weight":15,"add":{"component_groups":["minecraft:cat_siamese"]}},{"weight":15,"add":{"component_groups":["minecraft:cat_british"]}},{"weight":15,"add":{"component_groups":["minecraft:cat_calico"]}},{"weight":15,"add":{"component_groups":["minecraft:cat_persian"]}},{"weight":15,"add":{"component_groups":["minecraft:cat_ragdoll"]}},{"weight":15,"add":{"component_groups":["minecraft:cat_tabby"]}},{"weight":15,"add":{"component_groups":["minecraft:cat_black"]}},{"weight":15,"add":{"component_groups":["minecraft:cat_jellie"]}}]},{"trigger":"minecraft:randomize_sound_variant"}]},"minecraft:spawn_from_village":{"sequence":[{"randomize":[{"weight":3,"trigger":"minecraft:spawn_wild_adult"},{"weight":1,"trigger":"minecraft:spawn_wild_baby"}]},{"randomize":[{"weight":15,"add":{"component_groups":["minecraft:cat_tuxedo"]}},{"weight":15,"add":{"component_groups":["minecraft:cat_red"]}},{"weight":15,"add":{"component_groups":["minecraft:cat_siamese"]}},{"weight":15,"add":{"component_groups":["minecraft:cat_white"]}},{"weight":15,"add":{"component_groups":["minecraft:cat_british"]}},{"weight":15,"add":{"component_groups":["minecraft:cat_calico"]}},{"weight":15,"add":{"component_groups":["minecraft:cat_persian"]}},{"weight":15,"add":{"component_groups":["minecraft:cat_ragdoll"]}},{"weight":15,"add":{"component_groups":["minecraft:cat_tabby"]}},{"weight":15,"add":{"component_groups":["minecraft:cat_jellie"]}}]}]},"minecraft:spawn_midnight_cat":{"sequence":[{"trigger":"minecraft:spawn_wild_adult","add":{"component_groups":["minecraft:cat_black"]}}]},"minecraft:entity_born":{"sequence":[{"filters":{"test":"is_tamed"},"trigger":"minecraft:spawn_tame_baby"},{"filters":{"test":"is_tamed","value":false},"trigger":"minecraft:spawn_wild_baby"}]},"minecraft:spawn_wild_baby":{"add":{"component_groups":["minecraft:cat_baby","minecraft:cat_wild"]}},"minecraft:spawn_wild_adult":{"add":{"component_groups":["minecraft:cat_adult","minecraft:cat_wild"]},"trigger":"minecraft:randomize_sound_variant"},"minecraft:spawn_tame_baby":{"add":{"component_groups":["minecraft:cat_baby","minecraft:cat_tame"]}},"minecraft:spawn_tame_adult":{"add":{"component_groups":["minecraft:cat_adult","minecraft:cat_tame"]},"trigger":"minecraft:randomize_sound_variant"},"minecraft:ageable_grow_up":{"remove":{"component_groups":["minecraft:cat_baby"]},"add":{"component_groups":["minecraft:cat_adult"]},"trigger":"minecraft:randomize_sound_variant"},"minecraft:on_tame":{"sequence":[{"remove":{"component_groups":["minecraft:cat_wild"]}},{"add":{"component_groups":["minecraft:cat_tame"]}}]},"minecraft:pet_slept_with_owner":{"add":{"component_groups":["minecraft:cat_gift_for_owner"]}},"minecraft:cat_gifted_owner":{"remove":{"component_groups":["minecraft:cat_gift_for_owner"]}},"minecraft:randomize_sound_variant":{"randomize":[{"weight":1,"set_property":{"minecraft:sound_variant":"default"}},{"weight":1,"set_property":{"minecraft:sound_variant":"royal"}}]}}}},"minecraft:horse":{"format_version":"1.26.60","minecraft:entity":{"description":{"identifier":"minecraft:horse","spawn_category":"creature","is_spawnable":true,"is_summonable":true},"component_groups":{"minecraft:horse_baby":{"minecraft:is_baby":{},"minecraft:scale":{"value":0.5},"minecraft:ageable":{"duration":1200,"feed_items":[{"item":"wheat","growth":0.016667},{"item":"sugar","growth":0.025},{"item":"hay_block","growth":0.15},{"item":"apple","growth":0.05},{"item":"carrot","growth":0.05},{"item":"golden_carrot","growth":0.05},{"item":"golden_apple","growth":0.2},{"item":"appleEnchanted","growth":0.2}],"pause_growth_items":["golden_dandelion"],"reset_growth_items":["golden_dandelion"],"grow_up":{"event":"minecraft:ageable_grow_up","target":"self"}},"minecraft:behavior.follow_parent":{"priority":4,"speed_multiplier":1.0},"minecraft:collision_box":{"width":1.96,"height":2.24}},"minecraft:horse_adult":{"minecraft:collision_box":{"width":1.4,"height":1.6},"minecraft:experience_reward":{"on_bred":"Math.Random(1,7)","on_death":"query.last_hit_by_player ? Math.Random(1,3) : 0"},"minecraft:loot":{"table":"loot_tables/entities/horse.json"},"minecraft:leashable_to":{"unleash_on_removal":false},"minecraft:behavior.run_around_like_crazy":{"priority":1,"speed_multiplier":1.2},"minecraft:behavior.breed":{"priority":2,"speed_multiplier":1.0}},"minecraft:horse_wild":{"minecraft:rideable":{"seat_count":1,"family_types":["player","baby_undead"],"interact_text":"action.interact.mount","seats":[{"position":[0.0,1.1,-0.2]}]},"minecraft:behavior.mount_pathing":{"priority":2,"speed_multiplier":1.5,"target_dist":0.0,"track_target":true},"minecraft:tamemount":{"min_temper":0,"max_temper":100,"feed_text":"action.interact.feed","ride_text":"action.interact.mount","feed_items":[{"item":"wheat","temper_mod":3},{"item":"sugar","temper_mod":3},{"item":"apple","temper_mod":3},{"item":"carrot","temper_mod":3},{"item":"golden_carrot","temper_mod":5},{"item":"golden_apple","temper_mod":10},{"item":"appleenchanted","temper_mod":10}],"auto_reject_items":[{"item":"horsearmorleather"},{"item":"horsearmoriron"},{"item":"horsearmorgold"},{"item":"horsearmordiamond"},{"item":"minecraft:copper_horse_armor"},{"item":"minecraft:netherite_horse_armor"},{"item":"saddle"}],"tame_event":{"event":"minecraft:on_tame","target":"self"}}},"minecraft:horse_tamed":{"minecraft:is_tamed":{},"minecraft:rideable":{"seat_count":1,"crouching_skip_interact":true,"family_types":["player"],"interact_text":"action.interact.ride.horse","seats":[{"position":[0.0,1.1,-0.2]}]},"minecraft:interact":{"interactions":[{"on_interact":{"filters":{"all_of":[{"test":"has_equipment_tag","subject":"self","domain":"inventory","operator":"not","value":"minecraft:horse_armor"},{"test":"has_equipment_tag","subject":"player","domain":"hand","value":"minecraft:horse_armor"},{"test":"is_sneak_held","subject":"other","value":false}]},"target":"self"},"equip_item_slot":"1","interact_text":"action.interact.equiphorsearmor","play_sounds":["armor.equip_generic"]},{"on_interact":{"filters":{"all_of":[{"test":"rider_count","subject":"self","operator":"equals","value":0},{"test":"has_equipment_tag","subject":"self","domain":"inventory","value":"minecraft:horse_armor"},{"test":"has_equipment","subject":"other","domain":"hand","value":"shears"},{"test":"is_sneak_held","subject":"other","value":false}]}},"hurt_item":1,"drop_item_slot":"1","drop_item_y_offset":1.1,"interact_text":"action.interact.removehorsearmor","play_sounds":["armor.unequip_generic"],"vibration":"shear"},{"on_interact":{"filters":{"all_of":[{"test":"has_equipment","subject":"self","domain":"inventory","operator":"not","value":"saddle"},{"test":"has_equipment","subject":"other","domain":"hand","value":"saddle"},{"test":"is_sneak_held","subject":"other","value":false}]},"target":"self"},"equip_item_slot":"0","interact_text":"action.interact.saddle"},{"on_interact":{"filters":{"all_of":[{"test":"rider_count","subject":"self","operator":"equals","value":0},{"test":"has_equipment","subject":"self","domain":"inventory","value":"saddle"},{"test":"has_equipment","subject":"other","domain":"hand","value":"shears"},{"test":"is_sneak_held","subject":"other","value":false}]}},"hurt_item":1,"drop_item_slot":"0","drop_item_y_offset":1.1,"interact_text":"action.interact.removesaddle","play_sounds":["unsaddle"],"vibration":"shear"}]},"minecraft:inventory":{"inventory_size":2,"container_type":"horse"},"minecraft:breedable":{"require_tame":true,"breeds_with":{"minecraft:horse":{},"minecraft:donkey":{}},"breed_items":["golden_carrot","golden_apple","appleEnchanted"]}},"minecraft:horse_saddled":{"minecraft:is_saddled":{},"minecraft:input_ground_controlled":{},"minecraft:can_power_jump":{},"minecraft:behavior.player_ride_tamed":{}},"minecraft:base_white":{"minecraft:variant":{"value":0}},"minecraft:base_creamy":{"minecraft:variant":{"value":1}},"minecraft:base_chestnut":{"minecraft:variant":{"value":2}},"minecraft:base_brown":{"minecraft:variant":{"value":3}},"minecraft:base_black":{"minecraft:variant":{"value":4}},"minecraft:base_gray":{"minecraft:variant":{"value":5}},"minecraft:base_darkbrown":{"minecraft:variant":{"value":6}},"minecraft:markings_none":{"minecraft:mark_variant":{"value":0}},"minecraft:markings_white_details":{"minecraft:mark_variant":{"value":1}},"minecraft:markings_white_fields":{"minecraft:mark_variant":{"value":2}},"minecraft:markings_white_dots":{"minecraft:mark_variant":{"value":3}},"minecraft:markings_black_dots":{"minecraft:mark_variant":{"value":4}}},"components":{"minecraft:is_hidden_when_invisible":{},"minecraft:ambient_sound_interval":{"event_name":"ambient","event_names":[{"condition":"query.is_baby","event_name":"ambient.baby"}],"range":16.0,"value":12.0},"minecraft:equippable":{"slots":[{"slot":0,"item":"saddle","accepted_items":["saddle"],"on_equip":{"event":"minecraft:horse_saddled"},"on_unequip":{"event":"minecraft:horse_unsaddled"}},{"slot":1,"item":"horsearmoriron","accepted_items":["horsearmorleather","horsearmoriron","horsearmorgold","horsearmordiamond","minecraft:copper_horse_armor","minecraft:netherite_horse_armor"]}]},"minecraft:type_family":{"family":["horse","mob"]},"minecraft:collision_box":{"width":1.4,"height":1.6},"minecraft:breathable":{"total_supply":15,"suffocate_time":0},"minecraft:health":{"value":{"range_min":15,"range_max":30}},"minecraft:hurt_on_condition":{"damage_conditions":[{"filters":{"test":"in_lava","subject":"self"},"cause":"lava","damage_per_tick":4}]},"minecraft:movement":{"value":{"range_min":0.1125,"range_max":0.3375}},"minecraft:navigation.walk":{"can_path_over_water":true,"avoid_water":true,"avoid_damage_blocks":true,"using_door_annotation":true},"minecraft:movement.basic":{},"minecraft:jump.static":{},"minecraft:nameable":{},"minecraft:offspring":{"inherit_tamed":false,"parent_centric_attribute_blending":["minecraft:health","minecraft:movement","minecraft:horse.jump_strength"],"offspring_pairs":{"minecraft:horse":"minecraft:horse","minecraft:donkey":"minecraft:mule"},"mutation_factor":{"extra_variant":0.2,"variant":0.111},"mutation_strategy":"random","random_variant_mutation_interval":[0,7],"random_extra_variant_mutation_interval":[0,5]},"minecraft:spawn_egg_interaction":{},"minecraft:horse.jump_strength":{"value":{"range_min":0.4,"range_max":1.0}},"minecraft:leashable":{"presets":[{"filter":{"test":"is_family","subject":"other","value":"happy_ghast"},"spring_type":"quad_dampened"}],"unleash_on_removal":false},"minecraft:balloonable":{},"minecraft:healable":{"items":[{"item":"wheat","heal_amount":2},{"item":"sugar","heal_amount":1},{"item":"hay_block","heal_amount":20},{"item":"apple","heal_amount":3},{"item":"carrot","heal_amount":3},{"item":"golden_carrot","heal_amount":4},{"item":"golden_apple","heal_amount":10},{"item":"enchanted_golden_apple","heal_amount":10}]},"minecraft:despawn":{"despawn_from_distance":{}},"minecraft:behavior.float":{"priority":0,"chance_per_tick_to_float":0.0,"time_under_water_to_dismount_passengers":2.0},"minecraft:buoyant":{"base_buoyancy":1.0,"apply_gravity":false,"can_auto_step_from_liquid":true,"movement_type":"bobbing","liquid_blocks":["minecraft:water","minecraft:flowing_water","minecraft:lava","minecraft:flowing_lava"]},"minecraft:behavior.panic":{"priority":3,"speed_multiplier":1.2},"minecraft:behavior.tempt":{"priority":5,"speed_multiplier":1.2,"items":["golden_apple","appleEnchanted","golden_carrot"]},"minecraft:behavior.random_stroll":{"priority":6,"speed_multiplier":0.7},"minecraft:behavior.look_at_player":{"priority":7,"look_distance":6.0,"probability":0.02},"minecraft:behavior.random_look_around":{"priority":8},"minecraft:physics":{},"minecraft:pushable_by_entity":{"presets":[{"filters":{"all_of":[{"test":"is_family","subject":"other","value":"sulfur_cube"},{"test":"enum_property","subject":"other","domain":"minecraft:sulfur_cube_archetype","operator":"not","value":"none"},{"test":"is_controlling_passenger_family","subject":"self","value":"player"}]},"push_mode":"none"}]},"minecraft:pushable_by_block":{},"minecraft:conditional_bandwidth_optimization":{}},"events":{"minecraft:entity_spawned":{"sequence":[{"randomize":[{"weight":36,"add":{"component_groups":["minecraft:horse_adult","minecraft:horse_wild"]}},{"weight":9,"add":{"component_groups":["minecraft:horse_baby"]}}]},{"randomize":[{"weight":1,"add":{"component_groups":["minecraft:base_white"]}},{"weight":1,"add":{"component_groups":["minecraft:base_creamy"]}},{"weight":1,"add":{"component_groups":["minecraft:base_chestnut"]}},{"weight":1,"add":{"component_groups":["minecraft:base_brown"]}},{"weight":1,"add":{"component_groups":["minecraft:base_black"]}},{"weight":1,"add":{"component_groups":["minecraft:base_gray"]}},{"weight":1,"add":{"component_groups":["minecraft:base_darkbrown"]}}]},{"randomize":[{"weight":1,"add":{"component_groups":["minecraft:markings_none"]}},{"weight":1,"add":{"component_groups":["minecraft:markings_white_details"]}},{"weight":1,"add":{"component_groups":["minecraft:markings_white_fields"]}},{"weight":1,"add":{"component_groups":["minecraft:markings_white_dots"]}},{"weight":1,"add":{"component_groups":["minecraft:markings_black_dots"]}}]}]},"minecraft:entity_born":{"add":{"component_groups":["minecraft:horse_baby"]}},"minecraft:spawn_adult":{"add":{"component_groups":["minecraft:horse_adult","minecraft:horse_wild"]}},"minecraft:spawn_tame_adult":{"add":{"component_groups":["minecraft:horse_adult","minecraft:horse_tamed"]}},"minecraft:on_tame":{"remove":{"component_groups":["minecraft:horse_wild"]},"add":{"component_groups":["minecraft:horse_tamed"]}},"minecraft:ageable_grow_up":{"remove":{"component_groups":["minecraft:horse_baby"]},"add":{"component_groups":["minecraft:horse_adult","minecraft:horse_wild"]}},"minecraft:horse_saddled":{"add":{"component_groups":["minecraft:horse_saddled"]},"play_sound":{"sound":"saddle"}},"minecraft:horse_unsaddled":{"remove":{"component_groups":["minecraft:horse_saddled"]}},"minecraft:make_white":{"add":{"component_groups":["minecraft:base_white"]}},"minecraft:make_creamy":{"add":{"component_groups":["minecraft:base_creamy"]}},"minecraft:make_chestnut":{"add":{"component_groups":["minecraft:base_chestnut"]}},"minecraft:make_brown":{"add":{"component_groups":["minecraft:base_brown"]}},"minecraft:make_black":{"add":{"component_groups":["minecraft:base_black"]}},"minecraft:make_gray":{"add":{"component_groups":["minecraft:base_gray"]}},"minecraft:make_darkbrown":{"add":{"component_groups":["minecraft:base_darkbrown"]}}}}},"minecraft:rabbit":{"format_version":"1.26.50","minecraft:entity":{"description":{"identifier":"minecraft:rabbit","spawn_category":"creature","is_spawnable":true,"is_summonable":true},"component_groups":{"baby":{"minecraft:is_baby":{},"minecraft:scale":{"value":0.4},"minecraft:collision_box":{"width":0.6,"height":1.0},"minecraft:ageable":{"duration":1200,"feed_items":["golden_carrot","carrot","dandelion"],"pause_growth_items":["golden_dandelion"],"reset_growth_items":["golden_dandelion"],"grow_up":{"event":"grow_up","target":"self"}},"minecraft:behavior.follow_parent":{"priority":6,"speed_multiplier":1.1}},"adult":{"minecraft:scale":{"value":0.6},"minecraft:collision_box":{"width":0.81666666,"height":1.0},"minecraft:experience_reward":{"on_bred":"Math.Random(1,7)","on_death":"query.last_hit_by_player ? Math.Random(1,3) : 0"},"minecraft:loot":{"table":"loot_tables/entities/rabbit.json"},"minecraft:leashable_to":{},"minecraft:behavior.breed":{"priority":2,"speed_multiplier":0.75},"minecraft:breedable":{"breed_items":["golden_carrot","carrot","dandelion"],"breeds_with":{"minecraft:rabbit":{}},"require_tame":false}},"coat_brown":{"minecraft:variant":{"value":0}},"coat_white":{"minecraft:variant":{"value":1}},"coat_black":{"minecraft:variant":{"value":2}},"coat_splotched":{"minecraft:variant":{"value":3}},"coat_desert":{"minecraft:variant":{"value":4}},"coat_salt":{"minecraft:variant":{"value":5}}},"components":{"minecraft:is_hidden_when_invisible":{},"minecraft:can_stand_on_powder_snow":{},"minecraft:type_family":{"family":["rabbit","mob"]},"minecraft:breathable":{"total_supply":15,"suffocate_time":0},"minecraft:nameable":{},"minecraft:offspring":{"offspring_pairs":{"minecraft:rabbit":"minecraft:rabbit"},"mutation_factor":{"variant":0.2}},"minecraft:spawn_egg_interaction":{},"minecraft:health":{"value":3,"max":3},"minecraft:hurt_on_condition":{"damage_conditions":[{"filters":{"test":"in_lava","subject":"self","operator":"==","value":true},"cause":"lava","damage_per_tick":4}]},"minecraft:movement":{"value":0.3},"minecraft:navigation.walk":{"can_path_over_water":true,"avoid_water":true},"minecraft:movement.skip":{},"minecraft:jump.dynamic":{"regular_skip_data":{"distance_scale":0.8,"height":0.25,"jump_delay":15,"animation_duration":18},"fast_skip_data":{"distance_scale":1.75,"height":0.15,"jump_delay":1,"animation_duration":15}},"minecraft:can_climb":{},"minecraft:leashable":{},"minecraft:balloonable":{"mass":0.4},"minecraft:despawn":{"despawn_from_distance":{}},"minecraft:behavior.float":{"priority":0},"minecraft:behavior.panic":{"priority":1,"speed_multiplier":2.2},"minecraft:behavior.avoid_mob_type":{"priority":4,"entity_types":[{"filters":{"test":"is_family","subject":"other","value":"player"},"max_dist":8,"walk_speed_multiplier":1.5,"sprint_speed_multiplier":1.8},{"filters":{"test":"is_family","subject":"other","value":"wolf"},"max_dist":4,"walk_speed_multiplier":1.5,"sprint_speed_multiplier":1.8},{"filters":{"test":"is_family","subject":"other","value":"monster"},"max_dist":4,"walk_speed_multiplier":1.5,"sprint_speed_multiplier":1.5}]},"minecraft:behavior.tempt":{"priority":3,"speed_multiplier":1,"items":["golden_carrot","carrot","dandelion"]},"minecraft:behavior.raid_garden":{"priority":5,"blocks":["minecraft:carrots"],"search_range":16,"goal_radius":1.0,"speed_multiplier":0.6},"minecraft:behavior.random_stroll":{"priority":6,"speed_multiplier":0.6,"xz_dist":2,"y_dist":1},"minecraft:behavior.look_at_player":{"priority":11},"minecraft:physics":{},"minecraft:pushable_by_entity":{},"minecraft:pushable_by_block":{},"minecraft:conditional_bandwidth_optimization":{},"minecraft:block_climber":{}},"events":{"in_desert":{"add":{"component_groups":["coat_desert"]}},"in_snow":{"randomize":[{"weight":80,"add":{"component_groups":["coat_white"]}},{"weight":20,"add":{"component_groups":["coat_splotched"]}}]},"minecraft:entity_spawned":{"sequence":[{"randomize":[{"weight":3,"add":{"component_groups":["adult"]}},{"weight":1,"add":{"component_groups":["baby"]}}]},{"filters":{"test":"has_component","operator":"!=","value":"minecraft:variant"},"randomize":[{"weight":50,"add":{"component_groups":["coat_brown"]}},{"weight":40,"add":{"component_groups":["coat_black"]}},{"weight":10,"add":{"component_groups":["coat_salt"]}}]},{"filters":{"test":"is_biome","value":"desert"},"add":{"component_groups":["coat_desert"]}},{"filters":{"test":"is_snow_covered","value":true},"randomize":[{"weight":80,"add":{"component_groups":["coat_white"]}},{"weight":20,"add":{"component_groups":["coat_splotched"]}}]}]},"minecraft:entity_born":{"sequence":[{"add":{"component_groups":["baby"]}},{"filters":{"test":"has_component","operator":"!=","value":"minecraft:variant"},"randomize":[{"weight":50,"add":{"component_groups":["coat_brown"]}},{"weight":40,"add":{"component_groups":["coat_black"]}},{"weight":10,"add":{"component_groups":["coat_salt"]}}]},{"filters":{"test":"is_biome","value":"desert"},"add":{"component_groups":["coat_desert"]}},{"filters":{"test":"is_snow_covered","value":true},"randomize":[{"weight":80,"add":{"component_groups":["coat_white"]}},{"weight":20,"add":{"component_groups":["coat_splotched"]}}]}]},"grow_up":{"remove":{"component_groups":["baby"]},"add":{"component_groups":["adult"]}}}}},"minecraft:zombie":{"format_version":"1.26.50","minecraft:entity":{"description":{"identifier":"minecraft:zombie","is_summonable":true,"is_spawnable":true,"properties":{"minecraft:is_riding_zombie_horse":{"client_sync":false,"default":false,"type":"bool"}},"spawn_category":"monster"},"components":{"minecraft:attack":{"damage":3},"minecraft:behavior.equip_item":{"priority":2},"minecraft:behavior.hurt_by_target":{"entity_types":[{"filters":{"operator":"not","test":"is_family","subject":"other","value":"breeze"}}],"priority":1},"minecraft:behavior.look_at_player":{"look_distance":6,"priority":8},"minecraft:behavior.melee_box_attack":{"can_spread_on_fire":true,"priority":4},"minecraft:behavior.nearest_attackable_target":{"reselect_targets":true,"must_see":true,"within_radius":25,"must_see_forget_duration":17,"entity_types":[{"filters":{"any_of":[{"test":"is_family","subject":"other","value":"player"},{"test":"is_family","subject":"other","value":"snowgolem"},{"test":"is_family","subject":"other","value":"irongolem"}]},"max_dist":35},{"filters":{"any_of":[{"test":"is_family","subject":"other","value":"villager"},{"test":"is_family","subject":"other","value":"wandering_trader"}]},"max_dist":35,"must_see":false},{"filters":{"all_of":[{"test":"is_family","subject":"other","value":"baby_turtle"},{"test":"in_water","subject":"other","value":false}]},"max_dist":35}],"priority":2},"minecraft:behavior.pickup_items":{"can_pickup_any_item":true,"excluded_items":["minecraft:glow_ink_sac"],"pickup_based_on_chance":true,"goal_radius":2,"priority":6,"max_dist":3,"speed_multiplier":1},"minecraft:behavior.random_look_around":{"priority":9},"minecraft:behavior.random_stroll":{"priority":7,"speed_multiplier":1},"minecraft:behavior.stomp_turtle_egg":{"goal_radius":1.14,"priority":5,"search_height":2,"interval":20,"search_range":10,"speed_multiplier":1},"minecraft:breathable":{"breathes_air":true,"breathes_water":true,"suffocate_time":0,"total_supply":15},"minecraft:burns_in_daylight":{},"minecraft:can_climb":{},"minecraft:collision_box":{"height":1.9,"width":0.6},"minecraft:conditional_bandwidth_optimization":{},"minecraft:despawn":{"despawn_from_distance":{}},"minecraft:environment_sensor":{"triggers":[{"event":"minecraft:start_transforming_into_drowned","filters":{"test":"is_underwater"}},{"event":"minecraft:on_start_riding_zombie_horse","filters":{"all_of":[{"test":"is_vehicle_family","value":"zombiehorse"},{"domain":"minecraft:is_riding_zombie_horse","test":"bool_property","value":false}]}},{"event":"minecraft:on_stop_riding_zombie_horse","filters":{"all_of":[{"operator":"not","test":"is_vehicle_family","value":"zombiehorse"},{"domain":"minecraft:is_riding_zombie_horse","test":"bool_property"}]}}]},"minecraft:equip_item":{"excluded_items":[{"item":"minecraft:banner:15"}]},"minecraft:health":{"max":20,"value":20},"minecraft:hurt_on_condition":{"damage_conditions":[{"cause":"lava","damage_per_tick":4,"filters":{"test":"in_lava"}}]},"minecraft:is_hidden_when_invisible":{},"minecraft:jump.static":{},"minecraft:movement.basic":{},"minecraft:nameable":{},"minecraft:navigation.walk":{"can_break_doors":true,"is_amphibious":true,"can_pass_doors":true,"can_walk":true},"minecraft:offspring":{"offspring_pairs":{"minecraft:zombie":"minecraft:zombie"}},"minecraft:physics":{},"minecraft:pushable_by_entity":{},"minecraft:pushable_by_block":{},"minecraft:rotation_locked_to_vehicle":{},"minecraft:shareables":{"items":[{"item":"minecraft:netherite_sword","priority":0,"surplus_amount":1,"want_amount":1},{"item":"minecraft:diamond_sword","priority":1,"surplus_amount":1,"want_amount":1},{"item":"minecraft:iron_sword","priority":2,"surplus_amount":1,"want_amount":1},{"item":"minecraft:golden_sword","priority":3,"surplus_amount":1,"want_amount":1},{"item":"minecraft:copper_sword","priority":4,"surplus_amount":1,"want_amount":1},{"item":"minecraft:stone_sword","priority":5,"surplus_amount":1,"want_amount":1},{"item":"minecraft:wooden_sword","priority":6,"surplus_amount":1,"want_amount":1},{"item":"minecraft:netherite_spear","priority":0,"surplus_amount":1,"want_amount":1},{"item":"minecraft:diamond_spear","priority":1,"surplus_amount":1,"want_amount":1},{"item":"minecraft:iron_spear","priority":2,"surplus_amount":1,"want_amount":1},{"item":"minecraft:golden_spear","priority":3,"surplus_amount":1,"want_amount":1},{"item":"minecraft:copper_spear","priority":4,"surplus_amount":1,"want_amount":1},{"item":"minecraft:stone_spear","priority":5,"surplus_amount":1,"want_amount":1},{"item":"minecraft:wooden_spear","priority":6,"surplus_amount":1,"want_amount":1},{"item":"minecraft:netherite_helmet","priority":0,"surplus_amount":1,"want_amount":1},{"item":"minecraft:diamond_helmet","priority":1,"surplus_amount":1,"want_amount":1},{"item":"minecraft:iron_helmet","priority":2,"surplus_amount":1,"want_amount":1},{"item":"minecraft:chainmail_helmet","priority":3,"surplus_amount":1,"want_amount":1},{"item":"minecraft:golden_helmet","priority":4,"surplus_amount":1,"want_amount":1},{"item":"minecraft:copper_helmet","priority":5,"surplus_amount":1,"want_amount":1},{"item":"minecraft:leather_helmet","priority":6,"surplus_amount":1,"want_amount":1},{"item":"minecraft:turtle_helmet","priority":7,"surplus_amount":1,"want_amount":1},{"item":"minecraft:skull:0","priority":8,"surplus_amount":1,"want_amount":1},{"item":"minecraft:skull:1","priority":8,"surplus_amount":1,"want_amount":1},{"item":"minecraft:carved_pumpkin","priority":8,"surplus_amount":1,"want_amount":1},{"item":"minecraft:netherite_chestplate","priority":0,"surplus_amount":1,"want_amount":1},{"item":"minecraft:diamond_chestplate","priority":1,"surplus_amount":1,"want_amount":1},{"item":"minecraft:iron_chestplate","priority":2,"surplus_amount":1,"want_amount":1},{"item":"minecraft:chainmail_chestplate","priority":3,"surplus_amount":1,"want_amount":1},{"item":"minecraft:golden_chestplate","priority":4,"surplus_amount":1,"want_amount":1},{"item":"minecraft:copper_chestplate","priority":5,"surplus_amount":1,"want_amount":1},{"item":"minecraft:leather_chestplate","priority":6,"surplus_amount":1,"want_amount":1},{"item":"minecraft:netherite_leggings","priority":0,"surplus_amount":1,"want_amount":1},{"item":"minecraft:diamond_leggings","priority":1,"surplus_amount":1,"want_amount":1},{"item":"minecraft:iron_leggings","priority":2,"surplus_amount":1,"want_amount":1},{"item":"minecraft:chainmail_leggings","priority":3,"surplus_amount":1,"want_amount":1},{"item":"minecraft:golden_leggings","priority":4,"surplus_amount":1,"want_amount":1},{"item":"minecraft:copper_leggings","priority":5,"surplus_amount":1,"want_amount":1},{"item":"minecraft:leather_leggings","priority":6,"surplus_amount":1,"want_amount":1},{"item":"minecraft:netherite_boots","priority":0,"surplus_amount":1,"want_amount":1},{"item":"minecraft:diamond_boots","priority":1,"surplus_amount":1,"want_amount":1},{"item":"minecraft:iron_boots","priority":2,"surplus_amount":1,"want_amount":1},{"item":"minecraft:chainmail_boots","priority":3,"surplus_amount":1,"want_amount":1},{"item":"minecraft:golden_boots","priority":4,"surplus_amount":1,"want_amount":1},{"item":"minecraft:copper_boots","priority":5,"surplus_amount":1,"want_amount":1},{"item":"minecraft:leather_boots","priority":6,"surplus_amount":1,"want_amount":1}],"singular_pickup":true},"minecraft:spawn_egg_interaction":{},"minecraft:type_family":{"family":["zombie","undead","monster","mob"]}},"component_groups":{"minecraft:can_break_doors":{"minecraft:annotation.break_door":{}},"minecraft:can_have_equipment":{"minecraft:equipment":{"table":"loot_tables/entities/zombie_equipment.json"}},"minecraft:zombie_adult":{"minecraft:behavior.mount_pathing":{"priority":2,"target_dist":0,"speed_multiplier":1.25,"track_target":true},"minecraft:experience_reward":{"on_death":"query.last_hit_by_player ? 5 + (query.equipment_count * Math.Random(1,3)) : 0"},"minecraft:movement":{"value":0.23},"minecraft:rideable":{"family_types":["baby_undead"],"seat_count":1,"seats":{"lock_rider_rotation":0,"position":[0,1.175,-0.35]}},"minecraft:collision_box":{"height":1.9,"width":0.6}},"minecraft:zombie_baby":{"minecraft:experience_reward":{"on_death":"query.last_hit_by_player ? 12 + (query.equipment_count * Math.Random(1,3)) : 0"},"minecraft:is_baby":{},"minecraft:movement":{"value":0.35},"minecraft:scale":{"value":0.5},"minecraft:collision_box":{"height":1.96,"width":0.98},"minecraft:type_family":{"family":["baby_undead","zombie","undead","monster","mob"]}},"minecraft:zombie_default":{"minecraft:loot":{"table":"loot_tables/entities/zombie.json"}},"minecraft:zombie_jockey":{"minecraft:behavior.find_mount":{"max_failed_attempts":20,"priority":1,"start_delay":15,"within_radius":16},"minecraft:loot":{"table":"loot_tables/entities/zombie.json"}},"minecraft:zombie_rider":{"minecraft:equipment":{"table":"loot_tables/entities/zombie_rider_equipment.json"},"minecraft:loot":{"table":"loot_tables/entities/zombie_rider.json"},"minecraft:type_family":{"family":["zombie_rider","zombie","undead","monster","mob"]}},"minecraft:on_zombie_horse":{"minecraft:behavior.use_kinetic_weapon":{"approach_distance":12,"reposition_distance":{"min":8,"max":9},"reposition_speed_multiplier":1.4,"cooldown_distance":{"min":11,"max":13},"cooldown_speed_multiplier":1.4,"weapon_reach_multiplier":0.5,"weapon_min_speed_multiplier":0.2,"hijack_mount_navigation":true,"speed_multiplier":1.4,"track_target":true,"priority":3}},"minecraft:not_on_zombie_horse":{"minecraft:behavior.use_kinetic_weapon":{"approach_distance":10,"reposition_distance":{"min":6,"max":7},"cooldown_distance":{"min":9,"max":11},"weapon_reach_multiplier":0.5,"weapon_min_speed_multiplier":0.2,"hijack_mount_navigation":true,"track_target":true,"priority":3}},"minecraft:look_to_start_transformations":{"minecraft:environment_sensor":{"triggers":[{"event":"minecraft:start_transforming_into_drowned","filters":{"test":"is_underwater"}},{"event":"minecraft:on_start_riding_zombie_horse","filters":{"all_of":[{"test":"is_vehicle_family","value":"zombiehorse"},{"domain":"minecraft:is_riding_zombie_horse","test":"bool_property","value":false}]}},{"event":"minecraft:on_stop_riding_zombie_horse","filters":{"all_of":[{"operator":"not","test":"is_vehicle_family","value":"zombiehorse"},{"domain":"minecraft:is_riding_zombie_horse","test":"bool_property"}]}}]}},"minecraft:start_drowned_transformation":{"minecraft:environment_sensor":{"triggers":[{"event":"minecraft:stop_transforming","filters":{"test":"is_underwater","value":false}},{"event":"minecraft:on_start_riding_zombie_horse","filters":{"all_of":[{"test":"is_vehicle_family","value":"zombiehorse"},{"domain":"minecraft:is_riding_zombie_horse","test":"bool_property","value":false}]}},{"event":"minecraft:on_stop_riding_zombie_horse","filters":{"all_of":[{"operator":"not","test":"is_vehicle_family","value":"zombiehorse"},{"domain":"minecraft:is_riding_zombie_horse","test":"bool_property"}]}}]},"minecraft:timer":{"looping":false,"time":30,"time_down_event":{"event":"minecraft:convert_to_drowned"}}},"minecraft:convert_to_drowned":{"minecraft:is_shaking":{},"minecraft:transformation":{"delay":{"value":15},"preserve_equipment":true,"into":"minecraft:drowned<minecraft:as_adult>","transformation_sound":"convert_to_drowned"}},"minecraft:convert_to_baby_drowned":{"minecraft:is_shaking":{},"minecraft:transformation":{"delay":{"value":15},"preserve_equipment":true,"into":"minecraft:drowned<minecraft:as_baby>","transformation_sound":"convert_to_drowned"}}},"events":{"minecraft:entity_born":{"trigger":"minecraft:as_baby"},"minecraft:entity_spawned":{"sequence":[{"randomize":[{"trigger":"minecraft:as_adult","weight":9500},{"trigger":"minecraft:as_baby","weight":425},{"trigger":"minecraft:as_baby_jockey","weight":75}]},{"randomize":[{"add":{"component_groups":["minecraft:can_break_doors"]},"weight":10},{"weight":90}]}]},"minecraft:as_adult":{"add":{"component_groups":["minecraft:zombie_default","minecraft:zombie_adult","minecraft:on_foot","minecraft:not_on_zombie_horse","minecraft:can_have_equipment"]}},"minecraft:as_baby_jockey":{"add":{"component_groups":["minecraft:zombie_baby","minecraft:zombie_jockey","minecraft:not_on_zombie_horse","minecraft:can_have_equipment"]}},"minecraft:as_baby":{"add":{"component_groups":["minecraft:zombie_default","minecraft:zombie_baby","minecraft:on_foot","minecraft:not_on_zombie_horse","minecraft:can_have_equipment"]}},"minecraft:spawn_as_rider":{"add":{"component_groups":["minecraft:zombie_adult","minecraft:zombie_rider","minecraft:on_zombie_horse"]},"set_property":{"minecraft:is_riding_zombie_horse":true}},"minecraft:on_start_riding_zombie_horse":{"add":{"component_groups":["minecraft:on_zombie_horse"]},"set_property":{"minecraft:is_riding_zombie_horse":true},"remove":{"component_groups":["minecraft:not_on_zombie_horse"]}},"minecraft:on_stop_riding_zombie_horse":{"add":{"component_groups":["minecraft:not_on_zombie_horse"]},"set_property":{"minecraft:is_riding_zombie_horse":false},"remove":{"component_groups":["minecraft:on_zombie_horse"]}},"minecraft:start_transforming_into_drowned":{"add":{"component_groups":["minecraft:start_drowned_transformation"]},"remove":{"component_groups":["minecraft:look_to_start_transformations"]}},"minecraft:stop_transforming":{"add":{"component_groups":["minecraft:look_to_start_transformations"]},"remove":{"component_groups":["minecraft:start_drowned_transformation"]}},"minecraft:convert_to_drowned":{"sequence":[{"filters":{"test":"has_component","operator":"!=","value":"minecraft:is_baby"},"add":{"component_groups":["minecraft:convert_to_drowned"]},"remove":{"component_groups":["minecraft:start_drowned_transformation"]}},{"filters":{"test":"has_component","value":"minecraft:is_baby"},"add":{"component_groups":["minecraft:convert_to_baby_drowned"]},"remove":{"component_groups":["minecraft:start_drowned_transformation"]}}]}}}},"minecraft:skeleton":{"format_version":"1.26.50","minecraft:entity":{"description":{"identifier":"minecraft:skeleton","is_summonable":true,"is_spawnable":true,"spawn_category":"monster"},"components":{"minecraft:behavior.avoid_mob_type":{"entity_types":[{"filters":{"test":"is_family","subject":"other","value":"wolf"},"max_dist":6,"walk_speed_multiplier":1.2,"sprint_speed_multiplier":1.2}],"priority":4},"minecraft:behavior.equip_item":{"priority":3},"minecraft:behavior.flee_sun":{"priority":2,"speed_multiplier":1},"minecraft:behavior.hurt_by_target":{"entity_types":[{"filters":{"operator":"not","test":"is_family","subject":"other","value":"breeze"}}],"priority":1},"minecraft:behavior.look_at_player":{"priority":7},"minecraft:behavior.nearest_attackable_target":{"reselect_targets":true,"must_see":true,"entity_types":[{"filters":{"test":"is_family","subject":"other","value":"player"}},{"filters":{"test":"is_family","subject":"other","value":"irongolem"}},{"filters":{"all_of":[{"test":"is_family","subject":"other","value":"baby_turtle"},{"test":"in_water","subject":"other","value":false}]}}],"priority":2},"minecraft:behavior.pickup_items":{"can_pickup_any_item":true,"excluded_items":[{"tags":"q.all_tags('minecraft:is_spear')"}],"pickup_based_on_chance":true,"goal_radius":2,"priority":5,"max_dist":3,"speed_multiplier":1.0},"minecraft:behavior.random_look_around":{"priority":8},"minecraft:behavior.random_stroll":{"priority":6,"speed_multiplier":1},"minecraft:behavior.ranged_attack":{"attack_interval":{"min":3.0,"max":3.0},"attack_range":{"min":0.0,"max":15.0},"priority":0},"minecraft:breathable":{"breathes_water":true,"suffocate_time":0,"total_supply":15},"minecraft:burns_in_daylight":{},"minecraft:can_climb":{},"minecraft:collision_box":{"height":1.9,"width":0.6},"minecraft:conditional_bandwidth_optimization":{},"minecraft:despawn":{"despawn_from_distance":{}},"minecraft:environment_sensor":{"triggers":[{"event":"minecraft:melee_mode","filters":{"test":"is_underwater"}},{"event":"minecraft:melee_mode","filters":{"test":"has_ranged_weapon","value":false}},{"event":"got_in_powder_snow","filters":{"subject":"self","test":"in_block","value":"minecraft:powder_snow"}}]},"minecraft:equip_item":{"excluded_items":[{"item":"minecraft:banner:15"}]},"minecraft:equipment":{"table":"loot_tables/entities/skeleton_gear.json"},"minecraft:experience_reward":{"on_death":"query.last_hit_by_player ? 5 + (query.equipment_count * Math.Random(1,3)) : 0"},"minecraft:freezing_immune":{},"minecraft:health":{"max":20,"value":20},"minecraft:hurt_on_condition":{"damage_conditions":[{"cause":"lava","damage_per_tick":4,"filters":{"test":"in_lava"}}]},"minecraft:is_hidden_when_invisible":{},"minecraft:jump.static":{},"minecraft:loot":{"table":"loot_tables/entities/skeleton.json"},"minecraft:movement":{"value":0.25},"minecraft:movement.basic":{},"minecraft:nameable":{},"minecraft:navigation.walk":{"avoid_sun":true,"is_amphibious":true,"avoid_water":true},"minecraft:physics":{},"minecraft:pushable_by_block":{},"minecraft:pushable_by_entity":{},"minecraft:rotation_locked_to_vehicle":{},"minecraft:shareables":{"items":[{"item":"minecraft:netherite_sword","priority":0,"surplus_amount":1,"want_amount":1},{"item":"minecraft:diamond_sword","priority":1,"surplus_amount":1,"want_amount":1},{"item":"minecraft:iron_sword","priority":2,"surplus_amount":1,"want_amount":1},{"item":"minecraft:golden_sword","priority":3,"surplus_amount":1,"want_amount":1},{"item":"minecraft:copper_sword","priority":4,"surplus_amount":1,"want_amount":1},{"item":"minecraft:stone_sword","priority":5,"surplus_amount":1,"want_amount":1},{"item":"minecraft:wooden_sword","priority":6,"surplus_amount":1,"want_amount":1},{"item":"minecraft:bow","priority":7,"surplus_amount":1,"want_amount":1},{"item":"minecraft:netherite_helmet","priority":0,"surplus_amount":1,"want_amount":1},{"item":"minecraft:diamond_helmet","priority":1,"surplus_amount":1,"want_amount":1},{"item":"minecraft:iron_helmet","priority":2,"surplus_amount":1,"want_amount":1},{"item":"minecraft:chainmail_helmet","priority":3,"surplus_amount":1,"want_amount":1},{"item":"minecraft:golden_helmet","priority":4,"surplus_amount":1,"want_amount":1},{"item":"minecraft:copper_helmet","priority":5,"surplus_amount":1,"want_amount":1},{"item":"minecraft:leather_helmet","priority":6,"surplus_amount":1,"want_amount":1},{"item":"minecraft:turtle_helmet","priority":7,"surplus_amount":1,"want_amount":1},{"item":"minecraft:skull:0","priority":8,"surplus_amount":1,"want_amount":1},{"item":"minecraft:skull:1","priority":8,"surplus_amount":1,"want_amount":1},{"item":"minecraft:carved_pumpkin","priority":8,"surplus_amount":1,"want_amount":1},{"item":"minecraft:netherite_chestplate","priority":0,"surplus_amount":1,"want_amount":1},{"item":"minecraft:diamond_chestplate","priority":1,"surplus_amount":1,"want_amount":1},{"item":"minecraft:iron_chestplate","priority":2,"surplus_amount":1,"want_amount":1},{"item":"minecraft:chainmail_chestplate","priority":3,"surplus_amount":1,"want_amount":1},{"item":"minecraft:golden_chestplate","priority":4,"surplus_amount":1,"want_amount":1},{"item":"minecraft:copper_chestplate","priority":5,"surplus_amount":1,"want_amount":1},{"item":"minecraft:leather_chestplate","priority":6,"surplus_amount":1,"want_amount":1},{"item":"minecraft:netherite_leggings","priority":0,"surplus_amount":1,"want_amount":1},{"item":"minecraft:diamond_leggings","priority":1,"surplus_amount":1,"want_amount":1},{"item":"minecraft:iron_leggings","priority":2,"surplus_amount":1,"want_amount":1},{"item":"minecraft:chainmail_leggings","priority":3,"surplus_amount":1,"want_amount":1},{"item":"minecraft:golden_leggings","priority":4,"surplus_amount":1,"want_amount":1},{"item":"minecraft:copper_leggings","priority":5,"surplus_amount":1,"want_amount":1},{"item":"minecraft:leather_leggings","priority":6,"surplus_amount":1,"want_amount":1},{"item":"minecraft:netherite_boots","priority":0,"surplus_amount":1,"want_amount":1},{"item":"minecraft:diamond_boots","priority":1,"surplus_amount":1,"want_amount":1},{"item":"minecraft:iron_boots","priority":2,"surplus_amount":1,"want_amount":1},{"item":"minecraft:chainmail_boots","priority":3,"surplus_amount":1,"want_amount":1},{"item":"minecraft:golden_boots","priority":4,"surplus_amount":1,"want_amount":1},{"item":"minecraft:copper_boots","priority":5,"surplus_amount":1,"want_amount":1},{"item":"minecraft:leather_boots","priority":6,"surplus_amount":1,"want_amount":1}],"singular_pickup":true},"minecraft:shooter":{"def":"minecraft:arrow"},"minecraft:type_family":{"family":["skeleton","undead","monster","mob"]}},"component_groups":{"become_stray":{"minecraft:transformation":{"drop_inventory":true,"into":"minecraft:stray","keep_level":true,"preserve_equipment":true,"transformation_sound":"convert_to_stray"}},"got_out_of_powder_snow_environment_sensor":{"minecraft:environment_sensor":{"triggers":[{"event":"minecraft:melee_mode","filters":{"test":"is_underwater"}},{"event":"minecraft:melee_mode","filters":{"test":"has_ranged_weapon","value":false}},{"event":"minecraft:ranged_mode","filters":{"all_of":[{"test":"in_water","value":false},{"test":"has_ranged_weapon"}]}}]}},"in_powder_snow":{"minecraft:environment_sensor":{"triggers":[{"event":"got_out_of_powder_snow","filters":{"operator":"not","test":"in_block","subject":"self","value":"minecraft:powder_snow"}}]},"minecraft:is_shaking":{},"minecraft:timer":{"looping":false,"time":20,"time_down_event":{"event":"become_stray_event"}}},"minecraft:lightning_immune":{"minecraft:damage_sensor":{"triggers":{"deals_damage":"no","on_damage":{"filters":{"other_with_families":"lightning"}}}}},"minecraft:melee_attack":{"minecraft:attack":{"damage":2},"minecraft:behavior.melee_box_attack":{"speed_multiplier":1.25,"track_target":true,"priority":4},"minecraft:environment_sensor":{"triggers":[{"event":"minecraft:ranged_mode","filters":{"all_of":[{"test":"in_water","value":false},{"test":"has_ranged_weapon"}]}},{"event":"got_in_powder_snow","filters":{"test":"in_block","value":"minecraft:powder_snow"}}]}},"minecraft:ranged_attack":{"minecraft:behavior.ranged_attack":{"attack_interval":{"min":3.0,"max":3.0},"attack_range":{"min":0.0,"max":15.0},"priority":0},"minecraft:environment_sensor":{"triggers":[{"event":"minecraft:melee_mode","filters":{"test":"is_underwater"}},{"event":"minecraft:melee_mode","filters":{"test":"has_ranged_weapon","value":false}},{"event":"got_in_powder_snow","filters":{"subject":"self","test":"in_block","value":"minecraft:powder_snow"}},{"event":"minecraft:switch_to_hard_ranged","filters":{"test":"is_difficulty","value":"hard"}}]},"minecraft:shooter":{"def":"minecraft:arrow","sound":"bow"}},"minecraft:ranged_attack_hard":{"minecraft:behavior.ranged_attack":{"attack_interval":{"min":2.0,"max":2.0},"attack_range":{"min":0.0,"max":15.0},"priority":0},"minecraft:environment_sensor":{"triggers":[{"event":"minecraft:melee_mode","filters":{"test":"is_underwater"}},{"event":"minecraft:melee_mode","filters":{"test":"has_ranged_weapon","value":false}},{"event":"got_in_powder_snow","filters":{"subject":"self","test":"in_block","value":"minecraft:powder_snow"}},{"event":"minecraft:switch_to_normal_ranged","filters":{"test":"is_difficulty","operator":"!=","value":"hard"}}]},"minecraft:shooter":{"def":"minecraft:arrow","sound":"bow"}}},"events":{"become_stray_event":{"add":{"component_groups":["become_stray"]}},"minecraft:switch_to_hard_ranged":{"add":{"component_groups":["minecraft:ranged_attack_hard"]},"remove":{"component_groups":["minecraft:ranged_attack"]}},"minecraft:switch_to_normal_ranged":{"add":{"component_groups":["minecraft:ranged_attack"]},"remove":{"component_groups":["minecraft:ranged_attack_hard"]}},"got_in_powder_snow":{"add":{"component_groups":["in_powder_snow"]}},"got_out_of_powder_snow":{"add":{"component_groups":["got_out_of_powder_snow_environment_sensor"]},"remove":{"component_groups":["in_powder_snow"]}},"minecraft:melee_mode":{"add":{"component_groups":["minecraft:melee_attack"]},"remove":{"component_groups":["minecraft:ranged_attack","minecraft:ranged_attack_hard","got_out_of_powder_snow_environment_sensor"]}},"minecraft:entity_spawned":{"sequence":[{"filters":{"test":"is_difficulty","value":"hard"},"add":{"component_groups":["minecraft:ranged_attack_hard"]}},{"filters":{"test":"is_difficulty","operator":"!=","value":"hard"},"add":{"component_groups":["minecraft:ranged_attack"]}}]},"minecraft:ranged_mode":{"sequence":[{"filters":{"test":"is_difficulty","value":"hard"},"add":{"component_groups":["minecraft:ranged_attack_hard"]},"remove":{"component_groups":["minecraft:melee_attack","minecraft:ranged_attack","got_out_of_powder_snow_environment_sensor"]}},{"filters":{"test":"is_difficulty","operator":"!=","value":"hard"},"add":{"component_groups":["minecraft:ranged_attack"]},"remove":{"component_groups":["minecraft:melee_attack","minecraft:ranged_attack_hard","got_out_of_powder_snow_environment_sensor"]}}]},"minecraft:spring_trap":{"add":{"component_groups":["minecraft:lightning_immune"]}}}}},"minecraft:creeper":{"format_version":"1.26.0","minecraft:entity":{"description":{"identifier":"minecraft:creeper","is_experimental":false,"is_summonable":true,"is_spawnable":true,"spawn_category":"monster"},"components":{"minecraft:attack":{"damage":3},"minecraft:behavior.avoid_mob_type":{"entity_types":[{"filters":{"AND":[{"OR":[{"test":"is_family","subject":1,"operator":0,"value":"ocelot"},{"test":"is_family","subject":1,"operator":0,"value":"cat"}]}]},"max_dist":6,"sprint_speed_multiplier":1.2}],"priority":3},"minecraft:behavior.float":{"priority":0},"minecraft:behavior.hurt_by_target":{"priority":2},"minecraft:behavior.look_at_player":{"look_time":{"min":1,"max":2},"priority":6},"minecraft:behavior.melee_attack":{"reach_multiplier":0,"speed_multiplier":1.25,"priority":4},"minecraft:behavior.nearest_attackable_target":{"must_see":true,"entity_types":[{"filters":{"AND":[{"test":"is_family","subject":1,"operator":0,"value":"player"}]}}],"priority":1},"minecraft:behavior.random_look_around":{"priority":6},"minecraft:behavior.random_stroll":{"priority":5,"speed_multiplier":1},"minecraft:behavior.swell":{"priority":2,"start_distance":2.5,"stop_distance":6},"minecraft:breathable":{"suffocate_time":0,"total_supply":15},"minecraft:can_climb":{},"minecraft:collision_box":{"height":1.8,"width":0.6},"minecraft:conditional_bandwidth_optimization":{},"minecraft:damage_sensor":{"triggers":{"deals_damage":"no","on_damage":{"event":"minecraft:become_charged","filters":{"subject":"other","test":"is_family","value":"lightning"}}}},"minecraft:despawn":{"despawn_from_distance":{}},"minecraft:experience_reward":{"on_death":"query.last_hit_by_player ? 5 : 0"},"minecraft:health":{"max":20,"value":20},"minecraft:hurt_on_condition":{"damage_conditions":[{"cause":"lava","damage_per_tick":4,"filters":{"operator":"==","test":"in_lava","subject":"self","value":true}}]},"minecraft:interact":{"interactions":{"hurt_item":1,"interact_text":"action.interact.creeper","on_interact":{"event":"minecraft:start_exploding_forced","filters":{"all_of":[{"subject":"other","test":"is_family","value":"player"},{"domain":"hand","subject":"other","test":"has_equipment","value":"flint_and_steel"},{"operator":"!=","test":"has_component","value":"minecraft:explode"}]},"target":"self"},"play_sounds":"ignite","swing":true}},"minecraft:is_hidden_when_invisible":{},"minecraft:jump.static":{},"minecraft:loot":{"table":"loot_tables/entities/creeper.json"},"minecraft:movement":{"value":0.2},"minecraft:movement.basic":{},"minecraft:nameable":{},"minecraft:navigation.walk":{"can_path_over_water":true,"using_door_annotation":true},"minecraft:on_target_escape":{"event":"minecraft:stop_exploding","target":"self"},"minecraft:physics":{},"minecraft:pushable":{"is_pushable":true,"is_pushable_by_piston":true},"minecraft:target_nearby_sensor":{"inside_range":2.5,"on_inside_range":{"event":"minecraft:start_exploding","target":"self"},"on_vision_lost_inside_range":{"event":"minecraft:stop_exploding","target":"self"},"must_see":true,"on_outside_range":{"event":"minecraft:stop_exploding","target":"self"},"outside_range":6},"minecraft:type_family":{"family":["creeper","monster","mob"]}},"component_groups":{"minecraft:charged_creeper":{"minecraft:is_charged":{}},"minecraft:charged_exploding":{"minecraft:explode":{"causes_fire":false,"fuse_lit":true,"power":6,"destroy_affected_by_griefing":true,"fuse_length":1.5}},"minecraft:exploding":{"minecraft:explode":{"causes_fire":false,"fuse_lit":true,"power":3,"destroy_affected_by_griefing":true,"fuse_length":1.5}},"minecraft:forced_charged_exploding":{"minecraft:explode":{"causes_fire":false,"fuse_lit":true,"power":6,"destroy_affected_by_griefing":true,"fuse_length":1.5},"minecraft:on_target_escape":{},"minecraft:target_nearby_sensor":{}},"minecraft:forced_exploding":{"minecraft:explode":{"causes_fire":false,"fuse_lit":true,"power":3,"destroy_affected_by_griefing":true,"fuse_length":1.5},"minecraft:on_target_escape":{},"minecraft:target_nearby_sensor":{}}},"events":{"minecraft:become_charged":{"add":{"component_groups":["minecraft:charged_creeper"]},"remove":{"component_groups":["minecraft:exploding"]}},"minecraft:stop_exploding":{"remove":{"component_groups":["minecraft:exploding"]}},"minecraft:start_exploding":{"sequence":[{"filters":{"test":"has_component","operator":"!=","value":"minecraft:is_charged"},"add":{"component_groups":["minecraft:exploding"]}},{"filters":{"test":"has_component","value":"minecraft:is_charged"},"add":{"component_groups":["minecraft:charged_exploding"]}}]},"minecraft:start_exploding_forced":{"sequence":[{"filters":{"test":"has_component","operator":"!=","value":"minecraft:is_charged"},"add":{"component_groups":["minecraft:forced_exploding"]}},{"filters":{"test":"has_component","value":"minecraft:is_charged"},"add":{"component_groups":["minecraft:forced_charged_exploding"]}}]}}}},"minecraft:iron_golem":{"format_version":"1.26.20","minecraft:entity":{"description":{"identifier":"minecraft:iron_golem","is_summonable":true,"is_spawnable":true},"components":{"minecraft:attack":{"damage":{"range_max":21,"range_min":7}},"minecraft:balloonable":{"mass":2.0},"minecraft:behavior.hurt_by_target":{"entity_types":{"filters":{"operator":"not","test":"is_family","subject":"other","value":"creeper"}},"priority":2},"minecraft:behavior.look_at_player":{"look_time":{"min":1,"max":2},"look_distance":6,"priority":7},"minecraft:behavior.melee_box_attack":{"track_target":true,"priority":1},"minecraft:behavior.move_through_village":{"only_at_night":true,"priority":3,"speed_multiplier":0.6},"minecraft:behavior.move_towards_dwelling_restriction":{"priority":4},"minecraft:behavior.move_towards_target":{"priority":2,"speed_multiplier":0.9,"within_radius":32},"minecraft:behavior.nearest_attackable_target":{"must_reach":true,"must_see":true,"entity_types":[{"filters":{"AND":[{"test":"is_family","subject":1,"operator":0,"value":"monster"},{"test":"is_family","subject":1,"operator":1,"value":"creeper"}]}},{"filters":{"AND":[{"test":"is_family","subject":1,"operator":0,"value":"hoglin"},{"test":"is_difficulty","subject":0,"operator":1,"value":0}]}},{"filters":{"AND":[{"test":"is_family","subject":1,"operator":0,"value":"zoglin"},{"test":"is_difficulty","subject":0,"operator":1,"value":0}]}}],"priority":3},"minecraft:behavior.offer_flower":{"filters":{"test":"is_daytime"},"priority":5},"minecraft:behavior.random_look_around":{"priority":8},"minecraft:behavior.random_stroll":{"priority":6,"speed_multiplier":0.6,"xz_dist":16},"minecraft:behavior.target_when_pushed":{"entity_types":[{"filters":{"all_of":[{"subject":"other","test":"is_family","value":"monster"},{"operator":"not","test":"is_family","subject":"other","value":"creeper"}]}}],"percent_chance":5.0,"priority":1},"minecraft:can_climb":{},"minecraft:collision_box":{"height":2.9,"width":1.4},"minecraft:conditional_bandwidth_optimization":{},"minecraft:damage_sensor":{"triggers":{"cause":"fall","deals_damage":"no"}},"minecraft:follow_range":{"value":64},"minecraft:health":{"max":100,"value":100},"minecraft:hurt_on_condition":{"damage_conditions":[{"cause":"lava","damage_per_tick":4,"filters":{"subject":"self","test":"in_lava"}}]},"minecraft:interact":{"interactions":[{"health_amount":25,"interact_text":"action.interact.repair","on_interact":{"filters":{"all_of":[{"subject":"other","test":"is_family","value":"player"},{"domain":"hand","subject":"other","test":"has_equipment","value":"iron_ingot"},{"test":"is_missing_health"}]}},"play_sounds":"irongolem.repair","swing":false,"use_item":true}]},"minecraft:is_hidden_when_invisible":{},"minecraft:jump.static":{},"minecraft:knockback_resistance":{"value":1.0},"minecraft:leashable":{},"minecraft:leashable_to":{},"minecraft:loot":{"table":"loot_tables/entities/iron_golem.json"},"minecraft:movement":{"value":0.25},"minecraft:movement.basic":{},"minecraft:nameable":{},"minecraft:navigation.walk":{"avoid_damage_blocks":true,"avoid_water":true,"can_path_over_water":false,"using_door_annotation":true},"minecraft:persistent":{},"minecraft:physics":{},"minecraft:preferred_path":{"default_block_cost":1.5,"jump_cost":5,"preferred_path_blocks":[{"blocks":["grass_path"],"cost":0},{"blocks":["cobblestone","stone","granite","polished_granite","diorite","polished_diorite","andesite","polished_andesite","stone_bricks","mossy_stone_bricks","cracked_stone_bricks","chiseled_stone_bricks","sandstone","cut_sandstone","chiseled_sandstone","smooth_sandstone","mossy_cobblestone","smooth_stone_slab","sandstone_slab","cobblestone_slab","brick_slab","stone_brick_slab","quartz_slab","nether_brick_slab","red_sandstone_slab","purpur_slab","prismarine_slab","dark_prismarine_slab","prismarine_brick_slab","mossy_cobblestone_slab","smooth_sandstone_slab","red_nether_brick_slab","end_stone_brick_slab","smooth_red_sandstone_slab","polished_andesite_slab","andesite_slab","diorite_slab","polished_diorite_slab","granite_slab","polished_granite_slab","mossy_stone_brick_slab","smooth_quartz_slab","normal_stone_slab","cut_sandstone_slab","cut_red_sandstone_slab","smooth_stone_double_slab","sandstone_double_slab","cobblestone_double_slab","brick_double_slab","stone_brick_double_slab","quartz_double_slab","nether_brick_double_slab","red_sandstone_double_slab","purpur_double_slab","prismarine_double_slab","dark_prismarine_double_slab","prismarine_brick_double_slab","mossy_cobblestone_double_slab","smooth_sandstone_double_slab","red_nether_brick_double_slab","end_stone_brick_double_slab","smooth_red_sandstone_double_slab","polished_andesite_double_slab","andesite_double_slab","diorite_double_slab","polished_diorite_double_slab","granite_double_slab","polished_granite_double_slab","mossy_stone_brick_double_slab","smooth_quartz_double_slab","normal_stone_double_slab","cut_sandstone_double_slab","cut_red_sandstone_double_slab","oak_slab","spruce_slab","birch_slab","jungle_slab","acacia_slab","dark_oak_slab","oak_double_slab","spruce_double_slab","birch_double_slab","jungle_double_slab","acacia_double_slab","dark_oak_double_slab","oak_planks","spruce_planks","birch_planks","jungle_planks","acacia_planks","dark_oak_planks","brick_block","nether_brick","red_nether_brick","end_bricks","red_sandstone","cut_red_sandstone","chiseled_red_sandstone","smooth_red_sandstone","white_stained_glass","orange_stained_glass","magenta_stained_glass","light_blue_stained_glass","yellow_stained_glass","lime_stained_glass","pink_stained_glass","gray_stained_glass","light_gray_stained_glass","cyan_stained_glass","purple_stained_glass","blue_stained_glass","brown_stained_glass","green_stained_glass","red_stained_glass","black_stained_glass","glass","glowstone","prismarine","emerald_block","diamond_block","lapis_block","gold_block","redstone_block","purple_glazed_terracotta","white_glazed_terracotta","orange_glazed_terracotta","magenta_glazed_terracotta","light_blue_glazed_terracotta","yellow_glazed_terracotta","lime_glazed_terracotta","pink_glazed_terracotta","gray_glazed_terracotta","silver_glazed_terracotta","cyan_glazed_terracotta","blue_glazed_terracotta","brown_glazed_terracotta","green_glazed_terracotta","red_glazed_terracotta","black_glazed_terracotta"],"cost":1},{"blocks":["bed","lectern","composter","grindstone","blast_furnace","smoker","fletching_table","cartography_table","brewing_stand","smithing_table","cauldron","barrel","loom","stonecutter"],"cost":50}],"max_fall_blocks":1},"minecraft:pushable_by_block":{},"minecraft:pushable_by_entity":{},"minecraft:type_family":{"family":["irongolem","mob"]},"minecraft:apply_knockback_rules":{"presets":[{"horizontal_power":0.52,"vertical_power":0.39,"vertical_velocity_cap":0.8}]}},"component_groups":{"minecraft:player_created":{"minecraft:behavior.hurt_by_target":{"entity_types":{"filters":{"all_of":[{"test":"is_family","operator":"not","subject":"other","value":"player"},{"test":"is_family","operator":"not","subject":"other","value":"creeper"}]}},"priority":2}},"minecraft:village_created":{"minecraft:behavior.defend_village_target":{"must_reach":true,"entity_types":[{"filters":{"AND":[{"OR":[{"test":"is_family","subject":1,"operator":0,"value":"mob"},{"test":"is_family","subject":1,"operator":0,"value":"player"}]}]}}],"priority":1},"minecraft:dweller":{"dwelling_type":"village","can_find_poi":false,"can_migrate":true,"dweller_role":"defender","first_founding_reward":0,"update_interval_base":60,"update_interval_variant":40}}},"events":{"minecraft:from_player":{"add":{"component_groups":["minecraft:player_created"]}},"minecraft:from_village":{"add":{"component_groups":["minecraft:village_created"]}}}}},"minecraft:spider":{"format_version":"1.26.50","minecraft:entity":{"description":{"identifier":"minecraft:spider","is_summonable":true,"is_spawnable":true,"spawn_category":"monster"},"components":{"minecraft:attack":{"damage":2},"minecraft:behavior.avoid_mob_type":{"entity_types":[{"filters":{"all_of":[{"test":"is_family","subject":"other","value":"armadillo"},{"test":"enum_property","subject":"other","domain":"minecraft:armadillo_state","value":"unrolled"}]},"max_dist":6,"sprint_speed_multiplier":1.2}],"priority":2},"minecraft:behavior.float":{"priority":1},"minecraft:behavior.hurt_by_target":{"entity_types":[{"filters":{"operator":"!=","test":"is_family","subject":"other","value":"breeze"}}],"priority":1},"minecraft:behavior.look_at_player":{"look_distance":6,"priority":7},"minecraft:behavior.mount_pathing":{"priority":5,"target_dist":0.0,"speed_multiplier":1.25,"track_target":true},"minecraft:behavior.random_look_around":{"priority":7},"minecraft:behavior.random_stroll":{"priority":6,"speed_multiplier":0.8},"minecraft:block_movement_slowdown_immunity":{"blocks":["minecraft:web"]},"minecraft:breathable":{"suffocate_time":0,"total_supply":15},"minecraft:can_climb":{},"minecraft:collision_box":{"height":0.9,"width":1.4},"minecraft:conditional_bandwidth_optimization":{},"minecraft:despawn":{"despawn_from_distance":{}},"minecraft:experience_reward":{"on_death":"query.last_hit_by_player ? 5 : 0"},"minecraft:health":{"max":16,"value":16},"minecraft:hurt_on_condition":{"damage_conditions":[{"cause":"lava","damage_per_tick":4,"filters":{"subject":"self","test":"in_lava"}}]},"minecraft:is_hidden_when_invisible":{},"minecraft:jump.static":{},"minecraft:loot":{"table":"loot_tables/entities/spider.json"},"minecraft:movement":{"value":0.3},"minecraft:movement.basic":{},"minecraft:nameable":{},"minecraft:navigation.climb":{"can_path_over_water":true},"minecraft:physics":{},"minecraft:pushable_by_entity":{},"minecraft:pushable_by_block":{},"minecraft:renders_when_invisible":{},"minecraft:rideable":{"family_types":["baby_undead"],"seat_count":1,"seats":{"position":[0.0,0.54,-0.1]}},"minecraft:type_family":{"family":["spider","monster","mob","arthropod"]}},"component_groups":{"minecraft:spider_angry":{"minecraft:angry":{"calm_event":{"event":"minecraft:become_calm","target":"self"},"duration":10,"duration_delta":3},"minecraft:behavior.leap_at_target":{"must_be_on_ground":false,"priority":4,"yd":0.4},"minecraft:behavior.melee_box_attack":{"track_target":true,"priority":3}},"minecraft:spider_hostile":{"minecraft:behavior.nearest_attackable_target":{"attack_interval":{"min":5,"max":5},"must_see":true,"entity_types":[{"filters":{"any_of":[{"test":"is_family","subject":"other","value":"player"},{"test":"is_family","subject":"other","value":"snowgolem"},{"test":"is_family","subject":"other","value":"irongolem"}]}}],"priority":2},"minecraft:environment_sensor":{"triggers":{"event":"minecraft:become_neutral","filters":{"operator":">","test":"is_brightness","value":0.49}}},"minecraft:on_target_acquired":{"event":"minecraft:become_angry"}},"minecraft:spider_bogged_jockey":{"minecraft:addrider":{"riders":[{"entity_type":"minecraft:bogged"}]},"minecraft:rideable":{"family_types":["skeleton"],"seat_count":1,"seats":{"position":[0.0,0.325,-0.1]}}},"minecraft:spider_wither_jockey":{"minecraft:addrider":{"riders":[{"entity_type":"minecraft:wither_skeleton"}]},"minecraft:rideable":{"family_types":["skeleton"],"seat_count":1,"seats":{"position":[0.0,0.54,0.0]}}},"minecraft:spider_neutral":{"minecraft:environment_sensor":{"triggers":{"event":"minecraft:become_hostile","filters":{"operator":"<","test":"is_brightness","value":0.49}}},"minecraft:on_target_acquired":{"event":"minecraft:become_angry"}},"minecraft:spider_jockey":{"minecraft:addrider":{"riders":[{"entity_type":"minecraft:skeleton"}]},"minecraft:rideable":{"family_types":["skeleton"],"seat_count":1,"seats":{"position":[0.0,0.54,0.0]}}},"minecraft:spider_stray_jockey":{"minecraft:addrider":{"riders":[{"entity_type":"minecraft:stray"}]},"minecraft:rideable":{"family_types":["skeleton"],"seat_count":1,"seats":{"position":[0.0,0.54,0.0]}}},"minecraft:spider_parched_jockey":{"minecraft:addrider":{"riders":[{"entity_type":"minecraft:parched"}]},"minecraft:rideable":{"family_types":["skeleton"],"seat_count":1,"seats":{"position":[0.0,0.325,-0.1]}}}},"events":{"minecraft:become_angry":{"add":{"component_groups":["minecraft:spider_angry"]}},"minecraft:entity_spawned_with_default_jockey":{"filters":{"any_of":[{"test":"is_daytime","value":false},{"test":"is_underground","value":true}]},"add":{"component_groups":["minecraft:spider_jockey","minecraft:spider_neutral"]}},"minecraft:become_calm":{"remove":{"component_groups":["minecraft:spider_angry"]}},"minecraft:become_hostile":{"add":{"component_groups":["minecraft:spider_hostile"]},"remove":{"component_groups":["minecraft:spider_neutral"]}},"minecraft:entity_spawned_with_biome_specific_jockey":{"first_valid":[{"filters":{"all_of":[{"test":"is_daytime","value":false},{"test":"is_snow_covered","value":true},{"test":"is_underground","value":false}]},"add":{"component_groups":["minecraft:spider_stray_jockey","minecraft:spider_neutral"]}},{"filters":{"all_of":[{"test":"is_daytime","value":false},{"test":"is_underground","value":false},{"any_of":[{"test":"has_biome_tag","value":"swamp"},{"test":"has_biome_tag","value":"mangrove_swamp"}]}]},"add":{"component_groups":["minecraft:spider_bogged_jockey","minecraft:spider_neutral"]}},{"filters":{"all_of":[{"test":"is_daytime","value":false},{"test":"is_underground","value":false},{"test":"has_biome_tag","value":"desert"}]},"add":{"component_groups":["minecraft:spider_parched_jockey","minecraft:spider_neutral"]}},{"filters":{"test":"has_biome_tag","value":"nether"},"add":{"component_groups":["minecraft:spider_wither_jockey","minecraft:spider_neutral"]}},{"trigger":"minecraft:entity_spawned_with_default_jockey"}]},"minecraft:become_neutral":{"add":{"component_groups":["minecraft:spider_neutral"]},"remove":{"component_groups":["minecraft:spider_hostile"]}},"minecraft:entity_spawned":{"randomize":[{"randomize":[{"trigger":"minecraft:entity_spawned_with_biome_specific_jockey","weight":80},{"trigger":"minecraft:entity_spawned_with_default_jockey","weight":20}],"weight":1},{"add":{"component_groups":["minecraft:spider_neutral"]},"weight":99}]}}}},"minecraft:villager_v2":{"format_version":"1.26.20","minecraft:entity":{"description":{"identifier":"minecraft:villager_v2","is_summonable":false,"is_spawnable":true},"components":{"minecraft:annotation.open_door":{},"minecraft:behavior.avoid_mob_type":{"entity_types":[{"filters":{"any_of":[{"test":"is_family","subject":"other","value":"zombie"},{"test":"is_family","subject":"other","value":"zombie_villager"},{"test":"is_family","subject":"other","value":"illager"},{"test":"is_family","subject":"other","value":"vex"},{"test":"is_family","subject":"other","value":"zoglin"}]},"max_dist":8,"walk_speed_multiplier":0.6,"sprint_speed_multiplier":0.6}],"priority":4},"minecraft:behavior.float":{"priority":0},"minecraft:behavior.hide":{"duration":30,"poi_type":"bed","priority":0,"speed_multiplier":0.8},"minecraft:behavior.look_at_player":{"priority":9},"minecraft:behavior.look_at_trading_player":{"priority":7},"minecraft:behavior.move_indoors":{"priority":6,"speed_multiplier":0.8,"timeout_cooldown":8},"minecraft:behavior.move_towards_dwelling_restriction":{"speed_multiplier":0.6,"priority":11},"minecraft:behavior.panic":{"priority":1,"speed_multiplier":0.6},"minecraft:behavior.pickup_items":{"can_pickup_to_hand_or_equipment":false,"goal_radius":2,"priority":4,"max_dist":3,"speed_multiplier":0.5},"minecraft:behavior.random_stroll":{"priority":11,"speed_multiplier":0.6},"minecraft:behavior.share_items":{"entity_types":[{"filters":{"subject":"other","test":"is_family","value":"villager"}}],"goal_radius":2,"priority":10,"max_dist":3,"speed_multiplier":0.5},"minecraft:behavior.trade_with_player":{"filters":{"all_of":[{"all_of":[{"test":"in_water","value":false}]},{"any_of":[{"test":"on_ground","value":true},{"test":"is_sleeping","value":true}]}]},"priority":2},"minecraft:breathable":{"suffocate_time":0,"total_supply":15},"minecraft:can_climb":{},"minecraft:collision_box":{"height":1.9,"width":0.6},"minecraft:conditional_bandwidth_optimization":{},"minecraft:damage_sensor":{"triggers":[{"deals_damage":"no","on_damage":{"event":"become_witch","filters":[{"subject":"other","test":"is_family","value":"lightning"},{"operator":"!=","test":"is_difficulty","value":"peaceful"}]}},{"on_damage":{"event":"become_zombie","filters":{"all_of":[{"test":"has_damage","value":"fatal"}],"any_of":[{"subject":"other","test":"is_family","value":"zombie"},{"subject":"other","test":"is_family","value":"husk"}]}}}]},"minecraft:dweller":{"can_find_poi":true,"dwelling_type":"village","can_migrate":true,"dweller_role":"inhabitant","first_founding_reward":5,"update_interval_base":60,"update_interval_variant":40},"minecraft:equipment":{"slot_drop_chance":[{"drop_chance":0,"slot":"slot.weapon.mainhand"}]},"minecraft:follow_range":{"value":128},"minecraft:health":{"max":20,"value":20},"minecraft:hide":{},"minecraft:hurt_on_condition":{"damage_conditions":[{"cause":"lava","damage_per_tick":4,"filters":{"operator":"==","test":"in_lava","subject":"self","value":true}}]},"minecraft:inventory":{"inventory_size":8,"private":true},"minecraft:is_hidden_when_invisible":{},"minecraft:jump.static":{},"minecraft:mark_variant":{"value":0},"minecraft:movement":{"value":0.5},"minecraft:movement.basic":{},"minecraft:nameable":{},"minecraft:navigation.walk":{"avoid_water":true,"can_open_doors":true,"can_pass_doors":true,"can_path_over_water":true},"minecraft:offspring":{"offspring_pairs":{"minecraft:villager_v2":"minecraft:villager_v2"}},"minecraft:persistent":{},"minecraft:physics":{},"minecraft:pushable_by_entity":{},"minecraft:pushable_by_block":{},"minecraft:spawn_egg_interaction":{},"minecraft:type_family":{"family":["villager","mob"]}},"component_groups":{"adult":{"minecraft:preferred_path":{"default_block_cost":3,"jump_cost":20,"preferred_path_blocks":[{"blocks":["grass_path"],"cost":0},{"blocks":["cobblestone","stone","granite","polished_granite","diorite","polished_diorite","andesite","polished_andesite","stone_bricks","mossy_stone_bricks","cracked_stone_bricks","chiseled_stone_bricks","sandstone","cut_sandstone","chiseled_sandstone","smooth_sandstone","mossy_cobblestone","smooth_stone_slab","sandstone_slab","cobblestone_slab","brick_slab","stone_brick_slab","quartz_slab","nether_brick_slab","red_sandstone_slab","purpur_slab","prismarine_slab","dark_prismarine_slab","prismarine_brick_slab","mossy_cobblestone_slab","smooth_sandstone_slab","red_nether_brick_slab","end_stone_brick_slab","smooth_red_sandstone_slab","polished_andesite_slab","andesite_slab","diorite_slab","polished_diorite_slab","granite_slab","polished_granite_slab","mossy_stone_brick_slab","smooth_quartz_slab","normal_stone_slab","cut_sandstone_slab","cut_red_sandstone_slab","smooth_stone_double_slab","sandstone_double_slab","cobblestone_double_slab","brick_double_slab","stone_brick_double_slab","quartz_double_slab","nether_brick_double_slab","red_sandstone_double_slab","purpur_double_slab","prismarine_double_slab","dark_prismarine_double_slab","prismarine_brick_double_slab","mossy_cobblestone_double_slab","smooth_sandstone_double_slab","red_nether_brick_double_slab","end_stone_brick_double_slab","smooth_red_sandstone_double_slab","polished_andesite_double_slab","andesite_double_slab","diorite_double_slab","polished_diorite_double_slab","granite_double_slab","polished_granite_double_slab","mossy_stone_brick_double_slab","smooth_quartz_double_slab","normal_stone_double_slab","cut_sandstone_double_slab","cut_red_sandstone_double_slab","oak_slab","spruce_slab","birch_slab","jungle_slab","acacia_slab","dark_oak_slab","oak_double_slab","spruce_double_slab","birch_double_slab","jungle_double_slab","acacia_double_slab","dark_oak_double_slab","oak_planks","spruce_planks","birch_planks","jungle_planks","acacia_planks","dark_oak_planks","brick_block","nether_brick","red_nether_brick","end_bricks","red_sandstone","cut_red_sandstone","chiseled_red_sandstone","smooth_red_sandstone","white_stained_glass","orange_stained_glass","magenta_stained_glass","light_blue_stained_glass","yellow_stained_glass","lime_stained_glass","pink_stained_glass","gray_stained_glass","light_gray_stained_glass","cyan_stained_glass","purple_stained_glass","blue_stained_glass","brown_stained_glass","green_stained_glass","red_stained_glass","black_stained_glass","glass","glowstone","prismarine","emerald_block","diamond_block","lapis_block","gold_block","redstone_block","purple_glazed_terracotta","white_glazed_terracotta","orange_glazed_terracotta","magenta_glazed_terracotta","light_blue_glazed_terracotta","yellow_glazed_terracotta","lime_glazed_terracotta","pink_glazed_terracotta","gray_glazed_terracotta","silver_glazed_terracotta","cyan_glazed_terracotta","blue_glazed_terracotta","brown_glazed_terracotta","green_glazed_terracotta","red_glazed_terracotta","black_glazed_terracotta"],"cost":1},{"blocks":["bed","lectern","composter","grindstone","blast_furnace","smoker","fletching_table","cartography_table","brewing_stand","smithing_table","cauldron","barrel","loom","stonecutter"],"cost":50}],"max_fall_blocks":1},"minecraft:collision_box":{"height":1.9,"width":0.6}},"become_zombie":{"minecraft:transformation":{"into":"minecraft:zombie_villager_v2","keep_level":true}},"armorer":{"minecraft:behavior.trade_interest":{"carried_item_switch_time":2,"cooldown":2,"interest_time":45,"within_radius":6,"priority":5,"remove_item_time":1},"minecraft:dweller":{"can_find_poi":true,"dwelling_type":"village","can_migrate":true,"dweller_role":"inhabitant","preferred_profession":"armorer","first_founding_reward":5,"update_interval_base":60,"update_interval_variant":40},"minecraft:economy_trade_table":{"cured_discount":[-25,-20],"display_name":"entity.villager.armor","max_cured_discount":[-25,-20],"new_screen":true,"persist_trades":true,"table":"trading/economy_trades/armorer_trades.json"},"minecraft:type_family":{"family":["villager","blacksmith","armorer","mob"]},"minecraft:variant":{"value":8}},"bed_schedule_villager":{"minecraft:behavior.sleep":{"priority":3,"sleep_collider_height":0.3,"sleep_collider_width":1,"sleep_y_offset":0.6,"speed_multiplier":0.6,"timeout_cooldown":10}},"cartographer":{"minecraft:behavior.trade_interest":{"carried_item_switch_time":2,"cooldown":2,"interest_time":45,"within_radius":6,"priority":5,"remove_item_time":1},"minecraft:dweller":{"can_find_poi":true,"dwelling_type":"village","can_migrate":true,"dweller_role":"inhabitant","preferred_profession":"cartographer","first_founding_reward":5,"update_interval_base":60,"update_interval_variant":40},"minecraft:economy_trade_table":{"cured_discount":[-25,-20],"display_name":"entity.villager.cartographer","max_cured_discount":[-25,-20],"new_screen":true,"persist_trades":true,"table":"trading/economy_trades/cartographer_trades.json"},"minecraft:type_family":{"family":["villager","cartographer","mob"]},"minecraft:variant":{"value":6}},"basic_schedule":{"minecraft:scheduler":{"max_delay_secs":10,"scheduled_events":[{"event":"minecraft:schedule_wander_villager","filters":{"all_of":[{"operator":">=","test":"hourly_clock_time","value":0},{"operator":"<","test":"hourly_clock_time","value":8000}]}},{"event":"minecraft:schedule_gather_villager","filters":{"all_of":[{"operator":">=","test":"hourly_clock_time","value":8000},{"operator":"<","test":"hourly_clock_time","value":10000}]}},{"event":"minecraft:schedule_wander_villager","filters":{"all_of":[{"operator":">=","test":"hourly_clock_time","value":10000},{"operator":"<","test":"hourly_clock_time","value":11000}]}},{"event":"minecraft:schedule_home_villager","filters":{"all_of":[{"operator":">=","test":"hourly_clock_time","value":11000},{"operator":"<","test":"hourly_clock_time","value":12000}]}},{"event":"minecraft:schedule_bed_villager","filters":{"all_of":[{"operator":">=","test":"hourly_clock_time","value":12000},{"operator":"<","test":"hourly_clock_time","value":24000}]}}],"min_delay_secs":0}},"snow_villager":{"minecraft:mark_variant":{"value":4}},"baby":{"minecraft:ageable":{"duration":1200,"grow_up":{"event":"minecraft:ageable_grow_up","target":"self"}},"minecraft:behavior.take_flower":{"filters":{"all_of":[{"test":"is_daytime","value":true}]},"priority":9},"minecraft:is_baby":{},"minecraft:preferred_path":{"default_block_cost":1.5,"jump_cost":5,"preferred_path_blocks":[{"blocks":["grass_path"],"cost":0},{"blocks":["cobblestone","stone","granite","polished_granite","diorite","polished_diorite","andesite","polished_andesite","stone_bricks","mossy_stone_bricks","cracked_stone_bricks","chiseled_stone_bricks","sandstone","cut_sandstone","chiseled_sandstone","smooth_sandstone","mossy_cobblestone","smooth_stone_slab","sandstone_slab","cobblestone_slab","brick_slab","stone_brick_slab","quartz_slab","nether_brick_slab","red_sandstone_slab","purpur_slab","prismarine_slab","dark_prismarine_slab","prismarine_brick_slab","mossy_cobblestone","smooth_sandstone_slab","red_nether_brick_slab","end_stone_brick_slab","smooth_red_sandstone_slab","polished_andesite_slab","andesite_slab","diorite_slab","polished_diorite_slab","granite_slab","polished_granite_slab","mossy_stone_brick_slab","smooth_quartz_slab","normal_stone_slab","cut_sandstone_slab","cut_red_sandstone_slab","smooth_stone_double_slab","sandstone_double_slab","cobblestone_double_slab","brick_double_slab","stone_brick_double_slab","quartz_double_slab","nether_brick_double_slab","red_sandstone_double_slab","purpur_double_slab","prismarine_double_slab","dark_prismarine_double_slab","prismarine_brick_double_slab","mossy_cobblestone_double_slab","smooth_sandstone_double_slab","red_nether_brick_double_slab","end_stone_brick_double_slab","smooth_red_sandstone_double_slab","polished_andesite_double_slab","andesite_double_slab","diorite_double_slab","polished_diorite_double_slab","granite_double_slab","polished_granite_double_slab","mossy_stone_brick_double_slab","smooth_quartz_double_slab","normal_stone_double_slab","cut_sandstone_double_slab","cut_red_sandstone_double_slab","oak_slab","spruce_slab","birch_slab","jungle_slab","acacia_slab","dark_oak_slab","oak_double_slab","spruce_double_slab","birch_double_slab","jungle_double_slab","acacia_double_slab","dark_oak_double_slab","oak_planks","spruce_planks","birch_planks","jungle_planks","acacia_planks","dark_oak_planks","brick_block","nether_brick","red_nether_brick","end_bricks","red_sandstone","cut_red_sandstone","chiseled_red_sandstone","smooth_red_sandstone","white_stained_glass","orange_stained_glass","magenta_stained_glass","light_blue_stained_glass","yellow_stained_glass","lime_stained_glass","pink_stained_glass","gray_stained_glass","light_gray_stained_glass","cyan_stained_glass","purple_stained_glass","blue_stained_glass","brown_stained_glass","green_stained_glass","red_stained_glass","black_stained_glass","glass","glowstone","prismarine","emerald_block","diamond_block","lapis_block","gold_block","redstone_block","purple_glazed_terracotta","white_glazed_terracotta","orange_glazed_terracotta","magenta_glazed_terracotta","light_blue_glazed_terracotta","yellow_glazed_terracotta","lime_glazed_terracotta","pink_glazed_terracotta","gray_glazed_terracotta","silver_glazed_terracotta","cyan_glazed_terracotta","blue_glazed_terracotta","brown_glazed_terracotta","green_glazed_terracotta","red_glazed_terracotta","black_glazed_terracotta"],"cost":1},{"blocks":["bed","lectern","composter","grindstone","blast_furnace","smoker","fletching_table","cartography_table","brewing_stand","smithing_table","cauldron","barrel","loom","stonecutter"],"cost":50}],"max_fall_blocks":1},"minecraft:scale":{"value":0.5},"minecraft:collision_box":{"height":1.96,"width":0.98}},"make_and_receive_love":{"minecraft:behavior.make_love":{"priority":5},"minecraft:behavior.receive_love":{"priority":6}},"behavior_non_peasant":{"minecraft:shareables":{"items":[{"item":"minecraft:bread","stored_in_inventory":true,"surplus_amount":6,"want_amount":3},{"item":"minecraft:carrot","stored_in_inventory":true,"surplus_amount":24,"want_amount":12},{"item":"minecraft:potato","stored_in_inventory":true,"surplus_amount":24,"want_amount":12},{"item":"minecraft:beetroot","stored_in_inventory":true,"surplus_amount":24,"want_amount":12}]}},"become_witch":{"minecraft:transformation":{"delay":0.5,"into":"minecraft:witch"}},"weaponsmith":{"minecraft:behavior.trade_interest":{"carried_item_switch_time":2,"cooldown":2,"interest_time":45,"within_radius":6,"priority":5,"remove_item_time":1},"minecraft:dweller":{"can_find_poi":true,"dwelling_type":"village","can_migrate":true,"dweller_role":"inhabitant","preferred_profession":"weaponsmith","first_founding_reward":5,"update_interval_base":60,"update_interval_variant":40},"minecraft:economy_trade_table":{"cured_discount":[-25,-20],"display_name":"entity.villager.weapon","max_cured_discount":[-25,-20],"new_screen":true,"persist_trades":true,"table":"trading/economy_trades/weapon_smith_trades.json"},"minecraft:type_family":{"family":["villager","blacksmith","weaponsmith","mob"]},"minecraft:variant":{"value":9}},"butcher":{"minecraft:behavior.trade_interest":{"carried_item_switch_time":2,"cooldown":2,"interest_time":45,"within_radius":6,"priority":5,"remove_item_time":1},"minecraft:dweller":{"can_find_poi":true,"dwelling_type":"village","can_migrate":true,"dweller_role":"inhabitant","preferred_profession":"butcher","first_founding_reward":5,"update_interval_base":60,"update_interval_variant":40},"minecraft:economy_trade_table":{"cured_discount":[-25,-20],"display_name":"entity.villager.butcher","max_cured_discount":[-25,-20],"new_screen":true,"persist_trades":true,"table":"trading/economy_trades/butcher_trades.json"},"minecraft:type_family":{"family":["villager","artisan","butcher","mob"]},"minecraft:variant":{"value":11}},"behavior_peasant":{"minecraft:shareables":{"items":[{"item":"minecraft:bread","stored_in_inventory":true,"surplus_amount":6,"want_amount":3},{"item":"minecraft:carrot","stored_in_inventory":true,"surplus_amount":24,"want_amount":60},{"item":"minecraft:potato","stored_in_inventory":true,"surplus_amount":24,"want_amount":60},{"item":"minecraft:beetroot","stored_in_inventory":true,"surplus_amount":24,"want_amount":60},{"item":"minecraft:wheat_seeds","pickup_only":true,"stored_in_inventory":true,"surplus_amount":64,"want_amount":64},{"item":"minecraft:beetroot_seeds","pickup_only":true,"stored_in_inventory":true,"surplus_amount":64,"want_amount":64},{"craft_into":"minecraft:bread","want_amount":45,"item":"minecraft:wheat","stored_in_inventory":true,"surplus_amount":18}]}},"minecraft:celebrate":{"minecraft:behavior.celebrate_survive":{"duration":30,"fireworks_interval":{"max":7,"min":2},"on_celebration_end_event":{"event":"minecraft:stop_celebrating","target":"self"},"priority":5},"minecraft:behavior.move_outdoors":{"priority":2,"speed_multiplier":0.8,"timeout_cooldown":8}},"child_schedule":{"minecraft:scheduler":{"max_delay_secs":10,"scheduled_events":[{"event":"minecraft:schedule_play_villager","filters":{"all_of":[{"operator":">=","test":"hourly_clock_time","value":0},{"operator":"<","test":"hourly_clock_time","value":11000}]}},{"event":"minecraft:schedule_home_villager","filters":{"all_of":[{"operator":">=","test":"hourly_clock_time","value":11000},{"operator":"<","test":"hourly_clock_time","value":12000}]}},{"event":"minecraft:schedule_bed_villager","filters":{"all_of":[{"operator":">=","test":"hourly_clock_time","value":12000},{"operator":"<","test":"hourly_clock_time","value":24000}]}}],"min_delay_secs":0}},"cleric":{"minecraft:behavior.trade_interest":{"carried_item_switch_time":2,"cooldown":2,"interest_time":45,"within_radius":6,"priority":5,"remove_item_time":1},"minecraft:dweller":{"can_find_poi":true,"dwelling_type":"village","can_migrate":true,"dweller_role":"inhabitant","preferred_profession":"cleric","first_founding_reward":5,"update_interval_base":60,"update_interval_variant":40},"minecraft:economy_trade_table":{"cured_discount":[-25,-20],"display_name":"entity.villager.cleric","max_cured_discount":[-25,-20],"new_screen":true,"persist_trades":true,"table":"trading/economy_trades/cleric_trades.json"},"minecraft:type_family":{"family":["villager","priest","cleric","mob"]},"minecraft:variant":{"value":7}},"desert_villager":{"minecraft:mark_variant":{"value":1}},"farmer":{"minecraft:behavior.trade_interest":{"carried_item_switch_time":2,"cooldown":2,"interest_time":45,"within_radius":6,"priority":5,"remove_item_time":1},"minecraft:dweller":{"can_find_poi":true,"dwelling_type":"village","can_migrate":true,"dweller_role":"inhabitant","preferred_profession":"farmer","first_founding_reward":5,"update_interval_base":60,"update_interval_variant":40},"minecraft:economy_trade_table":{"cured_discount":[-25,-20],"display_name":"entity.villager.farmer","max_cured_discount":[-25,-20],"new_screen":true,"persist_trades":true,"table":"trading/economy_trades/farmer_trades.json"},"minecraft:type_family":{"family":["villager","peasant","farmer","mob"]},"minecraft:variant":{"value":1}},"work_schedule_farmer":{"minecraft:behavior.fertilize_farm_block":{"priority":8},"minecraft:behavior.harvest_farm_block":{"priority":7},"minecraft:behavior.work_composter":{"active_time":250,"priority":9,"can_work_in_rain":false,"on_arrival":{"event":"minecraft:resupply_trades","target":"self"},"goal_cooldown":200,"speed_multiplier":0.5,"work_in_rain_tolerance":100},"minecraft:shareables":{"items":[{"item":"minecraft:bread","stored_in_inventory":true,"surplus_amount":6,"want_amount":3},{"item":"minecraft:carrot","stored_in_inventory":true,"surplus_amount":24,"want_amount":60},{"item":"minecraft:potato","stored_in_inventory":true,"surplus_amount":24,"want_amount":60},{"item":"minecraft:beetroot","stored_in_inventory":true,"surplus_amount":24,"want_amount":60},{"item":"minecraft:wheat_seeds","pickup_only":true,"stored_in_inventory":true,"surplus_amount":64,"want_amount":64},{"item":"minecraft:beetroot_seeds","pickup_only":true,"stored_in_inventory":true,"surplus_amount":64,"want_amount":64},{"item":"minecraft:torchflower_seeds","pickup_only":true,"stored_in_inventory":true,"surplus_amount":64,"want_amount":64},{"item":"minecraft:pitcher_pod","pickup_only":true,"stored_in_inventory":true,"surplus_amount":64,"want_amount":64},{"item":"minecraft:bone_meal","stored_in_inventory":true,"surplus_amount":64,"want_amount":64},{"craft_into":"minecraft:bread","want_amount":45,"item":"minecraft:wheat","stored_in_inventory":true,"surplus_amount":18}]}},"farmer_schedule":{"minecraft:scheduler":{"max_delay_secs":10,"scheduled_events":[{"event":"minecraft:schedule_work_farmer","filters":{"all_of":[{"operator":">=","test":"hourly_clock_time","value":0},{"operator":"<","test":"hourly_clock_time","value":8000}]}},{"event":"minecraft:schedule_gather_villager","filters":{"all_of":[{"operator":">=","test":"hourly_clock_time","value":8000},{"operator":"<","test":"hourly_clock_time","value":10000}]}},{"event":"minecraft:schedule_work_farmer","filters":{"all_of":[{"operator":">=","test":"hourly_clock_time","value":10000},{"operator":"<","test":"hourly_clock_time","value":11000}]}},{"event":"minecraft:schedule_home_villager","filters":{"all_of":[{"operator":">=","test":"hourly_clock_time","value":11000},{"operator":"<","test":"hourly_clock_time","value":12000}]}},{"event":"minecraft:schedule_bed_villager","filters":{"all_of":[{"operator":">=","test":"hourly_clock_time","value":12000},{"operator":"<","test":"hourly_clock_time","value":24000}]}}],"min_delay_secs":0}},"work_schedule":{"minecraft:scheduler":{"max_delay_secs":10,"scheduled_events":[{"event":"minecraft:schedule_work_pro_villager","filters":{"all_of":[{"operator":">=","test":"hourly_clock_time","value":0},{"operator":"<","test":"hourly_clock_time","value":8000}]}},{"event":"minecraft:schedule_gather_villager","filters":{"all_of":[{"operator":">=","test":"hourly_clock_time","value":8000},{"operator":"<","test":"hourly_clock_time","value":10000}]}},{"event":"minecraft:schedule_work_pro_villager","filters":{"all_of":[{"operator":">=","test":"hourly_clock_time","value":10000},{"operator":"<","test":"hourly_clock_time","value":11000}]}},{"event":"minecraft:schedule_home_villager","filters":{"all_of":[{"operator":">=","test":"hourly_clock_time","value":11000},{"operator":"<","test":"hourly_clock_time","value":12000}]}},{"event":"minecraft:schedule_bed_villager","filters":{"all_of":[{"operator":">=","test":"hourly_clock_time","value":12000},{"operator":"<","test":"hourly_clock_time","value":24000}]}}],"min_delay_secs":0}},"fisher_schedule":{"minecraft:scheduler":{"max_delay_secs":10,"scheduled_events":[{"event":"minecraft:schedule_work_fisher","filters":{"all_of":[{"operator":">=","test":"hourly_clock_time","value":0},{"operator":"<","test":"hourly_clock_time","value":8000}]}},{"event":"minecraft:schedule_gather_villager","filters":{"all_of":[{"operator":">=","test":"hourly_clock_time","value":8000},{"operator":"<","test":"hourly_clock_time","value":10000}]}},{"event":"minecraft:schedule_work_fisher","filters":{"all_of":[{"operator":">=","test":"hourly_clock_time","value":10000},{"operator":"<","test":"hourly_clock_time","value":11000}]}},{"event":"minecraft:schedule_home_villager","filters":{"all_of":[{"operator":">=","test":"hourly_clock_time","value":11000},{"operator":"<","test":"hourly_clock_time","value":12000}]}},{"event":"minecraft:schedule_bed_villager","filters":{"all_of":[{"operator":">=","test":"hourly_clock_time","value":12000},{"operator":"<","test":"hourly_clock_time","value":24000}]}}],"min_delay_secs":0}},"villager_skin_2":{"minecraft:skin_id":{"value":2}},"fisherman":{"minecraft:behavior.trade_interest":{"carried_item_switch_time":2,"cooldown":2,"interest_time":45,"within_radius":6,"priority":5,"remove_item_time":1},"minecraft:dweller":{"can_find_poi":true,"dwelling_type":"village","can_migrate":true,"dweller_role":"inhabitant","preferred_profession":"fisherman","first_founding_reward":5,"update_interval_base":60,"update_interval_variant":40},"minecraft:economy_trade_table":{"cured_discount":[-25,-20],"display_name":"entity.villager.fisherman","max_cured_discount":[-25,-20],"new_screen":true,"persist_trades":true,"table":"trading/economy_trades/fisherman_trades.json"},"minecraft:type_family":{"family":["villager","peasant","fisherman","mob"]},"minecraft:variant":{"value":2}},"fletcher":{"minecraft:behavior.trade_interest":{"carried_item_switch_time":2,"cooldown":2,"interest_time":45,"within_radius":6,"priority":5,"remove_item_time":1},"minecraft:dweller":{"can_find_poi":true,"dwelling_type":"village","can_migrate":true,"dweller_role":"inhabitant","preferred_profession":"fletcher","first_founding_reward":5,"update_interval_base":60,"update_interval_variant":40},"minecraft:economy_trade_table":{"cured_discount":[-25,-20],"display_name":"entity.villager.fletcher","max_cured_discount":[-25,-20],"new_screen":true,"persist_trades":true,"table":"trading/economy_trades/fletcher_trades.json"},"minecraft:type_family":{"family":["villager","peasant","fletcher","mob"]},"minecraft:variant":{"value":4}},"gather_schedule_villager":{"minecraft:behavior.mingle":{"cooldown_time":10,"duration":30,"mingle_distance":2,"mingle_partner_type":"minecraft:villager_v2","priority":7,"speed_multiplier":0.5}},"home_schedule_villager":{},"job_specific_goals":{"minecraft:behavior.explore_outskirts":{},"minecraft:behavior.harvest_farm_block":{},"minecraft:behavior.inspect_bookshelf":{},"minecraft:behavior.mingle":{},"minecraft:behavior.sleep":{},"minecraft:behavior.work":{},"minecraft:behavior.work_composter":{}},"work_schedule_librarian":{"minecraft:behavior.inspect_bookshelf":{"goal_radius":0.8,"priority":8,"search_count":0,"search_height":3,"search_range":4,"speed_multiplier":0.6},"minecraft:behavior.work":{"priority":7,"active_time":250,"on_arrival":{"event":"minecraft:resupply_trades","target":"self"},"can_work_in_rain":false,"speed_multiplier":0.5,"goal_cooldown":200,"sound_delay_max":200,"work_in_rain_tolerance":100,"sound_delay_min":100}},"jobless_schedule":{"minecraft:scheduler":{"max_delay_secs":10,"scheduled_events":[{"event":"minecraft:schedule_wander_villager","filters":{"all_of":[{"operator":">=","test":"hourly_clock_time","value":2000},{"operator":"<","test":"hourly_clock_time","value":13000}]}},{"event":"minecraft:schedule_home_villager","filters":{"all_of":[{"operator":">=","test":"hourly_clock_time","value":13000},{"operator":"<","test":"hourly_clock_time","value":14000}]}},{"event":"minecraft:schedule_bed_villager","filters":{"all_of":[{"operator":">=","test":"hourly_clock_time","value":14000},{"operator":"<","test":"hourly_clock_time","value":24000}]}},{"event":"minecraft:schedule_bed_villager","filters":{"all_of":[{"operator":">=","test":"hourly_clock_time","value":0},{"operator":"<","test":"hourly_clock_time","value":2000}]}}],"min_delay_secs":0}},"librarian":{"minecraft:behavior.trade_interest":{"carried_item_switch_time":2,"cooldown":2,"interest_time":45,"within_radius":6,"priority":5,"remove_item_time":1},"minecraft:dweller":{"can_find_poi":true,"dwelling_type":"village","can_migrate":true,"dweller_role":"inhabitant","preferred_profession":"librarian","first_founding_reward":5,"update_interval_base":60,"update_interval_variant":40},"minecraft:economy_trade_table":{"cured_discount":[-25,-20],"display_name":"entity.villager.librarian","max_cured_discount":[-25,-20],"new_screen":true,"persist_trades":true,"table":"trading/economy_trades/librarian_trades.json"},"minecraft:type_family":{"family":["villager","librarian","mob"]},"minecraft:variant":{"value":5}},"jungle_villager":{"minecraft:mark_variant":{"value":2}},"leatherworker":{"minecraft:behavior.trade_interest":{"carried_item_switch_time":2,"cooldown":2,"interest_time":45,"within_radius":6,"priority":5,"remove_item_time":1},"minecraft:dweller":{"can_find_poi":true,"dwelling_type":"village","can_migrate":true,"dweller_role":"inhabitant","preferred_profession":"leatherworker","first_founding_reward":5,"update_interval_base":60,"update_interval_variant":40},"minecraft:economy_trade_table":{"cured_discount":[-25,-20],"display_name":"entity.villager.leather","max_cured_discount":[-25,-20],"new_screen":true,"persist_trades":true,"table":"trading/economy_trades/leather_worker_trades.json"},"minecraft:type_family":{"family":["villager","artisan","leatherworker","mob"]},"minecraft:variant":{"value":12}},"librarian_schedule":{"minecraft:scheduler":{"max_delay_secs":10,"scheduled_events":[{"event":"minecraft:schedule_work_librarian","filters":{"all_of":[{"operator":">=","test":"hourly_clock_time","value":0},{"operator":"<","test":"hourly_clock_time","value":8000}]}},{"event":"minecraft:schedule_gather_villager","filters":{"all_of":[{"operator":">=","test":"hourly_clock_time","value":8000},{"operator":"<","test":"hourly_clock_time","value":10000}]}},{"event":"minecraft:schedule_work_librarian","filters":{"all_of":[{"operator":">=","test":"hourly_clock_time","value":10000},{"operator":"<","test":"hourly_clock_time","value":11000}]}},{"event":"minecraft:schedule_home_villager","filters":{"all_of":[{"operator":">=","test":"hourly_clock_time","value":11000},{"operator":"<","test":"hourly_clock_time","value":12000}]}},{"event":"minecraft:schedule_bed_villager","filters":{"all_of":[{"operator":">=","test":"hourly_clock_time","value":12000},{"operator":"<","test":"hourly_clock_time","value":24000}]}}],"min_delay_secs":0}},"mason":{"minecraft:behavior.trade_interest":{"carried_item_switch_time":2,"cooldown":2,"interest_time":45,"within_radius":6,"priority":5,"remove_item_time":1},"minecraft:dweller":{"can_find_poi":true,"dwelling_type":"village","can_migrate":true,"dweller_role":"inhabitant","preferred_profession":"mason","first_founding_reward":5,"update_interval_base":60,"update_interval_variant":40},"minecraft:economy_trade_table":{"cured_discount":[-25,-20],"display_name":"entity.villager.mason","max_cured_discount":[-25,-20],"new_screen":true,"persist_trades":true,"table":"trading/economy_trades/stone_mason_trades.json"},"minecraft:type_family":{"family":["villager","artisan","stone_mason","mob"]},"minecraft:variant":{"value":13}},"work_schedule_fisher":{"minecraft:behavior.work":{"priority":7,"active_time":250,"on_arrival":{"event":"minecraft:resupply_trades","target":"self"},"can_work_in_rain":false,"speed_multiplier":0.5,"goal_cooldown":200,"sound_delay_max":200,"work_in_rain_tolerance":100,"sound_delay_min":100}},"nitwit":{"minecraft:type_family":{"family":["villager","peasant","nitwit","mob"]},"minecraft:variant":{"value":14}},"play_schedule_villager":{"minecraft:behavior.play":{"friend_types":[{"filters":{"all_of":[{"subject":"other","test":"is_family","value":"villager"},{"operator":"==","test":"is_baby","subject":"other","value":true}]}}],"priority":8,"speed_multiplier":0.6}},"savanna_villager":{"minecraft:mark_variant":{"value":3}},"unskilled":{"minecraft:type_family":{"family":["villager","peasant","unskilled","mob"]},"minecraft:variant":{"value":0}},"shepherd":{"minecraft:behavior.trade_interest":{"carried_item_switch_time":2,"cooldown":2,"interest_time":45,"within_radius":6,"priority":5,"remove_item_time":1},"minecraft:dweller":{"can_find_poi":true,"dwelling_type":"village","can_migrate":true,"dweller_role":"inhabitant","preferred_profession":"shepherd","first_founding_reward":5,"update_interval_base":60,"update_interval_variant":40},"minecraft:economy_trade_table":{"cured_discount":[-25,-20],"display_name":"entity.villager.shepherd","max_cured_discount":[-25,-20],"new_screen":true,"persist_trades":true,"table":"trading/economy_trades/shepherd_trades.json"},"minecraft:type_family":{"family":["villager","peasant","shepherd","mob"]},"minecraft:variant":{"value":3}},"swamp_villager":{"minecraft:mark_variant":{"value":5}},"taiga_villager":{"minecraft:mark_variant":{"value":6}},"toolsmith":{"minecraft:behavior.trade_interest":{"carried_item_switch_time":2,"cooldown":2,"interest_time":45,"within_radius":6,"priority":5,"remove_item_time":1},"minecraft:dweller":{"can_find_poi":true,"dwelling_type":"village","can_migrate":true,"dweller_role":"inhabitant","preferred_profession":"toolsmith","first_founding_reward":5,"update_interval_base":60,"update_interval_variant":40},"minecraft:economy_trade_table":{"cured_discount":[-25,-20],"display_name":"entity.villager.tool","max_cured_discount":[-25,-20],"new_screen":true,"persist_trades":true,"table":"trading/economy_trades/tool_smith_trades.json"},"minecraft:type_family":{"family":["villager","blacksmith","toolsmith","mob"]},"minecraft:variant":{"value":10}},"trade_components":{"minecraft:behavior.trade_interest":{},"minecraft:economy_trade_table":{}},"trade_resupply_component_group":{"minecraft:trade_resupply":{}},"villager_skin_0":{"minecraft:skin_id":{"value":0}},"villager_skin_1":{"minecraft:skin_id":{"value":1}},"work_schedule_villager":{"minecraft:behavior.work":{"priority":7,"active_time":250,"on_arrival":{"event":"minecraft:resupply_trades","target":"self"},"can_work_in_rain":false,"speed_multiplier":0.5,"goal_cooldown":200,"sound_delay_max":200,"work_in_rain_tolerance":100,"sound_delay_min":100}},"villager_skin_3":{"minecraft:skin_id":{"value":3}},"villager_skin_4":{"minecraft:skin_id":{"value":4}},"villager_skin_5":{"minecraft:skin_id":{"value":5}},"wander_schedule_villager":{"minecraft:behavior.explore_outskirts":{"max_wait_time":10,"speed_multiplier":0.6,"explore_dist":6,"min_dist_from_target":2.5,"priority":9}}},"events":{"become_witch":{"add":{"component_groups":["become_witch"]}},"become_zombie":{"sequence":[{"randomize":[{"add":{"component_groups":["become_zombie"]},"weight":50},{"weight":50}],"filters":{"test":"is_difficulty","value":"normal"}},{"filters":{"test":"is_difficulty","value":"hard"},"add":{"component_groups":["become_zombie"]}}]},"minecraft:stop_celebrating":{"remove":{"component_groups":["minecraft:celebrate"]}},"minecraft:schedule_work_fisher":{"add":{"component_groups":["make_and_receive_love","work_schedule_fisher"]},"remove":{"component_groups":["home_schedule_villager","gather_schedule_villager","wander_schedule_villager","bed_schedule_villager","job_specific_goals","play_schedule_villager"]}},"minecraft:become_farmer":{"add":{"component_groups":["farmer","adult","make_and_receive_love","behavior_peasant","farmer_schedule"]},"remove":{"component_groups":["baby","child_schedule","job_specific_goals","trade_components"]}},"minecraft:start_celebrating":{"add":{"component_groups":["minecraft:celebrate"]}},"minecraft:become_butcher":{"add":{"component_groups":["butcher","adult","make_and_receive_love","behavior_non_peasant","work_schedule"]},"remove":{"component_groups":["baby","child_schedule","job_specific_goals","trade_components"]}},"minecraft:ageable_grow_up":{"randomize":[{"add":{"component_groups":["adult","make_and_receive_love","nitwit","behavior_peasant","jobless_schedule"]},"remove":{"component_groups":["baby","child_schedule"]},"weight":10},{"add":{"component_groups":["adult","make_and_receive_love","unskilled","behavior_peasant","basic_schedule"]},"remove":{"component_groups":["baby","child_schedule"]},"weight":90}]},"minecraft:schedule_work_pro_villager":{"add":{"component_groups":["make_and_receive_love","work_schedule_villager"]},"remove":{"component_groups":["home_schedule_villager","gather_schedule_villager","wander_schedule_villager","bed_schedule_villager","play_schedule_villager"]}},"minecraft:become_cleric":{"add":{"component_groups":["cleric","adult","make_and_receive_love","behavior_non_peasant","work_schedule"]},"remove":{"component_groups":["baby","child_schedule","job_specific_goals","trade_components"]}},"minecraft:become_armorer":{"add":{"component_groups":["armorer","adult","make_and_receive_love","behavior_non_peasant","work_schedule"]},"remove":{"component_groups":["baby","child_schedule","job_specific_goals","trade_components"]}},"minecraft:become_cartographer":{"add":{"component_groups":["cartographer","adult","make_and_receive_love","behavior_non_peasant","work_schedule"]},"remove":{"component_groups":["baby","child_schedule","job_specific_goals","trade_components"]}},"minecraft:become_fletcher":{"add":{"component_groups":["fletcher","adult","make_and_receive_love","behavior_non_peasant","work_schedule"]},"remove":{"component_groups":["baby","child_schedule","job_specific_goals","trade_components"]}},"minecraft:become_fisherman":{"add":{"component_groups":["fisherman","adult","make_and_receive_love","behavior_non_peasant","fisher_schedule"]},"remove":{"component_groups":["baby","child_schedule","job_specific_goals","trade_components"]}},"minecraft:become_leatherworker":{"add":{"component_groups":["leatherworker","adult","make_and_receive_love","behavior_non_peasant","work_schedule"]},"remove":{"component_groups":["baby","child_schedule","job_specific_goals","trade_components"]}},"minecraft:become_librarian":{"add":{"component_groups":["librarian","adult","make_and_receive_love","behavior_non_peasant","librarian_schedule"]},"remove":{"component_groups":["baby","child_schedule","job_specific_goals","trade_components"]}},"minecraft:become_mason":{"add":{"component_groups":["mason","adult","make_and_receive_love","behavior_non_peasant","work_schedule"]},"remove":{"component_groups":["baby","child_schedule","job_specific_goals","trade_components"]}},"minecraft:entity_transformed":{"sequence":[{"filters":{"test":"has_component","operator":"==","subject":"other","value":"minecraft:is_baby"},"add":{"component_groups":["baby","child_schedule"]}},{"filters":{"test":"has_component","operator":"!=","subject":"other","value":"minecraft:is_baby"},"sequence":[{"add":{"component_groups":["adult","make_and_receive_love"]}},{"filters":{"subject":"other","test":"is_family","value":"farmer"},"add":{"component_groups":["farmer","behavior_peasant","farmer_schedule"]}},{"filters":{"subject":"other","test":"is_family","value":"fisherman"},"add":{"component_groups":["fisherman","behavior_peasant","fisher_schedule"]}},{"filters":{"subject":"other","test":"is_family","value":"shepherd"},"add":{"component_groups":["shepherd","behavior_peasant","work_schedule"]}},{"filters":{"subject":"other","test":"is_family","value":"fletcher"},"add":{"component_groups":["fletcher","behavior_peasant","work_schedule"]}},{"filters":{"subject":"other","test":"is_family","value":"librarian"},"add":{"component_groups":["librarian","behavior_non_peasant","librarian_schedule"]}},{"filters":{"subject":"other","test":"is_family","value":"cartographer"},"add":{"component_groups":["cartographer","behavior_non_peasant","work_schedule"]}},{"filters":{"subject":"other","test":"is_family","value":"cleric"},"add":{"component_groups":["cleric","behavior_non_peasant","work_schedule"]}},{"filters":{"subject":"other","test":"is_family","value":"armorer"},"add":{"component_groups":["armorer","behavior_non_peasant","work_schedule"]}},{"filters":{"subject":"other","test":"is_family","value":"weaponsmith"},"add":{"component_groups":["weaponsmith","behavior_non_peasant","work_schedule"]}},{"filters":{"subject":"other","test":"is_family","value":"toolsmith"},"add":{"component_groups":["toolsmith","behavior_non_peasant","work_schedule"]}},{"filters":{"subject":"other","test":"is_family","value":"butcher"},"add":{"component_groups":["butcher","behavior_non_peasant","work_schedule"]}},{"filters":{"subject":"other","test":"is_family","value":"leatherworker"},"add":{"component_groups":["leatherworker","behavior_non_peasant","work_schedule"]}},{"filters":{"subject":"other","test":"is_family","value":"stone_mason"},"add":{"component_groups":["mason","behavior_non_peasant","work_schedule"]}}]},{"filters":{"test":"is_family","operator":"==","subject":"other","value":"zombie_villager"},"sequence":[{"filters":{"subject":"other","test":"is_skin_id","value":0},"add":{"component_groups":["villager_skin_0"]}},{"filters":{"subject":"other","test":"is_skin_id","value":1},"add":{"component_groups":["villager_skin_1"]}},{"filters":{"subject":"other","test":"is_skin_id","value":2},"add":{"component_groups":["villager_skin_2"]}},{"filters":{"subject":"other","test":"is_skin_id","value":3},"add":{"component_groups":["villager_skin_3"]}},{"filters":{"subject":"other","test":"is_skin_id","value":4},"add":{"component_groups":["villager_skin_4"]}},{"filters":{"subject":"other","test":"is_skin_id","value":5},"add":{"component_groups":["villager_skin_5"]}},{"filters":{"subject":"other","test":"is_mark_variant","value":1},"add":{"component_groups":["desert_villager"]}},{"filters":{"subject":"other","test":"is_mark_variant","value":2},"add":{"component_groups":["jungle_villager"]}},{"filters":{"subject":"other","test":"is_mark_variant","value":3},"add":{"component_groups":["savanna_villager"]}},{"filters":{"subject":"other","test":"is_mark_variant","value":4},"add":{"component_groups":["snow_villager"]}},{"filters":{"subject":"other","test":"is_mark_variant","value":5},"add":{"component_groups":["swamp_villager"]}},{"filters":{"subject":"other","test":"is_mark_variant","value":6},"add":{"component_groups":["taiga_villager"]}}]},{"filters":{"test":"is_family","operator":"==","subject":"other","value":"villager"},"sequence":[{"randomize":[{"add":{"component_groups":["villager_skin_0"]},"weight":1},{"add":{"component_groups":["villager_skin_1"]},"weight":1},{"add":{"component_groups":["villager_skin_2"]},"weight":1},{"add":{"component_groups":["villager_skin_3"]},"weight":1},{"add":{"component_groups":["villager_skin_4"]},"weight":1},{"add":{"component_groups":["villager_skin_5"]},"weight":1}]},{"filters":{"any_of":[{"test":"has_biome_tag","value":"desert"},{"test":"has_biome_tag","value":"mesa"}]},"add":{"component_groups":["desert_villager"]}},{"filters":{"test":"has_biome_tag","value":"jungle"},"add":{"component_groups":["jungle_villager"]}},{"filters":{"test":"has_biome_tag","value":"savanna"},"add":{"component_groups":["savanna_villager"]}},{"filters":{"any_of":[{"all_of":[{"test":"has_biome_tag","value":"cold"},{"test":"has_biome_tag","operator":"!=","value":"ocean"}]},{"test":"has_biome_tag","value":"frozen"}]},"add":{"component_groups":["snow_villager"]}},{"filters":{"any_of":[{"test":"has_biome_tag","value":"swamp"},{"test":"has_biome_tag","value":"mangrove_swamp"}]},"add":{"component_groups":["swamp_villager"]}},{"filters":{"all_of":[{"any_of":[{"test":"has_biome_tag","value":"taiga"},{"test":"has_biome_tag","value":"extreme_hills"}]},{"test":"has_biome_tag","operator":"!=","value":"cold"}]},"add":{"component_groups":["taiga_villager"]}}]}]},"minecraft:become_sheperd":{"add":{"component_groups":["shepherd","adult","make_and_receive_love","behavior_non_peasant","work_schedule"]},"remove":{"component_groups":["baby","child_schedule","job_specific_goals","trade_components"]}},"minecraft:schedule_play_villager":{"add":{"component_groups":["play_schedule_villager"]},"remove":{"component_groups":["home_schedule_villager","gather_schedule_villager","wander_schedule_villager","bed_schedule_villager","job_specific_goals","trade_resupply_component_group"]}},"minecraft:become_toolsmith":{"add":{"component_groups":["toolsmith","adult","make_and_receive_love","behavior_non_peasant","work_schedule"]},"remove":{"component_groups":["baby","child_schedule","job_specific_goals","trade_components"]}},"minecraft:spawn_from_village":{"sequence":[{"randomize":[{"add":{"component_groups":["baby","child_schedule"]},"weight":5},{"add":{"component_groups":["adult","make_and_receive_love"]},"sequence":[{"randomize":[{"add":{"component_groups":["unskilled","behavior_peasant","basic_schedule"]},"weight":90},{"add":{"component_groups":["nitwit","behavior_peasant","jobless_schedule"]},"weight":10}]}],"weight":95}],"filters":{"test":"has_component","operator":"!=","value":"minecraft:variant"}},{"randomize":[{"add":{"component_groups":["villager_skin_0"]},"weight":1},{"add":{"component_groups":["villager_skin_1"]},"weight":1},{"add":{"component_groups":["villager_skin_2"]},"weight":1},{"add":{"component_groups":["villager_skin_3"]},"weight":1},{"add":{"component_groups":["villager_skin_4"]},"weight":1},{"add":{"component_groups":["villager_skin_5"]},"weight":1}],"filters":{"test":"has_component","operator":"!=","value":"minecraft:skin_id"}},{"filters":{"any_of":[{"test":"has_biome_tag","value":"desert"},{"test":"has_biome_tag","value":"mesa"}]},"add":{"component_groups":["desert_villager"]}},{"filters":{"test":"has_biome_tag","value":"jungle"},"add":{"component_groups":["jungle_villager"]}},{"filters":{"test":"has_biome_tag","value":"savanna"},"add":{"component_groups":["savanna_villager"]}},{"filters":{"any_of":[{"all_of":[{"test":"has_biome_tag","value":"cold"},{"test":"has_biome_tag","operator":"!=","value":"ocean"}]},{"test":"has_biome_tag","value":"frozen"}]},"add":{"component_groups":["snow_villager"]}},{"filters":{"any_of":[{"test":"has_biome_tag","value":"swamp"},{"test":"has_biome_tag","value":"mangrove_swamp"}]},"add":{"component_groups":["swamp_villager"]}},{"filters":{"all_of":[{"any_of":[{"test":"has_biome_tag","value":"taiga"},{"test":"has_biome_tag","value":"extreme_hills"}]},{"test":"has_biome_tag","operator":"!=","value":"cold"}]},"add":{"component_groups":["taiga_villager"]}}]},"minecraft:schedule_work_farmer":{"add":{"component_groups":["make_and_receive_love","work_schedule_farmer"]},"remove":{"component_groups":["home_schedule_villager","gather_schedule_villager","wander_schedule_villager","bed_schedule_villager","job_specific_goals","play_schedule_villager"]}},"minecraft:become_unskilled":{"add":{"component_groups":["adult","make_and_receive_love","unskilled","behavior_peasant","basic_schedule"]},"remove":{"component_groups":["baby","child_schedule","job_specific_goals","trade_components"]}},"minecraft:become_weaponsmith":{"add":{"component_groups":["weaponsmith","adult","make_and_receive_love","behavior_non_peasant","work_schedule"]},"remove":{"component_groups":["baby","child_schedule","job_specific_goals","trade_components"]}},"minecraft:entity_born":{"sequence":[{"randomize":[{"add":{"component_groups":["villager_skin_0"]},"weight":1},{"add":{"component_groups":["villager_skin_1"]},"weight":1},{"add":{"component_groups":["villager_skin_2"]},"weight":1},{"add":{"component_groups":["villager_skin_3"]},"weight":1},{"add":{"component_groups":["villager_skin_4"]},"weight":1},{"add":{"component_groups":["villager_skin_5"]},"weight":1}],"filters":{"test":"has_component","operator":"!=","value":"minecraft:skin_id"}},{"add":{"component_groups":["baby","unskilled","child_schedule"]}},{"filters":{"test":"has_biome_tag","value":"desert"},"add":{"component_groups":["desert_villager"]}},{"filters":{"test":"has_biome_tag","value":"jungle"},"add":{"component_groups":["jungle_villager"]}},{"filters":{"test":"has_biome_tag","value":"savanna"},"add":{"component_groups":["savanna_villager"]}},{"filters":{"any_of":[{"test":"has_biome_tag","value":"cold"},{"test":"has_biome_tag","value":"frozen"}]},"add":{"component_groups":["snow_villager"]}},{"filters":{"any_of":[{"test":"has_biome_tag","value":"swamp"},{"test":"has_biome_tag","value":"mangrove_swamp"}]},"add":{"component_groups":["swamp_villager"]}},{"filters":{"test":"has_biome_tag","value":"taiga"},"add":{"component_groups":["taiga_villager"]}}]},"minecraft:entity_spawned":{"sequence":[{"randomize":[{"add":{"component_groups":["villager_skin_0"]},"weight":1},{"add":{"component_groups":["villager_skin_1"]},"weight":1},{"add":{"component_groups":["villager_skin_2"]},"weight":1},{"add":{"component_groups":["villager_skin_3"]},"weight":1},{"add":{"component_groups":["villager_skin_4"]},"weight":1},{"add":{"component_groups":["villager_skin_5"]},"weight":1}],"filters":{"test":"has_component","operator":"!=","value":"minecraft:skin_id"}},{"randomize":[{"add":{"component_groups":["baby","child_schedule"]},"weight":5},{"sequence":[{"add":{"component_groups":["adult","make_and_receive_love"]}},{"randomize":[{"add":{"component_groups":["farmer","behavior_peasant","basic_schedule"]},"weight":1},{"add":{"component_groups":["fisherman","behavior_peasant","basic_schedule"]},"weight":1},{"add":{"component_groups":["shepherd","behavior_peasant","basic_schedule"]},"weight":1},{"add":{"component_groups":["fletcher","behavior_peasant","basic_schedule"]},"weight":1},{"add":{"component_groups":["librarian","behavior_non_peasant","basic_schedule"]},"weight":1},{"add":{"component_groups":["cartographer","behavior_non_peasant","basic_schedule"]},"weight":1},{"add":{"component_groups":["cleric","behavior_non_peasant","basic_schedule"]},"weight":1},{"add":{"component_groups":["armorer","behavior_non_peasant","basic_schedule"]},"weight":1},{"add":{"component_groups":["weaponsmith","behavior_non_peasant","basic_schedule"]},"weight":1},{"add":{"component_groups":["toolsmith","behavior_non_peasant","basic_schedule"]},"weight":1},{"add":{"component_groups":["butcher","behavior_non_peasant","basic_schedule"]},"weight":1},{"add":{"component_groups":["leatherworker","behavior_non_peasant","basic_schedule"]},"weight":1},{"add":{"component_groups":["mason","behavior_non_peasant","basic_schedule"]},"weight":1},{"add":{"component_groups":["nitwit","behavior_peasant","jobless_schedule"]},"weight":1}]}],"weight":95}],"filters":{"test":"has_component","operator":"!=","value":"minecraft:variant"}},{"filters":{"any_of":[{"test":"has_biome_tag","value":"desert"},{"test":"has_biome_tag","value":"mesa"}]},"add":{"component_groups":["desert_villager"]}},{"filters":{"test":"has_biome_tag","value":"jungle"},"add":{"component_groups":["jungle_villager"]}},{"filters":{"test":"has_biome_tag","value":"savanna"},"add":{"component_groups":["savanna_villager"]}},{"filters":{"any_of":[{"all_of":[{"test":"has_biome_tag","value":"cold"},{"test":"has_biome_tag","operator":"!=","value":"ocean"}]},{"test":"has_biome_tag","value":"frozen"}]},"add":{"component_groups":["snow_villager"]}},{"filters":{"any_of":[{"test":"has_biome_tag","value":"swamp"},{"test":"has_biome_tag","value":"mangrove_swamp"}]},"add":{"component_groups":["swamp_villager"]}},{"filters":{"all_of":[{"any_of":[{"test":"has_biome_tag","value":"taiga"},{"test":"has_biome_tag","value":"extreme_hills"}]},{"test":"has_biome_tag","operator":"!=","value":"cold"}]},"add":{"component_groups":["taiga_villager"]}}]},"minecraft:resupply_trades":{"add":{"component_groups":["trade_resupply_component_group"]}},"minecraft:schedule_home_villager":{"add":{"component_groups":["make_and_receive_love","home_schedule_villager"]},"remove":{"component_groups":["bed_schedule_villager","wander_schedule_villager","gather_schedule_villager","job_specific_goals","play_schedule_villager","trade_resupply_component_group"]}},"minecraft:schedule_bed_villager":{"add":{"component_groups":["bed_schedule_villager"]},"remove":{"component_groups":["make_and_receive_love","home_schedule_villager","gather_schedule_villager","wander_schedule_villager","job_specific_goals","play_schedule_villager","trade_resupply_component_group"]}},"minecraft:schedule_gather_villager":{"add":{"component_groups":["make_and_receive_love","gather_schedule_villager"]},"remove":{"component_groups":["bed_schedule_villager","wander_schedule_villager","home_schedule_villager","job_specific_goals","play_schedule_villager","trade_resupply_component_group"]}},"minecraft:schedule_wander_villager":{"add":{"component_groups":["make_and_receive_love","wander_schedule_villager"]},"remove":{"component_groups":["home_schedule_villager","bed_schedule_villager","wander_schedule_villager","job_specific_goals","play_schedule_villager","trade_resupply_component_group"]}},"minecraft:schedule_work_librarian":{"add":{"component_groups":["make_and_receive_love","work_schedule_librarian"]},"remove":{"component_groups":["home_schedule_villager","gather_schedule_villager","wander_schedule_villager","bed_schedule_villager","job_specific_goals","play_schedule_villager"]}},"minecraft:spawn_cleric":{"add":{"component_groups":["cleric","adult","make_and_receive_love","behavior_non_peasant","basic_schedule"]},"remove":{"component_groups":["baby","child_schedule"]}},"minecraft:spawn_armorer":{"randomize":[{"add":{"component_groups":["armorer","adult","make_and_receive_love","behavior_non_peasant","basic_schedule"]},"remove":{"component_groups":["baby","child_schedule"]},"weight":6},{"add":{"component_groups":["weaponsmith","adult","make_and_receive_love","behavior_non_peasant","basic_schedule"]},"remove":{"component_groups":["baby","child_schedule"]},"weight":6},{"add":{"component_groups":["toolsmith","adult","make_and_receive_love","behavior_non_peasant","basic_schedule"]},"remove":{"component_groups":["baby","child_schedule"]},"weight":6}]},"minecraft:spawn_butcher":{"randomize":[{"add":{"component_groups":["butcher","adult","make_and_receive_love","behavior_non_peasant","basic_schedule"]},"remove":{"component_groups":["baby","child_schedule"]},"weight":10},{"add":{"component_groups":["leatherworker","adult","make_and_receive_love","behavior_non_peasant","basic_schedule"]},"remove":{"component_groups":["baby","child_schedule"]},"weight":10}]},"minecraft:spawn_farmer":{"randomize":[{"add":{"component_groups":["farmer","adult","make_and_receive_love","behavior_peasant","basic_schedule"]},"remove":{"component_groups":["baby","child_schedule"]},"weight":5},{"add":{"component_groups":["fisherman","adult","make_and_receive_love","behavior_peasant","basic_schedule"]},"remove":{"component_groups":["baby","child_schedule"]},"weight":5},{"add":{"component_groups":["shepherd","adult","make_and_receive_love","behavior_peasant","basic_schedule"]},"remove":{"component_groups":["baby","child_schedule"]},"weight":5},{"add":{"component_groups":["fletcher","adult","make_and_receive_love","behavior_peasant","basic_schedule"]},"remove":{"component_groups":["baby","child_schedule"]},"weight":5},{"add":{"component_groups":["mason","adult","make_and_receive_love","behavior_non_peasant","work_schedule"]},"remove":{"component_groups":["baby","child_schedule"]},"weight":5}]},"minecraft:spawn_librarian":{"randomize":[{"add":{"component_groups":["librarian","adult","make_and_receive_love","behavior_non_peasant","basic_schedule"]},"remove":{"component_groups":["baby","child_schedule"]},"weight":20},{"add":{"component_groups":["cartographer","behavior_non_peasant","basic_schedule"]},"remove":{"component_groups":["baby","child_schedule"]},"weight":20}]}}}}};
function pulidoFinalAddon(files, plan, prompt){
  const cambios=[];
  const nota=(p,m)=>{ if(!cambios.some(c=>c.path===p&&c.motivo===m))cambios.push({path:p,motivo:m}); };
  const get=(p)=>files.find(f=>f.path===p);
  const quitarF=(p)=>{const i=files.findIndex(x=>x.path===p); if(i>=0)files.splice(i,1);};
  const guardar=(f,o)=>{f.content=JSON.stringify(o,null,2)+"\n";};
  const scripts=()=>files.filter(f=>/^BP\/scripts\/.+\.js$/.test(f.path)&&typeof f.content==="string");

  // inventario
  const ents=new Map(), items=new Map();
  for(const f of files){
    const o=hdJson(f); if(!o)continue;
    if(/^BP\/entities\/[^/]+\.json$/.test(f.path)&&o["minecraft:entity"]){const id=o["minecraft:entity"].description?.identifier; if(id)ents.set(id,f);}
    if(/^BP\/items\/[^/]+\.json$/.test(f.path)&&o["minecraft:item"]){const id=o["minecraft:item"].description?.identifier; if(id)items.set(id,f);}
  }
  const nsCnt=new Map();for(const id of [...ents.keys(),...items.keys()]){const n=id.split(":")[0];nsCnt.set(n,(nsCnt.get(n)||0)+1);}
  const ns=[...nsCnt.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||String(plan&&plan.ns||"ego");
  const armasJs=get("BP/scripts/ego_armas.js");
  const idsArmas=armasJs?[...armasJs.content.matchAll(/"([\w]+:[\w]+)"\s*:\s*\{\s*"nombre"/g)].map(m=>m[1]):[];
  const idsCuras=armasJs?[...armasJs.content.matchAll(/"([\w]+:[\w]+)"\s*:\s*\{\s*"vida"/g)].map(m=>m[1]):[];


  // 0b) Mobs vanilla (minecraft:*): la base es el archivo OFICIAL de Mojang; del modelo solo se toman sus grupos/eventos propios (ns:...)
  try{
    const VAN=MC_VANILLA_J;
    for(const [id,f] of [...ents.entries()]){
      if(!VAN[id])continue;
      const o=hdJson(f); if(!o||!o["minecraft:entity"])continue;
      const gen=o["minecraft:entity"], base=JSON.parse(JSON.stringify(VAN[id])), be=base["minecraft:entity"];
      be.component_groups=be.component_groups||{}; be.events=be.events||{};
      let nuevos=0;
      for(const [k,v] of Object.entries(gen.component_groups||{})){ if(/^minecraft:/.test(k)||be.component_groups[k])continue; const c={}; for(const [ck,cv] of Object.entries(v||{})){ if(SOLO_RP_VAN.includes(ck))continue; c[ck]=cv; } be.component_groups[k]=c; nuevos++; }
      for(const [k,v] of Object.entries(gen.events||{})){ if(/^minecraft:/.test(k)||be.events[k])continue; const refs=[]; (function w(x){ if(!x||typeof x!=="object")return; for(const [a,b] of Object.entries(x)){ if((a==="component_groups")&&Array.isArray(b))refs.push(...b); else w(b);} })(v); if(refs.every(r=>be.component_groups[r])){ be.events[k]=v; nuevos++; } }
      f.content=JSON.stringify(base,null,2)+"\n";
      nota(f.path,"Se usó el archivo oficial de Mojang de "+id+" como base y solo se añadieron los grupos/eventos propios ("+nuevos+"): así la criatura vanilla no pierde su comportamiento.");
      // quitar el reemplazo visual del RP (modelo/textura/animaciones inventadas) para esta criatura
      const cli=files.find(x=>/^RP\/entity\/[^/]+\.json$/.test(x.path)&&hdJson(x)&&hdJson(x)["minecraft:client_entity"]&&hdJson(x)["minecraft:client_entity"].description?.identifier===id);
      if(cli){
        const d=hdJson(cli)["minecraft:client_entity"].description||{}; const borrar=new Set([cli.path]);
        for(const t of Object.values(d.textures||{})) borrar.add("RP/"+String(t)+".png");
        const geoIds=Object.values(d.geometry||{}).map(String);
        const animIds=Object.values(d.animations||{}).map(String);
        for(const x of files){ if(/^RP\/models\/.+\.json$/.test(x.path)&&typeof x.content==="string"&&geoIds.some(g=>x.content.includes('"'+g+'"')))borrar.add(x.path); if(/^RP\/animations?\/.+\.json$/.test(x.path)&&typeof x.content==="string"&&animIds.some(a=>x.content.includes('"'+a+'"')))borrar.add(x.path); if(/^RP\/animation_controllers\/.+\.json$/.test(x.path)&&typeof x.content==="string"&&animIds.some(a=>x.content.includes('"'+a+'"')))borrar.add(x.path); }
        for(const p of borrar){ if(files.some(x=>x.path===p)){ quitarF(p); } }
        nota(cli.path,"Se quitó el modelo/textura inventados de "+id+": la criatura vanilla conserva su apariencia original.");
      }
    }
  }catch(e){ nota("BP/entities","Base vanilla omitida: "+String(e&&e.message||e).slice(0,80)); }


  // 0c) Partículas: solo existen las de Mojang (192). Un id inventado (p. ej. minecraft:smoke_particle) hace que el aura NO se vea.
  try{
    const PV=new Set(MC_PARTICULAS);
    const rpPart=new Set(files.filter(x=>/^RP\/particles\/.+\.json$/.test(x.path)).map(x=>{const m=/"identifier"\s*:\s*"([^"]+)"/.exec(String(x.content||""));return m?m[1]:null;}).filter(Boolean));
    const cerca=(id)=>{
      const n=id.replace(/^minecraft:/,"").toLowerCase();
      const mp=[[/smoke|humo|vapor|steam|fog|niebla/,"basic_smoke_particle"],[/soul|alma/,"soul_particle"],[/flame|fire|fuego|llama/,"basic_flame_particle"],[/portal/,"basic_portal_particle"],[/heart|coraz/,"heart_particle"],[/magic|spell|aura|mist|dark|oscur|void|shadow|sombra|witch/,"witchspell_emitter"],[/glow|brillo|light|luz|shine|sparkle|star/,"glow_particle"],[/electric|spark|lightning|rayo|thunder/,"electric_spark_particle"],[/explo|blast/,"explosion_particle"],[/crit|hit|impact/,"critical_hit_emitter"],[/bubble|burbuj|water/,"basic_bubble_particle"],[/snow|ice|frost|hielo/,"snowflake_particle"],[/angry|rage|furia/,"villager_angry"],[/happy|heal|cura/,"villager_happy"],[/totem/,"totem_particle"],[/note|music/,"note_particle"],[/lava/,"lava_particle"],[/dust|polvo|ash|ceniza/,"falling_dust"]];
      for(const [rx,v] of mp) if(rx.test(n))return v;
      let mejor=null,md=99;const lev=(a,b)=>{const d=[];for(let i=0;i<=a.length;i++){d[i]=[i];}for(let j=0;j<=b.length;j++)d[0][j]=j;for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return d[a.length][b.length];};
      for(const v of PV){const dd=lev(n,v);if(dd<md){md=dd;mejor=v;}}
      return md<=Math.max(3,Math.floor(n.length*0.35))?mejor:"basic_smoke_particle";
    };
    for(const f of scripts()){
      let c=f.content,ch=[];
      c=c.replace(/(spawnParticle\(\s*)(["'`])([\w:.\-]+)\2/g,(m,pre,q,id)=>{
        if(PV.has(id.replace(/^minecraft:/,""))&&/^minecraft:/.test(id))return m;
        if(rpPart.has(id))return m;
        if(!/^minecraft:/.test(id)&&PV.has(id))return pre+q+"minecraft:"+id+q;
        const nv="minecraft:"+cerca(id);ch.push(id+" → "+nv);return pre+q+nv+q;
      });
      c=c.replace(/(const\s+\w*(?:PARTICLE|PARTICULA)\w*\s*=\s*)(["'])(minecraft:[\w]+)\2/gi,(m,pre,q,id)=>{ if(PV.has(id.replace(/^minecraft:/,"")))return m; const nv="minecraft:"+cerca(id); ch.push(id+" → "+nv); return pre+q+nv+q; });
      if(ch.length){f.content=c;nota(f.path,"Partícula que NO existe en Minecraft (el aura no se veía): "+[...new Set(ch)].slice(0,3).join(", "));}
    }
  }catch(e){ nota("BP/scripts","Revisión de partículas omitida: "+String(e&&e.message||e).slice(0,80)); }

  // 0d) Cofres/botín al cargar el mundo que nadie pidió
  try{
    if(!/cofre|chest|kit|botin|botín|loot|tesoro|recompensa/i.test(String(prompt||"")+" "+String(plan&&plan.resumen||""))){
      for(const f of scripts()){
        const c=f.content,i=c.search(/world\.afterEvents\.worldLoad\.subscribe\s*\(/);
        if(i<0)continue;
        let j=c.indexOf("(",i),d=0,k=j;
        for(;k<c.length;k++){ if(c[k]==="(")d++; else if(c[k]===")"){d--; if(d===0)break;} }
        const bloque=c.slice(i,k+1);
        if(/setblock[^\n]*chest|loot\s+spawn/.test(bloque)){
          f.content=c.slice(0,i)+"/* (EGO) se quitó el cofre inicial: no lo pediste */"+c.slice(k+1).replace(/^\s*;/,"");
          nota(f.path,"Se quitó un cofre con botín que se generaba al cargar el mundo y no lo pediste.");
        }
      }
    }
  }catch(e){ nota("BP/scripts","Revisión de cofres omitida: "+String(e&&e.message||e).slice(0,80)); }

  // 0e) "Muy poderosa": una armadura pedida como poderosa/invencible debe PROTEGER de verdad (la protección vanilla del ítem es mínima)
  try{
    const txt=String(prompt||"")+" "+String(plan&&plan.resumen||"");
    const piezas=[...items.entries()].filter(([id,f])=>{const o=hdJson(f);const w=o&&o["minecraft:item"]&&o["minecraft:item"].components&&o["minecraft:item"].components["minecraft:wearable"];return !!w;}).map(([id])=>id);
    const poderosa=/poderos|invenc|inmortal|indestruct|invulnerab|resistent|protege|protecci|sin recibir da|no recibe da|god|op\b|legendari|definitiv|supremo|mortal|mata/i.test(txt);
    const yaTiene=scripts().some(f=>/["']resistance["']|invulnerab|entityHurt[\s\S]{0,400}health/.test(f.content)&&piezas.some(p=>f.content.includes(p)));
    if(piezas.length&&poderosa&&!yaTiene&&!get("BP/scripts/ego_set_poder.js")){
      const quiereAura=/aura|part[ií]cula|vapor|humo|brill|energ|oscur/i.test(txt)&&!scripts().some(f=>/spawnParticle/.test(f.content)&&piezas.some(p=>f.content.includes(p)));
      const sc=['import { world, system } from "@minecraft/server";','',
        '// Poder del conjunto: cada pieza puesta suma protección real; con el set completo eres casi invulnerable.',
        'const PIEZAS = '+JSON.stringify(piezas)+';',
        'const RANURAS = ["Head", "Chest", "Legs", "Feet"];',
        'function contar(p) {','  let n = 0;','  try {','    const eq = p.getComponent("minecraft:equippable");','    if (!eq) return 0;','    for (const r of RANURAS) { const it = eq.getEquipment(r); if (it && PIEZAS.includes(it.typeId)) n++; }','  } catch (e) {}','  return n;','}',
        'system.runInterval(() => {','  for (const p of world.getAllPlayers()) {','    try {','      const n = contar(p);','      if (n === 0) continue;',
        '      p.addEffect("resistance", 60, { amplifier: Math.min(4, n), showParticles: false });',
        '      p.addEffect("fire_resistance", 60, { amplifier: 0, showParticles: false });',
        '      if (n >= 2) p.addEffect("regeneration", 60, { amplifier: n >= 4 ? 2 : 0, showParticles: false });',
        '      if (n >= 4) p.addEffect("strength", 60, { amplifier: 1, showParticles: false });',
        ...(quiereAura?['      if (n >= 4) {','        const l = p.location;','        for (let i = 0; i < 6; i++) {','          const a = Math.random() * Math.PI * 2, r = 0.6 + Math.random() * 0.5;','          p.dimension.spawnParticle(i % 2 ? "minecraft:basic_smoke_particle" : "minecraft:witchspell_emitter", { x: l.x + Math.cos(a) * r, y: l.y + Math.random() * 1.8, z: l.z + Math.sin(a) * r });','        }','      }']:[]),
        '    } catch (e) {}','  }','}, 10);',''].join("\n");
      files.push({path:"BP/scripts/ego_set_poder.js",content:sc});
      const mj=get("BP/scripts/main.js");
      if(mj&&typeof mj.content==="string"&&!/ego_set_poder/.test(mj.content))mj.content='import "./ego_set_poder.js";\n'+mj.content;
      nota("BP/scripts/ego_set_poder.js","Pediste algo poderoso: el conjunto ahora da resistencia real (crece con cada pieza), regeneración y resistencia al fuego"+(quiereAura?", y un aura de partículas válidas":"")+".");
    }
  }catch(e){ nota("BP/scripts","Poder de conjunto omitido: "+String(e&&e.message||e).slice(0,80)); }


  // 0f) Entidades: componentes que NO existen en el esquema oficial de Mojang (406 válidos) y eventos que apuntan a grupos inexistentes
  try{
    for(const [id,f] of ents){
      const o=hdJson(f); if(!o||!o["minecraft:entity"])continue; const e=o["minecraft:entity"]; let ch=false; const quit=[];
      for(const c of [e.components,...Object.values(e.component_groups||{})]){ if(!c)continue; for(const k of Object.keys(c)){ const m=/^minecraft:movement\.(?:speed|value)$/.exec(k); if(m&&!c["minecraft:movement"]){ const v=c[k]; c["minecraft:movement"]={value:(v&&typeof v==="object"&&typeof v.value==="number")?v.value:(typeof v==="number"?v:0.25)}; ch=true; } } }
      const limpiar=(c)=>{ if(!c||typeof c!=="object")return; for(const k of Object.keys(c)){ if(/^minecraft:/.test(k)&&!MC_ENT_COMP.has(k)){ delete c[k]; ch=true; quit.push(k); } } };
      limpiar(e.components); for(const g of Object.values(e.component_groups||{}))limpiar(g);
      const grupos=new Set(Object.keys(e.component_groups||{}));
      const fixRef=(x)=>{ if(!x||typeof x!=="object")return; for(const k of ["add","remove"]){ if(x[k]&&Array.isArray(x[k].component_groups)){ const a=x[k].component_groups.filter(n=>grupos.has(n)||(k==="remove"&&/^minecraft:/.test(n))); if(a.length!==x[k].component_groups.length){ quit.push("evento→grupo inexistente "+x[k].component_groups.filter(n=>!a.includes(n)).join(",")); ch=true; x[k].component_groups=a; } if(!a.length)delete x[k]; } } for(const v of Object.values(x))if(v&&typeof v==="object")fixRef(v); };
      for(const ev of Object.values(e.events||{}))fixRef(ev);
      if(ch){ guardar(f,o); nota(f.path,"Esquema oficial de entidades: "+[...new Set(quit)].slice(0,5).join(", ")+" (no existe: se quitó para que la criatura cargue)."); }
    }
  }catch(e){ nota("BP/entities","Revisión de esquema de entidades omitida: "+String(e&&e.message||e).slice(0,80)); }

  // 1) componentes de Resource Pack metidos en la entidad del BP (Minecraft los rechaza)
  const SOLO_RP=["minecraft:geometry","minecraft:skin_id","minecraft:animation_controller","minecraft:animations","minecraft:render_controller","minecraft:material","minecraft:sound_event","minecraft:variant_texture"];
  for(const [id,f] of ents){
    const o=hdJson(f); if(!o)continue; const e=o["minecraft:entity"]; let ch=false;
    const limpia=(c)=>{ if(!c||typeof c!=="object")return; for(const k of SOLO_RP) if(k in c){delete c[k];ch=true;} for(const k of Object.keys(c)){ if(/\s/.test(k)){const k2=k.replace(/\s+/g,""); if(!(k2 in c))c[k2]=c[k]; delete c[k]; ch=true;} } };
    limpia(e.components); for(const g of Object.values(e.component_groups||{}))limpia(g);
    if(ch){guardar(f,o);nota(f.path,"se quitaron componentes que solo existen en el Resource Pack (geometría, skin, animaciones, sonidos); Minecraft los rechazaba en el BP");}
  }

  // 2) ítems: campos viejos/inválidos, comida duplicada con script, arma con shooter + script
  const huevos=[];
  for(const [id,f] of items){
    const o=hdJson(f); if(!o)continue; const it=o["minecraft:item"]; const c=it.components||(it.components={}); let ch=false;
    const esHuevo=!!c["minecraft:spawn_egg"]||/spawn_egg/i.test(id)||/spawn_egg/i.test(f.path);
    if(esHuevo){ huevos.push({id,f,def:c["minecraft:spawn_egg"]||{}}); continue; }
    if(it.description&&"category" in it.description){delete it.description.category;ch=true;}
    for(const k of ["minecraft:creative_category","minecraft:stacked_by_data"]) if(k in c){delete c[k];ch=true;}
    if("events" in it){delete it.events;ch=true;}
    const fd=c["minecraft:food"];
    if(fd&&typeof fd==="object"){
      for(const k of Object.keys(fd)){ if(/\s/.test(k)){const k2=k.replace(/\s+/g,""); if(!(k2 in fd))fd[k2]=fd[k]; delete fd[k]; ch=true;} }
      if("on_consume" in fd){delete fd.on_consume;ch=true;}
      if(fd.using_converts_to==="minecraft:air"){delete fd.using_converts_to;ch=true;}
    }
    if(idsCuras.includes(id)&&(c["minecraft:food"]||c["minecraft:use_duration"])){delete c["minecraft:food"];delete c["minecraft:use_duration"];ch=true;nota(f.path,"la cura la gestiona el script (clic derecho); se quitó minecraft:food para que no se consuma dos veces");}
    if(idsArmas.includes(id)&&c["minecraft:shooter"]){delete c["minecraft:shooter"];ch=true;nota(f.path,"el disparo lo hace el script; se quitó minecraft:shooter que chocaba con él");}
    if(ch){guardar(f,o);nota(f.path,"campos inválidos o viejos del ítem corregidos");}
  }
  // huevos de aparición: Minecraft ya crea <ns>:<entidad>_spawn_egg desde el RP; el ítem manual es inválido
  const renombrados=[];
  for(const h of huevos){
    const objetivo=(h.def&&h.def.entity)||[...ents.keys()].find(e=>h.id.includes(e.split(":")[1]));
    quitarF(h.f.path);
    const ni=objetivo?objetivo+"_spawn_egg":null;
    if(ni)renombrados.push({viejo:h.id,nuevo:ni});
    const it=get("RP/textures/item_texture.json");
    if(it){const o=hdJson(it); if(o&&o.texture_data){const k=hdSnake(h.id); if(o.texture_data[k]){delete o.texture_data[k];guardar(it,o);}}}
    nota(h.f.path,"se quitó el ítem de huevo manual (inválido); el juego crea el huevo automático "+(ni||"")+" con los colores de la entidad");
    if(objetivo){
      const rf=files.find(x=>/^RP\/entity\/.+\.json$/.test(x.path)&&x.content.includes('"'+objetivo+'"'));
      if(rf){const ro=hdJson(rf); const d=ro&&ro["minecraft:client_entity"]&&ro["minecraft:client_entity"].description; if(d&&!d.spawn_egg){d.spawn_egg={base_color:h.def.base_color||"#4b4b4b",overlay_color:h.def.overlay_color||"#964b00"};guardar(rf,ro);}}
    }
  }
  for(const f of files){
    if(/^RP\/texts\/.+\.lang$/.test(f.path)&&typeof f.content==="string"&&huevos.length){
      f.content=f.content.split("\n").filter(l=>!huevos.some(h=>l.startsWith("item."+h.id+"=")||l.startsWith("item."+h.id+".name="))).join("\n");
    }
  }

  // 3) recetas: "count" dentro de ingredientes no existe
  for(const f of files){
    if(!/^BP\/recipes\/.+\.json$/.test(f.path))continue;
    const o=hdJson(f); if(!o)continue; let ch=false;
    const sl=o["minecraft:recipe_shapeless"],sh=o["minecraft:recipe_shaped"];
    if(sl&&Array.isArray(sl.ingredients)){
      const nuevo=[]; for(const ing of sl.ingredients){ const n=ing&&typeof ing==="object"&&Number(ing.count)>1?Math.min(9,Math.floor(ing.count)):1; if(ing&&"count" in ing){delete ing.count;ch=true;} for(let k=0;k<n;k++)nuevo.push({...ing}); }
      if(nuevo.length>9)nuevo.length=9; sl.ingredients=nuevo;
    }
    if(sh&&sh.key)for(const v of Object.values(sh.key))if(v&&typeof v==="object"&&"count" in v){delete v.count;ch=true;}
    if(ch){guardar(f,o);nota(f.path,"receta: los ingredientes no admiten 'count'; se repiten los ingredientes");}
  }

  // 4) munición única: si existe un ítem de munición propio, el arma, las misiones y el botín lo usan
  const ammo=[...items.keys()].find(i=>/muni|ammo|bala|bullet|cartucho/i.test(hdSnake(i)));
  if(ammo&&armasJs){
    let cambio=false;
    for(const f of scripts()){
      let c=f.content;
      if(/^BP\/scripts\/ego_(nucleo|armas|misiones)\.js$/.test(f.path)){
        c=c.replace(/"minecraft:iron_nugget"/g,JSON.stringify(ammo));
        c=c.replace(/\(pepitas de hierro\)/g,"("+hdSnake(ammo).replace(/_/g," ")+")").replace(/pepitas de hierro/g,hdSnake(ammo).replace(/_/g," "));
      }
      if(c!==f.content){f.content=c;cambio=true;nota(f.path,"la munición del arma ahora es "+ammo+" (antes pepitas de hierro, que no coincidía con el ítem y la receta)");}
    }
    for(const f of files){
      if(!/^BP\/loot_tables\/entities\/.+\.json$/.test(f.path))continue;
      const o=hdJson(f); if(!o||!Array.isArray(o.pools)||JSON.stringify(o).includes('"'+ammo+'"'))continue;
      o.pools.push({rolls:1,conditions:[{condition:"random_chance",chance:0.55}],entries:[{type:"item",name:ammo,weight:1,functions:[{function:"set_count",count:{min:1,max:3}}]}]});
      guardar(f,o);nota(f.path,"los zombis ahora sueltan la munición del arma");
    }
  }

  // 5) bloques de código duplicados entre módulos (curación doble, muerte duplicada)
  for(const f of scripts()){
    if(/^BP\/scripts\/ego_/.test(f.path))continue;
    let c=f.content, tot=0;
    if(idsCuras.length){const r=pfQuitarSubs(c,/world\.afterEvents\.itemUse\.subscribe\s*\(/g,(b)=>idsCuras.some(id=>b.includes(id)));c=r.content;tot+=r.n;}
    {const r=pfQuitarSubs(c,/world\.afterEvents\.entityHurt\.subscribe\s*\(/g,(b)=>/currentValue\s*<=\s*0/.test(b)&&/spawnItem/.test(b)&&/\.remove\(\)/.test(b));c=r.content;tot+=r.n;}
    if(tot&&!balanceJs(c)){f.content=c;nota(f.path,"se quitaron "+tot+" bloque(s) que repetían lo que ya hace otro módulo (curación doble / muerte duplicada)");}
  }

  // 6) límite de apariciones por script (evita acumular cientos de entidades)
  const idsProp=[...ents.keys()];
  let usoSpawn=false;
  for(const f of scripts()){
    if(/^BP\/scripts\/ego_/.test(f.path))continue;
    let c=f.content, n=0;
    c=c.replace(/(\b[A-Za-z_$][\w$.]*)\.spawnEntity\(\s*(["'])([\w]+:[\w]+)\2\s*,/g,(m,d,q,id)=>{ if(!idsProp.includes(id))return m; n++; return "egoSpawnSeguro("+d+", "+q+id+q+","; });
    if(n){ c='import { egoSpawnSeguro } from "./ego_nucleo.js";\n'+c; if(!balanceJs(c)){f.content=c;usoSpawn=true;nota(f.path,"las apariciones automáticas ahora tienen límite (máx. 6 cerca); antes se acumulaban sin fin");} }
  }
  if(usoSpawn||files.some(f=>/egoSpawnSeguro/.test(f.content||""))){
    const fn='\nexport function egoSpawnSeguro(dim, id, loc, max = 6) {\n  try { if (dim.getEntities({ type: id, location: loc, maxDistance: 64 }).length >= max) return undefined; } catch (e) {}\n  return dim.spawnEntity(id, loc);\n}\n';
    let nu=get("BP/scripts/ego_nucleo.js");
    if(!nu){files.push({path:"BP/scripts/ego_nucleo.js",content:"// Núcleo compartido (EGO AI)."+fn});nota("BP/scripts/ego_nucleo.js","se creó el núcleo con egoSpawnSeguro");}
    else if(!/egoSpawnSeguro/.test(nu.content)){nu.content+=fn;}
  }

  // 6b) errores de lógica frecuentes en scripts de modelos
  const sdef=get("RP/sounds/sound_definitions.json"); const sdTxt=sdef&&typeof sdef.content==="string"?sdef.content:"";
  for(const f of scripts()){
    if(/^BP\/scripts\/ego_/.test(f.path))continue;
    let c=f.content, avisos=[];
    // 0) nombres de propiedades de eventos inventados (tabla derivada de la API oficial de Mojang)
    if(/\.teleportTo\(/.test(c)){c=c.replace(/\.teleportTo\(/g,".teleport(");avisos.push("API oficial: teleportTo no existe → teleport");}
    try{const tf=ttArreglarEventos(c,MC_API_T);if(tf.cambios.length&&!balanceJs(tf.texto)){c=tf.texto;for(const x of tf.cambios)avisos.push("API oficial: "+x);}}catch(_){}
    // a) damagingEntity no existe en el evento: está en damageSource
    // (solo entityHurt/entityDie; en entityHitEntity damagingEntity SÍ es propiedad directa del evento)
    const c1=(/entityHurt|entityDie/.test(c)&&!/entityHitEntity/.test(c))?c.replace(/\b(event|ev|e)\.damagingEntity\b/g,"$1.damageSource?.damagingEntity"):c;
    if(c1!==c){c=c1;avisos.push("damagingEntity se leía del evento (no existe ahí); ahora de damageSource");}
    // b) vida "propia" inventada (ego:health) que mataba al jugador sin relación con su vida real
    {const r1=pfQuitarSubs(c,/world\.afterEvents\.entityHurt\.subscribe\s*\(/g,(b)=>/["']ego:health["']|getDynamicProperty\(["'][\w:]*health/i.test(b)&&/\.kill\(\)/.test(b));c=r1.content;
     const r2=pfQuitarSubs(c,/world\.afterEvents\.playerSpawn\.subscribe\s*\(/g,(b)=>/setDynamicProperty\(\s*["'][\w:]*health["']/i.test(b)&&b.length<400);c=r2.content;
     if(r1.n||r2.n)avisos.push("se quitó un sistema de vida inventado que mataba al jugador sin relación con su vida real");}
    // c) premios en cada golpe (entityHurt) → explotable; el botín va en la tabla de loot
    {const r=pfQuitarSubs(c,/world\.afterEvents\.entityHurt\.subscribe\s*\(/g,(b)=>/spawnItem|runCommand\(\s*["'`]give /.test(b));c=r.content;if(r.n)avisos.push("se quitó un premio que se daba en CADA golpe (explotable); el botín va en la tabla de loot");}
    // d) sonidos propios que no existen
    c=c.replace(/^[ \t]*[\w$.?]+\.playSound\(\s*["']([\w.]+:[\w.]+)["'][^;\n]*\);?[ \t]*$/gm,(m,id)=>{ if(id.startsWith("minecraft:")||sdTxt.includes('"'+id+'"'))return m; avisos.push("sonido inexistente "+id+" quitado"); return "// (EGO) sonido inexistente quitado: "+id; });
    if(avisos.length&&!balanceJs(c)){f.content=c;for(const a of avisos)nota(f.path,a);}
  }
  // 6c) ítems/entidades/spawn: componentes que no existen
  for(const f of files){
    if(/^BP\/items\/[^/]+\.json$/.test(f.path)){
      const o=hdJson(f); const it=o&&o["minecraft:item"]; if(it&&it.components&&"minecraft:on_use" in it.components){delete it.components["minecraft:on_use"];guardar(f,o);nota(f.path,"minecraft:on_use no existe (apuntaba a un evento inexistente); el uso lo gestiona el script");}
    }
    if(/^BP\/entities\/[^/]+\.json$/.test(f.path)){
      const o=hdJson(f); const e=o&&o["minecraft:entity"]; if(e&&e.components&&"minecraft:attack_sound" in e.components){delete e.components["minecraft:attack_sound"];guardar(f,o);nota(f.path,"minecraft:attack_sound no existe en entidades de BP");}
    }
    if(/^BP\/spawn_rules\/[^/]+\.json$/.test(f.path)){
      const o=hdJson(f); const conds=o&&o["minecraft:spawn_rules"]&&o["minecraft:spawn_rules"].conditions; let ch=false;
      const OK=new Set(["minecraft:spawns_on_surface","minecraft:spawns_underground","minecraft:spawns_underwater","minecraft:spawns_lava","minecraft:spawns_on_block_filter","minecraft:spawns_on_block_prevented_filter","minecraft:brightness_filter","minecraft:density_limit","minecraft:difficulty_filter","minecraft:distance_filter","minecraft:height_filter","minecraft:herd","minecraft:mob_event_filter","minecraft:permute_type","minecraft:player_in_village_filter","minecraft:weight","minecraft:world_age_filter","minecraft:biome_filter","minecraft:delay_filter","minecraft:disallow_spawns_in_bubble","minecraft:is_persistent","minecraft:spawn_event"]);
      if(Array.isArray(conds))for(const c of conds)for(const k of Object.keys(c))if(!OK.has(k)){delete c[k];ch=true;nota(f.path,"se quitó "+k+" (no existe en las reglas de aparición)");}
      if(ch)guardar(f,o);
    }
  }
  // 6d) animaciones huérfanas (huesos/ids que nadie usa)
  {
    const rpTxt=files.filter(f=>/^RP\/(entity|animation_controllers|render_controllers)\//.test(f.path)).map(f=>f.content||"").join("\n");
    for(const f of [...files]){
      if(!/^RP\/animations\/.+\.json$/.test(f.path))continue;
      const o=hdJson(f); const ids=o&&o.animations?Object.keys(o.animations):[];
      if(ids.length&&!ids.some(id=>rpTxt.includes(id))){quitarF(f.path);nota(f.path,"animación que ninguna entidad usa; se quitó");}
    }
  }

  // 6e) v14.49: esquemas que los modelos escriben con formato viejo o inventado (bloques, armaduras, armas, mobs, comida)
  for(const f of files){
    if(/^BP\/blocks\/[^/]+\.json$/.test(f.path)){
      const o=hdJson(f); const b=o&&o["minecraft:block"]; if(!b)continue; let ch=false; const m=[];
      const d=b.description||(b.description={}); const c=b.components||(b.components={});
      if("category" in d){delete d.category;ch=true;m.push("description.category");}
      if(d.properties&&!d.states){d.states=d.properties;delete d.properties;ch=true;m.push("properties→states");}
      for(const k of ["minecraft:creative_category"]) if(k in c){delete c[k];ch=true;m.push(k);}
      if("events" in b){delete b.events;ch=true;m.push("events");}
      for(const k of Object.keys(c)) if(/^minecraft:(on_interact|on_step_on|on_step_off|on_fall_on|on_player_placing|on_player_destroyed|on_placed|queued_ticking|random_ticking)$/.test(k)){delete c[k];ch=true;m.push(k);}
      if(typeof c["minecraft:block_light_emission"]==="number"&&c["minecraft:block_light_emission"]>1){c["minecraft:block_light_emission"]=Math.round(Math.min(15,c["minecraft:block_light_emission"])/15*100)/100;ch=true;m.push("block_light_emission (0–1)");}
      if(typeof c["minecraft:friction"]==="number"&&(c["minecraft:friction"]>0.9||c["minecraft:friction"]<0)){c["minecraft:friction"]=Math.max(0,Math.min(0.9,c["minecraft:friction"]/ (c["minecraft:friction"]>1?10:1)));ch=true;m.push("friction (0–0.9)");}
      if(ch){guardar(f,o);nota(f.path,"bloque con formato viejo/inventado corregido: "+m.join(", "));}
    }
    if(/^BP\/items\/[^/]+\.json$/.test(f.path)){
      const o=hdJson(f); const it=o&&o["minecraft:item"]; if(!it)continue; const c=it.components||(it.components={}); let ch=false; const m=[];
      const idI=String(it.description&&it.description.identifier||"");
      if(c["minecraft:armor"]&&!c["minecraft:wearable"]){
        const n=hdSnake(idI);
        const slot=/casco|helm|capucha|gorro|sombrero|corona/.test(n)?"slot.armor.head":/pantal|legging|greva|falda/.test(n)?"slot.armor.legs":/bota|boot|zapato/.test(n)?"slot.armor.feet":"slot.armor.chest";
        const prot=Number(c["minecraft:armor"].protection)||Number(c["minecraft:armor"])||3;
        c["minecraft:wearable"]={slot,protection:Math.max(0,Math.min(20,Math.round(prot)))}; delete c["minecraft:armor"];
        if(!c["minecraft:max_stack_size"])c["minecraft:max_stack_size"]=1;
        ch=true;m.push("minecraft:armor→minecraft:wearable ("+slot+"); ojo: sin 'attachable' la pieza se equipa y protege pero no se ve puesta en el cuerpo");
      }
      if("minecraft:weapon" in c){delete c["minecraft:weapon"];ch=true;m.push("minecraft:weapon");}
      const fd=c["minecraft:food"];
      if(fd&&typeof fd.saturation_modifier==="string"){const mp={poor:0.1,low:0.3,normal:0.6,good:0.8,max:1,high:1,supernatural:1.2};fd.saturation_modifier=mp[fd.saturation_modifier.toLowerCase()]??0.6;ch=true;m.push("saturation_modifier numérico");}
      if(ch){guardar(f,o);nota(f.path,"ítem con formato viejo/inventado corregido: "+m.join(", "));}
    }
    if(/^BP\/entities\/[^/]+\.json$/.test(f.path)){
      const o=hdJson(f); const e=o&&o["minecraft:entity"]; if(!e)continue; let ch=false; const m=[];
      const grupos=[e.components,...Object.values(e.component_groups||{})].filter(x=>x&&typeof x==="object");
      for(const c of grupos){
        for(const [k,wrap] of [["minecraft:health",(n)=>({value:n,max:n})],["minecraft:movement",(n)=>({value:n})],["minecraft:attack",(n)=>({damage:n})],["minecraft:scale",(n)=>({value:n})],["minecraft:knockback_resistance",(n)=>({value:n})],["minecraft:follow_range",(n)=>({value:n,max:n})]])
          if(typeof c[k]==="number"){c[k]=wrap(c[k]);ch=true;m.push(k+" como objeto");}
      }
      const cc=e.components||{};
      if(cc["minecraft:behavior.ranged_attack"]&&!cc["minecraft:shooter"]){cc["minecraft:shooter"]={def:"minecraft:arrow"};ch=true;m.push("shooter (el ataque a distancia no tenía proyectil)");}
      if(ch){guardar(f,o);nota(f.path,"entidad con formato viejo corregida: "+m.join(", "));}
    }
  }
  // scripts: nombres de API viejos o inexistentes con reemplazo directo
  for(const f of scripts()){
    if(/^BP\/scripts\/ego_/.test(f.path))continue;
    let c=f.content; const av=[];
    const sw=(rx,rep,txt)=>{const n=c.replace(rx,rep);if(n!==c){c=n;av.push(txt);}};
    sw(/\.runCommandAsync\(/g,".runCommand(","runCommandAsync→runCommand");
    sw(/\bworld\.events\./g,"world.afterEvents.","world.events→world.afterEvents");
    sw(/\bworld\.say\(/g,"world.sendMessage(","world.say→world.sendMessage");
    sw(/\.setCurrent\(/g,".setCurrentValue(","setCurrent→setCurrentValue");
    sw(/(getComponent\(\s*["'](?:minecraft:)?health["']\s*\)\s*\??)\.current\b(?!Value)/g,"$1.currentValue","health.current→currentValue");
    // propiedades del evento que no existen según el tipo de evento
    for(const [head,from,to] of [[/world\.afterEvents\.entityDie\.subscribe\s*\(/g,"entity","deadEntity"],[/world\.afterEvents\.entityHurt\.subscribe\s*\(/g,"entity","hurtEntity"],[/world\.afterEvents\.itemUse\.subscribe\s*\(/g,"(?:player|entity)","source"]]){
      let pos=0;
      for(let g=0;g<20;g++){head.lastIndex=pos;const mm=head.exec(c);if(!mm)break;const ini=mm.index+mm[0].length-1,fin=pfFinBloque(c,ini);if(fin<0)break;
        const bl=c.slice(mm.index,fin+1);
        const nb2=bl.replace(new RegExp("\\b(event|ev|e|evt)\\.(?:"+from.replace(/^\(\?:|\)$/g,"")+")\\b","g"),"$1."+to);
        if(nb2!==bl){c=c.slice(0,mm.index)+nb2+c.slice(fin+1);av.push(to+" en lugar de "+from.replace(/[()?:]/g,""));pos=mm.index+nb2.length;}else pos=fin+1;}
    }
    if(av.length&&!balanceJs(c)){f.content=c;for(const a of av)nota(f.path,"API corregida: "+a);}
  }

  // 6f) v14.49.1: declaraciones duplicadas (rompen TODO el módulo) y detección de armadura puesta
  const pfFinLlave=(src,ini)=>{let d=0,q=null;for(let i=ini;i<src.length;i++){const ch=src[i];if(q){if(ch==="\\"){i++;continue;}if(ch===q)q=null;continue;}if(ch==='"'||ch==="'"||ch==="`"){q=ch;continue;}if(ch==="/"&&src[i+1]==="/"){const n=src.indexOf("\n",i);if(n<0)return -1;i=n;continue;}if(ch==="{")d++;else if(ch==="}"){d--;if(d===0)return i;}}return -1;};
  for(const f of scripts()){
    let c=f.content; const av=[];
    // a) import { world } + const { world } = mc  → "Identifier 'world' has already been declared"
    const imp=new Set(); for(const m of c.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']@minecraft\/server["']/g))for(const n of m[1].split(","))imp.add(n.trim().split(/\s+as\s+/).pop());
    if(imp.size){
      c=c.replace(/^[ \t]*const\s*\{([^}]*)\}\s*=\s*\w+\s*;?[ \t]*$/gm,(line,lista)=>{
        const nombres=lista.split(",").map(s=>s.trim()).filter(Boolean);
        const quedan=nombres.filter(n=>!imp.has(n.split(":").pop().trim()));
        if(quedan.length===nombres.length)return line;
        av.push("declaración duplicada de "+nombres.filter(n=>!quedan.includes(n)).join(", ")+" (rompía todo el módulo)");
        return quedan.length?line.replace(lista,quedan.join(", ")):"";
      });
    }
    // b) "armadura completa" que mira el inventario en vez de las ranuras de equipo
    for(let g=0;g<5;g++){
      const mm=/function\s+(\w*(?:[Ff]ull|[Ss]et|[Cc]omplet|[Ww]earing|[Ee]quipped)\w*)\s*\(\s*(\w+)\s*\)\s*\{/.exec(c); if(!mm)break;
      const ini=mm.index+mm[0].length-1, fin=pfFinLlave(c,ini); if(fin<0)break;
      const cuerpo=c.slice(ini,fin+1); let arr=/(\w+)\.every\s*\(/.exec(cuerpo);
      if(!/inventory/.test(cuerpo)||/equippable/.test(cuerpo))break;
      let nuevo;
      if(arr){
        nuevo="function "+mm[1]+"("+mm[2]+") {\n  try {\n    const eq = "+mm[2]+".getComponent(\"minecraft:equippable\");\n    if (!eq) return false;\n    const puestas = [\"Head\", \"Chest\", \"Legs\", \"Feet\"].map((s) => eq.getEquipment(s)?.typeId);\n    return "+arr[1]+".every((p) => puestas.includes(p));\n  } catch (e) { return false; }\n}";
      } else {
        // forma con comparaciones sueltas: helmet?.typeId === "ns:..._casco" && ...
        const ids=[...new Set([...cuerpo.matchAll(/["']([a-z][a-z0-9_]*:[a-z0-9_]+)["']/g)].map(x=>x[1]))];
        const slotDe=(id)=>/(casco|helmet|head|yelmo)/.test(id)?"Head":(/(pecho|chest|peto|coraza)/.test(id)?"Chest":(/(piern|leg|pant|grebas)/.test(id)?"Legs":(/(bota|boot|feet)/.test(id)?"Feet":null)));
        const pares=ids.map(id=>[slotDe(id),id]).filter(p=>p[0]);
        if(!pares.length)break;
        nuevo="function "+mm[1]+"("+mm[2]+") {\n  try {\n    const eq = "+mm[2]+".getComponent(\"minecraft:equippable\");\n    if (!eq) return false;\n    return "+pares.map(p=>"eq.getEquipment(\""+p[0]+"\")?.typeId === \""+p[1]+"\"").join("\n      && ")+";\n  } catch (e) { return false; }\n}";
      }
      c=c.slice(0,mm.index)+nuevo+c.slice(fin+1); av.push("la armadura se buscaba en el inventario; ahora se lee lo que el jugador lleva PUESTO"); break;
    }
    // c) filtro de entidades inexistente "minecraft:mob" (+ no dañar jugadores/objetos)
    if(/type\s*:\s*["']minecraft:mob["']/.test(c)){c=c.replace(/type\s*:\s*["']minecraft:mob["']/g,'families: ["monster"], excludeTypes: ["minecraft:player", "minecraft:item", "minecraft:xp_orb"]');av.push("type 'minecraft:mob' no existe; se usa la familia monster y se excluye a los jugadores");}
    // d) entityHitEntity usa hitEntity (no hurtEntity); Entity no tiene .families
    if(/entityHitEntity\.subscribe/.test(c)&&/\bhurtEntity\b/.test(c)&&!/entityHurt\.subscribe/.test(c)){c=c.replace(/\bhurtEntity\b/g,"hitEntity");av.push("entityHitEntity trae 'hitEntity' (no 'hurtEntity')");}
    if(/\.families\.includes\(/.test(c)){c=c.replace(/(\w+)\.families\.includes\(\s*(["'][^"']+["'])\s*\)/g,"$1.matches({ families: [$2] })");av.push("las entidades no tienen .families; se usa entity.matches({ families: [...] })");}
    if(/minecraft:smoke_puff/.test(c)){c=c.replace(/minecraft:smoke_puff/g,"minecraft:basic_smoke_particle");av.push("partícula 'smoke_puff' no existe; se usa basic_smoke_particle");}
    // e) nada de escribir errores en el chat (llenaba la pantalla de letras cada pocos ticks)
    if(/world\.sendMessage\(\s*(?:`[^`]*[Ee]rror[^`]*`|"[^"]*[Ee]rror[^"]*"|'[^']*[Ee]rror[^']*')\s*\)\s*;?/.test(c)){c=c.replace(/world\.sendMessage\(\s*(?:`[^`]*[Ee]rror[^`]*`|"[^"]*[Ee]rror[^"]*"|'[^']*[Ee]rror[^']*')\s*\)\s*;?/g,"void 0;");av.push("se quitaron los mensajes de error al chat (llenaban la pantalla)");}
    if(av.length&&!balanceJs(c)){f.content=c;for(const a of av)nota(f.path,a);}
  }

  // 6g) v14.52: componentes que NO existen en los esquemas oficiales de Mojang (item 1.26.50 / block 1.26.60) → se corrigen o se quitan
  for(const f of files){
    const esI=/^BP\/items\/[^/]+\.json$/.test(f.path),esB=/^BP\/blocks\/[^/]+\.json$/.test(f.path);
    if(!esI&&!esB)continue;
    const o=hdJson(f);const raiz=o&&(o["minecraft:item"]||o["minecraft:block"]);if(!raiz)continue;
    const ok=new Set(esI?MC_SCHEMA_J.item:MC_SCHEMA_J.block);const grupos=[raiz.components];
    if(esB&&Array.isArray(raiz.permutations))for(const p of raiz.permutations)grupos.push(p&&p.components);
    let ch=false;const m=[];
    for(const c of grupos){if(!c||typeof c!=="object")continue;
      if(esB){ // nombres antiguos → equivalentes oficiales
        if(typeof c["minecraft:block_light_emission"]==="number"&&!("minecraft:light_emission" in c)){const v=c["minecraft:block_light_emission"];c["minecraft:light_emission"]=Math.max(0,Math.min(15,Math.round(v<=1?v*15:v)));ch=true;m.push("block_light_emission → light_emission");}
        if(typeof c["minecraft:block_light_filter"]==="number"&&!("minecraft:light_dampening" in c)){c["minecraft:light_dampening"]=Math.max(0,Math.min(15,Math.round(c["minecraft:block_light_filter"])));ch=true;m.push("block_light_filter → light_dampening");}
        if(typeof c["minecraft:destroy_time"]==="number"&&!("minecraft:destructible_by_mining" in c)){c["minecraft:destructible_by_mining"]={seconds_to_destroy:c["minecraft:destroy_time"]};ch=true;m.push("destroy_time → destructible_by_mining");}
        if(typeof c["minecraft:explosion_resistance"]==="number"&&!("minecraft:destructible_by_explosion" in c)){c["minecraft:destructible_by_explosion"]={explosion_resistance:c["minecraft:explosion_resistance"]};ch=true;m.push("explosion_resistance → destructible_by_explosion");}
      }
      if(esI&&typeof c["minecraft:use_duration"]==="number"&&!("minecraft:use_modifiers" in c)){c["minecraft:use_modifiers"]={use_duration:Math.max(0.1,c["minecraft:use_duration"]),movement_modifier:1};ch=true;m.push("use_duration → use_modifiers");}
      for(const k of Object.keys(c)){if(/^minecraft:/.test(k)&&!ok.has(k)){delete c[k];ch=true;m.push(k+" (no existe en el esquema oficial)");}}
    }
    if(ch){guardar(f,o);nota(f.path,"esquema oficial: "+[...new Set(m)].join(", "));}
  }

  // 7) sonidos mal ubicados / nombres no ASCII
  for(const f of [...files]){
    if(/^RP\/sounds\/[^/]+\.json$/.test(f.path)&&!/^RP\/sounds\/sound_definitions\.json$/.test(f.path)){quitarF(f.path);nota(f.path,"archivo de sonido en lugar equivocado y sin audio real; se quitó (Minecraft lee RP/sounds/sound_definitions.json)");}
    else if(/[^\x00-\x7F]/.test(f.path)&&/\.(json|png|ogg|js)$/.test(f.path)){quitarF(f.path);nota(f.path,"nombre de archivo con caracteres no ASCII (ñ, acentos); se quitó");}
  }

  // 8) manifests con nombre genérico
  const nom=String((plan&&plan.nombre)||"").trim().slice(0,40);
  if(nom){
    for(const [p,suf] of [["BP/manifest.json","BP"],["RP/manifest.json","RP"]]){
      const f=get(p); const o=f&&hdJson(f); if(o&&o.header&&/^Add-on EGO (BP|RP)$/.test(String(o.header.name))){o.header.name=nom+" "+suf;o.header.description=(suf==="BP"?"Behavior pack: ":"Resource pack: ")+nom;guardar(f,o);nota(p,"nombre del pack con el título del add-on");}
    }
  }

  // 9) README honesto y sin el pedido pegado
  const rd=get("BP/README.md");
  if(rd&&typeof rd.content==="string"){
    let t=rd.content;
    if(/Actúa como|Tu misión es|PROYECTO MINECRAFT|PRUEBA TÉCNICA|IMPORTANTE:/i.test(t.split("## Instalar")[0])){
      const i=t.indexOf("## Instalar");
      t="# "+(nom||"Add-on EGO")+"\n\nAdd-on para Minecraft Bedrock creado por EGO AI.\n\n"+(plan&&plan.resumen?String(plan.resumen).slice(0,500)+"\n\n":"")+(i>=0?t.slice(i):"");
      nota(rd.path,"el README traía pegado el texto completo del pedido; se reemplazó por un resumen");
    }
    for(const r of renombrados){ t=t.split(r.viejo).join(r.nuevo); }
    const ids=new Set(files.map(f=>f.path));
    const desc={"ego_armas.js":"armas con clic derecho (gastan munición del inventario) y curas","ego_misiones.js":"misiones con progreso guardado (/scriptevent ego:misiones)","ego_infeccion.js":"infección por golpe en 3 etapas, se cura con botiquín","ego_zombis.js":"habilidades especiales de zombis","ego_estructuras.js":"ruinas con cofres de botín","ego_supervivientes.js":"diálogo al interactuar con el superviviente","ego_nucleo.js":"utilidades compartidas","ego_npc_brain.js":"compañero: sigue al jugador y se teletransporta si se aleja (no combate por script)"};
    const lineas=scripts().map(f=>f.path.split("/").pop()).map(n=>"- "+n+(desc[n]?": "+desc[n]:""));
    const lootZ=files.some(f=>/^BP\/loot_tables\/entities\//.test(f.path)&&ammo&&f.content.includes('"'+ammo+'"'));
    const sec="## Qué hace realmente este add-on (verificado por EGO AI)\n"+(lineas.length?lineas.join("\n"):"- Contenido por datos (entidades, ítems, recetas).")+
      (ammo?"\n- Munición de las armas: `"+ammo+"`"+(lootZ?"; los zombis pueden soltarla":"")+".":"")+
      (ids.has("BP/scripts/ego_armas.js")?"\n- Las armas se usan con clic derecho (no hay modo automático al mantener).":"")+
      (ids.has("BP/scripts/ego_misiones.js")?"\n- El progreso de misiones se guarda en el jugador.":"")+
      "\n\n### Limitaciones conocidas\n- Revisión estática y pruebas con un simulador; no se probó dentro de Minecraft.\n"+
      (ids.has("BP/scripts/ego_estructuras.js")?"- Las ruinas aparecen cerca del jugador y al colocar el bloque; no son estructuras nativas ni hay biomas nuevos.\n":"- No se generan estructuras automáticamente"+(ids.has("BP/functions/ego_ruina.mcfunction")?": usa `/function ego_ruina` para construir el refugio de ejemplo.":".")+"\n");
    const rx=/## Qué hace realmente este add-on[\s\S]*?(?=\n## (?!Qué hace)|$)/;
    t=rx.test(t)?t.replace(rx,()=>sec):t.replace(/\s*$/,"")+"\n\n"+sec;
    if(t!==rd.content){rd.content=t;}
  }
  return {cambios};
}

// Arquitectura EGO de compañeros NPC: complemento determinista y original para entidades
// explícitamente incluidas en el proyecto. No copia código ni recursos de terceros.
function integrarArquitecturaNPC(files, plan, prompt, serverVersion){
  const t=String(prompt||"");
  const pideIA=/(npc|compa[nñ]er|aliad|guardaespalda|soldado|superviviente|aldeano inteligente|equipo de.*(ia|intelig)|inteligencia artificial|ai player)/i.test(t);
  if(!pideIA) return {aplicado:false,avisos:[]};
  const map=new Map(files.map(f=>[f.path,f.content]));
  const entidades=[];
  for(const [path,content] of map){
    if(!/^BP\/entities\/.+\.json$/i.test(path)) continue;
    try{
      const root=JSON.parse(content), e=root['minecraft:entity'];
      const id=e?.description?.identifier;
      if(!id || !id.includes(':')) continue;
      const c=e.components=e.components||{};
      // Un zombi/monstruo que ataca jugadores NO es un compañero: no se convierte en aliado.
      if(/"player"/.test(JSON.stringify(c['minecraft:behavior.nearest_attackable_target']||{}))) continue;
      c['minecraft:type_family']=c['minecraft:type_family']||{family:['mob','ego_ally']};
      const fam=c['minecraft:type_family'].family;
      if(Array.isArray(fam)&&!fam.includes('ego_ally'))fam.push('ego_ally');
      c['minecraft:movement']=c['minecraft:movement']||{value:0.25};
      c['minecraft:movement.basic']=c['minecraft:movement.basic']||{};
      c['minecraft:navigation.walk']=c['minecraft:navigation.walk']||{can_path_over_water:true,avoid_water:true,can_break_doors:false};
      c['minecraft:physics']=c['minecraft:physics']||{};
      c['minecraft:attack']=c['minecraft:attack']||{damage:6};
      c['minecraft:behavior.float']=c['minecraft:behavior.float']||{priority:0};
      c['minecraft:behavior.hurt_by_target']=c['minecraft:behavior.hurt_by_target']||{priority:1};
      // Solo apunta a la familia monster; nunca a jugadores.
      c['minecraft:behavior.nearest_attackable_target']=c['minecraft:behavior.nearest_attackable_target']||{
        priority:2, must_see:false, reselect_targets:true,
        entity_types:[{filters:{all:[{test:'is_family',subject:'other',value:'monster'},{test:'is_family',subject:'other',operator:'!=',value:'ego_ally'}]},max_dist:20}]
      };
      c['minecraft:behavior.melee_attack']=c['minecraft:behavior.melee_attack']||{priority:3,speed_multiplier:1.15,track_target:true};
      c['minecraft:behavior.random_stroll']=c['minecraft:behavior.random_stroll']||{priority:7,speed_multiplier:0.85};
      c['minecraft:behavior.look_at_player']=c['minecraft:behavior.look_at_player']||{priority:8,look_distance:10};
      c['minecraft:behavior.random_look_around']=c['minecraft:behavior.random_look_around']||{priority:9};
      root.format_version=root.format_version||'1.21.0';
      map.set(path,JSON.stringify(root,null,2)+'\n'); entidades.push({id,path});
    }catch(_){ }
  }
  if(!entidades.length) return {aplicado:false,avisos:['Se detectó una petición de NPC inteligentes, pero el proyecto no contiene entidades BP/entities/*.json; no se inventaron NPC inexistentes.']};
  const ids=entidades.map(x=>x.id);
  const esc=JSON.stringify(ids);
  const script=`// EGO AI — coordinador táctico NPC (Bedrock Script API)\n// Máquina de estados: idle/follow/defend/follow_recover; memoria temporal por entidad.\n// Comportamiento modular: seguimiento, defensa contextual y recuperación.\nimport { world, system } from "@minecraft/server";\nconst EGO_ALLIES = new Set(${esc});\nconst EGO_HOSTILES = new Set(["minecraft:zombie","minecraft:husk","minecraft:drowned","minecraft:skeleton","minecraft:stray","minecraft:creeper","minecraft:spider","minecraft:cave_spider","minecraft:witch","minecraft:pillager","minecraft:vindicator","minecraft:ravager","minecraft:phantom","minecraft:blaze","minecraft:ghast","minecraft:wither_skeleton"]);\nconst memory = new Map();\nconst sq = (a,b) => { const x=a.x-b.x,y=a.y-b.y,z=a.z-b.z; return x*x+y*y+z*z; };\nfunction tick(){\n  let allies=[]; try { for(const d of [world.getDimension("overworld"),world.getDimension("nether"),world.getDimension("the_end")]) for(const e of d.getEntities()) if(EGO_ALLIES.has(e.typeId)) allies.push(e); } catch {}\n  for(const npc of allies){ try {\n    if(!npc.isValid()) { memory.delete(npc.id); continue; }\n    const players=npc.dimension.getPlayers({location:npc.location,maxDistance:48});\n    if(!players.length) continue;\n    players.sort((a,b)=>sq(a.location,npc.location)-sq(b.location,npc.location));\n    const owner=players[0], dist=sq(owner.location,npc.location);\n    let m=memory.get(npc.id)||{state:"follow",lastSeen:0};\n    m.lastSeen=system.currentTick;\n    if(dist>400){ const l=owner.location; npc.teleport({x:l.x+1,y:l.y,z:l.z+1},{dimension:owner.dimension,checkForBlocks:true}); m.state="follow_recover"; }\n    else { let nearby=[]; try { nearby=npc.dimension.getEntities({location:owner.location,maxDistance:12}); } catch {} const threat=nearby.find(e=>e.id!==npc.id && EGO_HOSTILES.has(e.typeId)); m.state=threat?"defend":"follow"; }\n    memory.set(npc.id,m);\n  } catch {} }\n}\nsystem.runInterval(tick,20);\nworld.afterEvents.entityDie.subscribe(ev=>{try{memory.delete(ev.deadEntity.id);}catch{}});\n`;
  // Evitar reinsertar dos veces el coordinador.
  const path='BP/scripts/ego_npc_brain.js';
  if(!map.has(path)) map.set(path,script);

  const main=map.get('BP/scripts/main.js');
  if(typeof main==='string'){
    if(!main.includes('./ego_npc_brain.js')) map.set('BP/scripts/main.js',main.replace(/\s*$/,'')+'\nimport "./ego_npc_brain.js";\n');
  } else {
    map.set('BP/scripts/main.js','// Punto de entrada EGO AI\nimport "./ego_npc_brain.js";\n');
  }
  const readme=map.get('BP/README.md')||'# Add-on EGO AI\n';
  map.set('BP/README.md',readme+'\n## Arquitectura de compañeros NPC EGO\n- Roles aliados con estados de seguimiento y defensa.\n- Adquisición de objetivos hostiles mediante componentes vanilla; la familia de aliados no se configura como objetivo.\n- Memoria táctica temporal por entidad y recuperación de seguimiento si queda lejos del jugador.\n- El módulo no mina, recoge inventario ni construye bloques automáticamente: esas acciones requieren una implementación específica y pruebas adicionales.\n- Prueba: invoca la entidad con `/summon <namespace:entidad>` y verifica seguimiento cercano, defensa ante mobs hostiles y recuperación al alejarte.\n- Requiere la dependencia `@minecraft/server` declarada en el manifest y compatible con la versión del juego.\n');
  files.splice(0,files.length,...[...map].map(([path,content])=>({path,content})));
  return {aplicado:true,entidades:ids,avisos:['Arquitectura NPC EGO añadida para '+ids.length+' entidad(es): roles aliados, adquisición de amenazas hostiles, memoria temporal y recuperación de seguimiento. La prueba dentro del juego sigue pendiente.']};
}

// Auditoría avanzada de requisitos explícitos: no confunde archivos decorativos con sistemas funcionales.
function auditarRequisitosAddonAvanzado(files, prompt, qualityEvidence = {}) {
  const list = Array.isArray(files) ? files : [];
  const paths = list.map(f => String(f.path || '').replace(/\\/g,'/').toLowerCase());
  const byPath = new Map(list.map(f => [String(f.path || '').toLowerCase(), String(f.content || '')]));
  const all = list.filter(f => /\.(?:js|json|mcfunction)$/i.test(String(f.path||''))).map(f => String(f.content||'')).join('\n').toLowerCase();
  const hasPath = rx => paths.some(x => rx.test(x));
  const hasCode = rx => rx.test(all);
  const findings = [];
  const requested = String(prompt || '').toLowerCase();
  const add = (key, label, ok, evidence, severity='faltante') => findings.push({key,label,ok:!!ok,evidence:evidence||'',severity:ok?'cumplido':severity});

  if (/(veh[ií]cul|autom[oó]vil|camioneta|motocicleta|conducible)/i.test(requested)) {
    const vehicleFiles = list.filter(f => /^BP\/entities\//i.test(String(f.path||'')) && /(veh[ií]cul|carro|camion|moto|vehicle)/i.test(String(f.path||'')+' '+String(f.content||'')));
    const rideable = vehicleFiles.some(f => /minecraft:rideable|"rideable"/i.test(String(f.content||'')));
    const vehicleLogic = hasCode(/(vehicle|veh[ií]cul|steer|drive|conduc|setrotation|applyimpulse|applyknockback)/i);
    add('vehicles','Vehículos con entidad y mecánica verificable', vehicleFiles.length>0 && (rideable || vehicleLogic), vehicleFiles.length ? `${vehicleFiles.length} definición(es); rideable=${rideable}; lógica=${vehicleLogic}` : 'No hay definición de entidad de vehículo.');
  }
  if (/(construcci[oó]n|construcciones|refugio|barricada|estructura|base militar)/i.test(requested)) {
    const structures = paths.filter(x => /^bp\/structures\/.*\.mcstructure$/i.test(x)).length;
    const functions = list.filter(f => /^BP\/functions\/.*\.mcfunction$/i.test(String(f.path||'')) && /(\bfill\b|\bsetblock\b|\bclone\b)/i.test(String(f.content||''))).length;
    const builderScripts = list.filter(f => /^BP\/scripts\/.*\.js$/i.test(String(f.path||'')) && /(setblock|structure|build|constru|placeblock)/i.test(String(f.content||''))).length;
    add('construction','Construcción/refugios con recurso ejecutable', structures>0 || functions>0 || builderScripts>0, `${structures} .mcstructure, ${functions} funciones de construcción, ${builderScripts} scripts relacionados.`);
  }
  if (/(oleada|oleadas|zona(?:s)? peligrosa|suministros|evento(?:s)? aleatorio|aparici[oó]n progresiva)/i.test(requested)) {
    const waveLogic = hasCode(/(wave|oleada|horde|horda)/i);
    const spawnLogic = hasCode(/(spawnentity|spawn_entity|spawn_rules|spawnrule)/i);
    const scheduler = hasCode(/(runinterval|runTimeout|system\.run|timer|cooldown)/i);
    add('waves','Oleadas/eventos con aparición y temporizador', waveLogic && spawnLogic && scheduler, `oleadas=${waveLogic}; aparición=${spawnLogic}; temporizador=${scheduler}`);
  }
  if (/(animaci[oó]n|animaciones|modelo 3d|modelos 3d)/i.test(requested)) {
    const bpEntities = paths.filter(x => /^bp\/entities\/.*\.json$/i.test(x)).length;
    const clientEntities = paths.filter(x => /^rp\/entity\/.*\.entity\.json$/i.test(x)).length;
    const animations = paths.filter(x => /^rp\/animations\/.*\.json$/i.test(x)).length;
    const connected = list.filter(f => /^RP\/entity\/.*\.entity\.json$/i.test(String(f.path||''))).every(f => /"animations"\s*:/i.test(String(f.content||'')) && /"animate"\s*:/i.test(String(f.content||'')));
    add('animations','Animaciones enlazadas a entidades', bpEntities>0 && clientEntities>=bpEntities && animations>0 && connected, `${bpEntities} entidades BP, ${clientEntities} client entities, ${animations} archivos de animación; conexiones=${connected}`);
  }
  if (/(arquitectura|modular|m[oó]dulos|api(?:s)? reales|@minecraft\/server)/i.test(requested)) {
    const scripts = paths.filter(x => /^bp\/scripts\/.*\.js$/i.test(x)).length;
    const main = byPath.get('bp/scripts/main.js') || '';
    const manifest = byPath.get('bp/manifest.json') || '';
    const imports = /\bimport\s+['"]\.\//i.test(main);
    const api = /@minecraft\/server/i.test(manifest) && /@minecraft\/server/i.test(all);
    add('architecture','Arquitectura modular y Script API declarada', scripts>=2 && imports && api, `${scripts} scripts; imports=${imports}; dependencia/API=${api}`);
  }
  // Los objetos solicitados deben existir como definiciones BP/items y estar
  // conectados a una mecánica real; README y nombres mencionados no cuentan.
  const itemDefs=[];
  for(const f of list){
    if(!/^BP\/items\/.+\.json$/i.test(String(f.path||'')))continue;
    try{const j=JSON.parse(String(f.content||''));const root=j['minecraft:item'];const id=root?.description?.identifier;if(id)itemDefs.push({id:String(id).toLowerCase(),root,content:String(f.content||'').toLowerCase(),path:f.path});}catch{}
  }
  const scriptFiles=list.filter(f=>/^BP\/scripts\/.+\.js$/i.test(String(f.path||'')));
  const scripts=scriptFiles.map(f=>String(f.content||'').toLowerCase()).join('\n');
  const recipes=list.filter(f=>/^BP\/recipes\/.+\.json$/i.test(String(f.path||'')));
  const checks=[
    {key:'medkit',rx:/(botiqu[ií]n|kit\s+m[eé]dico|medkit)/i,id:/botiqu[ií]n|medkit|kit[_ ]?med/i,logic:/curarvida|itemuse/},
    {key:'canned_food',rx:/(comida[_ ]enlatada|alimento enlatado|conserva)/i,id:/comida[_ ]?enlatada|conserva/i,logic:/minecraft:food/}
  ];
  for(const c of checks){
    if(!c.rx.test(requested))continue;
    const def=itemDefs.find(x=>c.id.test(x.id));
    add('item_'+c.key, c.key==='medkit'?'Botiquín solicitado con definición y uso':'Comida enlatada solicitada con definición de alimento',
      !!def && (c.key==='medkit' ? scripts.includes(def.id) : true) && c.logic.test(def.content+'\n'+scripts),
      def ? `definición=${def.id}; referencia_en_script=${scripts.includes(def.id)}; mecánica=${c.logic.test(def.content+'\n'+scripts)}` : 'No existe una definición correspondiente en BP/items/*.json.');
  }
  if(/(receta|recetas|crafting|fabricaci[oó]n|fabricar|craftear)/i.test(requested)){
    add('recipes','Recetas de fabricación solicitadas',recipes.length>0,`${recipes.length} archivo(s) en BP/recipes.`);
  }
  // Toda referencia ego:<id> usada como objeto en scripts debe tener una definición
  // BP/items. Se excluyen IDs de entidades usados en spawnEntity/summon.
  const customItemRefs=new Set();
  for(const f of scriptFiles){
    const code=String(f.content||'');
    for(const m of code.matchAll(/(?:ItemStack\s*\(\s*|addItem\s*\(\s*|countar?\s*\(\s*|quitar\s*\(\s*|dar\s*\(\s*)["'](ego:[a-z0-9_]+)["']/gi))customItemRefs.add(m[1].toLowerCase());
  }
  for(const id of customItemRefs){
    if(!itemDefs.some(x=>x.id===id))add('missing_item_'+id,`Referencia a objeto personalizado ${id}`,false,`Un script usa ${id}, pero no existe en BP/items/*.json.`);
  }
  if (/(control de calidad|validaci[oó]n|reparaci[oó]n|auditor[ií]a)/i.test(requested)) {
    // No se aprueba por defecto: debe existir resultado real del validador.
    const v=qualityEvidence.validacion;
    const executed=!!v && Array.isArray(v.errores) && typeof v.ok === "boolean";
    const passed=executed && v.ok && v.errores.length===0;
    const repairState=String(qualityEvidence.repairState||"no disponible");
    add('quality','Control de calidad ejecutado y superado', passed,
      executed ? `validador_ejecutado=true; errores=${v.errores.length}; estado_reparación=${repairState}; prueba dentro de Minecraft pendiente` : 'No existe evidencia verificable de ejecución del validador.', 'no_verificado');
  }
  const missing = findings.filter(x => !x.ok);
  return { ok: missing.length===0, total: findings.length, passed: findings.length-missing.length, findings, missing: missing.map(x=>`${x.label}: ${x.evidence}`) };
}

async function repararCoberturaRequisitosAddon(files,prompt,env){
  const evidence={validacion:{ok:true,errores:[]},repairState:"pendiente"};
  let audit=auditarRequisitosAddonAvanzado(files,prompt,evidence);
  if(audit.ok||env.EGO_AUTO_REPAIR==="0")return {audit,rounds:0,models:[]};
  const models=[];
  for(let round=0;round<3&&!audit.ok;round++){
    const relevant=files.filter(f=>/^(BP\/(items|recipes|scripts|entities)|RP\/(entity|animations|models|textures))\//i.test(f.path));
    const context=relevant.map(f=>`=== ARCHIVO: ${f.path} ===\n${String(f.content||'').slice(0,9000)}\n=== FIN ===`).join("\n").slice(0,26000);
    const messages=[
      {role:"system",content:`Eres un reparador de add-ons de Minecraft Bedrock. Corrige exclusivamente los requisitos faltantes indicados. Devuelve los archivos completos afectados con el formato exacto === ARCHIVO: ruta === contenido === FIN ===. Puedes añadir archivos nuevos. No escribas README ni manifiestos. No inventes APIs. Respeta los IDs ya usados, no borres funciones válidas y asegúrate de que cada receta tenga su ítem resultado definido. Si se pide un botiquín, debe existir BP/items/<archivo>.json y una mecánica real conectada; si se pide comida, debe tener minecraft:food. Usa @minecraft/server ${String(env.MC_SERVER_VERSION||"2.10.0")}.`},
      {role:"user",content:`PROMPT ORIGINAL:\n${String(prompt).slice(0,6500)}\n\nFALTANTES DETECTADOS:\n- ${audit.missing.join("\n- ")}\n\nARCHIVOS ACTUALES:\n${context}\n\nDevuelve solo los archivos completos corregidos o añadidos. No declares que están hechos si no los implementas.`}
    ];
    try{
      const result=await egoRoleChat("coder",messages,env,6500,{
        maxTotalMs:45000,maxModels:2,perModelMs:10000,
        providerModels:Math.min(2,egoExternalProviders(env,"code").length),
        providerTimeoutMs:12000,providerOffset:round,cfModels:1,cfTimeoutMs:7000,
        validateContent:(content)=>{const parsed=parsearSalidaMc(content,env.MC_SERVER_VERSION||"2.10.0");return parsed.files.length>0&&parsed.errores.length===0;}
      });
      const parsed=parsearSalidaMc(result.content,env.MC_SERVER_VERSION||"2.10.0");
      if(parsed.errores.length||!parsed.files.length){models.push("respuesta de reparación inválida");continue;}
      for(const patch of parsed.files){
        if(!/^(BP|RP)\//.test(patch.path))continue;
        const ix=files.findIndex(f=>f.path.toLowerCase()===patch.path.toLowerCase());
        if(ix>=0)files[ix]={path:patch.path,content:patch.content};else files.push(patch);
      }
      models.push(result.model||"proveedor sin identificar");
      audit=auditarRequisitosAddonAvanzado(files,prompt,evidence);
    }catch(e){models.push(String(e?.message||e).slice(0,100));}
  }
  return {audit,rounds:models.length,models};
}

async function mcBuild(body,env,request){
  const prompt=String(body.prompt||"").slice(0,12000);
  const plan=limpiarPlan(body.plan,prompt);
  const entrada=[];const vistos=new Set();
  for(const f of (Array.isArray(body.files)?body.files:[]).slice(0,400)){
    const path=safeProjectPath(f&&f.path);
    if(!path||!/^(BP|RP)\//.test(path)||typeof f.content!=="string") continue;
    if (f.content.length > 400000) return json({ error: "Archivo demasiado grande para construir el paquete; no se truncó.", path, limiteCaracteres: 400000 }, 413);
    if(/manifest\.json$|\.(png|jpg|zip|mcaddon)$/i.test(path)) continue;
    vistos.add(path);entrada.push({path,content:f.content});
  }
  if(!entrada.length&&!(plan.poderesJugador&&plan.poderesJugador.length)&&!plan.kit) return json({error:"No hay archivos para armar el add-on."},400);
  try{
    plan._prompt=prompt;
    plan._modelos3d=(Array.isArray(body.modelos3d)?body.modelos3d:[]).slice(0,4).map(q=>({entidad:String(q&&q.entidad||""),partes:limpiarModelo3d(q&&q.partes)})).filter(q=>q.entidad&&q.partes.length>=3);
    const vz=await generarVocesAddon(plan,env);plan._voces=vz.out;
    const rellenados=completarObjetosFaltantes(entrada,plan);
    const r=postprocesarAddon(entrada,plan,env.MC_SERVER_VERSION);
    if(rellenados.length)r.notas.push("Se completaron con una plantilla válida (la IA no los escribió): "+rellenados.join(", ")+". Son básicos: revísalos o pide mejorarlos.");
    try{const hd=endurecerAddonBedrock(r.files,plan);for(const g of hd.generado)r.notas.push("Módulo añadido: "+g);for(const x of hd.cambios.slice(0,30))r.notas.push("Corregido: "+x.path+" — "+x.motivo);r.conteo.scripts=r.files.filter(f=>/^BP\/scripts\/.+\.js$/.test(f.path)).length;}catch(e){r.notas.push("El endurecimiento automático falló y se omitió: "+String(e&&e.message||e).slice(0,100));}
    const npcAI=integrarArquitecturaNPC(r.files,plan,prompt,env.MC_SERVER_VERSION);
    for(const x of npcAI.avisos)r.notas.push(x);
    r.conteo.scripts=r.files.filter(f=>/^BP\/scripts\/.+\.js$/.test(f.path)).length;
    for(const x of vz.fallos)r.notas.push("Voz: "+x);
    const reparacionCobertura=await repararCoberturaRequisitosAddon(r.files,prompt,env);
    const ciclo=await cicloReparacionAutomatica(r.files,env,{minecraft:true});
    const validacion=ciclo.validacion||validarAddonEstructural(r.files,env.MC_SERVER_VERSION||"2.10.0");
    const auditoriaIA = auditarArquitecturaIAAddon(r.files, prompt);
    for (const aviso of auditoriaIA.warnings) r.notas.push(aviso);
    const auditoriaRequisitos = auditarRequisitosAddonAvanzado(r.files, prompt, {
      validacion,
      repairState: ciclo && ciclo.informe ? ciclo.informe.estado : "no disponible"
    });
    if (!validacion.ok || validacion.errores.length) {
      return respuestaValidacionFallida(validacion, ciclo);
    }
    // v14.48.1: ya no se tira todo el trabajo cuando faltan requisitos. Se entrega el add-on como PARCIAL,
    // con la lista honesta de lo que no se pudo verificar (solo MC_ESTRICTO=1 vuelve a bloquear).
    if (!auditoriaRequisitos.ok && env.MC_ESTRICTO === "1") {
      return json({error:"El add-on no se empaquetó como completo porque siguen faltando requisitos funcionales.",codigo:"cobertura_funcional_incompleta",cobertura:auditoriaRequisitos,recuperacion:{rondas:reparacionCobertura.rounds,modelos:reparacionCobertura.models}},422);
    }
    const esParcial = !auditoriaRequisitos.ok;
    for (const faltante of auditoriaRequisitos.missing) r.notas.unshift("REQUISITO NO VERIFICADO: " + faltante);
    if (!auditoriaRequisitos.ok) r.notas.unshift(`Cobertura real: ${auditoriaRequisitos.passed}/${auditoriaRequisitos.total} verificaciones; el add-on NO debe considerarse completo.`);
    if(reparacionCobertura.rounds)r.notas.push(`Reparación de cobertura: ${reparacionCobertura.rounds} intento(s); proveedores: ${reparacionCobertura.models.join(", ")}`);
    for(const x of ciclo.informe.cambios)r.notas.push(`Auto-reparación ronda ${x.ronda}: ${x.path}`);
    for(const x of ciclo.informe.avisosFinales)r.notas.push("Auto-reparación: "+x);
    for(const x of validacion.errores)r.notas.push("Validación pendiente: "+x);
    for(const x of validacion.avisos)r.notas.push("Revisión: "+x);
    try{const pf=pulidoFinalAddon(r.files,plan,prompt);try{await mcRegistrarErrores(env,pf.cambios);}catch(_){}for(const x of pf.cambios.slice(0,30))r.notas.push("Corregido: "+x.path+" — "+x.motivo);r.conteo.scripts=r.files.filter(f=>/^BP\/scripts\/.+\.js$/.test(f.path)).length;}catch(e){r.notas.push("El pulido final falló y se omitió: "+String(e&&e.message||e).slice(0,100));}
    const readme=r.files.find(f=>/^BP\/README\.md$/i.test(f.path));
    if(readme)readme.content+="\n\n## Validación estructural de EGO AI\n- Resultado: "+(validacion.ok?"sin errores estructurales detectados":"se detectaron problemas que debes revisar")+"\n- Archivos revisados: "+validacion.archivos+"\n"+[...validacion.errores,...validacion.avisos].map(x=>"- "+x).join("\n")+"\n- Esta revisión estática no sustituye la importación y prueba dentro de Minecraft.\n\n## Cobertura de requisitos solicitados\n- Resultado: "+(auditoriaRequisitos.total?auditoriaRequisitos.passed+"/"+auditoriaRequisitos.total+" verificaciones de características detectables.":"NO VERIFICADO: no se pudo comprobar ningún requisito automáticamente; pruébalo en el juego.")+"\n"+auditoriaRequisitos.findings.map(x=>"- ["+(x.ok?"VERIFICADO":"NO VERIFICADO")+"] "+x.label+": "+x.evidence).join("\n")+"\n- Un requisito no verificado no debe anunciarse como implementado.\n";
    const au=await auditarAddon(plan,r.files,r.conteo.habilidades,env);
    if(au&&au.faltan.length)r.notas.unshift("Revisión final: no pude confirmar "+au.faltan.length+" de "+au.total+" cosas que pediste → "+au.faltan.slice(0,3).join(" · "));
    const zip=await createZip(r.files);
    const nombre="ego-"+slugAscii(plan.nombre)+(esParcial?"-parcial":"");
    const c=r.conteo;
    const resumen=`${plan.nombre}: ${c.items} ítem(s), ${c.bloques} bloque(s), ${c.criaturas} criatura(s), ${c.scripts} script(s), ${c.texturas} textura(s) PNG`+(c.habilidades&&c.habilidades.length?". Habilidades programadas: "+c.habilidades.join("; "):"")+(au?". Revisión final: "+au.cumplidos+" de "+au.total+" cosas pedidas verificadas dentro del archivo":"");
    return new Response(zip,{status:200,headers:{...corsPara(request,env),"Content-Type":"application/zip","Content-Disposition":`attachment; filename="${nombre}.mcaddon"`,...egoTamHeaders(zip),"X-EGO-Files":String(r.files.length),"X-EGO-Model":"por-partes","X-EGO-Parcial":esParcial?"1":"0","X-EGO-Avisos":String(r.notas.length),"X-EGO-Notas":encodeURIComponent(r.notas.slice(0,6).join(" | ").slice(0,1500)),"X-EGO-Validacion":encodeURIComponent(JSON.stringify(validacionCompacta(validacion))),"X-EGO-Cobertura":encodeURIComponent(JSON.stringify(auditoriaRequisitos).slice(0,4000)),"X-EGO-Reparacion":encodeURIComponent(JSON.stringify({estado:ciclo.informe.estado,rondas:ciclo.informe.rondas,modelos:ciclo.informe.modelos||[],cambios:(ciclo.informe.historial||[]).length,erroresFinales:(ciclo.informe.erroresFinales||[]).slice(0,5).map(x=>String(x).slice(0,160))}).slice(0,2500)),"X-EGO-Resumen":encodeURIComponent(resumen),"X-EGO-Ficha":encodeURIComponent(JSON.stringify(fichaAddon(plan,r,au)).slice(0,6000)),"Cache-Control":"no-store"}});
  }catch(e){
    console.error("mc_build",String(e&&e.message||e).slice(0,200));
    if((e?.code==="EGO_PROJECT_TOO_LARGE"||e?.code==="EGO_WORKER_MEMORY_CAP")) return json({error:String(e.message),code:e.code,limiteBytes:e.projectLimitBytes,tamanoMinimoBytes:e.projectBytes},413);
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
    version: "14.59.0",
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
    equipoEgo: { planner: EGO_TEAM_MODELS.planner, reasoner: EGO_TEAM_MODELS.reasoner, coder: EGO_TEAM_MODELS.coder, auditor: EGO_TEAM_MODELS.auditor },
    colaboracionMinecraft: true,
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
  // Prioridad: si el usuario pide explícitamente un add-on, "mundo",
  // "survival" y "supervivencia" describen su temática, no el formato.
  if (/\b(?:add-?on|mcaddon)\b/.test(t)) return "addon";
  if (/\b(?:mundo|mapa|mapas|mapa de aventura|aventura|survival world|survival|world template|plantilla de mundo|minijuego|parkour|skyblock|oneblock|supervivencia)\b/.test(t)) return "world";
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

function validarProyectoMinecraftGeneral(files, mcKind, verSrv="2.10.0") {
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
      for (const e of lintScriptApiTipado(f.content, verSrv)) errores.push(f.path + ": " + e);
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

function auditarArquitecturaIAAddon(files, prompt) {
  const wanted = /(npc|npcs|aldean|compa[nñ]ero|jugador(?:es)? inteligente|ai player|inteligencia artificial|entidad inteligente|superviviente|survivor|agente aut[oó]nomo)/i.test(String(prompt || ""));
  if (!wanted) return { aplica: false, warnings: [] };
  const list = Array.isArray(files) ? files : [];
  const scripts = list.filter(f => /^BP\/scripts\/.+\.js$/i.test(String(f.path || "")));
  const paths = scripts.map(f => String(f.path).toLowerCase());
  const code = scripts.map(f => String(f.content || "")).join("\n").toLowerCase();
  const warnings = [];
  const nested = paths.filter(p => p.split("/").length >= 4).length;
  const hasState = /(state.?machine|statemachine|statecontroller|estado|transition|transici[oó]n)/i.test(code);
  const hasContext = /(agentcontext|aipcontext|contextcache|contextvar|contexto|memory|memoria)/i.test(code);
  const hasBehavior = /(behavio[u]?r|comportamiento|procedure|procedimiento)/i.test(code);
  const hasScheduler = /(runinterval|runtick|scheduler|tickbudget|presupuesto.*tick)/i.test(code);
  const hasCleanup = /(clearinterval|cleartimeout|unsubscribe|cleanup|dispose|isvalid)/i.test(code);
  if (scripts.length < 2) warnings.push("Arquitectura IA: faltan módulos separados y conectados (controlador y comportamiento); se detectó una estructura poco modular.");
  if (!hasState) warnings.push("Arquitectura IA: no se detectó una máquina de estados explícita para decidir entre acciones.");
  if (!hasContext) warnings.push("Arquitectura IA: no se detectó un módulo de contexto/memoria de entorno para tomar decisiones.");
  if (!hasBehavior) warnings.push("Arquitectura IA: no se detectaron comportamientos o procedimientos reutilizables.");
  if (!hasScheduler) warnings.push("Arquitectura IA: no se detectó un scheduler/tick controlado para ejecutar decisiones.");
  if (!hasCleanup) warnings.push("Arquitectura IA: no se detectó limpieza clara de tareas/eventos ni validación de entidades.");
  return { aplica: true, scripts: scripts.length, warnings };
}

function auditarCoberturaAddon(files, prompt) {
  const paths = (files || []).map(f => String(f.path || "").toLowerCase());
  const contents = (files || []).filter(f => /\.(?:js|json|mcfunction)$/i.test(f.path)).map(f => String(f.content || "")).join("\n").toLowerCase();
  const count = (rx) => paths.filter(p => rx.test(p)).length;
  const requested = String(prompt || "").toLowerCase();
  const missing = [];
  const m = requested.match(/\b(\d{1,2})\s+(?:tipos?\s+de\s+)?(?:zombis?|criaturas?|entidades?|monstruos?)\b/i);
  const wantedEntities = m ? Math.min(30, Number(m[1])) : (/(zombi|zombie|criatura|mutante|jefe)/i.test(requested) ? 1 : 0);
  const entities = count(/^bp\/entities\/.*\.json$/);
  if (wantedEntities && entities < wantedEntities) missing.push(`Entidades: se solicitaron ${wantedEntities} y solo hay ${entities} archivos BP/entities/*.json.`);
  if (wantedEntities) {
    const clients = count(/^rp\/entity\/.*\.json$/);
    const geometries = count(/^rp\/models\/entity\/.*\.json$/);
    if (clients < entities || clients < wantedEntities) missing.push(`Client entities: hay ${clients}; se necesitan al menos ${Math.min(wantedEntities, entities)} conectadas a las entidades.`);
    if (geometries < wantedEntities) missing.push(`Geometrías 3D: hay ${geometries}; se solicitaron al menos ${wantedEntities} modelos distintos.`);
    const anims = count(/^rp\/animations\/.*\.json$/);
    if (anims < wantedEntities) missing.push(`Animaciones: hay ${anims}; se solicitaron criaturas animadas y faltan recursos de animación.`);
  }
  if (/(arma|armas|pistola|escopeta|rifle|munici[oó]n)/i.test(requested)) {
    if (!count(/^bp\/items\/.*\.json$/)) missing.push("Armas: no hay definiciones BP/items/*.json.");
    if (!/(itemuse|item_use|entityhit|entity_hit|minecraft:damage|minecraft:projectile)/i.test(contents)) missing.push("Armas: no se detecta lógica de uso, daño o proyectil conectada.");
  }
  if (/(misi[oó]n|misiones|quest|progresi[oó]n)/i.test(requested) && !/(mission|quest|misi[oó]n|objetivo|objective|progress|progreso)/i.test(contents)) missing.push("Misiones: no se detecta lógica de objetivos/progreso en scripts o funciones.");
  if (/(supervivencia|sed|infecci[oó]n|hambre|herida|hemorragia)/i.test(requested) && !/(thirst|sed|infection|infecci[oó]n|hunger|hambre|bleed|hemorrag|wound|herida)/i.test(contents)) missing.push("Supervivencia: no se detecta implementación de los estados solicitados.");
  if (/(npc|superviviente|supervivientes|comerciante)/i.test(requested) && !/(minecraft:npc|minecraft:behavior|villager|superviviente|survivor|trader)/i.test(contents)) missing.push("NPCs: no se detecta entidad o comportamiento de supervivientes/comerciantes.");
  if (/(estructura|hospital|laboratorio|comisar[ií]a|refugio|base militar)/i.test(requested) && !count(/^bp\/(?:structures|functions)\//)) missing.push("Estructuras: no hay estructuras ni funciones de construcción en el paquete.");
  return { ok: missing.length === 0, requestedEntities: wantedEntities, generatedEntities: entities, missing };
}

async function completarAddonPorCobertura(files, prompt, env, maxFiles, intentos) {
  const audit = auditarCoberturaAddon(files, prompt);
  if (audit.ok || (!routerApiKey(env) && !egoExternalProviders(env, "code").length && !env.AI) || env.EGO_ADDON_COMPLETION === "0") return audit;
  const remaining = Math.max(0, maxFiles - files.length);
  if (!remaining) { audit.missing.push("Se alcanzó el límite de archivos antes de completar los requisitos."); return audit; }
  const inventory = files.map(f => `${f.path} (${String(f.content || "").length} caracteres)`).join("\n").slice(0, 9000);
  const messages = [
    { role: "system", content: `Eres un ingeniero de Minecraft Bedrock que completa proyectos incompletos. Añade SOLO archivos nuevos que implementen los requisitos faltantes; no repitas rutas existentes, no escribas README promocional, no inventes APIs ni binarios. Cada archivo debe tener contenido completo y coherente con los identificadores/rutas ya existentes. Si un recurso binario PNG no puede generarse como bytes reales, no lo simules ni lo declares existente. Responde con el formato exacto PROYECTO: nombre y bloques === ARCHIVO: ruta === contenido === FIN ===. Máximo ${remaining} archivos. Usa @minecraft/server ${String(env.MC_SERVER_VERSION || "2.10.0")} si hace falta.` },
    { role: "user", content: `PROYECTO ORIGINAL:\n${String(prompt).slice(0,7000)}\n\nINVENTARIO EXISTENTE (NO DUPLICAR):\n${inventory}\n\nREQUISITOS FALTANTES DETECTADOS:\n- ${audit.missing.join("\n- ")}\n\nAñade los archivos que realmente puedas implementar y conecta las referencias con los recursos existentes. No afirmes que algo está completo si no lo está.` }
  ];
  try {
    const r = await egoRoleChat("coder", messages, env, 10000, {
      maxTotalMs: 55000, maxModels: 2, perModelMs: 11000,
      providerModels: Math.min(2, egoExternalProviders(env, "code").length),
      providerTimeoutMs: 12000, providerOffset: 0, cfModels: 1, cfTimeoutMs: 8000,
      validateContent:(content)=>{const parsed=leerProyectoModelo(content);return !!(parsed&&parsed.files&&parsed.files.length);}
    });
    const extra = leerProyectoModelo(r.content);
    if (extra?.files?.length) {
      const seen = new Set(files.map(f => f.path.toLowerCase()));
      let added = 0;
      for (const f of extra.files) {
        const path = safeProjectPath(f.path);
        if (!path || seen.has(path.toLowerCase()) || typeof f.content !== "string" || added >= remaining) continue;
        if (/\.json$/i.test(path) && !jsonTolerante(f.content).ok) continue;
        if (/\.js$/i.test(path) && balanceJs(f.content)) continue;
        if (f.content.length > 300000) { intentos.push(path + ": archivo demasiado grande; rechazado sin truncarlo"); continue; }
        files.push({ path, content: f.content });
        seen.add(path.toLowerCase()); added++;
      }
      intentos.push(`completitud-addon: ${added} archivos nuevos añadidos`);
    } else intentos.push("completitud-addon: el modelo no devolvió archivos adicionales válidos");
  } catch (e) { intentos.push("completitud-addon: " + String(e?.message || e).slice(0, 100)); }
  return auditarCoberturaAddon(files, prompt);
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
      if (!validacion.ok || validacion.errores.length) return respuestaValidacionFallida(validacion, ciclo);
      const avisos = [...reparaciones, ...ciclo.informe.cambios.map(x=>`Auto-reparación (ronda ${x.ronda}): ${x.path}`), ...ciclo.informe.avisosFinales.map(x=>"Auto-reparación: "+x), ...validacion.errores.map(x=>"Validación pendiente: "+x), ...validacion.avisos.map(x=>"Revisión: "+x)];
      const readme = files.find(f=>/^BP\/README\.md$/i.test(f.path));
      if(readme && avisos.length) readme.content += "\n\n## Revisión de EGO AI\n"+avisos.map(x=>"- "+x).join("\n")+"\n";
      const zip = await createZip(files);
      return new Response(zip,{status:200,headers:{...corsPara(request,env),"Content-Type":"application/zip","Content-Disposition":`attachment; filename="ego-${spec.id}.mcaddon"`,"X-EGO-Avisos":String(avisos.length),"X-EGO-Validacion":encodeURIComponent(JSON.stringify(validacionCompacta(validacion))),"X-EGO-Reparacion":encodeURIComponent(JSON.stringify({estado:ciclo.informe.estado,rondas:ciclo.informe.rondas,modelos:ciclo.informe.modelos||[],cambios:(ciclo.informe.historial||[]).length,erroresFinales:(ciclo.informe.erroresFinales||[]).slice(0,5).map(x=>String(x).slice(0,160))}).slice(0,2500)),"X-EGO-Model":"plantilla-ego","X-EGO-Resumen":encodeURIComponent(`${spec.nombre} (${spec.tipo}, habilidad de ${spec.habilidad}, daño ${spec.danio}, id ego:${spec.id}; con textura PNG, receta, aura de partículas y habilidades${spec.buscar?", busca objetivo":""}${spec.velocidad?", velocidad al correr":""}; no incluye animación 3D del modelo)`),"X-EGO-Spec":encodeURIComponent(JSON.stringify(spec)),"X-EGO-NoAplicado":encodeURIComponent(r0.noAplicado.join(" | ")),...egoTamHeaders(zip),"X-EGO-Files":String(files.length),"Cache-Control":"no-store"}});
    } catch(e) { console.error("tpl_addon",String(e?.message||e).slice(0,200)); return json({avanzado:true,motivo:"plantilla no disponible"}); }
  }
  const maxFiles = Math.max(1, Math.min(Number(body.maxFiles || (minecraft ? 90 : 35)), minecraft ? 100 : 50));
  const system = minecraft
    ? (mcKind === "addon" ? `Eres un ingeniero experto en Minecraft BEDROCK Edition (Android, Windows, consolas). NUNCA uses Java, Forge ni Fabric. Genera un ADD-ON COMPLETO.
Estructura obligatoria con DOS packs enlazados: carpeta "BP/" (behavior pack) y carpeta "RP/" (resource pack). Cada uno con su manifest.json (format_version 2, header con name, description, uuid, version [1,0,0], min_engine_version [1,26,50]; modules con su propio uuid distinto; SOLO el BP depende del RP (uuid del header del RP, version [1,0,0]); el RP NO depende de nada; el BP con script añade la dependencia {\"module_name\":\"@minecraft/server\",\"version\":\"${String(env.MC_SERVER_VERSION || "2.10.0")}\"}). Todos los UUID deben ser v4 válidos y DISTINTOS entre sí.
Ítems personalizados: BP/items/<nombre>.json con formato "minecraft:item" (format_version "1.21.0"), identificador con prefijo propio (por ejemplo ego:espada_trueno), componentes como minecraft:icon, minecraft:max_stack_size, minecraft:damage, minecraft:hand_equipped, minecraft:durability (NO uses minecraft:cooldown; el enfriamiento va en el script). El ícono es "minecraft:icon":{"textures":{"default":"nombre_corto"}} y ese nombre se define en RP/textures/item_texture.json. Textos en RP/texts/es_ES.lang y RP/texts/en_US.lang y RP/texts/languages.json.
Recursos gráficos: no escribas bytes binarios como texto. El postprocesador de EGO genera PNG de ítems, bloques e iconos. Cada entidad debe tener su propio client_entity, spawn_egg, geometría, textura y animación locomotora coherentes; no reutilices la misma geometría para criaturas distintas. Los iconos de armas de fuego, botiquines, granadas, munición y armaduras deben ser de su categoría y nunca una espada genérica. No finjas que existe un recurso si no se generó.
Efectos y comportamiento (rayos, partículas, sonidos, habilidades): usa Script API con "@minecraft/server" en BP/scripts/main.js (módulo "script" en el manifest con language "javascript", entry "scripts/main.js", y dependencia @minecraft/server con una version estable). Para rayos usa APIs verificadas; escucha eventos soportados y comprueba el identificador del objeto. Añade cooldown y no uses APIs inventadas.
ARQUITECTURA AVANZADA PARA NPC, COMPAÑEROS Y ENTIDADES INTELIGENTES (OBLIGATORIA CUANDO EL PEDIDO LO SOLICITE):
No implementes una IA compleja en un único archivo monolítico ni con decisiones aleatorias. Usa módulos JavaScript pequeños y conectados dentro de BP/scripts/:
- core/AgentController.js: ciclo de vida, prioridad y transición de estados.
- core/AgentContext.js: captura limitada y cacheada de contexto (posición, salud, objetivo, jugadores, enemigos, inventario y entorno).
- core/StateMachine.js: estados explícitos, condiciones de entrada/salida, prioridad, cooldown y recuperación.
- behaviors/: comportamientos independientes como follow, defend, combat, flee, gather, build, interact y idle, únicamente los solicitados.
- procedures/: secuencias reutilizables con éxito, fallo, cancelación y timeout.
- systems/: registro de eventos, scheduler por ticks y persistencia de datos cuando sea necesaria.
- utils/: validación de entidades, distancias, vectores y manejo seguro de errores.
La entrada declarada en manifest debe importar e inicializar el sistema real. Comprueba cada ruta de importación relativa; no generes módulos huérfanos.
Usa un presupuesto de trabajo por tick, actualiza contexto a intervalos razonables, limita búsquedas de entidades/bloques, evita crear intervalos por entidad sin limpieza y cancela tareas cuando la entidad deja de ser válida. No guardes referencias de entidades indefinidamente.
Cada estado debe definir prioridad, condiciones, cooldown, timeout y fallback. La IA debe evitar ciclos infinitos, cambios de estado recursivos y órdenes incompatibles.
Implementa memoria persistente solo con Dynamic Properties registradas/compatibles y con límites de tamaño; nunca dependas de variables globales no inicializadas.
No inventes APIs de navegación, visión, pathfinding, inventario ni eventos. Usa solo miembros disponibles en la versión objetivo de @minecraft/server; si una acción no es viable con la API disponible, declara la limitación y ofrece una alternativa real.
Pruebas mínimas: sintaxis de todos los scripts, resolución de imports, existencia de entrypoint, registro de eventos, cleanup de tareas y validación de identificadores. La validación estática no demuestra comportamiento real dentro del juego.
No imites ni reutilices código, recursos o identificadores de add-ons comerciales. Diseña una implementación original con la misma clase de arquitectura modular.
REGLA DE IMPLEMENTACIÓN: cada característica solicitada debe existir como archivo y lógica conectada, no basta con mencionarla en README. Para cada criatura: BP/entities/<id>.json + RP/entity/<id>.entity.json + geometría propia en RP/models/entity/ + textura real PNG en RP/textures/entity/ + animación/controlador cuando se solicite + spawn egg/registro cuando aplique. Los identificadores y rutas deben coincidir exactamente. Para armas: item JSON, icono registrado, receta y lógica real de uso/ataque/recarga si se prometió; no llames arma de fuego a un objeto de combate cuerpo a cuerpo. Para misiones: estado persistente, objetivos/eventos, progreso y recompensas en scripts. Para botín: loot tables referenciadas por entidades/cofres. Para estructuras: solo declara estructuras importables si entregas el archivo binario real; los planos y comandos deben etiquetarse como planos, no como estructuras listas. No incluyas referencias a archivos que no estén presentes.
Si el usuario solicita una cantidad explícita de criaturas, genera esa cantidad de entidades distintas o declara claramente que no alcanzaste la cantidad. No reduzcas silenciosamente los requisitos. No entregues un README que afirme sistemas no implementados.
Incluye todos los archivos con contenido completo, sin placeholders, sin binarios falsos, sin rutas absolutas ni "..". Máximo ${maxFiles} archivos. packType=${kind}.` : `Eres un ingeniero especializado en Minecraft BEDROCK. Tipo de entrega: ${mcKind}. Nunca Java, Forge ni Fabric.

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
      if (f.content.length > 300000) { intentos.push(path + ": archivo supera el límite seguro; no se truncó"); continue; }
      seen.add(path); files.push({path,content:f.content});
    }
    if(!files.length) return json({error:"El proyecto no contiene archivos válidos.",model},502);
    let coberturaAddon = null;
    if (minecraft && mcKind === "addon") {
      coberturaAddon = await completarAddonPorCobertura(files, prompt, env, maxFiles, intentos);
    }
    const name=String(parsed.name|| (minecraft?"ego-bedrock-addon":"ego-project")).replace(/[^\w.-]/g,"-").slice(0,60)||"ego-project";
    const readmeExists=files.some(f=>/^README\.md$/i.test(f.path));
    if(!readmeExists) files.push({path:"README.md",content:`# ${name}\n\n${String(parsed.description||prompt)}\n\nGenerado por EGO AI. Revisa y prueba el proyecto antes de publicarlo.\n`});
    if (minecraft && mcKind === "addon" && coberturaAddon && !coberturaAddon.ok && env.MC_ESTRICTO === "1") {
      return json({error:"El add-on no se empaquetó porque la cobertura solicitada sigue incompleta.",codigo:"cobertura_funcional_incompleta",cobertura:coberturaAddon,intentos},422);
    }
    if(minecraft && mcKind !== "addon") {
      const cicloGeneral = await cicloReparacionAutomatica(files, env, { minecraft: false });
      const revisionGeneral = validarProyectoMinecraftGeneral(files, mcKind, env.MC_SERVER_VERSION || "2.10.0");
      if (!revisionGeneral.ok) return json({ error: "El proyecto Minecraft no superó la revisión; no se empaquetó como terminado.", artifact: mcKind, validacion: revisionGeneral, reparacion: cicloGeneral.informe }, 422);
      return await generarPaqueteMinecraftEspecial(files, mcKind, name, prompt, env, request);
    }
    if(minecraft){
      // El README final lo construye postprocesarAddon dentro del BP; evita duplicarlo al reparar la raíz del .mcaddon.
      for(let i=files.length-1;i>=0;i--) if(/^README\.md$/i.test(files[i].path)) files.splice(i,1);
      const planGen=planDesdeArchivosMinecraft(files,name,prompt);
      const procesado=postprocesarAddon(files,planGen,env.MC_SERVER_VERSION);
      files.splice(0,files.length,...procesado.files);
      try{endurecerAddonBedrock(files,planGen);pulidoFinalAddon(files,planGen,prompt);}catch(e){console.warn('endurecer',String(e&&e.message||e).slice(0,100));}
    }
    const avisos=minecraft?repararAddon(files,env.MC_SERVER_VERSION):[];
    if (minecraft && mcKind === "addon") avisos.push(...auditarArquitecturaIAAddon(files, prompt).warnings);
    const ciclo=await cicloReparacionAutomatica(files,env,{minecraft});
    const validacion=ciclo.validacion||(minecraft?validarAddonEstructural(files):{ok:true,errores:[],avisos:[],archivos:files.length});
    if (minecraft && (!validacion.ok || validacion.errores.length)) return respuestaValidacionFallida(validacion, ciclo);
    avisos.push(...ciclo.informe.cambios.map(x=>`Auto-reparación ronda ${x.ronda}: ${x.path}`),...ciclo.informe.avisosFinales.map(x=>"Auto-reparación: "+x));
    if(minecraft) avisos.push(...validacion.errores.map(x=>"Validación pendiente: "+x),...validacion.avisos.map(x=>"Revisión: "+x));
    if (coberturaAddon && !coberturaAddon.ok) avisos.push("Cobertura funcional incompleta: " + coberturaAddon.missing.join(" | "));
    if(avisos.length){const ix=files.findIndex(f=>/(^|\/)README\.md$/i.test(f.path));if(ix>=0)files[ix].content+="\n\n## Avisos y validación de EGO AI\n"+avisos.map(a=>"- "+a).join("\n")+"\n- La validación estática no sustituye la importación y prueba dentro de Minecraft.\n";}
    const zip=await createZip(files);
    return new Response(zip,{status:200,headers:{...corsPara(request,env),"Content-Type":"application/zip","Content-Disposition":`attachment; filename="${name}${minecraft?".mcaddon":".zip"}"`,"X-EGO-Avisos":String(avisos.length),"X-EGO-Validacion":encodeURIComponent(JSON.stringify(validacionCompacta(validacion))),"X-EGO-Reparacion":encodeURIComponent(JSON.stringify({estado:ciclo.informe.estado,rondas:ciclo.informe.rondas,modelos:ciclo.informe.modelos||[],cambios:(ciclo.informe.historial||[]).length,erroresFinales:(ciclo.informe.erroresFinales||[]).slice(0,5).map(x=>String(x).slice(0,160))}).slice(0,2500)),"X-EGO-Model":model,...egoTamHeaders(zip),"X-EGO-Files":String(files.length),...(minecraft?{"X-EGO-Artifact":"addon","X-EGO-Importable":"true",...(coberturaAddon?{"X-EGO-Cobertura":encodeURIComponent(JSON.stringify(coberturaAddon).slice(0,4000))}:{})}:{}),"Cache-Control":"no-store"}});
  } catch(e) {
    console.error("project_generate",String(e?.message||e).slice(0,250));
    if((e?.code==="EGO_PROJECT_TOO_LARGE"||e?.code==="EGO_WORKER_MEMORY_CAP")) return json({error:String(e.message),code:e.code,limiteBytes:e.projectLimitBytes,tamanoMinimoBytes:e.projectBytes},413);
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
// Solo modifica archivos existentes; máximo tres rondas. No ejecuta Minecraft ni simula pruebas reales.
// ============================================================
// Clasificación de hallazgos: CRÍTICO bloquea la exportación; ADVERTENCIA se informa; INFORMATIVO es una recomendación.
// ============================================================
const GEO_VANILLA_RX = /geometry\.(?:humanoid|zombie|skeleton|creeper|spider|pig|cow|chicken|sheep|villager|irongolem|enderman|witch|wolf|cat|horse|bat|blaze|ghast|slime|squid|dragon|wither|player)/i;
const HALLAZGO_ADVERTENCIA = [
  /falta el PNG de icono/, /no tiene icono declarado/, /no está registrado en RP\/textures\/item_texture/, /la entrada de atlas/,
  /falta el archivo de textura/, /: falta textura /, /no declara spawn_egg/, /extremidades móviles/,
  /referencia a objeto inexistente/, /ingrediente inexistente/, /spawn_rule .* no tiene definición/,
  /material_instances/, /textura de bloque .* no está registrada/,
  /: (?:llama a \.|usa new |el evento |importa «)/, /no existe el archivo de geometría geometry\.(?:humanoid|zombie|skeleton|creeper|spider|pig|cow|chicken|sheep|villager|irongolem|enderman|witch|wolf|cat|horse|bat|blaze|ghast|slime|squid|dragon|wither|player)/i
];
const DIAGNOSTICOS = [
  [/JSON inválido/, "sintaxis JSON rota (coma, comilla o llave mal puesta)", "EGO normaliza comas y comentarios; si persiste, el reparador reescribe ese archivo"],
  [/posible error de sintaxis/, "el script tiene llaves, paréntesis o comillas sin cerrar", "el reparador corrige el script y se vuelve a validar"],
  [/UUID repetido/, "dos packs o módulos comparten el mismo UUID", "se genera un UUID nuevo para uno de ellos"],
  [/UUID/, "UUID ausente o con formato inválido", "se reemplaza por un UUID v4 válido"],
  [/entry de script/, "el manifest apunta a un script que no existe", "se enlaza al script real (scripts/main.js) o se crea el faltante"],
  [/dependencia versionada/, "el pack con scripts no declara @minecraft/server", "se añade la dependencia con la versión del servidor"],
  [/Dependencia circular|no declara dependencia del Resource Pack/, "las dependencias entre Behavior Pack y Resource Pack están mal enlazadas", "el BP debe depender del RP (nunca al revés); se corrige el manifest"],
  [/Identificador duplicado/, "dos archivos definen el mismo identificador", "se renombra o elimina el duplicado"],
  [/client_entity|huevo/, "la entidad del BP no tiene su definición visual (client_entity) enlazada", "se crea o se enlaza el client_entity con el mismo identificador"],
  [/spawn_egg/, "la entidad no tiene huevo de aparición", "se añade spawn_egg con colores por defecto"],
  [/geometr/, "la geometría 3D referenciada no existe o está vacía", "se genera o se enlaza el modelo .geo.json"],
  [/animaci/, "la animación referenciada no existe o no está conectada", "se declara el alias y se conecta la animación"],
  [/textura|PNG|icono|atlas|material_instances/, "una textura o icono referenciado no existe o no está registrado", "se registra en el atlas o se genera el PNG que falta"],
  [/spawn_rule/, "la regla de aparición apunta a una entidad que no está en el add-on", "se crea la entidad o se corrige el identificador"],
  [/objeto inexistente|ingrediente inexistente/, "la receta usa un objeto que no existe", "se corrige el identificador o se crea el objeto"],
  [/llama a \.|usa new |el evento |importa «/, "el script usa una API que no existe en @minecraft/server de esta versión", "el reparador la sustituye por una API vigente"],
  [/manifest/, "el manifest.json está ausente o incompleto", "se reconstruye con header, módulos y UUID válidos"]
];
function diagnosticarHallazgo(msg, severidad) {
  const m = String(msg || "");
  const archivo = (m.match(/((?:BP|RP)\/[^\s:]+?\.(?:json|js|png|lang|mcfunction|mcstructure|ogg|wav))/i) || [])[1] || "";
  let causa = "validación estructural fallida", solucion = "revisar el archivo y volver a generar la parte afectada";
  for (const [rx, c, s] of DIAGNOSTICOS) if (rx.test(m)) { causa = c; solucion = s; break; }
  return { severidad, archivo, problema: m.replace(/^((?:BP|RP)\/[^\s:]+:\s*)/, "").slice(0, 240), causa, solucion };
}
function clasificarHallazgos(errores, avisos, archivos) {
  const criticos = [], advertencias = [...new Set(avisos || [])];
  for (const e of [...new Set(errores || [])]) {
    if (HALLAZGO_ADVERTENCIA.some(rx => rx.test(e))) advertencias.push(e); else criticos.push(e);
  }
  const informativos = ["Esta revisión es estática: no sustituye importar y probar el add-on dentro de Minecraft."];
  const detalle = [...criticos.map(x => diagnosticarHallazgo(x, "CRITICO")), ...advertencias.map(x => diagnosticarHallazgo(x, "ADVERTENCIA"))];
  return { ok: criticos.length === 0, errores: criticos.slice(0, 80), avisos: advertencias.slice(0, 60), criticos: criticos.slice(0, 80), advertencias: advertencias.slice(0, 60), informativos, detalle: detalle.slice(0, 120), archivos };
}
function validacionCompacta(v) {
  const c = x => String(x).slice(0, 180);
  return { ok: !!v?.ok, archivos: v?.archivos || 0, errores: (v?.criticos || v?.errores || []).slice(0, 8).map(c), avisos: (v?.advertencias || v?.avisos || []).slice(0, 10).map(c), nCriticos: (v?.criticos || v?.errores || []).length, nAdvertencias: (v?.advertencias || v?.avisos || []).length };
}
function respuestaValidacionFallida(validacion, ciclo) {
  const crit = (validacion.detalle || []).filter(d => d.severidad === "CRITICO");
  const resumen = crit.slice(0, 3).map(d => `${d.archivo || "proyecto"}: ${d.problema} (causa: ${d.causa}; intento: ${d.solucion})`).join(" | ");
  const inf = ciclo?.informe || {};
  return json({
    error: `El add-on no superó la validación estructural y no se exportó como terminado. ${crit.length} problema(s) crítico(s): ${resumen}`.slice(0, 900),
    estado: "validacion_fallida",
    archivos: validacion.archivos,
    criticos: crit.slice(0, 40),
    advertencias: (validacion.detalle || []).filter(d => d.severidad === "ADVERTENCIA").slice(0, 30),
    informativos: validacion.informativos || [],
    errores: (validacion.errores || []).slice(0, 40),
    avisos: (validacion.avisos || []).slice(0, 30),
    reparacion: { estado: inf.estado, rondas: inf.rondas, modelos: inf.modelos || [], cambios: (inf.historial || []).slice(0, 40), noCorregidos: (inf.noCorregidos || []).slice(0, 20), avisos: (inf.avisosFinales || []).slice(0, 20) }
  }, 422);
}

// Reparaciones deterministas (sin IA): solo cambios seguros y demostrables.
function repararDeterministico(files) {
  const cambios = [];
  const por = new Map(files.map(f => [f.path, f]));
  const hecho = (path, motivo) => cambios.push({ path, motivo });
  for (const f of files) {
    if (!/\.json$/i.test(f.path) || typeof f.content !== "string") continue;
    try { JSON.parse(f.content); continue; } catch {}
    const t = jsonTolerante(f.content);
    if (t.ok) { f.content = JSON.stringify(t.obj, null, 2); hecho(f.path, "JSON con comas o comentarios sobrantes normalizado"); }
  }
  for (const f of files) {
    if (!/(^|\/)manifest\.json$/i.test(f.path) || typeof f.content !== "string") continue;
    let o; try { o = JSON.parse(f.content); } catch { continue; }
    const root = f.path.split("/")[0]; let ch = false;
    for (const m of (Array.isArray(o.modules) ? o.modules : [])) {
      if (!m || m.type !== "script") continue;
      const e = String(m.entry || "").replace(/^\/+/, "");
      if (e && por.has(`${root}/${e}`)) continue;
      const cand = files.filter(x => x.path.startsWith(root + "/scripts/") && /\.js$/i.test(x.path));
      const pick = cand.find(x => /\/main\.js$/i.test(x.path)) || (cand.length === 1 ? cand[0] : null);
      if (pick) { m.entry = pick.path.slice(root.length + 1); ch = true; hecho(f.path, `entry de script corregido a ${m.entry}`); }
    }
    if (ch) f.content = JSON.stringify(o, null, 2);
  }
  for (const atlasPath of ["RP/textures/item_texture.json", "RP/textures/terrain_texture.json"]) {
    const f = por.get(atlasPath); if (!f || typeof f.content !== "string") continue;
    let a; try { a = JSON.parse(f.content); } catch { continue; }
    let ch = false;
    for (const [key, entry] of Object.entries(a.texture_data || {})) {
      const arr = typeof entry === "string" ? null : (Array.isArray(entry?.textures) ? entry.textures : (typeof entry?.textures === "string" ? [entry.textures] : null));
      if (!arr) continue;
      arr.forEach((t, i) => {
        if (typeof t !== "string") return;
        const clean = t.replace(/^\//, "").replace(/\.(png|tga|jpg)$/i, "");
        if (["png", "tga", "jpg"].some(ext => por.has(`RP/${clean}.${ext}`))) return;
        const base = clean.split("/").pop();
        const cands = [...por.keys()].filter(p => /^RP\/textures\/.+\.png$/i.test(p) && p.split("/").pop().replace(/\.png$/i, "") === base);
        if (cands.length === 1) { arr[i] = cands[0].slice(3).replace(/\.png$/i, ""); ch = true; hecho(atlasPath, `textura ${key}: ruta corregida a ${arr[i]}`); }
      });
      if (ch && typeof entry?.textures === "string") entry.textures = arr[0];
    }
    if (ch) f.content = JSON.stringify(a, null, 2);
  }
  for (const [p, f] of por) {
    if (!/^RP\/entit(?:y|ies)\/.+\.json$/i.test(p) || typeof f.content !== "string") continue;
    let j; try { j = JSON.parse(f.content); } catch { continue; }
    const d = j["minecraft:client_entity"]?.description; if (!d || d.spawn_egg) continue;
    d.spawn_egg = { base_color: "#3a3a4a", overlay_color: "#8a8aa0" };
    f.content = JSON.stringify(j, null, 2); hecho(p, "se añadió spawn_egg (huevo de aparición) con colores por defecto");
  }
  // Reparaciones Minecraft v14.41: recetas en formato array, referencias de loot y typo conocido.
  // 1) Las recetas Bedrock pueden contener arrays por tipo (minecraft:recipe_shaped: [...]).
  //    Se eliminan solo las entradas cuyo resultado personalizado no existe; las válidas se conservan.
  const itemIds = new Set();
  for (const f of files) {
    if (!/^BP\/(?:items|blocks)\/.+\.json$/i.test(f.path) || typeof f.content !== "string") continue;
    try {
      const j = JSON.parse(f.content);
      const root = j["minecraft:item"] || j["minecraft:block"];
      const id = root && root.description && root.description.identifier;
      if (id) itemIds.add(id);
    } catch {}
  }
  for (const f of files) {
    if (!/^BP\/recipes\/.+\.json$/i.test(f.path) || typeof f.content !== "string") continue;
    let j; try { j = JSON.parse(f.content); } catch { continue; }
    let changed = false;
    for (const [kind, value] of Object.entries(j)) {
      if (!/^minecraft:recipe_/.test(kind)) continue;
      const list = Array.isArray(value) ? value : [value];
      const kept = list.filter(recipe => {
        const resultId = recipe && (recipe.result && recipe.result.item || recipe.output);
        if (typeof resultId === "string" && resultId.includes(":") && !resultId.startsWith("minecraft:") && !itemIds.has(resultId)) {
          hecho(f.path, `se retiró una receta cuyo resultado ${resultId} no tiene definición BP; evita recetas que fabrican objetos inexistentes`);
          changed = true; return false;
        }
        return true;
      });
      if (kept.length !== list.length) j[kind] = Array.isArray(value) ? kept : (kept[0] || null);
      // Quita claves de receta que quedaron vacías.
      if (Array.isArray(j[kind]) && j[kind].length === 0) delete j[kind];
      if (j[kind] === null) delete j[kind];
    }
    if (changed) f.content = JSON.stringify(j, null, 2) + "\n";
  }
  // 2) Quita componentes minecraft:loot que apuntan a tablas inexistentes (no inventa drops falsos).
  const paths = new Set(files.map(f => f.path));
  for (const f of files) {
    if (!/^BP\/entities\/.+\.json$/i.test(f.path) || typeof f.content !== "string") continue;
    let j; try { j = JSON.parse(f.content); } catch { continue; }
    const e = j["minecraft:entity"], c = e && e.components;
    const loot = c && c["minecraft:loot"];
    const table = typeof loot === "string" ? loot : loot && loot.table;
    if (typeof table !== "string") continue;
    const target = "BP/" + table.replace(/^\//, "");
    if (!paths.has(target)) {
      delete c["minecraft:loot"];
      f.content = JSON.stringify(j, null, 2) + "\n";
      hecho(f.path, `se quitó una referencia a tabla de botín inexistente (${target}); la entidad queda sin loot personalizado`);
    }
  }
  // 3) Corrige un error real frecuente: weaponCooldown declarado en plural y leído en singular.
  for (const f of files) {
    if (!/^BP\/scripts\/.+\.js$/i.test(f.path) || typeof f.content !== "string") continue;
    if (/\bconst\s+weaponCooldowns\s*=/.test(f.content) && /\bweaponCooldown\.get\(/.test(f.content)) {
      f.content = f.content.replace(/\bweaponCooldown\.get\(/g, "weaponCooldowns.get(");
      hecho(f.path, "se corrigió weaponCooldown.get a weaponCooldowns.get (variable declarada en plural)");
    }
  }
  // 4) Fallback honesto de estructuras: función Bedrock invocable, nunca un .mcstructure falso.
  const readme = files.find(f => /^BP\/README\.md$/i.test(f.path));
  const pideEstructuras = !!(readme && /\b(?:estructuras?|construcci[oó]n(?:es)?|ruinas?|refugios?)\b/i.test(String(readme.content || "").split(/##\s*Instalar/i)[0]));
  const tieneEstructura = files.some(f => /^BP\/(?:structures\/.+\.mcstructure|functions\/.+\.mcfunction)$/i.test(f.path));
  if (pideEstructuras && !tieneEstructura) {
    const fn = "BP/functions/ego_ruina.mcfunction";
    const contenido = [
      "# Refugio/ruina de emergencia EGO AI (función de construcción, no archivo .mcstructure)",
      "fill ~-4 ~-1 ~-4 ~4 ~-1 ~4 minecraft:stone_bricks",
      "fill ~-4 ~ ~-4 ~4 ~3 ~-4 minecraft:cracked_stone_bricks",
      "fill ~-4 ~ ~4 ~4 ~3 ~4 minecraft:stone_bricks",
      "fill ~-4 ~ ~-3 ~-4 ~3 ~3 minecraft:stone_bricks",
      "fill ~4 ~ ~-3 ~4 ~3 ~3 minecraft:stone_bricks",
      "fill ~-3 ~4 ~-3 ~3 ~4 ~3 minecraft:oak_planks",
      "fill ~-1 ~ ~-4 ~1 ~2 ~-4 minecraft:air",
      "fill ~-1 ~ ~-1 ~1 ~2 ~1 minecraft:air",
      "setblock ~-2 ~ ~-2 minecraft:chest",
      "setblock ~2 ~ ~2 minecraft:barrel"
    ].join("\n") + "\n";
    files.push({ path: fn, content: contenido });
    hecho(fn, "se añadió una función de construcción de refugio como respaldo verificable; no se presenta como .mcstructure importable");
    if (readme) {
      readme.content = String(readme.content || "") + "\n\n### Estructura de respaldo\n- Se incluye `BP/functions/ego_ruina.mcfunction`, una función de comandos para construir un refugio sencillo. Ejecuta `/function ego_ruina` dentro del mundo.\n- Esta función no es un archivo binario `.mcstructure` ni se genera automáticamente al entrar al mundo.\n";
    }
  }
  return cambios;
}

async function cicloReparacionAutomatica(files, env, opciones = {}) {
  const mc = !!opciones.minecraft;
  const t0Rep = Date.now();
  const hayProveedorReparacion = !!routerApiKey(env) || egoExternalProviders(env, "code").length > 0 || !!env.AI;
  const informe = { habilitado: hayProveedorReparacion && env.EGO_AUTO_REPAIR !== "0", rondas: 0, cambios: [], historial: [], modelos: [], erroresFinales: [], avisosFinales: [], noCorregidos: [], estado: "omitido" };
  if (!Array.isArray(files)) return { validacion: null, informe };
  const vacia = () => ({ ok: true, errores: [], avisos: [], criticos: [], advertencias: [], informativos: [], detalle: [], archivos: files.length });
  const validar = () => mc ? validarAddonEstructural(files, env.MC_SERVER_VERSION || "2.10.0") : vacia();
  // 0) Reparación determinista (sin IA): cambios seguros y demostrables.
  if (mc) {
    try { for (const c of repararDeterministico(files)) { informe.cambios.push({ path: c.path, ronda: 0, motivo: c.motivo, tipo: "determinista" }); informe.historial.push({ ronda: 0, tipo: "determinista", path: c.path, motivo: c.motivo }); } }
    catch (e) { informe.avisosFinales.push("Reparación determinista omitida: " + String(e?.message || e).slice(0, 100)); }
  }
  let validacion = validar();
  const cerrar = () => {
    if (mc) validacion = validar();
    informe.erroresFinales = validacion?.errores || [];
    for (const a of (validacion?.avisos || [])) if (!informe.avisosFinales.includes(a)) informe.avisosFinales.push(a);
    informe.noCorregidos = (validacion?.detalle || []).filter(d => d.severidad === "CRITICO");
    informe.estado = informe.erroresFinales.length ? (informe.cambios.length ? "reparado_parcial" : "pendiente") : (informe.cambios.length ? "reparado_y_validado" : "sin_cambios_necesarios");
    return { validacion, informe };
  };
  if (!informe.habilitado) { if (validacion.errores.length || validacion.avisos.length) informe.avisosFinales.push("Reparación con IA desactivada: no hay proveedor de chat disponible o EGO_AUTO_REPAIR=0; solo se aplicaron reparaciones deterministas."); return cerrar(); }
  const maxRondas = Math.max(1, Math.min(Number(env.EGO_AUTO_REPAIR_ROUNDS || 3), 3));
  const modelosReparador = [...new Set([EGO_TEAM_MODELS.coder, EGO_TEAM_MODELS.reasoner, EGO_TEAM_MODELS.planner].filter(Boolean))];
  const rutaCreable = p => /^(?:BP|RP)\/(?:entities|entity|items|blocks|recipes|loot_tables|spawn_rules|animations|animation_controllers|render_controllers|models\/entity|texts|sounds|scripts|functions|trading)\/.+\.(?:json|js|lang|mcfunction)$/i.test(p) && !/manifest\.json$/i.test(p);
  for (let ronda = 1; ronda <= maxRondas; ronda++) {
    if (Date.now() - t0Rep > 150000) { informe.avisosFinales.push("Reparación detenida por tiempo (150 s); se entrega lo reparado hasta ahora."); break; }
    if (!validacion.errores.length && !validacion.avisos.some(a => /BP\/scripts\/.+\.js: /.test(a))) break;
    const hallazgos = [...validacion.errores, ...validacion.avisos];
    const rutasError = hallazgos.map(x => { const m = String(x).match(/(?:^|[\s:])((?:BP|RP)\/[^\s:]+?\.(?:json|js))/i); return m && m[1]; }).filter(Boolean);
    const candidatos = files.filter(f => f && typeof f.content === "string" && (/\.js$/i.test(f.path) || /\.json$/i.test(f.path)));
    if (!candidatos.length) break;
    let objetivo = rutasError.length ? candidatos.filter(f => rutasError.includes(f.path)) : candidatos.filter(f => /\.js$/i.test(f.path) && (!mc || /(^|\/)scripts?\//i.test(f.path)));
    if (!objetivo.length && validacion.errores.length) objetivo = candidatos.filter(f => /\.json$/i.test(f.path) && !/manifest\.json$/i.test(f.path)).slice(0, 8);
    objetivo = [...new Map(objetivo.map(f => [f.path, f])).values()].slice(0, 12);
    if (!objetivo.length && !validacion.errores.length) break;
    const snapshot = objetivo.map(f => ({ path: f.path, content: f.content.slice(0, 18000) }));
    const inventario = files.map(f => f.path).slice(0, 300);
    const estadoAntes = new Map(files.map(f => [f.path, f.content]));
    const erroresAntesSet = new Set(validacion.errores);
    const scoreAntes = validacion.errores.length * 10 + validacion.avisos.length;
    const diagnostico = hallazgos.map(x => (validacion.errores.includes(x) ? "CRÍTICO: " : "ADVERTENCIA: ") + x).join("\n").slice(0, 9000);
    const messages = [
      { role: "system", content: `Eres el reparador de código de EGO AI. Corrige SOLO problemas demostrables. No reescribas el proyecto ni cambies su diseño; no borres código válido. Conserva compatibilidad con Minecraft Bedrock y @minecraft/server ${String(env.MC_SERVER_VERSION || "2.10.0")} (no uses APIs eliminadas como runCommandAsync ni eventos que no existan). Puedes corregir archivos existentes y CREAR archivos que falten SOLO si el diagnóstico lo exige (JSON/JS/lang en BP/ o RP/, nunca manifest ni PNG). Devuelve ÚNICAMENTE JSON válido: {"patches":[{"path":"ruta","content":"contenido COMPLETO del archivo"}]}. Si no puedes justificar una corrección devuelve {"patches":[]}. No uses Markdown, no inventes APIs ni afirmes haber ejecutado pruebas.` + (mc ? "\n\n" + mcApiReferencia() : "") },
      { role: "user", content: `RONDA ${ronda}. DIAGNÓSTICO:\n${diagnostico}\n\nARCHIVOS DEL PROYECTO (inventario):\n${inventario.join("\n")}\n\nARCHIVOS A CORREGIR:\n${JSON.stringify(snapshot)}` }
    ];
    informe.rondas = ronda;
    let parsed = null, usado = "";
    // La reparación también usa el failover multiproveedor. Antes llamaba
    // directamente a OpenRouter, así que quedaba desactivada en la práctica
    // cuando OpenRouter no tenía crédito aunque Gemini/Cohere/SambaNova sí.
    try {
      let respuesta = await egoRoleChat("reparador", messages, env, 8000, {
        maxTotalMs: 48000, maxModels: 3, perModelMs: 22000,
        providerModels: Math.min(2, egoExternalProviders(env, "code").length),
        providerTimeoutMs: 22000, cfModels: 1, cfTimeoutMs: 15000,
        providerOffset: ronda - 1,
        validateContent:(content)=>{const parsed=extractJson(content);return !!(parsed&&Array.isArray(parsed.patches));}
      });
      let p = extractJson(respuesta.content);
      // HTTP 200 con texto que no respeta el protocolo también es fallo:
      // no debe bloquear el rescate por OpenRouter/Workers AI.
      if (!p || !Array.isArray(p.patches)) {
        informe.avisosFinales.push(`Ronda ${ronda}: la primera respuesta no respetó el JSON de reparación; se intenta otro proveedor.`);
        respuesta = await egoRoleChat("coder", messages, env, 1800, {
          maxTotalMs: 18000, maxModels: 2, perModelMs: 5000,
          providerModels: 0, cfModels: 1, cfTimeoutMs: 5000
        });
        p = extractJson(respuesta.content);
      }
      if (p && Array.isArray(p.patches)) { parsed = p; usado = respuesta.model || "proveedor-failover"; }
      else informe.avisosFinales.push(`Ronda ${ronda}: el proveedor de rescate tampoco devolvió el formato JSON de reparación.`);
    } catch (e) {
      informe.avisosFinales.push(`Ronda ${ronda}: ningún proveedor pudo reparar: ${String(e?.message || e).slice(0, 150)}`);
    }
    if (!parsed) { informe.estado = "fallo_reparador"; break; }
    if (usado && !informe.modelos.includes(usado)) informe.modelos.push(usado);
    const creados = [], tocados = [];
    let nuevos = 0;
    for (const patch of parsed.patches.slice(0, 10)) {
      const path = safeProjectPath(patch && patch.path);
      if (!path || typeof patch.content !== "string" || patch.content.length > 300000 || !/\.(?:js|json|lang|mcfunction)$/i.test(path) || /manifest\.json$/i.test(path)) continue;
      if (/\.json$/i.test(path) && !jsonTolerante(patch.content).ok) { informe.avisosFinales.push(`Parche rechazado en ${path}: JSON inválido.`); continue; }
      if (/\.js$/i.test(path) && (balanceJs(patch.content) || (mc && /^BP\/scripts\//i.test(path) && /\bfrom\s*["']@minecraft\/server["']/.test(patch.content) === false && /@minecraft\/server/.test(String(estadoAntes.get(path) || "")) ))) { informe.avisosFinales.push(`Parche rechazado en ${path}: sintaxis no válida o pierde imports.`); continue; }
      const original = files.find(f => f.path === path);
      if (original) {
        if (original.content === patch.content) continue;
        if (patch.content.length < original.content.length * 0.35 && original.content.length > 800) { informe.avisosFinales.push(`Parche rechazado en ${path}: eliminaba más del 65% del archivo (reparación destructiva).`); continue; }
        original.content = /\.json$/i.test(path) ? JSON.stringify(jsonTolerante(patch.content).obj, null, 2) : patch.content; tocados.push(path);
      } else {
        if (!rutaCreable(path) || creados.length >= 4) continue;
        files.push({ path, content: /\.json$/i.test(path) ? JSON.stringify(jsonTolerante(patch.content).obj, null, 2) : patch.content }); creados.push(path);
      }
      nuevos++;
    }
    if (!nuevos) { informe.avisosFinales.push(`Ronda ${ronda}: el reparador no propuso correcciones aplicables.`); break; }
    const despues = validar();
    const nuevosErrores = despues.errores.filter(x => !erroresAntesSet.has(x));
    const scoreDespues = despues.errores.length * 10 + despues.avisos.length;
    const revertir = (motivo) => {
      for (const f of files) if (estadoAntes.has(f.path)) f.content = estadoAntes.get(f.path);
      for (const p of creados) { const k = files.findIndex(f => f.path === p); if (k >= 0) files.splice(k, 1); }
      informe.avisosFinales.push(motivo); validacion = validar();
    };
    if (mc && nuevosErrores.length) { revertir(`Ronda ${ronda} revertida: el parche introdujo errores nuevos (${nuevosErrores.slice(0, 2).join("; ").slice(0, 200)}).`); break; }
    if (mc && scoreDespues >= scoreAntes) { revertir(`Ronda ${ronda} revertida: no hubo progreso (${scoreAntes} → ${scoreDespues} hallazgos).`); break; }
    for (const p of tocados) { informe.cambios.push({ path: p, ronda, motivo: "parche del modelo reparador" }); informe.historial.push({ ronda, tipo: "modelo", path: p, motivo: "archivo corregido", modelo: usado }); }
    for (const p of creados) { informe.cambios.push({ path: p, ronda, motivo: "archivo faltante creado por el reparador" }); informe.historial.push({ ronda, tipo: "modelo", path: p, motivo: "archivo creado", modelo: usado }); }
    validacion = despues;
    if (validacion.ok && !validacion.avisos.length) break;
  }
  return cerrar();
}

// Valida y repara el add-on: JSON de manifest, UUID v4 únicos y dependencias coherentes.
// Validación estructural local: no sustituye la prueba dentro de Minecraft.
function validarAddonEstructural(files, verSrv="2.10.0") {
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
    let clientPath=`RP/entity/${stem}.entity.json`; let cf=porRuta.get(clientPath);
    if(!cf){for(const [cp,cff] of porRuta){if(!/^RP\/entit(?:y|ies)\/.+\.json$/i.test(cp)||typeof cff.content!=="string")continue;try{if(JSON.parse(cff.content)["minecraft:client_entity"]?.description?.identifier===id){cf=cff;clientPath=cp;break}}catch{}}}
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
  // Recetas: todos los identificadores no vanilla deben existir en los packs del proyecto.
  const idsItems = new Set(idsBP.keys());
  const vanilla = id => /^minecraft:/.test(String(id||""));
  for (const [path,f] of porRuta) {
    if (!/^BP\/recipes\/.+\.json$/i.test(path) || typeof f.content !== "string") continue;
    let root; try { root = JSON.parse(f.content); } catch { continue; }
    const walk = (v, key) => {
      if (!v || typeof v !== "object") return;
      for (const [k,val] of Object.entries(v)) {
        if ((k === "item" || k === "output" || k === "result") && typeof val === "string" && val.includes(":" ) && !vanilla(val) && !idsItems.has(val))
          errores.push(`${path}: referencia a objeto inexistente ${val}.`);
        else if (k === "item" && val && typeof val === "object" && typeof val.item === "string" && !vanilla(val.item) && !idsItems.has(val.item))
          errores.push(`${path}: ingrediente inexistente ${val.item}.`);
        else if (val && typeof val === "object") walk(val,k);
      }
    };
    walk(root, "");
  }
  // Referencias de botín: evita que entidades/bloques apunten a archivos que no están empaquetados.
  for (const [path, f] of porRuta) {
    if (!/^BP\/(?:entities|blocks)\/.+\.json$/i.test(path) || typeof f.content !== "string") continue;
    try {
      const j = JSON.parse(f.content);
      const root = j["minecraft:entity"] || j["minecraft:block"];
      const loot = root?.components?.["minecraft:loot"];
      const table = typeof loot === "string" ? loot : loot?.table;
      if (typeof table === "string") {
        const target = "BP/" + table.replace(/^\//, "");
        if (!porRuta.has(target)) errores.push(`${path}: tabla de botín inexistente ${target}.`);
      }
    } catch {}
  }
  // Spawn rules: una regla no crea una entidad; su identifier debe existir en BP/entities.
  const entityIds = new Set();
  for (const [path,f] of porRuta) if (/^BP\/entities\/.+\.json$/i.test(path) && typeof f.content === "string") {
    try { const id = JSON.parse(f.content)["minecraft:entity"]?.description?.identifier; if (id) entityIds.add(id); } catch {}
  }
  for (const [path,f] of porRuta) if (/^BP\/spawn_rules\/.+\.json$/i.test(path) && typeof f.content === "string") {
    try { const id = JSON.parse(f.content)["minecraft:spawn_rules"]?.description?.identifier; if (id && !entityIds.has(id) && !/^minecraft:/.test(id)) errores.push(`${path}: spawn_rule ${id} no tiene definición correspondiente en BP/entities.`); } catch {}
  }
  // Scripts: errores sintácticos detectables y patrones API incompatibles no deben pasar como éxito.
  for(const [path,f] of porRuta){if(!/^BP\/scripts\/.+\.js$/i.test(path)||typeof f.content!=="string")continue;const bal=balanceJs(f.content);if(bal)errores.push(`${path}: posible error de sintaxis (${bal}).`);const lint=lintScriptApiTipado(f.content,verSrv);for(const msg of lint.slice(0,10))errores.push(`${path}: API incompatible (${msg}).`);}
  if (!manifests.length) errores.push("No se encontró ningún manifest.json.");
  // Imports locales de scripts: un módulo faltante rompe todo el entrypoint aunque cada archivo sea sintácticamente válido.
  for (const [path, f] of porRuta) {
    if (!/^BP\/scripts\/.+\.js$/i.test(path) || typeof f.content !== "string") continue;
    const rx = /\b(?:from\s*|import\s*\()\s*["'](\.{1,2}\/[^"']+)["']/g;
    let m;
    while ((m = rx.exec(f.content))) {
      const spec = m[1];
      const base = path.split("/"); base.pop();
      for (const part of spec.split("/")) {
        if (!part || part === ".") continue;
        if (part === "..") { if (base.length > 1) base.pop(); else base.push("!INVALID!"); }
        else base.push(part);
      }
      const resolved = base.join("/");
      const candidates = /\.[cm]?js$/i.test(resolved)
        ? [resolved]
        : [resolved + ".js", resolved + "/index.js"];
      if (base.includes("!INVALID!") || !candidates.some(p => porRuta.has(p))) {
        errores.push(`${path}: import local no resuelto "${spec}" (se esperaba ${candidates.join(" o ")}).`);
      }
    }
  }
  return clasificarHallazgos(errores, avisos, porRuta.size);
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

// Presupuesto de proyectos EGO AI (v14.59.0).
// Perfiles de producto: pequeño (objetivo 0.98–3 MiB), grande (objetivo 24 MiB),
// súper grande experimental (techo de proyecto 200 MiB). Son objetivos de diseño,
// no una garantía universal de compatibilidad de Minecraft o de memoria del Worker.
// Sin R2, el ensamblador ZIP actual reserva el paquete completo en memoria; por seguridad
// conserva un límite operativo de 48 MiB (ajustable hacia abajo, nunca hacia arriba).
// Para empaquetar 200 MiB de forma fiable hace falta ensamblado por streaming/fragmentos
// o del lado del dispositivo; no se simula esa capacidad aumentando una constante.
// El servidor mide bytes UTF-8/binarios reales de todos los archivos antes del ZIP.
const EGO_ABS_MAX_BYTES = 200 * 1024 * 1024;
const EGO_MAX_PROJECT_MB = 200;
const EGO_LIMITE_MB_DEFECTO = 24;
const EGO_MAX_ARCHIVOS = 2500;
const EGO_SAFE_MB_DEFECTO = 48;
function egoMb(v, def, tope){ const mb = Number(v); return (Number.isFinite(mb) && mb > 0 ? Math.min(mb, tope) : def); }
function egoLimiteBytes(){ return Math.floor(Math.min(egoMb(globalThis.__egoMaxMb, EGO_LIMITE_MB_DEFECTO, EGO_MAX_PROJECT_MB), EGO_MAX_PROJECT_MB) * 1048576); }
function egoSafeBytes(){ return Math.floor(egoMb(globalThis.__egoSafeMb, EGO_SAFE_MB_DEFECTO, EGO_SAFE_MB_DEFECTO) * 1048576); }
function utf8Len(s){ let n = 0; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c < 0x80) n += 1; else if (c < 0x800) n += 2; else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xFC00) === 0xDC00) { n += 4; i++; } else n += 3; } return n; }
function medirProyectoBytes(files){
  let total = 0, n = 0;
  const lista = Array.isArray(files) ? files : [];
  const limite = egoLimiteBytes(), safe = egoSafeBytes();
  const fmt = (b) => b < 1048576 ? (b / 1024).toFixed(1) + " KB" : (b / 1048576).toFixed(2) + " MB";
  if (lista.length > EGO_MAX_ARCHIVOS) {
    const error = new Error(`El proyecto tiene ${lista.length} archivos y el máximo recomendado para un add-on es ${EGO_MAX_ARCHIVOS}. Quita archivos innecesarios o divide el add-on en varios paquetes.`);
    error.code = "EGO_PROJECT_TOO_LARGE"; error.projectBytes = 0; error.projectLimitBytes = limite; throw error;
  }
  for (const f of lista) {
    const c = f && f.content;
    total += typeof c === "string" ? utf8Len(c) : (c && Number.isFinite(c.byteLength) ? c.byteLength : 0);
    n++;
    if (total > limite) {
      const error = new Error(`El proyecto supera el límite de ${fmt(limite)} (al menos ${fmt(total)}). Es el tamaño recomendado por Microsoft para add-ons: más grandes fallan más en móvil y multijugador. Reduce u optimiza los recursos antes de exportar.`);
      error.code = "EGO_PROJECT_TOO_LARGE"; error.projectBytes = total; error.projectLimitBytes = limite; throw error;
    }
    if (total > safe) {
      const error = new Error(`El proyecto pesa al menos ${fmt(total)}. El empaquetador actual sin R2 tiene un límite operativo de ${fmt(safe)} porque construye el ZIP en memoria. No se reducirá la calidad ni se forzará un paquete que pueda fallar; para superar ese tamaño se necesita ensamblado por fragmentos/streaming o empaquetado local.`);
      error.code = "EGO_WORKER_MEMORY_CAP"; error.projectBytes = total; error.projectLimitBytes = safe; throw error;
    }
  }
  return { bytes: total, megabytes: total / 1048576, files: n, limitBytes: limite, safeBytes: safe };
}
function egoEstadoTam(bytes){ const p = bytes / egoLimiteBytes(); return p >= 1 ? "bloqueado" : p >= 0.95 ? "critico" : p >= 0.8 ? "aviso" : "ok"; }
function egoTamHeaders(zip){
  const i = (zip && zip.egoInfo) || {}; const b = Number(i.bytes) || (zip && zip.length) || 0;
  const mib = b / 1048576;
  const tier = mib <= 3 ? "small" : mib <= 24 ? "large" : "experimental";
  return { "X-EGO-Bytes": String(b), "X-EGO-Limit": String(egoLimiteBytes()), "X-EGO-MaxProject": String(EGO_MAX_PROJECT_MB * 1048576), "X-EGO-MaxFiles": String(EGO_MAX_ARCHIVOS), "X-EGO-Safe": String(egoSafeBytes()), "X-EGO-Tier": tier, "X-EGO-Tam": egoEstadoTam(b), "X-EGO-Dup": String(i.bytesDuplicados || 0) };
}

// ZIP clásico sin compresión (STORE, sin ZIP64), compatible con navegadores y Minecraft.
// v14.58: una sola reserva de memoria del tamaño exacto (antes: lista de trozos + copia final = el doble), CRC con índice (más rápido)
// y detección de archivos idénticos (se informan; no se borran porque Bedrock necesita cada ruta).
const CRC_TABLE = (()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);t[n]=c>>>0;}return t;})();
function crc32(bytes){let c=0xffffffff;for(let i=0;i<bytes.length;i++)c=CRC_TABLE[(c^bytes[i])&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function u16(n){return [n&255,(n>>>8)&255];} function u32(n){return [n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255];}
function concatBytes(parts){let len=parts.reduce((a,b)=>a+b.length,0),out=new Uint8Array(len),pos=0;for(const p of parts){out.set(p,pos);pos+=p.length;}return out;}
async function createZip(files){
  // Un solo control centralizado: ningún exportador puede saltarse el techo global.
  const med = medirProyectoBytes(files);
  const lista = files.map(f => ({ name: new TextEncoder().encode(String(f.path)), c: f.content }));
  let total = 22;
  for (const e of lista) { e.len = typeof e.c === "string" ? utf8Len(e.c) : e.c.byteLength; total += 30 + e.name.length + e.len + 46 + e.name.length; }
  if (lista.length > 65535 || total >= 0xFFFFFFFF) { const er = new Error("El paquete necesitaría ZIP64, que Minecraft Bedrock no garantiza importar. Divídelo en paquetes más pequeños."); er.code = "EGO_PROJECT_TOO_LARGE"; er.projectBytes = total; er.projectLimitBytes = 0xFFFFFFFF; throw er; }
  const out = new Uint8Array(total), dv = new DataView(out.buffer), enc = new TextEncoder();
  const ahora = new Date();
  const DT = ((ahora.getUTCHours() << 11) | (ahora.getUTCMinutes() << 5) | (ahora.getUTCSeconds() >> 1)) & 0xffff;
  const DD = (((ahora.getUTCFullYear() - 1980) << 9) | ((ahora.getUTCMonth() + 1) << 5) | ahora.getUTCDate()) & 0xffff;
  let off = 0; const vistos = new Map(); let dup = 0, bytesDup = 0;
  for (const e of lista) {
    e.off = off;
    dv.setUint32(off, 0x04034b50, true); dv.setUint16(off + 4, 20, true); dv.setUint16(off + 6, 0x0800, true); dv.setUint16(off + 8, 0, true);
    dv.setUint16(off + 10, DT, true); dv.setUint16(off + 12, DD, true); dv.setUint32(off + 18, e.len, true); dv.setUint32(off + 22, e.len, true);
    dv.setUint16(off + 26, e.name.length, true); dv.setUint16(off + 28, 0, true);
    out.set(e.name, off + 30); const d0 = off + 30 + e.name.length;
    if (typeof e.c === "string") enc.encodeInto(e.c, out.subarray(d0, d0 + e.len)); else out.set(e.c, d0);
    e.crc = crc32(out.subarray(d0, d0 + e.len)); dv.setUint32(off + 14, e.crc, true);
    const k = e.crc + ":" + e.len; if (e.len > 2000) { if (vistos.has(k)) { dup++; bytesDup += e.len; } else vistos.set(k, 1); }
    off = d0 + e.len;
  }
  const cdIni = off;
  for (const e of lista) {
    dv.setUint32(off, 0x02014b50, true); dv.setUint16(off + 4, 20, true); dv.setUint16(off + 6, 20, true); dv.setUint16(off + 8, 0x0800, true); dv.setUint16(off + 10, 0, true);
    dv.setUint16(off + 12, DT, true); dv.setUint16(off + 14, DD, true); dv.setUint32(off + 16, e.crc, true); dv.setUint32(off + 20, e.len, true); dv.setUint32(off + 24, e.len, true);
    dv.setUint16(off + 28, e.name.length, true); dv.setUint32(off + 42, e.off, true);
    out.set(e.name, off + 46); off += 46 + e.name.length;
  }
  dv.setUint32(off, 0x06054b50, true); dv.setUint16(off + 8, lista.length, true); dv.setUint16(off + 10, lista.length, true); dv.setUint32(off + 12, off - cdIni, true); dv.setUint32(off + 16, cdIni, true);
  out.egoInfo = { bytes: med.bytes, zipBytes: out.length, archivos: lista.length, duplicados: dup, bytesDuplicados: bytesDup };
  return out;
}

// ============================================================
// 🚀 PRINCIPAL
// ============================================================

export default {
  async fetch(request, env) {
    const requestId = request.headers.get("CF-Ray") || (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : "ego-" + Date.now().toString(36));
    try {
      const r = await manejar(request, env);
      const h = new Headers(r.headers);
      h.set("X-EGO-Request-ID", requestId);
      const c = corsPara(request, env);
      for (const k in c) h.set(k, c[k]);
      if (String(c["Access-Control-Expose-Headers"] || "").indexOf("X-EGO-Request-ID") < 0) {
        h.set("Access-Control-Expose-Headers", String(c["Access-Control-Expose-Headers"] || "") + ", X-EGO-Request-ID, X-EGO-Tier, X-EGO-MaxProject");
      }
      return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
    } catch (e) {
      // Diagnóstico útil para el 500: nunca registrar cuerpo, tokens, correo ni secretos.
      console.error("worker_unhandled", JSON.stringify({ requestId, method: request.method, path: new URL(request.url).pathname, name: String(e && e.name || "Error").slice(0, 80), message: String(e && e.message || e).slice(0, 300), stack: String(e && e.stack || "").slice(0, 1800) }));
      const r = json({ error: "Error interno del servidor. Revisa los logs del Worker.", requestId }, 500);
      const h = new Headers(r.headers); h.set("X-EGO-Request-ID", requestId);
      const c = corsPara(request, env); for (const k in c) h.set(k, c[k]);
      return new Response(r.body, { status: 500, headers: h });
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
  globalThis.__egoSafeMb = env.EGO_MAX_WORKER_MB;
  globalThis.__egoMaxMb = env.EGO_MAX_PROJECT_MB;
  const espera = limitar(request, env);
  if (espera) {
    return new Response(JSON.stringify({ error: "Demasiadas peticiones. Espera " + espera + " s e inténtalo de nuevo.", limite: true }), {
      status: 429, headers: { ...corsPara(request, env), "Content-Type": "application/json", "Retry-After": String(espera) }
    });
  }
  const url = new URL(request.url);
  let correoUsuario = null;
  const tokenInicial = obtenerToken(request, null);
  if (tokenInicial) {
    const sesionInicial = await verificarSesion(tokenInicial);
    correoUsuario = sesionInicial?.email || null;
  }

  if (url.searchParams.get("web")) { const c = await contextoWeb(url.searchParams.get("web"), env, true); return json({ fuentes: c.fuentes, usadas: c.usadas, vista: c.texto.slice(0, 3000) }); }
  if (url.searchParams.has("health")) return json({
    ok: true, version: "14.59.1", projectValidator: true, autoRepair: true, aiConfigured: !!env.AI,
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
    return new Response("🧠 EGO AI v14.59.1 — Código, matemáticas, ciencias y creación\n\n" +
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

  const tokenSesion = obtenerToken(request, body);
  if (tokenSesion && !correoUsuario) {
    const sesion = await verificarSesion(tokenSesion);
    correoUsuario = sesion?.email || null;
  }
  // La identidad para memoria se deriva exclusivamente de un token Firebase verificado.
  // body.usuario, body.correo y X-Usuario-Correo nunca son credenciales.
  const usuario = correoUsuario ? cleanUser(correoUsuario) : null;
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
  if (cmdEstudiar || cmdBorrar || cmdListar) sesionAdmin = await verificarAdmin(tokenSesion);

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
    ok: true, v: "14.33.0", memoriaPersonal: !!env.EGO_MEMORY, biblioteca: !!env.EGO_BIBLIOTECA,
    workersAI: !!env.AI, openRouter: !!routerApiKey(env), equipo: !!routerApiKey(env) && env.EGO_TEAM_MODE !== "0"
  });

  if (body.recall || body.action === "recall") {
    if (!correoUsuario) return json({ error: "Inicia sesión para consultar tu memoria personal.", code: "auth_required" }, 401);
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
    if (!correoUsuario) return json({ error: "Inicia sesión para borrar tu memoria personal.", code: "auth_required" }, 401);
    await env.EGO_MEMORY.delete(`historial:${usuario}`);
    return json({ ok: true });
  }

  if (body.summarize) {
    const prev = String(body.prev || "").slice(0, 3000);
    const text = String(body.text || "").slice(0, 12000);
    try {
      const r = await cfChatSeguro([CF_MODELS.chat], [
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
  if (body.action === "mc_part") return await mcPart(body, env, request);
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
  } else if (correoUsuario) {
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
  if (!env.AI && !routerApiKey(env)) return json({ error: "No hay modelos disponibles. Configura Workers AI o la clave de OpenRouter." }, 503);
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
