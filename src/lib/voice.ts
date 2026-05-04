// Síntesis de voz (Web Speech API) - español.
// Estrategia robusta:
// 1) Desbloqueamos el motor en el primer gesto (click/touch/keydown) reproduciendo
//    una utterance silenciosa. Algunos navegadores bloquean sin esto.
// 2) Exportamos `primeSpeech()` para llamarla EXPLÍCITAMENTE dentro del onClick
//    del usuario (p. ej. al elegir un destino) y garantizar reproducción.
// 3) `speak()` realiza un keep-alive (pause/resume) y reintenta si el navegador
//    "se queda dormido" (problema típico de Chrome).

let lastSaid = "";
let lastSaidAt = 0;
let unlocked = false;
let voicesReady = false;
let voicesCache: SpeechSynthesisVoice[] = [];

function hasTTS(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function loadVoices() {
  if (!hasTTS()) return;
  const v = window.speechSynthesis.getVoices();
  if (v && v.length) {
    voicesCache = v;
    voicesReady = true;
  }
}

if (hasTTS()) {
  loadVoices();
  // Algunos navegadores cargan voces de forma asíncrona
  window.speechSynthesis.onvoiceschanged = () => loadVoices();
}

function pickSpanishVoice(): SpeechSynthesisVoice | null {
  if (!voicesCache.length) loadVoices();
  return (
    voicesCache.find((v) => /^es([-_]|$)/i.test(v.lang)) ??
    voicesCache.find((v) => v.lang?.toLowerCase().startsWith("es")) ??
    null
  );
}

/** Desbloquea el motor de TTS. Llamar dentro de un gesto del usuario. */
export function primeSpeech() {
  if (!hasTTS()) return;
  try {
    // Reanudar si quedó pausado
    if (window.speechSynthesis.paused) window.speechSynthesis.resume();
    if (unlocked) return;
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    u.lang = "es-ES";
    window.speechSynthesis.speak(u);
    unlocked = true;
  } catch {
    /* noop */
  }
}

if (hasTTS()) {
  const unlock = () => primeSpeech();
  ["click", "touchstart", "keydown", "pointerdown"].forEach((ev) =>
    window.addEventListener(ev, unlock, { passive: true } as any),
  );
  // Keep-alive: Chrome a veces deja la cola "stuck" tras ~15s
  setInterval(() => {
    if (!hasTTS()) return;
    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      // truco de mantener vivo
      window.speechSynthesis.pause();
      window.speechSynthesis.resume();
    }
  }, 8000);
}

function doSpeak(text: string, rate: number) {
  if (!hasTTS()) return;
  try {
    window.speechSynthesis.cancel();
    if (window.speechSynthesis.paused) window.speechSynthesis.resume();

    const u = new SpeechSynthesisUtterance(text);
    u.lang = "es-ES";
    const v = pickSpanishVoice();
    if (v) u.voice = v;
    u.rate = rate;
    u.pitch = 1;
    u.volume = 1;
    u.onerror = (e) => console.warn("TTS error", e);
    window.speechSynthesis.speak(u);
  } catch (e) {
    console.warn("speak failed", e);
  }
}

export function speak(text: string, opts: { force?: boolean; rate?: number } = {}) {
  if (!hasTTS()) return;
  if (!text || !text.trim()) return;
  const now = Date.now();
  if (!opts.force && text === lastSaid && now - lastSaidAt < 8000) return;
  lastSaid = text;
  lastSaidAt = now;

  const rate = opts.rate ?? 1;

  // Si las voces aún no cargaron, esperamos y reintentamos
  if (!voicesReady) {
    loadVoices();
    if (!voicesReady) {
      setTimeout(() => doSpeak(text, rate), 250);
      return;
    }
  }

  // Forzar desbloqueo (idempotente) e ir
  primeSpeech();
  doSpeak(text, rate);
}

export function stopSpeaking() {
  if (hasTTS()) {
    try { window.speechSynthesis.cancel(); } catch { /* noop */ }
  }
}
