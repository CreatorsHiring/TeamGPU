# TeamGPU Product and Implementation Guide

## Goal

Build TeamGPU in two stages:

1. A terminal client that lets a user run:

   ```text
   teamgpu run qwen2.5-coder:1.5b
   ```

   The user can then enter prompts continuously, see streamed tokens, and keep conversation context.

2. A desktop application that discovers available TeamGPU laptops, displays their hardware and available models, and lets the user select a laptop and chat with its LLM.

The current project already has most of the first-stage behavior. The CLI loop in `src/cli/commands/run.js` stores user and assistant messages, sends the full conversation to `POST /api/generate`, and prints streamed Ollama tokens. The main product gap is automatic host discovery and selection instead of asking users to enter IP addresses or server URLs.

## Recommended product model: one TeamGPU installer

Do not make users install separate "host" and "client" products. Distribute one TeamGPU application, similar to Ollama's installer, containing:

- the desktop application;
- the CLI executable;
- the TeamGPU host agent;
- local configuration and diagnostics tools.

The installer should work on a normal laptop and on a GPU laptop. During first launch, the user chooses how they want to use TeamGPU:

```text
How would you like to use TeamGPU?

1. Use available laptops
   Discover and chat with models running on other TeamGPU devices.

2. Provide my laptop's GPU
   Run Ollama locally and make selected models available to approved users.
```

This is a product role, not a different binary. The user should choose one primary role during onboarding. A user can change the role later from Settings if the product eventually supports that workflow.

### What the installer should do

The installer should:

1. Install the desktop application and `teamgpu` command.
2. Install or enable the background TeamGPU agent.
3. Register a local device ID.
4. Open the onboarding screen.
5. Detect whether Ollama is installed and running.
6. Detect CPU, RAM, GPU, and available models.
7. Explain any missing prerequisite with a direct action.

Do not silently install large LLM model files. Models can be many gigabytes and require explicit user confirmation. Instead, offer buttons such as:

```text
Ollama is not installed.
[Install Ollama] [I'll install it later]
```

and:

```text
No models found.
[Browse recommended models] [Continue without hosting]
```

The TeamGPU installer should not bundle Ollama initially. Keep Ollama as a separately licensed/runtime-managed dependency, while making its installation and setup feel like part of TeamGPU onboarding. Revisit bundling only after checking licensing, update, disk-space, and GPU-driver implications.

### First-run host onboarding

If the user chooses to provide their laptop:

1. Check Ollama installation and connectivity.
2. Display detected GPU, memory, and installed models.
3. Let the user select which models are shareable.
4. Let the user choose who can access the device.
5. Start the TeamGPU host agent as a background service.
6. Show online/offline state and a stop/pause control.
7. Provide a copyable device pairing code or sign-in flow.

The host must require explicit consent before making a laptop or model available. It should also show active requests, resource usage, and a way to revoke access.

### First-run client onboarding

If the user chooses to use available laptops:

1. Sign in or enter a pairing code.
2. Load the user's authorized TeamGPU devices.
3. Show online laptops and their available models.
4. Let the user select a device and model.
5. Open a chat view with streaming responses.

If no registry account is available in the first MVP, automatically scan the local network:

```text
Searching for TeamGPU laptops...

Available laptops:
1. Gaming-PC — RTX 3090 — qwen2.5-coder:1.5b — Online
2. Workstation-A — RTX 4090 — llama3.2 — Online
```

Manual device URLs should be a developer/troubleshooting fallback, not part of the normal onboarding flow.

### CLI behavior after installation

The installed CLI should provide both a guided mode and explicit commands:

```powershell
teamgpu
teamgpu chat
teamgpu host status
teamgpu host start
teamgpu devices
teamgpu models
teamgpu settings
```

Running `teamgpu` with no arguments should open the guided terminal interface:

```text
TeamGPU

1. Chat with a laptop
2. Set up this laptop as a host
3. Show device status
4. Settings

Select an option:
```

After selecting chat, the CLI should display available laptops, their GPUs, and their models before entering the prompt loop. Advanced users can skip the menus:

```powershell
teamgpu chat --device gaming-pc --model qwen2.5-coder:1.5b
```

The existing `teamgpu run <model>` command can remain as a compatibility/developer command, with the selected server supplied by configuration or `--server`.

### Background agent versus desktop application

Treat the host agent as a separate process managed by the installer, even though it is distributed in the same installer:

```text
TeamGPU Desktop
    |
    +-- TeamGPU CLI
    |
    +-- TeamGPU Host Agent (background service)
             |
             +-- Ollama on 127.0.0.1:11434
```

