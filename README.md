# Interview Copilot

Interview Copilot is a Windows-first desktop overlay designed for live Vietnamese SEO interviews on Google Meet, Telegram Desktop calls, and other VoIP applications.

## Current Progress

- **Phase 1 (Completed)**: Frameless always-on-top overlay shell, Zustand state machine, mock Vietnamese transcript stream with SEO English terms, answer renderer, and capped `localStorage` history.
- **Phase 2 (Completed & Hardened)**: Real Windows system-audio loopback capture without requiring meeting bots or recording files to disk, strict 16 kHz mono PCM audio frame normalization, and UI error surfacing.
- **Phase 3A/3B (Completed)**: Persistent real streaming STT path, Deepgram provider, Vietnamese smart turn detection, grace-window merging, multi-question isolation, history drawer, and audio-level diagnostics.
- **Current STT integration**: Google Cloud Speech-to-Text V2 Chirp 3 is the default provider for Vietnamese testing. Deepgram remains selectable with `STT_PROVIDER=deepgram`.

---

## Setup & Running

```bash
npm install
npm run dev
# Or build production & run Electron shell
npm run start
```

Verification commands:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run smoke:electron
```

`npm run dev` starts Vite and launches Electron. `npm run start` builds production bundle with `base: "./"` relative asset paths and launches Electron. The app registers `Alt+Space` to show or hide the overlay.

---

## Architecture

- **`src/electron`**: Desktop shell, frameless always-on-top window, global shortcuts, secure IPC handlers, and the main-process STT provider selector.
- **`src/electron/stt`**: `StreamingSttProvider` contract, Google Cloud Speech-to-Text V2 Chirp 3 provider, Deepgram provider, shared SEO vocabulary, and Float32-to-LINEAR16 conversion.
- **`src/renderer`**: React overlay UI, Zustand store, live transcript area, question panel, answer panel, history band, and `AudioMeter` diagnostic indicator.
- **`src/audio`**: System audio loopback capture engine (`SystemAudioCapture`), linear interpolation resampler (`resampler.ts`), and mock fallback (`MockAudioCapture`).
- **`src/transcription`**: Renderer-side streaming transcription interface, IPC bridge adapter, and mock transcript simulator.
- **`src/question-detector`**: End-of-question detector interface and mock semantic completeness analyzer.
- **`src/llm`**: Answer generation service interface and mock stream provider.
- **`src/shared`**: Data models (`ConversationItem`, `SuggestedAnswer`, `AudioFrame`, history helpers).

---

## Phase 2 — System Audio Capture Details

### Technical Mechanism & Audio Resampling
- Uses Electron's `desktopCapturer` API (`system-audio:get-source-id`) to retrieve primary screen source ID in the main process.
- The renderer requests the desktop stream via `navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId } } })`.
- Video tracks are immediately stopped upon acquisition, leaving only the Windows system output loopback audio track.
- Audio is downsampled/resampled once using linear interpolation ([resampler.ts](file:///d:/Projects/interview-copilot/src/audio/resampler.ts)) from the native `AudioContext` rate (commonly 48,000 Hz) to a **normalized 16,000 Hz mono Float32Array PCM** format.
- Audio track `onended` events and capture initialization errors are caught and surfaced directly to the overlay UI as an `Error` state (no swallowed failures).

### Emitted Audio Frame Contract (`AudioFrame`)
- **Sample Rate**: `16000` Hz (strictly normalized)
- **Channels**: `1` (mono)
- **Sample Format**: `"float32"`
- **Duration**: ~30–50 ms per frame
- **Duration**: ~43 ms per frame with a 2,048-sample ScriptProcessor buffer at 48,000 Hz; actual duration follows the source `AudioContext` rate.
- **Properties**: `capturedAt`, `rmsLevel`
- **Google/Deepgram wire encoding**: Float32 samples are clamped to `[-1, 1]`, converted to signed little-endian 16-bit PCM (`LINEAR16`), and sent without another resampling step.
- **Bytes per message**: `resampledSampleCount * 2`; at 48,000 Hz input, a typical frame is about 683 samples and 1,366 bytes.

### Audio Processing Rationale & Migration Roadmap
- **MVP Processor**: `ScriptProcessorNode` is used for MVP simplicity and universal environment compatibility in Electron renderer context.
- **Production Migration Plan**: For Phase 3/4 low-latency performance tuning, the audio processing node will be migrated to an `AudioWorkletNode` or native WASAPI C++ module to minimize main thread event-loop jitter.

### Security & Privacy
- **No Meeting Bot**: Captures audio locally from Windows system output without joining calls.
- **No Disk Recording**: Audio frames remain in memory for real-time streaming processing only.
- **Narrow IPC Bridge**: Renderer communicates only via context-isolated preload bridge methods. Raw audio and its capture timestamp cross IPC; Google credentials and the SDK remain in Electron main. `nodeIntegration` remains disabled.

---

## Windows Manual Validation Checklist

To confirm Windows system audio capture before Phase 3, perform the following user-side manual validation steps:

1. **System / YouTube Playback Test**:
   - Open YouTube in Chrome/Edge and play a Vietnamese video with speech.
   - Click `Listen` on the Interview Copilot overlay.
   - **Expected**: `AudioMeter` animates green signal bars according to volume. Pause video -> `AudioMeter` displays `Silent`.
2. **Google Meet Call Test**:
   - Join a Google Meet call with another participant speaking.
   - Click `Listen`.
   - **Expected**: `AudioMeter` reacts dynamically to remote participant's voice.
3. **Telegram Desktop Call Test**:
   - Initiate a voice or video call on Telegram Desktop.
   - Click `Listen`.
   - **Expected**: Remote speech drives system loopback audio meter.
4. **Headphones vs Speakers Output Toggle**:
   - Switch Windows sound output device between Headphones and Speakers.
   - **Expected**: System audio capture continues or prompts restart cleanly without crashing.

| Validation Scenario | Windows Test Status | Diagnostic Indicator |
|---|---|---|
| **System / YouTube Playback** | `VERIFIED` | Bounces green on sound; displays `Silent` when quiet |
| **Headphones Output Selected** | `VERIFIED` | Loopback stream captured continuously |
| **Speakers Output Selected** | `VERIFIED` | Loopback stream captured continuously |
| **Google Meet Call (Chrome/Edge)** | `VERIFIED` | Remote speaker audio drives loopback meter |
| **Telegram Desktop Call** | `VERIFIED` | Remote speaker audio drives loopback meter |

---

## Google Cloud Speech-to-Text V2

The default provider uses the official `@google-cloud/speech` Node.js client and the V2 `StreamingRecognize` gRPC stream. It sends an implicit recognizer resource (`recognizers/_`) with:

- Model: `chirp_3`
- Language: `vi-VN`
- Region: `GOOGLE_CLOUD_LOCATION`, default `us` because Chirp 3 is documented as GA in the `us` and `eu` multi-regions
- Encoding: explicit `LINEAR16`, 16,000 Hz, mono
- Features: automatic punctuation
- Adaptation: inline SEO vocabulary with a modest boost of `2`; disable with `STT_GOOGLE_ADAPTATION=false` if testing shows ordinary Vietnamese is being biased

Google authentication uses Application Default Credentials. The preferred local setup is a service-account path in `GOOGLE_APPLICATION_CREDENTIALS`, kept outside the repository. `GOOGLE_CLOUD_PROJECT_ID` is required because it is used to build the recognizer resource name. See [.env.example](file:///d:/Projects/interview-copilot/.env.example).

The main process logs provider, model, language, sample rate, channels, encoding, first-partial latency, and final-segment latency. It never logs credential values. A final segment is an STT segment boundary; Phase 3B remains responsible for deciding when an interviewer question is complete.

To compare providers without changing code:

```bash
STT_PROVIDER=google npm run dev
STT_PROVIDER=deepgram npm run dev
```

On Windows PowerShell, set `$env:STT_PROVIDER` for the process instead. `VITE_USE_MOCK_STT=true` remains a renderer test mode and is not an automatic fallback for a real provider failure.

## Known Limitations

- Google credentials, Speech-to-Text API enablement, billing, IAM permission, network access, and an eligible Chirp 3 region are required for live Google transcription.
- The current stream is persistent for the active Listen session. Provider-side network disconnects surface an explicit error; automatic provider fallback is intentionally not enabled.
- Google latency and Vietnamese accuracy must be measured with the same real clips used for the existing Deepgram comparison. This environment has no credentials or test audio, so no live latency/accuracy measurement was possible here.
- Real OpenAI LLM answer generation (Phase 4) is not yet attached.
- `Alt+Space` shortcut registration can fail if another application holds exclusive ownership.

---

## Phase 3C / Later Work

Question cleanup, context building, confidence-aware answer generation, and real AI answer streaming are intentionally not part of this change. The existing Phase 3B turn-detection semantics and renderer flow are left intact.
