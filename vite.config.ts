import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiPort = process.env.PORT ?? "8787";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: { "/api": `http://localhost:${apiPort}` },
  },
});
