import { StrictMode } from "react";
import { MotionConfig } from "motion/react";
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
import "lenis/dist/lenis.css";
import "@lets-explain/core/styles/tokens.css";
import "@lets-explain/core/styles/global.css";
import "@lets-explain/core/styles/iso.css";
import "@lets-explain/core/styles/scene.css";
import { App } from "./App";
import { LangProvider } from "@lets-explain/core/i18n";
import { migrateLegacyStorage } from "@lets-explain/core/lib/storage";
import { startSmoothScroll } from "@lets-explain/core/lib/smoothScroll";

// Before anything reads storage: older Kafka-only keys move to the per-course names.
migrateLegacyStorage();

// Eased wheel and touchpad scrolling for the page, unless the reader asks for less motion.
startSmoothScroll();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* Scenes animate how things really move; people who ask for less motion get the end states. */}
    <MotionConfig reducedMotion="user">
      <LangProvider>
        <App />
      </LangProvider>
    </MotionConfig>
  </StrictMode>,
);
