# Interview Copilot

Phase 1 builds the Windows-first Electron overlay and mocked realtime UX for a Vietnamese SEO interview copilot. It intentionally does not include real system-audio capture, external speech-to-text, or OpenAI calls.

## Setup

```bash
npm install
npm run dev
```

Useful checks:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run smoke:electron
```

`npm run dev` starts Vite and launches Electron. The app registers `Alt+Space` to show or hide the overlay.

## Architecture

- `src/electron` owns the desktop shell, secure preload bridge, frameless always-on-top window, and global shortcut registration.
- `src/renderer` owns the React overlay, Zustand state machine, panels, controls, local history, and local-only presentation state.
- `src/audio` defines the future audio capture interface and a mock capture source.
- `src/transcription` defines the streaming transcription interface and a Vietnamese-first mock transcript stream with SEO English terminology.
- `src/question-detector` defines the question detector interface and a mock semantic completeness detector.
- `src/llm` defines the answer streaming interface and a mock Vietnamese answer stream.
- `src/shared` contains product data types and history helpers shared across services and UI.

Renderer security defaults are kept narrow: `contextIsolation` is enabled, `nodeIntegration` is disabled, and the preload exposes only `copilotWindow.hide()`. There is no API key or secret handling in the renderer.

## Phase 1 Behavior

Press `Listen` to start a fake Vietnamese interview question. The live transcript panel receives partial text incrementally. When the mock detector receives a complete question, the raw transcript is frozen, a cleaned question remains visible, and the answer streams underneath as an opening line, bullets, and keywords. Completed Q&A pairs are persisted to `localStorage`, capped to the latest five items.

## Known Limitations

- No real Windows WASAPI loopback capture yet.
- No real Vietnamese STT provider or vocabulary-hint evaluation yet.
- No OpenAI integration yet.
- Alt+Space registration can fail if the OS or another app already owns that shortcut.

## Recommended Phase 2 Next Steps

1. Add a Windows system-audio capture implementation behind `AudioCapture`.
2. Validate loopback capture with Google Meet and Telegram Desktop.
3. Keep microphone and system output routing explicit.
4. Add audio level diagnostics without recording by default.
5. Preserve the existing streaming event contract so the renderer remains unchanged.
