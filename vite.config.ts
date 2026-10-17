import { defineConfig } from "vite";
import { colyseus } from "colyseus/vite";
import { env } from "process";

export default defineConfig(({ mode }) => ({
    build: { outDir: "dist/client" },
    plugins: [
        ...(mode === "client" ? [] : [colyseus({ serverEntry: "/src/app.config.ts" })])
    ],
    server: {
        port: 5174,
        cors: {
            origin: env.CLIENT_URL as string,
            credentials: true
        }
    }
}));