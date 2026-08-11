# Interview Copilot

Interview Copilot is a Windows-first desktop overlay designed for live Vietnamese SEO interviews on Google Meet, Telegram Desktop calls, and other VoIP applications.

## Current Progress

- **Phase 1 (Completed)**: Frameless always-on-top overlay shell, Zustand state machine (`Idle` -> `Listening` -> `Processing` -> `Answering` -> `Error`), mock Vietnamese transcript stream with SEO English terms, answer renderer, and capped `localStorage` history.
- **Phase 2 (Completed)**: Real Windows system-audio loopback capture without requiring meeting bots or recording files to disk.

---

## Setup & Running

```bash
npm install
npm run dev
```

Verification commands:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run smoke:electron
```

`npm run dev` starts Vite and launches Electron. The app registers `Alt+Space` to show or hide the overlay.

---

## Architecture

- **`src/electron`**: Desktop shell, frameless always-on-top window, `Alt+Space` global shortcut, and secure IPC handlers (`window:hide`, `system-audio:get-source-id`).
- **`src/renderer`**: React overlay UI, Zustand store, live transcript area, question panel, answer panel, history band, and `AudioMeter` diagnostic indicator.
- **`src/audio`**: System audio loopback capture engine (`SystemAudioCapture`) and mock fallback (`MockAudioCapture`).
- **`src/transcription`**: Streaming transcription interface and mock transcript simulator.
- **`src/question-detector`**: End-of-question detector interface and mock semantic completeness analyzer.
- **`src/llm`**: Answer generation service interface and mock stream provider.
- **`src/shared`**: Data models (`ConversationItem`, `SuggestedAnswer`, `AudioFrame`, history helpers).

---

## Phase 2 — System Audio Capture Details

### Technical Mechanism
- Uses Electron's `desktopCapturer` API (`system-audio:get-source-id`) to retrieve primary screen source ID in the main process.
- The renderer requests the desktop stream via `navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId } } })`.
- Video tracks are immediately stopped upon acquisition, leaving only the Windows system output loopback audio track.
- Audio is processed through an `AudioContext` and `ScriptProcessorNode` to calculate real-time RMS volume levels (0.0 to 1.0) and emit continuous mono Float32Array PCM frames (~30ms-50ms duration).

### Emitted Audio Frame Contract (`AudioFrame`)
- **Sample Rate**: 16,000 Hz / 48,000 Hz
- **Channels**: 1 (mono)
- **Sample Format**: `"float32"`
- **Duration**: ~30–50 ms per frame
- **Properties**: `capturedAt`, `rmsLevel`

### Security & Privacy
- **No Meeting Bot**: Captures audio locally from Windows system output without joining calls.
- **No Disk Recording**: Audio frames remain in memory for real-time streaming processing only.
- **Narrow IPC Bridge**: Renderer communicates only via context-isolated preload bridge methods (`getDesktopSourceId`, `hide`). `nodeIntegration` remains disabled.

---

## Manual Validation Matrix

The system-audio loopback implementation has been validated for the following scenarios:
1. **Google Meet (Chrome / Edge)**: Remote interviewer voice playback triggers `AudioMeter` live volume signal.
2. **Telegram Desktop Call**: Voice and video call audio captured cleanly.
3. **System / YouTube Playback**: Playback sound drives loopback meter without lag.
4. **Headphones Output**: Output audio captured when default Windows output is set to Headphones.
5. **Speakers Output**: Output audio captured when default Windows output is set to Speakers.

---

## Known Limitations

- Real STT engine (Phase 3) is not yet attached to the live audio frames.
- Real OpenAI LLM answer generation (Phase 4) is not yet attached.
- `Alt+Space` shortcut registration can fail if another application holds exclusive ownership.

---

## Phase 3 Handoff Contract (Vietnamese-first Streaming STT)

Phase 3 will attach a persistent WebSocket/streaming STT connection directly to `SystemAudioCapture` frames:
- Primary target language: **Vietnamese** (`vi-VN`) with mixed English SEO terminology (e.g., `GSC`, `GA4`, `backlink`, `Core Update`, `canonical`, `301`).
- Input format: Mono Float32Array / PCM16 audio frames emitted continuously by `AudioCapture`.
- Interface contract: `TranscriptionService` (`start(callbacks)` yielding `onPartial`, `onFinal`, `onComplete`, `onError`).
