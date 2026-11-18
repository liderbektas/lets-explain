import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/baloo-2/600.css";
import "@fontsource/baloo-2/700.css";
import "@fontsource/baloo-2/800.css";
import "@fontsource/nunito/400.css";
import "@fontsource/nunito/600.css";
import "@fontsource/nunito/700.css";
import "@fontsource/nunito/800.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import "@fontsource/jetbrains-mono/800.css";
import "@lets-explain/core/styles/tokens.css";
import "@lets-explain/core/styles/global.css";
import "@lets-explain/core/styles/iso.css";
import "@lets-explain/core/styles/scene.css";
import { App } from "./App";
import { LangProvider } from "@lets-explain/core/i18n";
import { migrateLegacyStorage } from "@lets-explain/core/lib/storage";

// Before anything reads storage: older Kafka-only keys move to the per-course names.
migrateLegacyStorage();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LangProvider>
      <App />
    </LangProvider>
  </StrictMode>,
);
