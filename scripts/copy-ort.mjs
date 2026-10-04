// Copies the onnxruntime-web WASM runtime into public/ort so TrailNet works
// from our own origin (and offline once cached). Runs before dev/build.
import { copyFileSync, mkdirSync } from 'node:fs';
const src = 'node_modules/onnxruntime-web/dist/';
mkdirSync('public/ort', { recursive: true });
for (const f of ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) copyFileSync(src + f, 'public/ort/' + f);
console.log('onnxruntime-web runtime copied to public/ort');