This means a host laptop can continue serving requests after the desktop window is closed. The user should be able to pause or stop the agent from the desktop application, CLI, or operating-system service controls.

### Suggested packaging strategy

Use the following progression:

1. Development: npm package and `npm link`.
2. Early release: platform-specific desktop installers containing the Node runtime, CLI, desktop UI, and host agent.
3. Mature release: signed and auto-updating installers for Windows, macOS, and Linux.

The end user should not need to install Node.js or clone the repository. The website should offer one download button per operating system, not separate client and host downloads.

The downloaded application can expose the CLI on the user's `PATH`, or provide a terminal command setup step during onboarding. Make this optional on systems where modifying `PATH` requires elevated permissions.

## Current architecture

```text
Terminal client
    |
    | POST /api/generate
    v
TeamGPU server on the selected laptop
    |
    | POST http://127.0.0.1:11434/api/chat
    v
Ollama + local model + GPU
```

The server exposes:

- `GET /machine` — hardware, Ollama status, and model information.
- `POST /api/generate` — validates a model and message history, then streams Ollama's NDJSON response.

The server should remain the only component that talks directly to Ollama. Clients should never need direct access to port `11434`.

## Stage 1: Finish the terminal experience

### 1. Discover hosts automatically

The normal user must not need to know a host's IP address, port, or URL. TeamGPU should:

1. Give each host a stable device ID and display name.
2. Advertise the host on the local network using a discovery protocol such as mDNS/DNS-SD.
3. Have the client listen for TeamGPU host announcements.
4. Query each discovered host's health and machine metadata.
5. Show only reachable hosts with their GPU and available models.
6. Store the selected device ID, not a hardcoded IP address.
7. refresh the resolved address when the host's DHCP address changes.

The client flow should be:

```text
teamgpu
  -> Discovering TeamGPU laptops...
  -> Choose a laptop
  -> Choose an available model
  -> Chat
```

The client may use an IP address internally, but that detail must be hidden from the user.

For devices on different networks, local discovery is insufficient. Use a central authenticated registry or relay: hosts make outbound connections to the registry, and clients retrieve the authorized device list by stable device ID. Do not attempt to discover arbitrary public IP addresses.

### 2. Verify the selected server before chatting

Before entering the prompt loop:

1. Request `GET /machine`.
2. Confirm the server is reachable.
3. Confirm Ollama is running.
4. Confirm the requested model is available.
5. Print actionable errors if any check fails.

For example, distinguish between:

- server unreachable;
- Ollama not running;
- model missing;
- invalid model name;
- network permission or firewall failure.

Do not silently fall back to another laptop or model.

### 3. Preserve the conversation loop

For each user prompt:

1. Add a `user` message to the local history.
2. Send the complete history with the selected model.
3. Read the NDJSON response incrementally.
4. Print each `message.content` token immediately.
5. Accumulate the complete assistant response.
6. Add that assistant response to the history only after the stream completes.
7. Prompt for the next user message.

The existing commands should remain:

- `/exit` or `/quit` — close the client.
- `/clear` — remove local conversation history.

Add these useful commands later:

- `/status` — show selected server, model, and connection status.
- `/models` — refresh and display models on the selected server.
- `/help` — show available commands.

### 4. Handle failures without corrupting context

If a request fails or the stream ends unexpectedly:

- report the HTTP or connection error;
- remove the unsent user message from local history;
- do not add a partial assistant response as a completed message;
- allow the user to retry or exit.

If the server supports cancellation, connect `Ctrl+C` or an abort action to the active request. Otherwise, make sure the CLI exits cleanly and closes its readline interface.

### 5. Package and distribute the CLI

The `bin` entry in `package.json` maps the `teamgpu` command to `src/cli/index.js`. Make the CLI installable and document one supported installation path:

- local development: `npm link`;
- published package: `npm install --global teamgpu-agent`;
- later: signed standalone binaries for Windows, macOS, and Linux.

The package should not require users to understand the repository layout. Add a supported configuration method for the default server URL and document Node.js requirements.

## Stage 1 API contract

Keep the generation request shaped like this:

```json
{
  "model": "qwen2.5-coder:1.5b",
  "messages": [
    {
      "role": "user",
      "content": "Write a JavaScript function that reverses a string."
    }
  ],
  "stream": true
}
```

The server sends the request to Ollama's chat API with `stream: true` and forwards the NDJSON chunks.

The client should treat the response as a stream, not as one JSON document. A typical chunk contains:

```json
{
  "message": {
    "role": "assistant",
    "content": "function"
  },
  "done": false
}
```

