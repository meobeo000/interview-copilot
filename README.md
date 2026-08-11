# Interview Copilot

Interview Copilot is a Windows-first desktop overlay designed for live Vietnamese SEO interviews on Google Meet, Telegram Desktop calls, and other VoIP applications.

## Current Progress

- **Phase 1 (Completed)**: Frameless always-on-top overlay shell, Zustand state machine (`Idle` -> `Listening` -> `Processing` -> `Answering` -> `Error`), mock Vietnamese transcript stream with SEO English terms, answer renderer, and capped `localStorage` history.
- **Phase 2 (Completed & Hardened)**: Real Windows system-audio loopback capture without requiring meeting bots or recording files to disk, strict 16 kHz mono PCM audio frame normalization, and UI error surfacing.

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

- **`src/electron`**: Desktop shell, frameless always-on-top window, `Alt+Space` global shortcut, and secure IPC handlers (`window:hide`, `system-audio:get-source-id`).
- **`src/renderer`**: React overlay UI, Zustand store, live transcript area, question panel, answer panel, history band, and `AudioMeter` diagnostic indicator.
- **`src/audio`**: System audio loopback capture engine (`SystemAudioCapture`), linear interpolation resampler (`resampler.ts`), and mock fallback (`MockAudioCapture`).
- **`src/transcription`**: Streaming transcription interface and mock transcript simulator.
- **`src/question-detector`**: End-of-question detector interface and mock semantic completeness analyzer.
- **`src/llm`**: Answer generation service interface and mock stream provider.
- **`src/shared`**: Data models (`ConversationItem`, `SuggestedAnswer`, `AudioFrame`, history helpers).

---

## Phase 2 — System Audio Capture Details

### Technical Mechanism & Audio Resampling
- Uses Electron's `desktopCapturer` API (`system-audio:get-source-id`) to retrieve primary screen source ID in the main process.
- The renderer requests the desktop stream via `navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId } } })`.
- Video tracks are immediately stopped upon acquisition, leaving only the Windows system output loopback audio track.
- Audio is downsampled/resampled using linear interpolation ([resampler.ts](file:///d:/Projects/interview-copilot/src/audio/resampler.ts)) from native `AudioContext` rates (e.g. 48,000 Hz) to a **normalized 16,000 Hz mono Float32Array PCM** format.
- Audio track `onended` events and capture initialization errors are caught and surfaced directly to the overlay UI as an `Error` state (no swallowed failures).

### Emitted Audio Frame Contract (`AudioFrame`)
- **Sample Rate**: `16000` Hz (strictly normalized)
- **Channels**: `1` (mono)
- **Sample Format**: `"float32"`
- **Duration**: ~30–50 ms per frame
- **Properties**: `capturedAt`, `rmsLevel`

### Audio Processing Rationale & Migration Roadmap
- **MVP Processor**: `ScriptProcessorNode` is used for MVP simplicity and universal environment compatibility in Electron renderer context.
- **Production Migration Plan**: For Phase 3/4 low-latency performance tuning, the audio processing node will be migrated to an `AudioWorkletNode` or native WASAPI C++ module to minimize main thread event-loop jitter.

### Security & Privacy
- **No Meeting Bot**: Captures audio locally from Windows system output without joining calls.
- **No Disk Recording**: Audio frames remain in memory for real-time streaming processing only.
- **Narrow IPC Bridge**: Renderer communicates only via context-isolated preload bridge methods (`getDesktopSourceId`, `hide`). `nodeIntegration` remains disabled.

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

## Known Limitations

- Real STT engine (Phase 3) is not yet attached to the live audio frames.
- Real OpenAI LLM answer generation (Phase 4) is not yet attached.
- `Alt+Space` shortcut registration can fail if another application holds exclusive ownership.

---

## Phase 3 Handoff Contract (Vietnamese-first Streaming STT)

Phase 3 will attach a persistent WebSocket/streaming STT connection directly to `SystemAudioCapture` frames:
- Primary target language: **Vietnamese** (`vi-VN`) with mixed English SEO terminology (e.g., `GSC`, `GA4`, `backlink`, `Core Update`, `canonical`, `301`).
- Input format: Normalized mono 16,000 Hz Float32Array PCM audio frames emitted continuously by `AudioCapture`.
- Interface contract: `TranscriptionService` (`start(callbacks)` yielding `onPartial`, `onFinal`, `onComplete`, `onError`).
