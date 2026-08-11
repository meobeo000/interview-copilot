/// <reference types="vite/client" />

interface Window {
  copilotWindow: {
    hide: () => Promise<void>;
  };
}
