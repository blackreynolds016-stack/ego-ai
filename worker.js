// ============================================================
// EGO AI WORKER v12.1.0 — CÓDIGO, MATEMÁTICAS, CIENCIAS Y CREACIÓN (visión y video)
// ============================================================

// Cada cadena se prueba en orden: si un modelo falla (p. ej. tu plan de Cloudflare no lo incluye) pasa al siguiente.
const MODELO_RAPIDO = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const CF_MODELS = {
  chat: MODELO_RAPIDO,   // resúmenes y estudio de lecciones
  codigo:  ["@cf/moonshotai/kimi-k2.7-code", "@cf/qwen/qwen2.5-coder-32b-instruct", "@cf/qwen/qwen3.8-27b", MODELO_RAPIDO],
  razonar: ["@cf/deepseek-ai/deepseek-v4-pro-0813", "@cf/moonshotai/kimi-k2.7-code", "@cf/qwen/qwen3.8-27b", MODELO_RAPIDO],
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
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET"
};

const MSG_NO_APRENDE = "EGO AI no puede aprender de los usuarios. Solo su creador puede enseñarle.";
const RX_LISTAR = /^[\s¿¡]*(?:qu[eé]\s+(?:lecciones\s+)?has\s+(?:estudiado|aprendido)|(?:mis\s+|las\s+)?lecciones(?:\s+estudiadas)?)[\s?!.]*$/i;

