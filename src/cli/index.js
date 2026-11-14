#!/usr/bin/env node

function parseArgs(rawArgs) {
    const args = rawArgs.slice(2);
    const parsed = { _: [], server: null };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === "--server" || arg === "-s") {
            parsed.server = args[++i];
        } else if (arg.startsWith("--server=")) {
            parsed.server = arg.slice(9);
        } else {
            parsed._.push(arg);
        }
    }
    return parsed;
}

const { _: positional, server } = parseArgs(process.argv);
const command = positional[0];

switch (command) {
    case "host": {
        // Enter temporary Host mode
        const { startHostMode } = await import("./commands/host.js");
        await startHostMode();
        break;
    }

    case "client": {
        // Save Client preference persistently and enter Client mode
        const { setPreferredMode } = await import("../utils/config.js");
        setPreferredMode("client");
        const { run } = await import("./commands/run.js");
        await run(null, { server });
        break;
    }

    case "run":
    case "chat": {
        const model = positional[1];
        const { run } = await import("./commands/run.js");
        await run(model, { server });
        break;
    }

    case "devices":
    case "discover": {
        const { listDevices } = await import("./commands/devices.js");
        await listDevices();
        break;
    }

    case "models": {
        const { listModels } = await import("./commands/models.js");
        await listModels({ server });
        break;
    }

    case "status": {
        const { showStatus } = await import("./commands/status.js");
        await showStatus({ server });
        break;
    }

    case "help": {
        printUsage();
        break;
    }

    default: {
        // If command is an unrecognized flag or word
        if (command && !command.startsWith("-")) {
            // Check if the user directly passed a model name: e.g. `teamgpu qwen2.5-coder:1.5b`
            const { run } = await import("./commands/run.js");
            await run(command, { server });
            break;
        }

        // Default `teamgpu`: check preferredMode in config
        const { getPreferredMode } = await import("../utils/config.js");
        const preferredMode = getPreferredMode();

        if (preferredMode === "client") {
            const { run } = await import("./commands/run.js");
            await run(null, { server });
        } else {
            const { showOnboarding } = await import("./commands/onboarding.js");
            await showOnboarding({ server });
        }
        break;
    }
}

function printUsage() {
    console.log(`
TeamGPU CLI - Share & Use GPU Compute across your LAN

Usage:
  teamgpu                                Launch interactive chat (or onboarding on first run)
  teamgpu client                         Save Client preference and connect to LAN hosts
  teamgpu host                           Start temporary Host mode (shares GPU on LAN)
  teamgpu run [model] [--server <url>]   Chat with model on host (auto-discovers or uses URL)
  teamgpu devices                        List available TeamGPU host laptops on LAN
  teamgpu models [--server <url>]        List available models on host
  teamgpu status [--server <url>]        Display local & LAN hardware status
  teamgpu help                           Show this help message

In-Chat & Selection Commands:
  /settings                              Open mode settings popup inside host selection
  /models, /model                        Switch the active model on current host
  /hosts, /host                          Switch to a different host laptop on LAN
  /clear                                 Clear conversation history
  /status                                Show current host, GPU, and context stats
  /exit, /quit                           Exit chat
`);
}
