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

        // Default: directly start the host-selection and chat workflow!
        const { run } = await import("./commands/run.js");
        await run(null, { server });
        break;
    }
}

function printUsage() {
    console.log(`
TeamGPU CLI - Share & Use GPU Compute across your LAN

Usage:
  teamgpu                                Launch interactive chat (auto-discovers LAN laptops)
  teamgpu run [model] [--server <url>]   Chat with model on host (auto-discovers or uses URL)
  teamgpu devices                        List available TeamGPU host laptops on LAN
  teamgpu models [--server <url>]        List available models on host
  teamgpu status [--server <url>]        Display local & LAN hardware status
  teamgpu help                           Show this help message

In-Chat Commands:
  /models, /model                        Switch the active model on current host
  /hosts, /host                          Switch to a different host laptop on LAN
  /clear                                 Clear conversation history
  /status                                Show current host, GPU, and context stats
  /exit, /quit                           Exit chat
`);
}
