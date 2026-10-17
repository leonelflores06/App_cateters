# Stock Catéteres

App móvil (Expo / React Native) para llevar el stock de catéteres con estadísticas.
Datos 100% locales (SQLite en el celular). El uso se registra **por voz o escribiendo** y todo corre en el celular, sin internet.

## Estado

- [x] Etapa 1: stock, movimientos manuales (−1 / +1), estadísticas y explicación local
- [x] Etapa 2: audio a texto en el celular (Whisper `base` cuantizado vía `whisper.rn`, incluido en el APK)
- [x] Etapa 3: intérprete por reglas (`src/parser.ts`) + confirmación + explicación de una línea del cambio
- [ ] Etapa 4: pulido (backup, ícono)
- [ ] Pendiente: probar en un celular real (nada de voz fue probado en un dispositivo todavía)

## Cómo se usa

1. Cargá los catéteres con el nombre que quieras (ej. `18G`, `20G`, `Mariposa`).
2. Tocá 🎤, decí por ejemplo *"usé 3 catéteres 18G y 1 de 20G"* y tocá ■.
3. Aparece lo que entendió (podés corregir el texto a mano). Tocá **Confirmar** y se actualiza el stock.

También sirve escribir la frase. Para reponer: *"repuse 10 de 18G"*, *"llegaron 20 de 22G"*.
Los números pueden ir en dígitos o palabras ("tres", "dieciocho", "treinta y dos"). Si no ponés cantidad, se toma 1.

## Voz: cómo funciona

- Graba con `@fugood/react-native-audio-pcm-stream` (16 kHz, mono) y arma un WAV en memoria.
- Transcribe con `whisper.rn` (whisper.cpp) y el modelo `ggml-base-q5_1.bin` (~57 MB), empaquetado en los assets del APK.
- **Necesita un APK / development build.** No funciona en Expo Go (ahí queda el modo texto).

## Correr en local

```bash
npm install
npm test                # tests del intérprete
npm run typecheck && npm run lint
npx expo start          # Expo Go: solo modo texto, sin voz
```

## Compilar APK en local

Requisitos: Node 22, JDK 17 y Android SDK (Android Studio).

```bash
npx expo prebuild --platform android
bash scripts/fetch-model.sh          # mete el modelo de voz en el APK (descarga ~57 MB)
cd android && ./gradlew assembleRelease
# APK en android/app/build/outputs/apk/release/
```

## Compilar APK en GitHub

Cada push a `main` (o a ramas `claude/**`) ejecuta `.github/workflows/build-apk.yml`: tipos, lint, tests,
prebuild, descarga del modelo y `assembleRelease`. El APK queda como *artifact* en **Actions**
(también se puede lanzar a mano con *Run workflow*).
