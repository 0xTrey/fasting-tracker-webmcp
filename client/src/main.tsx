import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from './App';
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App/>
  </StrictMode>,
);

// Keep installed iPhone/PWA copies on the current release after a deployment.
if ("serviceWorker" in navigator && import.meta.env.DEV) {
  void navigator.serviceWorker.getRegistrations()
    .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
    .catch(() => undefined);
}

if ("serviceWorker" in navigator && !import.meta.env.DEV) {
  let isReloadingForUpdate = false;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (isReloadingForUpdate) return;
    isReloadingForUpdate = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch((error: unknown) => {
        console.error("Service Worker registration failed:", error);
      });
  });
}