const EGO_MANUAL = `Eres EGO AI v12.1.0, una IA especializada en PROGRAMACIÓN, MATEMÁTICAS, CIENCIAS y CREACIÓN DE APPS Y JUEGOS. Habla en español de forma clara y directa.

=== TU ESPECIALIDAD ===
1. Solo trabajas en: código (cualquier lenguaje), depuración, algoritmos, matemáticas, física, química, biología y demás ciencias, y crear apps, juegos, páginas e interfaces. También respondes saludos y preguntas sobre ti.
2. Si la petición es de otro tema, dilo en una sola frase amable y ofrece ayuda dentro de tu especialidad. No hagas la tarea fuera de tema.
3. La aplicación puede generar imágenes mediante action=image_generate, editar imágenes originales mediante action=image_edit, crear texturas 2D para modelos 3D mediante action=texture_generate y generar voz mediante action=tts o action=addon_voice. No afirmes que ejecutaste una generación si no se invocó esa acción. Minecraft: SIEMPRE Bedrock (Android, Windows, consolas), nunca Java ni Forge/Fabric. Si piden un add-on, di que la app lo crea como archivo .mcaddon cuando el usuario escribe algo como «crea un add-on para Minecraft con …»; no pegues código Java. Puedes analizar imágenes y videos enviados en el chat.

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
const BASE_VERSION = "1";
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
async function cfChatSeguro(cadena, messages, env, maxTokens) {
  const fallos = [];
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

async function openRouterChat(messages, env, maxTokens, model = env.OPENROUTER_MODEL) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55000);
  try {
    const normalized = messages.map(m => ({
      role: ["system", "user", "assistant"].includes(m?.role) ? m.role : "user",
      content: typeof m?.content === "string" ? m.content : textOf(m?.content)
    }));
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${routerApiKey(env)}`,
        "Content-Type": "application/json",
        "HTTP-Referer": env.OPENROUTER_SITE_URL || "https://ego-ai.app",
        "X-Title": "EGO AI"
      },
      body: JSON.stringify({ model, messages: normalized, max_tokens: maxTokens, temperature: 0.2 })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${String(data?.error?.message || "proveedor rechazó la solicitud").slice(0, 180)}`);
    const content = salida(data);
    if (!content) throw new Error("respuesta vacía");
    return { content, model: `openrouter:${model}` };
  } finally { clearTimeout(timer); }
}

async function cfVision(messages, env) {
  if (!env.AI) throw new Error("AI no disponible");
  const r = await cfChat(CF_MODELS.vision[0], messages, env, 4000);
  if (!r.content) throw new Error("el modelo de visión no devolvió texto");
  return r;
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
    version: "12.1.0",
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

async function generarImagen(body, env) {
  const prompt = String(body.prompt || "").trim().slice(0, 5000);
  if (!prompt) return respuestaJsonError("Falta prompt.");
  const enhanced = promptImagenProfesional(prompt, body);
  // Workers AI FLUX.2 Klein ofrece generación y edición con referencia. Se usa primero
  // si está disponible; se conserva el fallback de proveedores ya configurado.
  if (env.AI) {
    const model = String(env.IMAGE_MODEL || "@cf/black-forest-labs/flux-2-klein-4b");
    try {
      const result = await env.AI.run(model, { prompt: enhanced, width: 1024, height: 1024 });
      const out = imagenResultado(result, model);
      if (out) return json(out);
    } catch (e) { console.warn("cf_image_generate", String(e?.message || e).slice(0, 160)); }
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
  const model = String(env.IMAGE_EDIT_MODEL || "@cf/black-forest-labs/flux-2-klein-4b");
  try {
    const form = new FormData();
    form.append("prompt", `Edit the provided original image. Preserve the original subject, identity, framing, and all areas not requested to change. Apply only this change: ${prompt}. Do not replace the image with an unrelated new scene.`);
    form.append("input_image_0", new Blob([bytes], {type:source.mime}), source.mime === "image/jpeg" ? "input.jpg" : source.mime === "image/webp" ? "input.webp" : "input.png");
    const serialized = new Response(form);
    const result = await env.AI.run(model, { multipart: { body: serialized.body, contentType: serialized.headers.get("content-type") } });
    const out = imagenResultado(result, model);
    if (!out) return json({error:"El modelo de edición no devolvió una imagen."},502);
    return json({...out, edited:true, preservesOriginalReference:true});
  } catch(e) {
    console.error("image_edit",String(e?.message||e).slice(0,200));
    return json({error:"No se pudo editar la imagen. Comprueba que el modelo admite edición y que la imagen sea compatible.",model},503);
  }
}

async function generarTextura(body, env) {
  const prompt = String(body.prompt || body.description || "").trim().slice(0,4000);
  if (!prompt) return respuestaJsonError("Describe la textura que quieres crear.");
  const size = [16,32,64,128,256].includes(Number(body.size)) ? Number(body.size) : 64;
  const texturePrompt = `Create a seamless, tileable Minecraft-style pixel-art texture atlas tile. Subject/material: ${prompt}. Requirements: orthographic flat 2D texture, square image, clean pixel clusters, no perspective, no lighting cast outside the texture, no border, no text, no watermark, repeatable edges on all four sides, game-ready UV texture. Target logical resolution ${size}x${size} pixels; keep pixel-art style and avoid blurry gradients.`;
  if (!env.AI) return respuestaJsonError("La generación de texturas requiere Workers AI (AI).",503);
  const model = String(env.TEXTURE_MODEL || env.IMAGE_MODEL || "@cf/black-forest-labs/flux-2-klein-4b");
  try {
    const result = await env.AI.run(model, {prompt:texturePrompt,width:1024,height:1024});
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

async function generarProyecto(body, env, minecraft, request) {
  const prompt = String(body.prompt || body.description || "").trim().slice(0, 12000);
  if (!prompt) return respuestaJsonError("Falta prompt del proyecto.");
  const kind = minecraft ? String(body.packType || "behavior").slice(0, 30) : String(body.kind || "web").slice(0, 40);
  const maxFiles = Math.max(1, Math.min(Number(body.maxFiles || (minecraft ? 25 : 35)), 50));
  const system = minecraft
    ? `Eres un ingeniero experto en Minecraft BEDROCK Edition (Android, Windows, consolas). NUNCA uses Java, Forge ni Fabric. Genera un ADD-ON COMPLETO como JSON válido, sin Markdown ni texto extra: {"name":"...","description":"...","files":[{"path":"...","content":"..."}]}.
