import { PermissionsAndroid, Platform } from 'react-native';

/** Modelo Whisper incluido en el APK (ver scripts/fetch-model.sh). */
export const MODEL_ASSET = 'ggml-base-q5_1.bin';

const SAMPLE_RATE = 16000;
/** Corte de seguridad: una orden de voz nunca debería pasar de esto. */
export const MAX_SECONDS = 20;

type WhisperCtx = {
  transcribe: (
    input: string,
    opts: { language: string; prompt?: string }
  ) => { promise: Promise<{ result: string }> };
};

let ctxPromise: Promise<WhisperCtx> | null = null;
let chunks: Uint8Array[] = [];
let listening = false;
let listenerAttached = false;

// Se cargan con require() perezoso: en Expo Go no existen estos módulos nativos y la app
// tiene que seguir funcionando (con el texto escrito) en vez de romperse al arrancar.
function audioStream(): any {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@fugood/react-native-audio-pcm-stream').default;
}

function loadContext(): Promise<WhisperCtx> {
  if (!ctxPromise) {
    ctxPromise = (async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { initWhisper } = require('whisper.rn');
      return (await initWhisper({ filePath: MODEL_ASSET, isBundleAsset: true })) as WhisperCtx;
    })().catch((e) => {
      ctxPromise = null; // permitir reintentar
      throw new Error(
        `No se pudo cargar el modelo de voz. ¿Está incluido en el APK? (${e?.message ?? e})`
      );
    });
  }
  return ctxPromise;
}

/** Precarga el modelo en segundo plano para que el primer dictado no espere. */
export function warmUp() {
  loadContext().catch(() => {});
}

export function isListening() {
  return listening;
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    bin += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(bin);
}

/** Arma un WAV PCM 16 bit mono 16 kHz en memoria a partir de los trozos grabados. */
function buildWav(pcm: Uint8Array[]): Uint8Array {
  const dataLen = pcm.reduce((n, c) => n + c.length, 0);
  const wav = new Uint8Array(44 + dataLen);
  const v = new DataView(wav.buffer);
  const str = (o: number, s: string) => [...s].forEach((ch, i) => (wav[o + i] = ch.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + dataLen, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, SAMPLE_RATE, true);
  v.setUint32(28, SAMPLE_RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, dataLen, true);
  let off = 44;
  for (const c of pcm) {
    wav.set(c, off);
    off += c.length;
  }
  return wav;
}

async function ensureMicPermission() {
  if (Platform.OS !== 'android') return;
  const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
    title: 'Micrófono',
    message: 'Se usa para registrar el uso de catéteres por voz. El audio no sale del celular.',
    buttonPositive: 'Permitir',
    buttonNegative: 'Ahora no',
  });
  if (res !== PermissionsAndroid.RESULTS.GRANTED) {
    throw new Error('Sin permiso de micrófono. Podés habilitarlo en Ajustes > Apps > Stock Catéteres.');
  }
}

export async function startListening(): Promise<void> {
  if (listening) return;
  await ensureMicPermission();
  const stream = audioStream();
  stream.init({
    sampleRate: SAMPLE_RATE,
    channels: 1,
    bitsPerSample: 16,
    audioSource: 6, // VOICE_RECOGNITION
    bufferSize: 4096,
    wavFile: '',
  });
  if (!listenerAttached) {
    stream.on('data', (b64: string) => {
      if (listening) chunks.push(b64ToBytes(b64));
    });
    listenerAttached = true;
  }
  chunks = [];
  listening = true;
  stream.start();
  warmUp();
}

/** Corta la grabación y devuelve el texto dictado (todo en el celular, sin internet). */
export async function stopAndTranscribe(): Promise<string> {
  if (!listening) return '';
  listening = false;
  try {
    await audioStream().stop();
  } catch {
    // si el stream ya estaba detenido no hay nada que hacer
  }
  const pcm = chunks;
  chunks = [];
  const bytes = pcm.reduce((n, c) => n + c.length, 0);
  if (bytes < SAMPLE_RATE * 2 * 0.4) return ''; // menos de ~0,4 s: no hay nada que transcribir

  const ctx = await loadContext();
  const wav = `data:audio/wav;base64,${bytesToB64(buildWav(pcm))}`;
  const { promise } = ctx.transcribe(wav, {
    language: 'es',
    prompt: 'Registro de catéteres. Usé 3 catéteres 18G y 1 de 20G.',
  });
  const { result } = await promise;
  // Whisper marca silencios/ruidos como [BLANK_AUDIO] o (música): no son parte de la orden.
  return result.replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function cancelListening() {
  if (!listening) return;
  listening = false;
  chunks = [];
  try {
    await audioStream().stop();
  } catch {}
}
