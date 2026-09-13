import { createRoot } from "react-dom/client";
import App from "./App";
import { ensureDefaultSettings } from "./lib/default-settings";
import { BUILD_ID } from "./lib/build-info";

ensureDefaultSettings();

if (typeof navigator !== "undefined" && navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().then((granted) => {
    if (granted) console.info("Storage persistente concedido — dados sobrevivem a limpeza de cookies");
    else console.warn("Storage persistente NÃO concedido — localStorage pode ser limpo com cookies");
  }).catch(() => {});
}

console.info(`HOK OS · build ${BUILD_ID}`);

createRoot(document.getElementById("root")!).render(<App />);
