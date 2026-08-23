import { createRoot } from "react-dom/client";
import App from "./App";
import { ensureDefaultSettings } from "./lib/default-settings";
import { BUILD_ID } from "./lib/build-info";

ensureDefaultSettings();

console.info(`HOK OS · build ${BUILD_ID}`);

createRoot(document.getElementById("root")!).render(<App />);
