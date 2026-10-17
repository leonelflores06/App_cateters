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

La app tiene dos apartados (barra de abajo):

**🎤 Cargar**
1. Cargá los catéteres con el nombre que quieras (ej. `18G`, `20G`, `Mariposa`).
2. Tocá 🎤, decí por ejemplo *"usé 3 catéteres 18G y 1 de 20G"* y tocá ■.
3. Revisá lo que entendió: podés corregir cantidades (− / +), quitar una línea (×) o invertir uso/reposición.
4. **Actualizar stock** guarda; **Descartar** borra todo si entendió mal.

**Tema**: botón arriba a la derecha → ◐ Auto (sigue al celular) / ☀️ Claro / 🌙 Oscuro. Se recuerda.

**📊 Panel**: elegí el período del reporte — **Hoy**, **7 días** (predeterminado), **30 días** o
**Elegir fechas** (Desde/Hasta, DD/MM/AAAA). Muestra usados, repuestos y promedio diario del período,
gráfico de uso (por hora si es un día; por día, semana o mes según el largo), uso por catéter,
stock actual vs mínimo con días restantes, alertas de reposición y movimientos del período.
Se recuerda el último período elegido.

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
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a
# APK en android/app/build/outputs/apk/release/
```

## Compilar APK en GitHub

Cada push a `main` (o a ramas `claude/**`) ejecuta `.github/workflows/build-apk.yml`: tipos, lint, tests,
prebuild, descarga del modelo y `assembleRelease`. El APK queda como *artifact* en **Actions**
(también se puede lanzar a mano con *Run workflow*).
