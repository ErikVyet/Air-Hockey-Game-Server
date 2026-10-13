import { defineConfig } from "vite";
import { colyseus } from "colyseus/vite";

export default defineConfig(({ mode }) => ({
    build: { outDir: "dist/client" },
    plugins: [
        ...(mode === "client" ? [] : [colyseus({ serverEntry: "/src/app.config.ts" })])
    ],
    server: {
        port: 5174,
        cors: {
            origin: "http://localhost:5173",
            credentials: true
        }
    }
}));