import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ChakraProvider } from "@chakra-ui/react";
import "bootstrap/dist/css/bootstrap.min.css";
import "./styles/hrs.css";
import App from "./App.tsx";
import { AppErrorBoundary } from "./components/AppErrorBoundary.tsx";
import { chakraSystem } from "./theme/chakraTheme";

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <ChakraProvider value={chakraSystem}>
        <AppErrorBoundary>
          <App />
        </AppErrorBoundary>
      </ChakraProvider>
    </StrictMode>
  );
}
