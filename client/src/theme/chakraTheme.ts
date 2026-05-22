import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

const appConfig = defineConfig({
  theme: {
    breakpoints: {
      sm: "576px",
      md: "768px",
      lg: "992px",
      xl: "1200px",
      "2xl": "1400px",
    },
    tokens: {
      fonts: {
        heading: { value: "\"Space Grotesk\", system-ui, -apple-system, \"Segoe UI\", sans-serif" },
        body: { value: "\"Space Grotesk\", system-ui, -apple-system, \"Segoe UI\", sans-serif" },
      },
    },
  },
});

export const chakraSystem = createSystem(defaultConfig, appConfig);
