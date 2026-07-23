# TeamGPU Agent

A lightweight Node.js service that scans your machine's hardware (GPU, CPU, RAM) and provides an API to generate text using locally-running Ollama models.

## Features

- **Hardware Detection** — Automatically detects NVIDIA GPU, CPU, and RAM details.
- **Ollama Integration** — Proxies generation requests to a local Ollama instance.
- **Machine Info Endpoint** — Returns a complete hardware profile as JSON.
- **CLI Client** — Interactive command-line tool for quick generation tests.

## Prerequisites

- **Node.js** v18+ (uses native `fetch`)
- **Ollama** — must be running on `http://127.0.0.1:11434` for generation features
- **NVIDIA GPU + nvidia-smi** — optional, for GPU detection

## Installation

```bash
git clone https://github.com/your-username/TeamGPU.git
cd TeamGPU
npm install
```

## Usage

Start the server:

```bash
npm start
```

The server listens on **port 3000** by default.

### Using the CLI

```bash
node src/cli/generate.js
```

You will be prompted for:

1. **Server URL** (default: `http://localhost:3000`)
2. **Model** (e.g., `llama3`, `mistral`)
3. **Prompt**

## API Reference

### `GET /machine`

Returns a JSON object with hardware information.

**Response:**

```json
{
  "gpu": {
    "detected": true,
    "vendor": "NVIDIA",
    "model": "RTX 3090",
    "memoryMB": 24576,
    "driverVersion": "535.104.12",
    "temperatureC": 45,
    "utilizationPercent": 12,
    "powerWatts": 35
  },
  "cpu": {
    "detected": true,
    "manufacturer": "Intel",
    "model": "12th Gen Intel(R) Core(TM) i7-12700K",
    "architecture": "x64",
    "logicalCores": 20,
    "speedMHz": 3600,
    "speedGHz": 3.6
  },
  "memory": {
    "detected": true,
    "totalBytes": 34359738368,
    "freeBytes": 17179869184,
    "usedBytes": 17179869184,
    "totalGB": 32,
    "freeGB": 16,
    "usedGB": 16
  },
  "ollama": {
    "detected": true,
    "running": true,
    "version": "0.3.4",
    "models": [
      {
        "name": "llama3",
        "size": 4739761664,
        "modifiedAt": "2024-06-20T12:00:00Z"
      }
    ]
  }
}
```

### `POST /api/generate`

Sends a generation request to the local Ollama instance.

**Request Body:**

```json
{
  "model": "llama3",
  "prompt": "Explain what a GPU is in simple terms."
}
```

**Parameters:**

| Field    | Type   | Required | Description                    |
| -------- | ------ | -------- | ------------------------------ |
| `model`  | string | Yes      | Ollama model name              |
| `prompt` | string | Yes      | The prompt to send             |

**Response:** Returns the raw Ollama response object.

**Error Responses:**

| Status | Meaning                        |
| ------ | ------------------------------ |
| `400`  | Missing `model` or `prompt`    |
| `502`  | Ollama returned an error       |
| `500`  | Internal server error          |

## Project Structure

```
TeamGPU/
├── package.json
├── src/
│   ├── index.js              # Express app entry point
│   ├── scanner.js            # Aggregates all scanner modules
│   ├── routes/
│   │   ├── machine.js        # GET /machine handler
│   │   └── generate.js       # POST /api/generate handler
│   ├── scanners/
│   │   ├── gpu.js            # NVIDIA GPU detection (nvidia-smi)
│   │   ├── cpu.js            # CPU detection (os module)
│   │   ├── ram.js            # RAM detection (os module)
│   │   └── ollama.js         # Ollama install + running check
│   ├── cli/
│   │   └── generate.js       # Interactive CLI client
│   └── utils/
│       └── exec.js           # Shell command runner
```

## How It Works

1. **Hardware Scanning** — The `GET /machine` endpoint runs each scanner (GPU, CPU, RAM, Ollama) in parallel and aggregates the results.
2. **GPU Detection** — Runs `nvidia-smi` via shell; gracefully returns `{ detected: false }` on non-NVIDIA systems or missing drivers.
3. **Generation Proxy** — `POST /api/generate` validates input, then forwards the request to Ollama's local API at `127.0.0.1:11434`.

## Notes

- The `run()` utility (`src/utils/exec.js`) swallows shell errors and returns `null` on failure. Callers must always null-check the result.
- The GPU scanner only supports NVIDIA GPUs; AMD/Intel GPU detection is not implemented.
- Ollama must be installed and running separately — this project does not manage Ollama's lifecycle.
