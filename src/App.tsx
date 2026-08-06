import { useEffect } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ThemeProvider } from "@/hooks/use-theme";
import { hydrateFromServer } from "@/lib/conversations-store";
import "./index.css";

function App() {
  useEffect(() => {
    hydrateFromServer();
  }, []);

  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}

export default App;