Estructura obligatoria con DOS packs enlazados: carpeta "BP/" (behavior pack) y carpeta "RP/" (resource pack). Cada uno con su manifest.json (format_version 2, header con name, description, uuid, version [1,0,0], min_engine_version [1,21,0]; modules con su propio uuid distinto; el BP depende del RP y el RP del BP usando el uuid del header del otro, con version [1,0,0]). Todos los UUID deben ser v4 válidos y DISTINTOS entre sí.
Ítems personalizados: BP/items/<nombre>.json con formato "minecraft:item" (format_version "1.21.0"), identificador con prefijo propio (por ejemplo ego:espada_trueno), componentes como minecraft:icon, minecraft:max_stack_size, minecraft:damage, minecraft:hand_equipped, minecraft:durability y minecraft:cooldown. Textos en RP/texts/es_ES.lang y RP/texts/en_US.lang y RP/texts/languages.json.
Icono: NO puedes crear imágenes binarias. En RP/textures/item_texture.json apunta a una textura que ya exista en el juego (por ejemplo "textures/items/diamond_sword") para que no falte ninguna imagen; documenta en README.md cómo cambiarla por un PNG propio.
Efectos y comportamiento (rayos, partículas, sonidos, habilidades): usa Script API con "@minecraft/server" en BP/scripts/main.js (módulo "script" en el manifest con language "javascript", entry "scripts/main.js", y dependencia @minecraft/server con una version estable). Para rayos usa dimension.spawnEntity("minecraft:lightning_bolt", ubicacion) o /summon; para partículas dimension.spawnParticle o RP/particles; para sonidos world.playSound o dimension.playSound. Escucha eventos como world.afterEvents.itemUse y world.afterEvents.entityHitEntity y comprueba que el ítem sea el tuyo. Añade cooldown y no uses APIs inventadas. Explica en README.md si hay que activar Experimentos (Beta APIs) y cómo instalarlo.
Incluye todos los archivos con contenido completo, sin placeholders, sin binarios, sin rutas absolutas ni "..". Máximo ${maxFiles} archivos. packType=${kind}.`
    : `Eres un arquitecto de software senior. Genera un proyecto ejecutable completo como JSON válido y sin Markdown: {"name":"...","description":"...","files":[{"path":"...","content":"..."}]}. Incluye README.md con instalación y ejecución, archivos de configuración, código completo y pruebas básicas cuando proceda. Elige una estructura simple y consistente con el stack solicitado. Máximo ${maxFiles} archivos. No incluyas placeholders, secretos, ni rutas absolutas.`;
  const user = `Crea este proyecto con calidad profesional, funcional y adaptado a móvil cuando aplique. Solicitud: ${prompt}`;
  let raw="", model="";
  try {
    if (routerApiKey(env)) {
      let lastError = null;
      for (const chosen of openRouterCandidates(env, "code")) {
        try {
          const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method:"POST", headers:{"Authorization":`Bearer ${routerApiKey(env)}`,"Content-Type":"application/json","HTTP-Referer":env.OPENROUTER_SITE_URL||"https://ego-ai.app","X-Title":"EGO AI"},
            body:JSON.stringify({model:chosen,messages:[{role:"system",content:system},{role:"user",content:user}],temperature:0.15,max_tokens:16000})
          });
          const data=await r.json().catch(()=>({}));
          if(!r.ok) throw new Error(`OpenRouter HTTP ${r.status}: ${String(data?.error?.message||"error").slice(0,140)}`);
          raw=salida(data); model=`openrouter:${chosen}`;
          if (raw) break;
        } catch (err) { lastError = err; }
      }
      if (!raw) throw lastError || new Error("Los modelos gratuitos no devolvieron contenido");
    } else if (env.AI) {
      const cadena=env.PROJECT_CF_MODEL?[String(env.PROJECT_CF_MODEL),...CF_MODELS.codigo.filter(m=>m!==String(env.PROJECT_CF_MODEL))]:CF_MODELS.codigo;
      const r=await cfChatSeguro(cadena,[{role:"system",content:system},{role:"user",content:user}],env,12000);
      raw=r.content; model=r.model;
    } else return respuestaJsonError("Configura Workers AI o OPENROUTER_API_KEY para generar proyectos.",503);
    const parsed=extractJson(raw);
    if(!parsed || !Array.isArray(parsed.files)) return json({error:"El modelo no devolvió un manifiesto de archivos válido. Reintenta con una solicitud más concreta.",model},502);
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
    const avisos=minecraft?repararAddon(files):[];
    if(avisos.length){const ix=files.findIndex(f=>/^README\.md$/i.test(f.path));if(ix>=0)files[ix].content+="\n\n## Avisos de EGO AI\n"+avisos.map(a=>"- "+a).join("\n")+"\n";}
    const zip=await createZip(files);
    return new Response(zip,{status:200,headers:{...corsPara(request,env),"Content-Type":"application/zip","Content-Disposition":`attachment; filename="${name}${minecraft?".mcaddon":".zip"}"`,"X-EGO-Avisos":String(avisos.length),"X-EGO-Model":model,"X-EGO-Files":String(files.length),"Cache-Control":"no-store"}});
  } catch(e) {
    console.error("project_generate",String(e?.message||e).slice(0,250));
    return json({error:"No se pudo generar el proyecto. Revisa la configuración del proveedor y los logs.",detail:String(e?.message||e).slice(0,180)},503);
  }
}


// Valida y repara el add-on: JSON de manifest, UUID v4 únicos y dependencias coherentes.
const RX_UUID4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function nuevoUuid(){return crypto.randomUUID();}
function repararAddon(files){
  const avisos=[]; const usados=new Map(); const cambios=new Map();
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
  // dependencias entre packs: deben apuntar al header de otro pack
  const headers=objs.map(x=>({f:x.f,u:String(x.o?.header?.uuid||"")}));
  for(const {f,o} of objs){
    const deps=Array.isArray(o.dependencies)?o.dependencies:[];
    for(const d of deps){ if(d&&d.uuid&&!headers.some(h=>h.u.toLowerCase()===String(d.uuid).toLowerCase())&&!d.module_name){
      const otro=headers.find(h=>h.f!==f); if(otro){avisos.push(`Dependencia rota en ${f.path}; se enlazó con ${otro.f.path}.`);d.uuid=otro.u;} } }
    f.content=JSON.stringify(o,null,2);
  }
  if(objs.length>=2){
    const [a,b]=[objs[0],objs[1]];
    const apunta=(x,y)=>(x.o.dependencies||[]).some(d=>d&&String(d.uuid).toLowerCase()===String(y.o.header.uuid).toLowerCase());
    if(!apunta(a,b)||!apunta(b,a)){
      for(const [x,y] of [[a,b],[b,a]]) if(!apunta(x,y)){x.o.dependencies=(x.o.dependencies||[]).concat([{uuid:y.o.header.uuid,version:y.o.header.version||[1,0,0]}]);x.f.content=JSON.stringify(x.o,null,2);}
      avisos.push("Se enlazaron los dos packs entre sí (dependencias que faltaban).");
    }
  }
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
  for(const f of files){const name=enc.encode(f.path),data=enc.encode(f.content),crc=crc32(data);
    const lh=new Uint8Array([...u32(0x04034b50),...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0),...name]);
    local.push(lh,data);
    const ch=new Uint8Array([...u32(0x02014b50),...u16(20),...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(offset),...name]);
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

  if (url.searchParams.has("health")) return json({
    ok: true, version: "12.1.0", aiConfigured: !!env.AI,
    memoryConfigured: !!env.EGO_MEMORY, libraryConfigured: !!env.EGO_BIBLIOTECA,
    openRouterFallbackConfigured: !!routerApiKey(env), freeModels: OR_FREE
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
    return new Response("🧠 EGO AI v12.1.0 — Código, matemáticas, ciencias y creación\n\n" +
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
    ok: true, v: "12.1.0", memoriaPersonal: !!env.EGO_MEMORY, biblioteca: !!env.EGO_BIBLIOTECA 
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
  const msgsL = limpiarImagenes(msgs);
  const conImagen = tieneImagen(msgsL[msgsL.length - 1]);
  const tipo = tipoTarea(text);
  const cadena = CF_MODELS[tipo === "razonar" ? "razonar" : tipo === "rapido" ? "rapido" : "codigo"];
  const base = { memoriaPersonal: memoriasPersonales.length, biblioteca: biblioteca.length };

  // 👁️ VISIÓN: imágenes y fotogramas de video
  if (conImagen) {
    if (!env.AI) return json({ error: "Visión no disponible" }, 500);
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
    } catch (e) { return json({ error: "Visión: " + String(e.message || e) }, 500); }
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
      reply: r.content + confirmacion,
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
