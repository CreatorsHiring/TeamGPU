# TeamGPU Agent

Express server (port 3000) that scans local machine hardware and proxies LLM generation to Ollama.

## Run

```
npm start
```

No other scripts exist (no test, lint, or build).

## Architecture

```
src/
  index.js          # Express app, mounts routes, listens on :3000
  scanner.js        # Aggregates all hardware scanners
  cli/generate.js   # Interactive CLI client for /api/generate
  routes/
    machine.js      # GET /machine — returns hardware scan JSON
    generate.js     # POST /api/generate — proxies to Ollama
  scanners/
    gpu.js          # nvidia-smi (NVIDIA only, fails gracefully)
    cpu.js          # os.cpus()
    ram.js          # os.totalmem/freemem
    ollama.js       # checks ollama --version + HTTP :11434
  utils/exec.js     # promisified child_process.exec, returns null on failure
```

## Key details

- **ESM only** — `"type": "module"` in package.json; use `import`, not `require`.
- **Express 5** (`^5.2.1`) — not Express 4; minor API differences exist.
- **Ollama dependency** — `/api/generate` and the Ollama scanner talk to `http://127.0.0.1:11434`. If Ollama isn't running, generation fails and the scanner returns `running: false`.
- **GPU scanner** — runs `nvidia-smi` via shell; only works with NVIDIA GPUs. Returns `{ detected: false }` otherwise.
- **`utils/exec.js`** — the `run()` helper swallows errors and returns `null` on any shell failure. Callers must check for null (not try/catch).
- **No tests, no linter, no type checker.**
- **No `.env` file committed** (gitignored), but `.env` is in `.gitignore` — the project may expect env vars in the future.
