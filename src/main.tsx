import { createRoot } from "react-dom/client";
import App from "./App";
import { ensureDefaultSettings } from "./lib/default-settings";

ensureDefaultSettings();

createRoot(document.getElementById("root")!).render(<App />);
