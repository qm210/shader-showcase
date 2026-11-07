import { defineConfig } from "vite";
import glslImport from "./plugin/vite-plugin-glsl/index.js";

const HOST_LOCAL_NETWORK = true;

export default defineConfig({
    plugins: [glslImport({
        minify: false,
        keepAllComments: true,
    })],
    assetsInclude: ['src/textures/**/*.png'],
    test: {
        globals: true,
        environment: "happy-dom"
    },
    server: HOST_LOCAL_NETWORK ? {
        host: '0.0.0.0',
        port: 5173,
        strictPort: true,
    } : {
        host: true,
        port: 5173,
    }
});
