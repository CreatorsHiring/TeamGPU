import readline from "node:readline";
import { getPreferredMode, setPreferredMode } from "../utils/config.js";

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

    const hint = `${colors.dim}mode selected client /settings to change.${colors.reset}`;
    renderInputCard({ inputVal, placeholder, cardWidth, leftPad, hint });
}

/**
 * Renders the 3-row OpenCode-style input card with orange left accent bar,
 * full-width dark-grey background on all rows, right-aligned hints,
 * and repositions the cursor on the input row.
 */
export function renderInputCard({ inputVal = "", placeholder = "", cardWidth, leftPad, hint = null }) {
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
    const defaultHint = `${colors.dim}enter select   ctrl+c exit${colors.reset}`;
    const hintText = hint !== null && hint !== undefined ? hint : defaultHint;
    const hintLen = stripAnsi(hintText).length;
    const hintPad = " ".repeat(Math.max(2, leftPad.length + cardWidth - hintLen));
    process.stdout.write(`${hintPad}${hintText}`);

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
 * Renders the TeamGPU Welcome / Onboarding composition vertically and horizontally centered.
 *
 * Structure:
 * 1. TeamGPU ASCII logo (6 lines)
 * 2. Spacing (1 line)
 * 3. "Welcome to TeamGPU" heading (1 line)
 * 4. "Choose how you want to use TeamGPU:" subheading (1 line)
 * 5. Spacing (1 line)
 * 6. Option [1] Host (2 lines: title + description)
 * 7. Spacing (1 line)
 * 8. Option [2] Client (2 lines: title + description)
 * 9. Spacing (1 line)
 * 10. Selection input card (3 lines: top padding, input line, bottom padding)
 * 11. Keyboard hints below card (1 line)
 */
export function renderOnboardingComposition({ inputVal = "" } = {}) {
    const { rows, cols } = getTerminalDimensions();
    const contentLines = 20;
    const topPad = Math.max(0, Math.floor((rows - contentLines) / 2));

    const cardWidth = getCardWidth(cols);
    const leftPad = getCardLeftPad(cols);

    console.clear();
    if (topPad > 0) {
        process.stdout.write("\n".repeat(topPad));
    }

    // 1. TeamGPU ASCII logo
    for (let r = 0; r < TEAM_ASCII.length; r++) {
        const line = colors.white + TEAM_ASCII[r] + colors.reset + " " + colorFire(GPU_ASCII[r]);
        console.log(centerText(line, cols));
    }
    console.log();

    // 2. Headings
    console.log(centerText(`${colors.white}${colors.bold}Welcome to TeamGPU${colors.reset}`, cols));
    console.log(centerText(`${colors.dim}Choose how you want to use TeamGPU:${colors.reset}`, cols));
    console.log();

    // 3. Options
    const optLeftPad = leftPad + "  ";
    console.log(`${optLeftPad}${colors.yellow}[1]${colors.reset} ${colors.white}${colors.bold}Host${colors.reset}`);
    console.log(`${optLeftPad}${colors.dim}    Share your machine's GPU with the TeamGPU network.${colors.reset}`);
    console.log();
    console.log(`${optLeftPad}${colors.yellow}[2]${colors.reset} ${colors.white}${colors.bold}Client${colors.reset}`);
    console.log(`${optLeftPad}${colors.dim}    Discover available GPUs and run workloads remotely.${colors.reset}`);
    console.log();

    // 4. Selection input card
    const placeholder = "Select an option [1-2] (default 2)...";
    renderInputCard({ inputVal, placeholder, cardWidth, leftPad });
}

/**
 * Handles interactive onboarding selection.
 */
export function promptOnboardingInput(rl = null) {
    return promptSelectionInput({
        render: (inputVal) => renderOnboardingComposition({ inputVal }),
        defaultVal: "2",
        rl,
        allowSettings: false
    });
}

/**
 * Opens the in-place Settings modal popup over the current screen.
 * Displays preferred mode selection (Client vs Host) with exact visual styling,
 * keyboard arrow navigation, mouse hover/click, and Esc dismissal.
 */
export function openSettingsModalPopup({ initialSavedMode = null, onSelect, onClose }) {
    let selectedIndex = initialSavedMode === "host" ? 1 : 0; // 0 = client, 1 = host
    let isClosed = false;

    const modalBg = "\x1b[48;2;24;25;32m";
    const hoverBg = "\x1b[48;2;255;168;108m";
    const hoverFg = "\x1b[1;38;2;20;20;24m";
    const hoverMetaFg = "\x1b[22;38;2;65;50;35m";
    const normalMetaFg = "\x1b[22;2;37m";
    const whiteFg = "\x1b[1;97m";
    const orangeFg = "\x1b[1;38;2;255;125;0m";

    const getPopupGeometry = () => {
        const { rows, cols } = getTerminalDimensions();
        const popupWidth = Math.max(56, Math.min(68, cols - 6));
        const leftCol = Math.max(2, Math.floor((cols - popupWidth) / 2) + 1);
        const rightCol = leftCol + popupWidth - 1;
        const innerWidth = popupWidth - 4;
        const totalHeight = 13;
        const topRow = Math.max(2, Math.floor((rows - totalHeight) / 2) + 1);
        const bottomRow = topRow + totalHeight - 1;
        return { rows, cols, popupWidth, leftCol, rightCol, innerWidth, totalHeight, topRow, bottomRow };
    };

    const renderPopup = () => {
        if (isClosed) return;
        const geom = getPopupGeometry();
        const makeRow = (content, contentCells) => {
            const pad = Math.max(0, geom.innerWidth - contentCells);
            return `${modalBg}  ${content}${modalBg}${" ".repeat(pad)}  ${colors.reset}`;
        };

        const rowsOut = [];
        // Line 0: Top padding
        rowsOut.push(`${modalBg}${" ".repeat(geom.popupWidth)}${colors.reset}`);

        // Line 1: Header
        const title = "Settings";
        const rightText = "TEAMGPU · esc";
        const titleGap = Math.max(1, geom.innerWidth - stripAnsi(title).length - stripAnsi(rightText).length);
        rowsOut.push(makeRow(
            `${whiteFg}${title}${" ".repeat(titleGap)}${normalMetaFg}${rightText}`,
            stripAnsi(title).length + titleGap + stripAnsi(rightText).length
        ));

        // Line 2: Gap
        rowsOut.push(`${modalBg}${" ".repeat(geom.popupWidth)}${colors.reset}`);

        // Line 3: Subheading
        const subhead = "Select your preferred mode";
        rowsOut.push(makeRow(`${normalMetaFg}${subhead}`, stripAnsi(subhead).length));

        // Line 4: Gap
        rowsOut.push(`${modalBg}${" ".repeat(geom.popupWidth)}${colors.reset}`);

        // Line 5: Option 0 (Client) Title
        const isClientHovered = selectedIndex === 0;
        const isClientActive = initialSavedMode === "client";
        const clientBg = isClientHovered ? hoverBg : modalBg;
        const clientBullet = isClientActive ? "● " : "  ";
        const clientBulletFg = isClientHovered ? hoverFg : (isClientActive ? orangeFg : "");
        const clientTitleFg = isClientHovered ? hoverFg : (isClientActive ? orangeFg : whiteFg);
        const clientTitleStr = `${clientBulletFg}${clientBullet}${clientTitleFg}Client`;
        const clientPad1 = Math.max(0, geom.innerWidth - 6);
        rowsOut.push(`${clientBg}  ${clientTitleStr}${" ".repeat(clientPad1)}  ${colors.reset}`);

        // Line 6: Option 0 (Client) Description
        const clientDesc = "Discover available GPUs and run workloads remotely.";
        const clientDescFg = isClientHovered ? hoverMetaFg : normalMetaFg;
        const clientPad2 = Math.max(0, geom.innerWidth - 4 - stripAnsi(clientDesc).length);
        rowsOut.push(`${clientBg}      ${clientDescFg}${clientDesc}${" ".repeat(clientPad2)}  ${colors.reset}`);

        // Line 7: Gap between options
        rowsOut.push(`${modalBg}${" ".repeat(geom.popupWidth)}${colors.reset}`);

        // Line 8: Option 1 (Host) Title
        const isHostHovered = selectedIndex === 1;
        const isHostActive = initialSavedMode === "host";
        const hostBg = isHostHovered ? hoverBg : modalBg;
        const hostBullet = isHostActive ? "● " : "  ";
        const hostBulletFg = isHostHovered ? hoverFg : (isHostActive ? orangeFg : "");
        const hostTitleFg = isHostHovered ? hoverFg : (isHostActive ? orangeFg : whiteFg);
        const hostTitleStr = `${hostBulletFg}${hostBullet}${hostTitleFg}Host`;
        const hostPad1 = Math.max(0, geom.innerWidth - 6);
        rowsOut.push(`${hostBg}  ${hostTitleStr}${" ".repeat(hostPad1)}  ${colors.reset}`);

        // Line 9: Option 1 (Host) Description
        const hostDesc = "Share your machine's GPU with the TeamGPU network.";
        const hostDescFg = isHostHovered ? hoverMetaFg : normalMetaFg;
        const hostPad2 = Math.max(0, geom.innerWidth - 4 - stripAnsi(hostDesc).length);
        rowsOut.push(`${hostBg}      ${hostDescFg}${hostDesc}${" ".repeat(hostPad2)}  ${colors.reset}`);

        // Line 10: Gap
        rowsOut.push(`${modalBg}${" ".repeat(geom.popupWidth)}${colors.reset}`);

        // Line 11: Footer
        const footerText = "↑/↓ navigate     enter select     esc close";
        rowsOut.push(makeRow(`${normalMetaFg}${footerText}`, stripAnsi(footerText).length));

        // Line 12: Bottom padding
        rowsOut.push(`${modalBg}${" ".repeat(geom.popupWidth)}${colors.reset}`);

        // Render rows using ANSI positioning
        process.stdout.write("\x1b[?25l\x1b[?7l");
        let out = "";
        for (let i = 0; i < rowsOut.length; i++) {
            const r = geom.topRow + i;
            out += `\x1b[${r}H\x1b[${geom.leftCol}G${rowsOut[i]}`;
        }
        process.stdout.write(out);
    };

    // Initial render
    renderPopup();

    // Enable SGR mouse tracking
    process.stdout.write("\x1b[?1000h\x1b[?1002h\x1b[?1006h");

    const close = () => {
        if (isClosed) return;
        isClosed = true;
        // Disable mouse tracking and restore cursor
        process.stdout.write("\x1b[?1006l\x1b[?1002l\x1b[?1000l\x1b[?25h\x1b[?7h");
        process.stdin.removeListener("data", onRawData);
    };

    const choose = (idx) => {
        close();
        const mode = idx === 0 ? "client" : "host";
        if (onSelect) onSelect(mode);
    };

    const dismiss = () => {
        close();
        if (onClose) onClose();
    };

    const onKey = (str, key) => {
        if (isClosed) return;
        if (!key && str === "\x1b") {
            dismiss();
            return;
        }
        if (key) {
            if (key.name === "escape") {
                dismiss();
                return;
            }
            if (key.name === "up" || key.name === "down") {
                selectedIndex = selectedIndex === 0 ? 1 : 0;
                renderPopup();
                return;
            }
            if (key.name === "return" || key.name === "enter") {
                choose(selectedIndex);
                return;
            }
        }
    };

    const onRawData = (chunk) => {
        if (isClosed) return;
        const text = chunk.toString();
        // Check for Esc key in raw chunk
        if (text === "\x1b" || text === "\x1b\x1b") {
            dismiss();
            return;
        }

        // SGR Mouse regex: \x1b[<btn;col;row;M or m
        const sgrRe = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/g;
        let match;
        while ((match = sgrRe.exec(text)) !== null) {
            const btn = parseInt(match[1], 10);
            const col = parseInt(match[2], 10);
            const row = parseInt(match[3], 10);
            const type = match[4]; // M = press / drag / motion, m = release

            const geom = getPopupGeometry();
            const isInside = (col >= geom.leftCol && col <= geom.rightCol && row >= geom.topRow && row <= geom.bottomRow);

            if (type === "M") {
                if (btn === 0) { // Left click
                    if (!isInside) {
                        dismiss();
                        return;
                    }
                    // Option 0 (Client): rows topRow + 5 and topRow + 6
                    if (row === geom.topRow + 5 || row === geom.topRow + 6) {
                        choose(0);
                        return;
                    }
                    // Option 1 (Host): rows topRow + 8 and topRow + 9
                    if (row === geom.topRow + 8 || row === geom.topRow + 9) {
                        choose(1);
                        return;
                    }
                } else if (btn === 35 || btn === 32) { // Mouse move / hover
                    if (isInside) {
                        if (row === geom.topRow + 5 || row === geom.topRow + 6) {
                            if (selectedIndex !== 0) {
                                selectedIndex = 0;
                                renderPopup();
                            }
                        } else if (row === geom.topRow + 8 || row === geom.topRow + 9) {
                            if (selectedIndex !== 1) {
                                selectedIndex = 1;
                                renderPopup();
                            }
                        }
                    }
                }
            }
        }
    };

    process.stdin.on("data", onRawData);

    return {
        onKey,
        render: renderPopup,
        close: dismiss
    };
}

/**
 * Shared interactive input loop for selection screens (host and model selection).
 * - Full-width dark-grey background on all 3 rows
 * - Cursor positioned on the input row
 * - Visual-only placeholder that disappears upon typing
 * - Re-renders dynamically on terminal resize
 * - Enter defaults to defaultVal
 * - Clean Ctrl+C exit
 * - In-place Settings popup overlay when /settings is entered
 */
export function promptSelectionInput({ render, defaultVal = "1", rl = null, allowSettings = false }) {
    return new Promise((resolve) => {
        let inputVal = "";
        let activePopup = null;
        let isExited = false;
        let settingsDebounceTimer = null;

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
            if (activePopup) {
                render(inputVal);
                activePopup.render();
            } else {
                render(inputVal);
            }
        };
        process.stdout.on("resize", onResize);

        const triggerSettingsPopup = () => {
            if (activePopup || isExited) return;
            const preferred = getPreferredMode();
            activePopup = openSettingsModalPopup({
                initialSavedMode: preferred,
                onClose: () => {
                    activePopup = null;
                    inputVal = "";
                    render(inputVal);
                },
                onSelect: (chosenMode) => {
                    activePopup = null;
                    if (chosenMode === "client") {
                        setPreferredMode("client");
                        inputVal = "";
                        render(inputVal);
                    } else if (chosenMode === "host") {
                        cleanup();
                        resolve("__TEAMGPU_SWITCH_TO_HOST__");
                    }
                }
            });
        };

        const onKey = (str, key) => {
            if (key && key.ctrl && key.name === "c") {
                if (activePopup) {
                    activePopup.close();
                    activePopup = null;
                }
                cleanup();
                process.stdout.write("\x1b[2B\r\n\x1b[?25h");
                process.exit(0);
            }

            // Route keypresses to active modal popup if open
            if (activePopup) {
                activePopup.onKey(str, key);
                return;
            }

            if (key && (key.name === "return" || key.name === "enter")) {
                if (settingsDebounceTimer) {
                    clearTimeout(settingsDebounceTimer);
                    settingsDebounceTimer = null;
                }
                if (allowSettings && inputVal.trim().toLowerCase() === "/settings") {
                    triggerSettingsPopup();
                    return;
                }
                cleanup();
                process.stdout.write("\x1b[2B\r\n");
                resolve(inputVal.trim() || defaultVal);
                return;
            }

            if (key && (key.name === "backspace" || key.name === "delete")) {
                if (settingsDebounceTimer) {
                    clearTimeout(settingsDebounceTimer);
                    settingsDebounceTimer = null;
                }
                if (inputVal.length > 0) {
                    inputVal = inputVal.slice(0, -1);
                    render(inputVal);
                }
                return;
            }

            if (str && str.length === 1 && !key.ctrl && !key.meta) {
                inputVal += str;
                render(inputVal);

                if (allowSettings && inputVal.trim().toLowerCase() === "/settings") {
                    if (settingsDebounceTimer) clearTimeout(settingsDebounceTimer);
                    settingsDebounceTimer = setTimeout(() => {
                        if (!activePopup && inputVal.trim().toLowerCase() === "/settings") {
                            triggerSettingsPopup();
                        }
                    }, 800);
                }
            }
        };

        function cleanup() {
            isExited = true;
            if (settingsDebounceTimer) {
                clearTimeout(settingsDebounceTimer);
                settingsDebounceTimer = null;
            }
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
 * - Allows /settings command to open in-place Settings popup
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
        rl,
        allowSettings: true
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
