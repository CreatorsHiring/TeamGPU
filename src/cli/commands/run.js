import readline from "node:readline";
import { discoverHosts, probeHost } from "../../discovery/client.js";
import {
    colors,
    printSplash,
    promptHostInput,
    promptModelInput,
    printModelPicker,
    printChatTopBar,
    printUserMessage,
    printAssistantMeta,
    renderChatInputCard,
    getPromptPrefix,
    getCardLeftPad
} from "../tui.js";
import { runChatInterface } from "../chatTui.js";

function createInterface() {
    return readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
}

function ask(rl, question) {
    return new Promise(resolve => {
        rl.question(question, (answer) => {
            process.stdout.write(colors.reset);
            resolve(answer);
        });
    });
}

/**
 * Prompts user to select an available host using OpenCode layout.
 */
async function selectHostPrompt(rl, { directServer = null } = {}) {
    if (directServer) {
        console.log(`Connecting directly to: ${colors.orange}${directServer}${colors.reset}`);
        const probed = await probeHost(directServer, 3000);
        if (!probed) {
            console.error(`\n${colors.red}[Error] Unable to reach TeamGPU server at ${directServer}${colors.reset}`);
            return null;
        }
        return probed;
    }

    let hosts = null;

    while (true) {
        if (!hosts) {
            console.log(`\n${colors.dim}Scanning local network for TeamGPU laptops...${colors.reset}`);
            hosts = await discoverHosts({ timeoutMs: 2000 });
        }

        const answer = await promptHostInput(rl, hosts);
        if (answer === "__TEAMGPU_SWITCH_TO_HOST__") {
            return { action: "switch_host" };
        }
        const trimmed = (answer || "").trim();

        if (hosts.length === 0) {
            hosts = null;
            const act = trimmed.toLowerCase();
            if (act === "r" || act === "") {
                continue;
            } else if (act === "m") {
                const promptPrefix = getPromptPrefix();
                const urlInput = await ask(rl, `${promptPrefix}Host URL (e.g. http://192.168.0.5:3000): `);
                if (urlInput.trim()) {
                    const probed = await probeHost(urlInput.trim(), 3000);
                    if (probed) return probed;
                    console.log(`\n${colors.red}Could not reach specified host.${colors.reset}`);
                    await new Promise(r => setTimeout(r, 1200));
                }
            } else {
                return null;
            }
            continue;
        }

        const num = parseInt(trimmed, 10);
        if (!isNaN(num) && num >= 1 && num <= hosts.length) {
            return hosts[num - 1];
        }

        const leftPad = getCardLeftPad();
        console.log(`\n${leftPad}${colors.red}Invalid choice. Enter a number between 1 and ${hosts.length}.${colors.reset}`);
        await new Promise(r => setTimeout(r, 1200));
    }
}

/**
 * Prompts user to select a model on the chosen host using OpenCode layout.
 */
async function selectModelPrompt(rl, host, currentModel = null) {
    const refreshed = await probeHost(host.url, 2000);
    const models = refreshed?.models || host.models || [];
    const promptPrefix = getPromptPrefix();

    if (models.length === 0) {
        console.log(`\n${colors.yellow}No models found installed on ${host.name}.${colors.reset}`);
        const manual = await ask(rl, `${promptPrefix}Model name: `);
        return manual.trim() || currentModel || null;
    }

    const defaultIdx = 1;

    while (true) {
        const answer = await promptModelInput(rl, host, models);
        const trimmed = (answer || "").trim();

        if (!trimmed) {
            if (currentModel) return currentModel;
            return models[defaultIdx - 1];
        }

        const num = parseInt(trimmed, 10);
        if (!isNaN(num) && num >= 1 && num <= models.length) {
            return models[num - 1];
        }

        if (trimmed.length > 0 && isNaN(num)) {
            return trimmed;
        }

        const leftPad = getCardLeftPad();
        console.log(`\n${leftPad}${colors.red}Invalid selection. Enter a number between 1 and ${models.length}.${colors.reset}`);
        await new Promise(r => setTimeout(r, 1200));
    }
}

/**
 * Main interactive run & chat loop.
 */
export async function run(initialModel = null, options = {}) {
    const rl = createInterface();
    const directServer = options.server || process.env.TEAMGPU_SERVER || null;

    try {
        // 1. Host selection (OpenCode Splash)
        let currentHost = await selectHostPrompt(rl, { directServer });
        if (!currentHost) {
            console.log("\nNo host selected. Exiting.");
            return;
        }

        if (currentHost.action === "switch_host") {
            const { startHostMode } = await import("./host.js");
            await startHostMode();
            return;
        }

        // 2. Model selection (OpenCode Model Picker)
        let currentModel = initialModel;
        if (!currentModel) {
            currentModel = await selectModelPrompt(rl, currentHost);
            if (!currentModel) {
                console.log("\nNo model selected. Exiting.");
                return;
            }
        }

        // Preflight validation
        if (currentHost.ollama && !currentHost.ollama.running) {
            console.log(`\n${colors.yellow}⚠ Warning: Ollama is detected but not currently running on '${currentHost.name}'. Responses may fail.${colors.reset}\n`);
            await new Promise(r => setTimeout(r, 1500));
        }

        // 3. OpenCode Split-Pane Chat Interface
        await runChatInterface({
            rl,
            initialHost: currentHost,
            initialModel: currentModel,
            selectHostPrompt,
            selectModelPrompt
        });
    } finally {
        rl.close();
    }
}
