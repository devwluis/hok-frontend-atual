import { useEffect } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ThemeProvider } from "@/hooks/use-theme";
import { TerminalProvider } from "@/hooks/use-terminal";
import { hydrateFromServer } from "@/lib/conversations-store";
import "./index.css";

function App() {
  useEffect(() => {
    hydrateFromServer();
  }, []);

  return (
    <ThemeProvider>
      <TerminalProvider>
        <AppShell />
      </TerminalProvider>
    </ThemeProvider>
  );
}

export default App;
