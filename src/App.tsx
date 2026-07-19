import { AppShell } from "@/components/shell/AppShell";
import { ThemeProvider } from "@/hooks/use-theme";
import "./index.css";

function App() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}

export default App;