The complete conversation context is currently held in the client process. This is appropriate for the first version. Later, add optional conversation IDs and server-side persistence rather than sending unlimited history forever.

## Networking plan

### Local network first

For the first remote version:

1. Run TeamGPU on the laptop with the GPU.
2. Bind the server to a network-accessible interface instead of only loopback if required.
3. Open only the TeamGPU port, normally `3000`, in the host firewall.
4. Let the TeamGPU client discover the laptop automatically.
5. Keep Ollama bound to `127.0.0.1:11434`.

Never expose Ollama directly to the LAN or internet.

### Authentication before internet access

The current API has no authentication. Before allowing access beyond a trusted local network, add:

- API keys or short-lived access tokens;
- TLS/HTTPS;
- request size limits;
- rate limiting;
- origin and host validation;
- structured request logging without logging prompt contents by default;
- model allowlists and configurable resource limits.

Do not rely on an obscure port or a private IP as security.

## Stage 2: Device discovery and desktop application

### Device agent responsibilities

Each laptop running TeamGPU should provide:

- stable device ID;
- display name;
- operating system and agent version;
- CPU and RAM details;
- GPU vendor, model, memory, and utilization;
- Ollama availability;
- installed model names and status;
- health/last-seen timestamp;
- authenticated chat endpoint.

Extend `GET /machine` or add a versioned endpoint such as `GET /api/v1/device`.

### Discovery options

Implement discovery in increasing order of complexity:

1. LAN discovery using mDNS/DNS-SD.
2. Saved devices by stable device ID.
3. A small authenticated coordination service for devices across networks.
4. A secure relay for hosts that cannot accept inbound connections.

For cross-network access, use an authenticated relay or private VPN rather than exposing every laptop directly.

### Desktop UI flow

The dashboard should:

1. Sign the user in or establish a local profile.
2. Discover or load registered laptops.
3. Show each laptop's online status, GPU, RAM, and available models.
4. Let the user select a laptop.
5. Let the user select an installed model.
6. Open a chat view.
7. Stream tokens into the assistant message as they arrive.
8. Preserve conversation history per device/model conversation.
9. Allow stopping generation, clearing context, and switching devices.

Show connection and generation state explicitly: connecting, generating, completed, interrupted, unavailable, and error.

### Suggested desktop architecture

Use a desktop shell such as Electron or Tauri only after the HTTP API and CLI contracts are stable.

```text
Desktop UI
    |
    v
Device registry/discovery + authenticated HTTP client
    |
    +--> Laptop A TeamGPU agent --> Ollama/GPU
    +--> Laptop B TeamGPU agent --> Ollama/GPU
    +--> Laptop C TeamGPU agent --> Ollama/GPU
```

Keep the device agent and desktop UI separately deployable. A laptop should be able to serve requests without having the desktop application open.

## Conversation and context design

Start with client-owned context:

```text
conversation = [
  { role: "user", content: "..." },
  { role: "assistant", content: "..." }
]
```

For a production version:

- assign every conversation an ID;
- store messages locally in the desktop client;
- optionally persist them on the selected device;
- cap history by token count, not message count;
- summarize older messages when the context window becomes large;
- never mix histories between models or devices;
- clearly label which device generated each response.

The selected device's model determines the available context window and generation settings. The client should eventually fetch model capabilities before choosing a history limit.

## Recommended implementation order

1. Add `/machine` preflight checks.
2. Improve streaming error and cancellation handling.
3. Add `/status`, `/models`, and `/help`.
4. Add stable host identity and machine metadata.
5. Add LAN discovery with mDNS/DNS-SD.
6. Build automatic laptop/model selection in the CLI.
7. Add authentication and HTTPS for non-trusted networks.
8. Version the API under `/api/v1`.
9. Build multi-device selection in a desktop prototype.
10. Add a secure cross-network registry/relay.
12. Package signed desktop and CLI releases.

## Acceptance criteria

### Terminal MVP

- `teamgpu run qwen2.5-coder:1.5b` starts an interactive loop.
- The target server can be on another laptop.
- Prompts produce visible streamed tokens.
- Follow-up prompts use the prior conversation context.
- `/clear` starts a new context.
- `/exit` exits cleanly.
- Missing server, Ollama, or model produces a useful error.
- A failed request does not leave invalid messages in the history.

### Desktop MVP

- At least two registered laptops can be displayed.
- Each device shows online status, GPU information, and available models.
- The user can select a device and model.
- Chat responses stream into the selected conversation.
- Conversations remain isolated by device and model.
- Unauthenticated internet access is not supported.
