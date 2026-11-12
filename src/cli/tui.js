import readline from "node:readline";

/**
 * TeamGPU TUI - OpenCode Style Theme
 *
 * Implements OpenCode-inspired minimalist aesthetic with fire/orange styling:
 * - Centered block branding with white 'Team' and fiery 'GPU'
 * - Clean vertical orange-bar (▌) text areas with lighter background shading
 * - Centered input cards where user types directly at the card's column
 * - User message blocks with orange accent bars and shaded backgrounds
 * - Metrics footer: "<model> · 467ms · 22.5 tok/s" (no 'Build', no 'Ollama')
 */

export const colors = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    dim: "\x1b[2;37m",
    white: "\x1b[1;97m",
    orange: "\x1b[1;38;2;255;125;0m",
    cyan: "\x1b[38;2;80;200;255m",
    green: "\x1b[1;38;2;40;220;120m",
    yellow: "\x1b[1;38;2;255;225;40m",
    amber: "\x1b[1;38;2;255;170;20m",
    flame: "\x1b[1;38;2;255;65;10m",
    red: "\x1b[1;38;2;225;25;15m",
    tabBg: "\x1b[7m",
    cardBg: "\x1b[48;2;34;36;44m" // Lighter dark-slate background
};

const TEAM_ASCII = [
    "████████╗███████╗ █████╗ ███╗   ███╗",
    "╚══██╔══╝██╔════╝██╔══██╗████╗ ████║",
    "   ██║   █████╗  ███████║██╔████╔██║",
    "   ██║   ██╔══╝  ██╔══██║██║╚██╔╝██║",
    "   ██║   ███████╗██║  ██║██║ ╚═╝ ██║",
    "   ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝"
];

const GPU_ASCII = [
    " ██████╗ ██████╗ ██╗   ██╗",
    "██╔════╝ ██╔══██╗██║   ██║",
    "██║  ███╗██████╔╝██║   ██║",
    "██║   ██║██╔═══╝ ██║   ██║",
    "╚██████╔╝██║     ╚██████╔╝",
    " ╚═════╝ ╚═╝      ╚═════╝ "
];

/**
 * Strips ANSI codes to compute visible character length.
 */
