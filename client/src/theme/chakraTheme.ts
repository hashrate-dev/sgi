import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

const appConfig = defineConfig({
  theme: {
    tokens: {
      fonts: {
        heading: { value: "\"Space Grotesk\", system-ui, -apple-system, \"Segoe UI\", sans-serif" },
        body: { value: "\"Space Grotesk\", system-ui, -apple-system, \"Segoe UI\", sans-serif" },
      },
    },
  },
});

export const chakraSystem = createSystem(defaultConfig, appConfig);
