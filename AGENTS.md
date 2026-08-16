# TeamGPU Agent

Express server (port 3000) that scans local hardware and proxies LLM generation to a local Ollama instance.

## Run

```
npm start
```

Requires Node 18+ (native `fetch` and stream readers used throughout). `npm start` is the only script — no test, lint, or build.

## Architecture

```
src/
  index.js           # Express app; mounts routers at /machine and /api/generate; listens :3000
  scanner.js         # Aggregates scanners (plain sequential awaits, despite README's "parallel" claim)
  routes/machine.js  # GET /machine — returns scan JSON
  routes/generate.js # POST /api/generate — streaming NDJSON proxy to Ollama
  scanners/
    gpu.js           # nvidia-smi (NVIDIA only; returns { detected:false } otherwise)
    cpu.js           # os.cpus()
    ram.js           # os.totalmem()/freemem()
    ollama.js        # `ollama --version` + HTTP GET /api/tags on :11434
  utils/exec.js      # promisified child_process.exec; returns null on any shell failure
  cli/
    index.js         # Unfinished dispatcher — imports ./commands/run.js|models.js|status.js which DON'T exist; not wired into package.json. Do not treat as runnable.
    generate.js      # Non-interactive flag-driven client (--server/--model/--prompt). README's "interactive CLI" description is stale.
```

## Key details

- **ESM only** — `"type": "module"` in package.json; use `import`, not `require`.
- **Express 5** (`^5.2.1`), not Express 4.
- **Ollama at `http://127.0.0.1:11434`** — must be running for generation; scanner checks `/api/tags`, the proxy posts to `/api/generate`.
- **`/api/generate` is a streaming proxy** — forwards `{ model, prompt, stream: true }`, sets `Content-Type: application/x-ndjson`, pipes Ollama's chunk stream through; Ollama's raw HTTP status is passed through (not hardcoded).
- **GPU scanner** — shell runs `nvidia-smi` with `--format=csv,noheader,nounits` and splits on `,`; parses by exact column order. NVIDIA-only.
- **`utils/exec.js` `run()`** — swallows errors, returns `null` on shell failure; callers must null-check (not try/catch).
- **`.env` is gitignored** but not currently used by the app.
- **README lags the code** (CLI interactivity, response shape, parallelism); code is authoritative.