export function stripAnsi(str) {
    return str.replace(/\x1b\[[0-9;]*m/g, "");
}

/**
 * Returns current terminal width (minimum 72).
 */
export function getTerminalWidth() {
    return Math.max(72, process.stdout.columns || 80);
}

/**
 * Returns terminal dimensions.
 */
export function getTerminalDimensions() {
    return {
        rows: process.stdout.rows || 24,
        cols: Math.max(72, process.stdout.columns || 80)
    };
}

/**
 * Returns the card width for text areas.
 */
export function getCardWidth(termWidth = getTerminalWidth()) {
    return Math.min(termWidth - 8, 68);
}

/**
 * Returns leading spaces to center cards horizontally.
 */
export function getCardLeftPad(termWidth = getTerminalWidth()) {
    const cardWidth = getCardWidth(termWidth);
    return " ".repeat(Math.max(2, Math.floor((termWidth - cardWidth) / 2)));
}

/**
 * Centers text on the screen.
 */
export function centerText(str, width = getTerminalWidth()) {
    const len = stripAnsi(str).length;
    const pad = Math.max(0, Math.floor((width - len) / 2));
    return " ".repeat(pad) + str;
}

/**
 * Renders a single row of the shaded card with an orange left accent bar.
 */
export function renderCardLine(content = "") {
    const cardWidth = getCardWidth();
    const leftPad = getCardLeftPad();
    const visLen = stripAnsi(content).length;
    const padding = Math.max(0, cardWidth - 3 - visLen);

    return `${leftPad}${colors.orange}▌${colors.cardBg} ${content}${" ".repeat(padding)} ${colors.reset}`;
}

/**
 * Returns the prompt prefix string for readline so typing starts centered inside the shaded card.
 */
export function getPromptPrefix() {
    const leftPad = getCardLeftPad();
    return `${leftPad}${colors.orange}▌${colors.cardBg} ${colors.white}`;
}

/**
 * Applies horizontal fire gradient (Yellow -> Orange -> Red) across text.
 */
export function colorFire(text) {
    let out = "";
    const len = text.length;

    for (let i = 0; i < len; i++) {
        const char = text[i];
        if (char === " ") {
            out += " ";
            continue;
        }

        const ratio = i / Math.max(1, len - 1);
        const g = Math.round(230 * (1 - ratio) + 25 * ratio);
        const b = Math.round(35 * (1 - ratio));

        out += `\x1b[1;38;2;255;${g};${b}m${char}`;
    }

    return out + colors.reset;
}

/**
 * Prints the centered TeamGPU branding logo.
 */
export function printCenteredLogo() {
    const width = getTerminalWidth();

    console.log();
    for (let r = 0; r < TEAM_ASCII.length; r++) {
        const line = colors.white + TEAM_ASCII[r] + colors.reset + " " + colorFire(GPU_ASCII[r]);
        console.log(centerText(line, width));
    }
    console.log();
}

/**
 * Formats GPU specs nicely.
 */
export function formatGPU(gpu) {
    if (!gpu || !gpu.detected) {
        return `${colors.dim}No dedicated GPU${colors.reset}`;
    }
    const memGB = gpu.memoryMB ? (gpu.memoryMB / 1024).toFixed(1) + " GB" : "Unknown VRAM";
    const util = gpu.utilizationPercent !== undefined ? ` | Util: ${gpu.utilizationPercent}%` : "";
    return `${colors.yellow}${gpu.model || "NVIDIA GPU"}${colors.reset} ${colors.dim}(${memGB}${util})${colors.reset}`;
}

/**
 * Renders an OpenCode-style shaded text card with orange left bar.
 */
export function renderOpenCodeCard({ placeholder, meta }) {
    console.log(renderCardLine(""));
    console.log(renderCardLine(`${colors.dim}${placeholder}${colors.reset}`));
    if (meta) {
        console.log(renderCardLine(meta));
    }
    console.log(renderCardLine(""));

    const cardWidth = getCardWidth();
    const leftPadLen = getCardLeftPad().length;
    const hint = `${colors.dim}enter select   ctrl+c exit${colors.reset}`;
    const hintPad = " ".repeat(Math.max(2, leftPadLen + cardWidth - stripAnsi(hint).length));
    console.log(`${hintPad}${hint}\n`);
}

/**
 * Renders the entire splash screen composition vertically and horizontally centered as one group.
 *
 * Composition structure:
 * 1. TeamGPU ASCII logo (6 lines)
 * 2. Spacing (1 line)
 * 3. "Available Host Laptops on LAN:" heading (1 line)
 * 4. Spacing (1 line)
 * 5. Available hosts info (hosts.length lines, or 2 lines if empty)
 * 6. Spacing (1 line)
 * 7. OpenCode-inspired input card:
 *    - Card line 1 (top padding inside card): 1 line
 *    - Card line 2 (input line with placeholder or typed text): 1 line
 *    - Card line 3 (bottom padding inside card): 1 line
 * 8. Keyboard hint line below the card: 1 line
 *
 * Total lines = 6 + 1 + 1 + 1 + (hosts.length === 0 ? 2 : hosts.length) + 1 + 3 + 1
 */
export function renderSplashComposition({ hosts = [], inputVal = "" } = {}) {
    const { rows, cols } = getTerminalDimensions();
    const hostLinesCount = hosts.length === 0 ? 2 : hosts.length;
    const contentLines = 6 + 1 + 1 + 1 + hostLinesCount + 1 + 3 + 1;
    const topPad = Math.max(0, Math.floor((rows - contentLines) / 2));

    const cardWidth = getCardWidth(cols);
    const leftPad = getCardLeftPad(cols);

    console.clear();
    if (topPad > 0) {
        process.stdout.write("\n".repeat(topPad));
    }

    // 1. TeamGPU ASCII logo (centered horizontally)
    for (let r = 0; r < TEAM_ASCII.length; r++) {
        const line = colors.white + TEAM_ASCII[r] + colors.reset + " " + colorFire(GPU_ASCII[r]);
        console.log(centerText(line, cols));
    }
    console.log();

    // 2. Heading
    console.log(centerText(`${colors.dim}Available Host Laptops on LAN:${colors.reset}`, cols));
    console.log();

    // 3. Hosts or fallback message
    if (hosts.length === 0) {
        console.log(centerText(`${colors.yellow}No TeamGPU host laptops found on local network.${colors.reset}`, cols));
        console.log(centerText(`${colors.dim}Make sure 'npm start' is running on the host laptop.${colors.reset}`, cols));
    } else {
        hosts.forEach((h, idx) => {
            const indexStr = `${colors.yellow}[${idx + 1}]${colors.reset} ${colors.white}${colors.bold}${h.name}${colors.reset}`;
            const gpuStr = formatGPU(h.gpu);
            const modelsCount = `${colors.cyan}${h.models?.length || 0} models${colors.reset}`;
            const statusStr = h.ollama?.running
                ? `${colors.green}● Online${colors.reset}`
                : `${colors.dim}○ Offline${colors.reset}`;

            const hostLine = `${indexStr} ${colors.dim}·${colors.reset} ${gpuStr} ${colors.dim}·${colors.reset} ${modelsCount} ${colors.dim}·${colors.reset} ${statusStr}`;
            console.log(centerText(hostLine, cols));
        });
    }
    console.log();

    // 4. Host-selection input card
    const placeholder = hosts.length === 0
        ? "[r] Retry | [m] Enter URL manually | [q] Quit"
        : `Select host index [1-${hosts.length}] (default 1)...`;

    renderInputCard({ inputVal, placeholder, cardWidth, leftPad });
}

/**
 * Renders the 3-row OpenCode-style input card with orange left accent bar,
 * full-width dark-grey background on all rows, right-aligned hints,
 * and repositions the cursor on the input row.
 */
export function renderInputCard({ inputVal = "", placeholder = "", cardWidth, leftPad }) {
    const cardPadding = Math.max(0, cardWidth - 3);

    // Card Line 1 (top padding inside card)
    process.stdout.write(`${leftPad}${colors.orange}▌${colors.cardBg} ${" ".repeat(cardPadding)} ${colors.reset}\n`);

    // Card Line 2 (input line with placeholder or typed text)
    // Note: colors.reset is placed ONLY after trailing spaces so cardBg background remains continuous across the whole card
    if (!inputVal) {
        const text = `${colors.dim}${placeholder}`;
        const visLen = stripAnsi(placeholder).length;
        const p = Math.max(0, cardWidth - 3 - visLen);
        process.stdout.write(`${leftPad}${colors.orange}▌${colors.cardBg} ${text}${" ".repeat(p)} ${colors.reset}\n`);
    } else {
        const text = `${colors.white}${inputVal}`;
        const visLen = inputVal.length;
        const p = Math.max(0, cardWidth - 3 - visLen);
        process.stdout.write(`${leftPad}${colors.orange}▌${colors.cardBg} ${text}${" ".repeat(p)} ${colors.reset}\n`);
    }

    // Card Line 3 (bottom padding inside card)
    process.stdout.write(`${leftPad}${colors.orange}▌${colors.cardBg} ${" ".repeat(cardPadding)} ${colors.reset}\n`);

    // 5. Keyboard hints below the input card
    const hint = `${colors.dim}enter select   ctrl+c exit${colors.reset}`;
    const hintLen = stripAnsi(hint).length;
    const hintPad = " ".repeat(Math.max(2, leftPad.length + cardWidth - hintLen));
    process.stdout.write(`${hintPad}${hint}`);

    // Reposition cursor directly inside the card on Card Line 2!
    // Hints line has no trailing newline; move up 2 lines (Card Line 3 -> Card Line 2).
    // Move horizontally to column: leftPad.length + 3 + inputVal.length (1-based index)
    const cursorCol = leftPad.length + 3 + inputVal.length;
    process.stdout.write(`\x1b[2A\r\x1b[${cursorCol}G`);
}

/**
 * Renders the entire model-selection composition centered horizontally and vertically as one group.
 *
 * Composition structure:
 * 1. TeamGPU ASCII logo (6 lines)
 * 2. Spacing (1 line)
 * 3. "Available Models on HOSTNAME:" heading (1 line)
 * 4. Spacing (1 line)
 * 5. Available models list in two-column layout (Math.ceil(models.length / 2) lines)
 * 6. Spacing (1 line)
 * 7. Model-selection input card (3 lines: top padding, input line, bottom padding)
 * 8. Keyboard hints below card (1 line)
 */
export function renderModelComposition({ host = {}, models = [], inputVal = "" } = {}) {
    const { rows, cols } = getTerminalDimensions();
    const modelRowsCount = models.length === 0 ? 1 : Math.ceil(models.length / 2);
    const contentLines = 6 + 1 + 1 + 1 + modelRowsCount + 1 + 3 + 1;
    const topPad = Math.max(0, Math.floor((rows - contentLines) / 2));

    const cardWidth = getCardWidth(cols);
    const leftPad = getCardLeftPad(cols);

    console.clear();
    if (topPad > 0) {
        process.stdout.write("\n".repeat(topPad));
    }

    // 1. TeamGPU ASCII logo (centered horizontally)
    for (let r = 0; r < TEAM_ASCII.length; r++) {
        const line = colors.white + TEAM_ASCII[r] + colors.reset + " " + colorFire(GPU_ASCII[r]);
        console.log(centerText(line, cols));
    }
    console.log();

    // 2. Heading: "Available Models on HOSTNAME:"
    const hostName = host.name || "Host";
    console.log(centerText(`${colors.dim}Available Models on ${colors.reset}${colors.white}${colors.bold}${hostName}${colors.reset}:`, cols));
    console.log();

    // 3. Models list in two columns (centered as a group)
    if (models.length === 0) {
        console.log(centerText(`${colors.yellow}No models found installed on ${hostName}.${colors.reset}`, cols));
    } else {
        const modelItems = models.map((m, idx) => {
            return `${colors.yellow}[${idx + 1}]${colors.reset} ${colors.white}${m}${colors.reset}`;
        });

        let leftColMaxLen = 0;
        for (let i = 0; i < modelItems.length; i += 2) {
            const len = stripAnsi(modelItems[i]).length;
            if (len > leftColMaxLen) leftColMaxLen = len;
        }

        let rightColMaxLen = 0;
        for (let i = 1; i < modelItems.length; i += 2) {
            const len = stripAnsi(modelItems[i]).length;
            if (len > rightColMaxLen) rightColMaxLen = len;
        }

        const colSpacing = 6;
        const maxRowWidth = rightColMaxLen > 0
            ? leftColMaxLen + colSpacing + rightColMaxLen
            : leftColMaxLen;

        const groupPad = " ".repeat(Math.max(0, Math.floor((cols - maxRowWidth) / 2)));

        for (let i = 0; i < modelItems.length; i += 2) {
            const item1 = modelItems[i];
            const item2 = modelItems[i + 1];
            if (item2) {
                const vis1 = stripAnsi(item1).length;
                const sp = " ".repeat(leftColMaxLen - vis1 + colSpacing);
                console.log(`${groupPad}${item1}${sp}${item2}`);
            } else {
                console.log(`${groupPad}${item1}`);
            }
        }
    }
    console.log();

    // 4. Model-selection input card
    const placeholder = `Select model index [1-${models.length}] (default 1)...`;
    renderInputCard({ inputVal, placeholder, cardWidth, leftPad });
}

/**
 * Shared interactive input loop for selection screens (host and model selection).
 * - Full-width dark-grey background on all 3 rows
 * - Cursor positioned on the input row
 * - Visual-only placeholder that disappears upon typing
 * - Re-renders dynamically on terminal resize
 * - Enter defaults to defaultVal
 * - Clean Ctrl+C exit
 */
export function promptSelectionInput({ render, defaultVal = "1", rl = null }) {
    return new Promise((resolve) => {
        let inputVal = "";

        const isTTY = Boolean(process.stdin.isTTY && typeof process.stdin.setRawMode === "function");

        if (!isTTY) {
            render(inputVal);
            process.stdout.write("\x1b[2B\r\n");
            if (rl) {
                rl.question("", (ans) => {
                    resolve(ans.trim() || defaultVal);
                });
            } else {
                const tempRl = readline.createInterface({ input: process.stdin, output: process.stdout });
                tempRl.question("", (ans) => {
                    tempRl.close();
                    resolve(ans.trim() || defaultVal);
                });
            }
            return;
        }

        if (rl) {
            rl.pause();
        }
        readline.emitKeypressEvents(process.stdin);
        if (typeof process.stdin.setRawMode === "function") {
            process.stdin.setRawMode(true);
        }
        process.stdin.resume(); // Ensure stdin actively flows and keeps the event loop alive
        process.stdout.write("\x1b[?25h");

        render(inputVal);

        const onResize = () => {
            render(inputVal);
        };
        process.stdout.on("resize", onResize);

        const onKey = (str, key) => {
            if (key && key.ctrl && key.name === "c") {
                cleanup();
                process.stdout.write("\x1b[2B\r\n\x1b[?25h");
                process.exit(0);
            }

            if (key && (key.name === "return" || key.name === "enter")) {
                cleanup();
                process.stdout.write("\x1b[2B\r\n");
                resolve(inputVal.trim() || defaultVal);
                return;
            }

            if (key && (key.name === "backspace" || key.name === "delete")) {
                if (inputVal.length > 0) {
                    inputVal = inputVal.slice(0, -1);
                    render(inputVal);
                }
                return;
            }

            if (str && str.length === 1 && !key.ctrl && !key.meta) {
                inputVal += str;
                render(inputVal);
            }
        };

        function cleanup() {
            process.stdout.removeListener("resize", onResize);
            process.stdin.removeListener("keypress", onKey);
            if (typeof process.stdin.setRawMode === "function") {
                process.stdin.setRawMode(false);
            }
            if (rl) {
                rl.resume();
            } else {
                process.stdin.pause();
            }
        }

        process.stdin.on("keypress", onKey);
    });
}

/**
 * Handles interactive host input directly inside the centered splash input card.
 * - Placeholder is visual-only and disappears when typing
 * - Cursor is placed directly inside the card
 * - Enter without input defaults to "1"
 * - Ctrl+C exits cleanly
 * - Handles terminal resizing dynamically
 */
export function promptHostInput(rlOrHosts, maybeHosts = []) {
    let rl = null;
    let hosts = [];

    if (rlOrHosts && typeof rlOrHosts.question === "function") {
        rl = rlOrHosts;
        hosts = Array.isArray(maybeHosts) ? maybeHosts : [];
    } else {
        hosts = Array.isArray(rlOrHosts) ? rlOrHosts : [];
    }

    const defaultVal = hosts.length === 0 ? "r" : "1";
    return promptSelectionInput({
        render: (inputVal) => renderSplashComposition({ hosts, inputVal }),
        defaultVal,
        rl
    });
}

/**
 * Handles interactive model input directly inside the centered model selection input card.
 * - Placeholder is visual-only and disappears when typing
 * - Cursor is placed directly inside the card
 * - Enter without input defaults to "1"
 * - Ctrl+C exits cleanly
 * - Handles terminal resizing dynamically
 */
export function promptModelInput(rlOrHost, maybeHost, maybeModels) {
    let rl = null;
    let host = {};
    let models = [];

    if (rlOrHost && typeof rlOrHost.question === "function") {
        rl = rlOrHost;
        host = maybeHost || {};
        models = Array.isArray(maybeModels) ? maybeModels : [];
    } else {
        host = rlOrHost || {};
        models = Array.isArray(maybeHost) ? maybeHost : [];
    }

    const defaultVal = "1";
    return promptSelectionInput({
        render: (inputVal) => renderModelComposition({ host, models, inputVal }),
        defaultVal,
        rl
    });
}

/**
 * Prints the splash screen composition (alias for backwards compatibility).
 */
export function printSplash(hosts) {
    renderSplashComposition({ hosts, inputVal: "" });
}

/**
 * Prints the model selection screen for the chosen host (alias for backwards compatibility).
 */
export function printModelPicker(host, models) {
    renderModelComposition({ host, models, inputVal: "" });
}

/**
 * Top bar tab matching OpenCode.
 */
export function printChatTopBar() {
    console.clear();
    const tab = `${colors.tabBg} TeamGPU Chat ${colors.reset} ${colors.dim}+${colors.reset}`;
    console.log(`\n${tab}\n`);
}

/**
 * Prints user message with orange left accent bar.
 */
export function printUserMessage(content) {
    console.log(renderCardLine(""));
    console.log(renderCardLine(`${colors.white}${content}${colors.reset}`));
    console.log(renderCardLine(""));
    console.log();
}

/**
 * Prints assistant metadata footer matching OpenCode style:
 * "<model> · 467ms · 22.5 tok/s" (no 'Build', no 'Ollama')
 */
export function printAssistantMeta(model, elapsedMs, tokPerSec) {
    const leftPad = getCardLeftPad();
    console.log(`\n${leftPad}${colors.orange}${model}${colors.reset} ${colors.dim}· ${elapsedMs}ms · ${tokPerSec} tok/s${colors.reset}\n`);
}

/**
 * Renders the OpenCode chat input card with shaded background and orange left bar.
 */
export function renderChatInputCard(model) {
    const cardWidth = getCardWidth();
    const leftPadLen = getCardLeftPad().length;

    console.log(renderCardLine(""));
    console.log(renderCardLine(`${colors.dim}Ask anything... (/models, /hosts, /clear, /exit)${colors.reset}`));
    console.log(renderCardLine(`${colors.orange}${model}${colors.reset}`));
    console.log(renderCardLine(""));

    const helpHint = `${colors.dim}/help for commands${colors.reset}`;
    const hintPad = " ".repeat(Math.max(2, leftPadLen + cardWidth - stripAnsi(helpHint).length));
    console.log(`${hintPad}${helpHint}\n`);
}
