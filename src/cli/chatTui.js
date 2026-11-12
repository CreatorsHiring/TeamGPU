import readline from "node:readline";
import { colors, stripAnsi, getTerminalDimensions } from "./tui.js";
import { probeHost } from "../discovery/client.js";

/**
 * Returns the terminal cell display width of a Unicode code point (0, 1, or 2).
 */
export function charDisplayWidth(cp) {
    if (cp === 0) return 0;
    if (cp < 32 || (cp >= 0x7f && cp < 0xa0)) return 0;
    if (
        (cp >= 0x0300 && cp <= 0x036f) ||
        (cp >= 0x1ab0 && cp <= 0x1aff) ||
        (cp >= 0x1dc0 && cp <= 0x1dff) ||
        (cp >= 0x200b && cp <= 0x200f) ||
        (cp >= 0x202a && cp <= 0x202e) ||
        (cp >= 0x20d0 && cp <= 0x20ff) ||
        (cp >= 0xfe00 && cp <= 0xfe0f) ||
        (cp >= 0xfe20 && cp <= 0xfe2f)
    ) {
        return 0;
    }
    if (
        cp >= 0x1100 && (
            cp <= 0x115f ||
            cp === 0x2329 || cp === 0x232a ||
            (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
            (cp >= 0xac00 && cp <= 0xd7a3) ||
            (cp >= 0xf900 && cp <= 0xfaff) ||
            (cp >= 0xfe10 && cp <= 0xfe19) ||
            (cp >= 0xfe30 && cp <= 0xfe6f) ||
            (cp >= 0xff00 && cp <= 0xff60) ||
            (cp >= 0xffe0 && cp <= 0xffe6) ||
            (cp >= 0x1f000 && cp <= 0x1fbff) ||
            (cp >= 0x20000 && cp <= 0x3fffd)
        )
    ) {
        return 2;
    }
    return 1;
}

/**
 * Computes exact terminal cell width of a string, ignoring ANSI escape sequences.
 */
export function getCellWidth(str) {
    if (!str) return 0;
    const clean = stripAnsi(String(str));
    let cells = 0;
    for (const ch of clean) {
        cells += charDisplayWidth(ch.codePointAt(0));
    }
    return cells;
}

/**
 * Splits a single word into chunks that each fit within maxCells terminal cells.
 */
function splitWordByCells(word, maxCells) {
    const chunks = [];
    let current = "";
    let currentCells = 0;
    for (const ch of word) {
        const w = charDisplayWidth(ch.codePointAt(0));
        if (current && currentCells + w > maxCells) {
            chunks.push(current);
            current = ch;
            currentCells = w;
        } else {
            current += ch;
            currentCells += w;
        }
    }
    if (current) {
        chunks.push(current);
    }
    return chunks.length > 0 ? chunks : [""];
}

/**
 * Word-wraps text to a maximum visible terminal-cell width, preserving manual newlines.
 */
export function wrapText(text, maxWidth) {
    if (!text) return [""];
    const limit = Math.max(1, maxWidth);
    const paragraphs = String(text).split("\n");
    const wrappedLines = [];

    for (const paragraph of paragraphs) {
        if (!paragraph) {
            wrappedLines.push("");
            continue;
        }

        const words = paragraph.split(" ");
        let currentLine = "";
        let currentCells = 0;

        for (const word of words) {
            const wordCells = getCellWidth(word);
            if (!currentLine) {
                if (wordCells > limit) {
                    const chunks = splitWordByCells(word, limit);
                    for (let i = 0; i < chunks.length - 1; i++) {
                        wrappedLines.push(chunks[i]);
                    }
                    currentLine = chunks[chunks.length - 1];
                    currentCells = getCellWidth(currentLine);
                } else {
                    currentLine = word;
                    currentCells = wordCells;
                }
            } else if (currentCells + 1 + wordCells <= limit) {
                currentLine += " " + word;
                currentCells += 1 + wordCells;
            } else {
                wrappedLines.push(currentLine);
                if (wordCells > limit) {
                    const chunks = splitWordByCells(word, limit);
                    for (let i = 0; i < chunks.length - 1; i++) {
                        wrappedLines.push(chunks[i]);
                    }
                    currentLine = chunks[chunks.length - 1];
                    currentCells = getCellWidth(currentLine);
                } else {
                    currentLine = word;
                    currentCells = wordCells;
                }
            }
        }
        if (currentLine) {
            wrappedLines.push(currentLine);
        }
    }

    return wrappedLines;
}

/**
 * Pads or truncates a string with ANSI codes to an exact terminal cell width.
 * Never cuts through an ANSI escape code or splits multi-cell characters.
 */
export function padToWidth(str, width) {
    const target = Math.max(0, width);
    const vis = getCellWidth(str);
    if (vis < target) {
        return str + " ".repeat(target - vis);
    }
    if (vis === target) {
        return str;
    }
    let cells = 0;
    let result = "";
    let i = 0;
    while (i < str.length) {
        if (str[i] === "\x1b") {
            const rest = str.slice(i);
            const m = rest.match(/^\x1b\[[0-9;?]*[a-zA-Z]/);
            if (m) {
                result += m[0];
                i += m[0].length;
                continue;
            }
        }
        const cp = str.codePointAt(i);
        const ch = String.fromCodePoint(cp);
        const w = charDisplayWidth(cp);
        if (cells + w > target) break;
        result += ch;
        cells += w;
        i += ch.length;
    }
    if (cells < target) {
        result += " ".repeat(target - cells);
    }
    return result + colors.reset;
}

/**
 * Sanitizes and clips plain text to an exact maximum number of terminal cells.
 */
export function clipToWidth(text, maxWidth) {
    if (!text || maxWidth <= 0) return "";
    const clean = stripAnsi(String(text)).replace(/[\t\r\n]/g, " ");
    let cells = 0;
    let out = "";
    for (const ch of clean) {
        const w = charDisplayWidth(ch.codePointAt(0));
        if (cells + w > maxWidth) break;
        out += ch;
        cells += w;
    }
    return out;
}

/**
 * Builds an input-card padding row with continuous background across the full card width.
 */
export function buildCardPadRow(cardWidth) {
    const safeWidth = Math.max(4, cardWidth);
    return ` ${colors.orange}▌${colors.cardBg}${" ".repeat(safeWidth)}${colors.reset}`;
}

/**
 * Builds an input-card content row with explicit terminal-cell width enforcement
 * and continuous background. Applies reset ONLY after all right-padding spaces.
 */
export function buildCardRow(text, textColor, cardWidth) {
    const safeWidth = Math.max(4, cardWidth);
    const leftInnerPad = 2;
    const minRightInnerPad = 1;
    const maxTextWidth = Math.max(1, safeWidth - leftInnerPad - minRightInnerPad);
    const clipped = clipToWidth(text, maxTextWidth);
    const visCells = getCellWidth(clipped);
    const rightPad = Math.max(minRightInnerPad, safeWidth - leftInnerPad - visCells);

    return ` ${colors.orange}▌${colors.cardBg}${" ".repeat(leftInnerPad)}${textColor}${clipped}${" ".repeat(rightPad)}${colors.reset}`;
}

/**
 * Formats persistent right-hand system sidebar lines with live host information.
 */
export function formatSidebarLines(host, currentModel, width) {
    const lines = [];
    const pad = (str) => padToWidth(str, width);

    const isOnline = host.online !== false && (host.ollama?.running !== false);
    const statusText = isOnline
        ? `${colors.green}● Online${colors.reset}`
        : `${colors.red}○ Offline${colors.reset}`;

    lines.push(pad(`${colors.dim}HOST${colors.reset}`));
    lines.push(pad(`${colors.white}${colors.bold}${host.name || "Unknown"}${colors.reset}`));
    if (host.ip && host.ip !== host.name) {
        lines.push(pad(`${colors.dim}${host.ip}${colors.reset}`));
    }
    lines.push(pad(statusText));
    lines.push(pad(""));

    lines.push(pad(`${colors.dim}ACTIVE MODEL${colors.reset}`));
    lines.push(pad(`${colors.orange}${currentModel || "None"}${colors.reset}`));
    lines.push(pad(`${colors.dim}Ollama${colors.reset}`));
    lines.push(pad(""));

    lines.push(pad(`${colors.dim}CPU${colors.reset}`));
    const cpuUtil = host.cpu?.utilizationPercent !== undefined
        ? `${host.cpu.utilizationPercent}%`
        : (host.cpu?.speedGHz ? `${host.cpu.speedGHz} GHz (${host.cpu.logicalCores || "?"}c)` : "N/A");
    lines.push(pad(`${colors.white}${cpuUtil}${colors.reset}`));
    lines.push(pad(""));

    lines.push(pad(`${colors.dim}RAM${colors.reset}`));
    const ramText = (host.memory?.usedGB !== undefined && host.memory?.totalGB !== undefined)
        ? `${host.memory.usedGB} / ${host.memory.totalGB} GB`
        : (host.memory?.totalGB ? `${host.memory.totalGB} GB` : "N/A");
    lines.push(pad(`${colors.white}${ramText}${colors.reset}`));
    lines.push(pad(""));

    lines.push(pad(`${colors.dim}GPU${colors.reset}`));
    if (host.gpu && host.gpu.detected) {
        const gpuName = host.gpu.model || "NVIDIA GPU";
        lines.push(pad(`${colors.white}${gpuName.slice(0, width)}${colors.reset}`));
        const gpuUtil = host.gpu.utilizationPercent !== undefined
            ? `Util: ${host.gpu.utilizationPercent}%`
            : "N/A";
        lines.push(pad(`${colors.yellow}${gpuUtil}${colors.reset}`));
    } else {
        lines.push(pad(`${colors.dim}No dedicated GPU${colors.reset}`));
    }
    lines.push(pad(""));

    lines.push(pad(`${colors.dim}VRAM${colors.reset}`));
    if (host.gpu && host.gpu.detected && host.gpu.memoryMB) {
        const vramGB = (host.gpu.memoryMB / 1024).toFixed(1);
        lines.push(pad(`${colors.white}${vramGB} GB${colors.reset}`));
    } else {
        lines.push(pad(`${colors.dim}N/A${colors.reset}`));
    }

    return lines;
}

/**
 * Computes responsive layout boundaries for the split-pane chat interface.
 */
export function getChatLayout(cols, rows, inputVal = "") {
    const sidebarWidth = Math.max(22, Math.min(32, Math.floor(cols * 0.26)));
    const dividerCol = Math.max(2, cols - sidebarWidth); // 1-based column for divider
    const leftWidth = Math.max(1, dividerCol - 1);
    const sidebarStartCol = dividerCol + 1;
    const headerRows = 2; // Rows 1 and 2

    // Strict 1-column guard before dividerCol so input card never touches divider or sidebar
    const safeInputWidth = Math.max(1, leftWidth - 1);
    const cardWidth = Math.max(4, safeInputWidth - 2);
    const promptMaxWidth = Math.max(1, cardWidth - 4);

    const rawWrapped = inputVal ? wrapText(inputVal, promptMaxWidth) : [""];
    const wrappedPrompt = rawWrapped.length > 0 ? rawWrapped : [""];
    const maxInputRows = Math.max(5, Math.floor(rows * 0.5));
    const maxPromptLines = Math.max(1, maxInputRows - 4);
    const visiblePromptLines = wrappedPrompt.slice(-maxPromptLines);
    const inputContentRows = visiblePromptLines.length;
    const inputRows = inputContentRows + 4; // top pad (1) + prompt lines + model line (1) + bottom pad (1) + hint (1)

    const convStartRow = 3;
    const convEndRow = Math.max(convStartRow, rows - inputRows);
    const convHeight = Math.max(1, convEndRow - convStartRow + 1);

    return {
        rows,
        cols,
        sidebarWidth,
        dividerCol,
        leftWidth,
        safeInputWidth,
        sidebarStartCol,
        headerRows,
        inputRows,
        inputContentRows,
        visiblePromptLines,
        convStartRow,
        convEndRow,
        convHeight,
        cardWidth
    };
}

/**
 * Formats all conversation messages into styled text lines for the left pane.
 */
export function formatConversationLines({
    messages = [],
    currentStreamingText = "",
    cardWidth = 60,
    leftWidth = 62
}) {
    const lines = [];

    for (const msg of messages) {
        if (msg.role === "user") {
            const wrapped = wrapText(msg.content, Math.max(6, cardWidth - 4));
            // Card top padding
            lines.push(` ${colors.orange}▌${colors.cardBg} ${" ".repeat(Math.max(0, cardWidth - 2))} ${colors.reset}`);
            // Card content lines
            for (const line of wrapped) {
                const pad = Math.max(0, cardWidth - 4 - stripAnsi(line).length);
                lines.push(` ${colors.orange}▌${colors.cardBg}  ${colors.white}${line}${" ".repeat(pad)} ${colors.reset}`);
            }
            // Card bottom padding
            lines.push(` ${colors.orange}▌${colors.cardBg} ${" ".repeat(Math.max(0, cardWidth - 2))} ${colors.reset}`);
            lines.push("");
        } else if (msg.role === "assistant") {
            const wrapped = wrapText(msg.content, Math.max(6, leftWidth - 5));
            for (const line of wrapped) {
                const col = msg.isError ? colors.red : colors.white;
                lines.push(`   ${col}${line}${colors.reset}`);
            }
            if (msg.meta) {
                lines.push("");
                lines.push(`   ${colors.orange}${msg.meta}${colors.reset}`);
            }
            lines.push("");
        } else if (msg.role === "system") {
            const wrapped = wrapText(msg.content, Math.max(6, leftWidth - 5));
            for (const line of wrapped) {
                lines.push(`   ${colors.dim}${line}${colors.reset}`);
            }
            lines.push("");
        }
    }

    if (currentStreamingText) {
        const wrapped = wrapText(currentStreamingText, Math.max(6, leftWidth - 5));
        for (const line of wrapped) {
            lines.push(`   ${colors.white}${line}${colors.reset}`);
        }
    }

    return lines;
}

/**
 * Runs the interactive full-screen TeamGPU chat session.
 *
 * Runs inside the terminal's alternate screen buffer (ESC[?1049h), isolating
 * it from previous terminal outputs and scrollback. Supports SGR mouse-wheel
 * scrolling and keyboard navigation.
 */
export async function runChatInterface({
    rl,
    initialHost,
    initialModel,
    selectHostPrompt,
    selectModelPrompt
}) {
    let currentHost = { ...initialHost };
    let currentModel = initialModel;
    const messages = [];
    let currentStreamingText = "";
    let inputVal = "";
    let scrollOffset = 0;
    let isStreaming = false;
    let isExited = false;

    // Stream throttling configuration (~30 FPS)
    const STREAM_RENDER_INTERVAL_MS = 33;
    let streamRenderTimer = null;
    let lastStreamRenderTime = 0;

    /**
     * Obtains latest terminal dimensions and computed layout.
     */
    const getLayout = () => {
        const { rows, cols } = getTerminalDimensions();
        return getChatLayout(cols, rows, inputVal);
    };

    /**
     * Computes maximum available scroll depth based on current history length.
     */
    const getMaxScroll = (layout = getLayout()) => {
        const allLines = formatConversationLines({
            messages,
            currentStreamingText,
            cardWidth: layout.cardWidth,
            leftWidth: layout.leftWidth
        });
        return Math.max(0, allLines.length - layout.convHeight);
    };

    /**
     * Computes the cursor position within the dynamic bottom input card.
     * Guarantees the cursor stays inside the shaded input card and never crosses dividerCol.
     */
    const getCursorPos = (layout = getLayout()) => {
        const safeInputWidth = Math.max(1, Math.min(layout.safeInputWidth ?? (layout.leftWidth - 1), layout.leftWidth - 1));
        const innerCardWidth = Math.max(1, Math.min(layout.cardWidth, Math.max(1, safeInputWidth - 2)));
        const maxTextWidth = Math.max(1, innerCardWidth - 3);
        const maxCursorCol = Math.min(layout.leftWidth - 1, safeInputWidth, 2 + innerCardWidth);
        const startRow = layout.rows - layout.inputRows + 1;

        if (!inputVal) {
            const cursorRow = Math.max(1, startRow + 1);
            const cursorCol = Math.min(maxCursorCol, 5);
            return { cursorRow, cursorCol };
        }

        const lines = (layout.visiblePromptLines || [""]).slice(0, Math.max(1, layout.inputContentRows || 1));
        const cursorRow = Math.max(1, startRow + lines.length);
        const clippedLast = clipToWidth(lines[lines.length - 1] || "", maxTextWidth);
        const cursorCol = Math.min(maxCursorCol, 5 + getCellWidth(clippedLast));
        return { cursorRow, cursorCol };
    };

    /**
     * Renders header lines (Rows 1 and 2) in-place without touching other areas.
     * Displays a clean scroll indicator in Row 1 when scrolled into history.
     */
    const renderHeader = (layout) => {
        let out = "";
        const baseTab = ` ${colors.tabBg} TeamGPU Chat ${colors.reset} ${colors.dim}+${colors.reset}`;

        if (scrollOffset > 0) {
            const maxScroll = getMaxScroll(layout);
            const remaining = Math.max(0, maxScroll - scrollOffset);
            const indicator = `   ${colors.orange}↑ ${scrollOffset} lines${colors.reset} ${colors.dim}(scroll down / PageDn to return)${colors.reset}`;
            out += `\x1b[1;1H${padToWidth(baseTab + indicator, layout.leftWidth)}`;
        } else {
            out += `\x1b[1;1H${padToWidth(baseTab, layout.leftWidth)}`;
        }

        // Row 2 is clean vertical spacing between header and conversation
        out += `\x1b[2;1H${" ".repeat(layout.leftWidth)}`;
        return out;
    };

    /**
     * Renders vertical divider between left pane and right sidebar (Row 1 to rows).
     */
    const renderDivider = (layout) => {
        let out = "";
        for (let r = 1; r <= layout.rows; r++) {
            out += `\x1b[${r};${layout.dividerCol}H${colors.dim}│${colors.reset}`;
        }
        return out;
    };

    /**
     * Renders persistent right-hand system sidebar lines strictly within sidebar columns.
     */
    const renderSidebar = (layout) => {
        const sidebarWidth = Math.max(1, Math.min(layout.sidebarWidth, layout.cols - layout.sidebarStartCol + 1));
        const sidebarLines = formatSidebarLines(currentHost, currentModel, sidebarWidth);
        let out = "";
        for (let r = 1; r <= layout.rows; r++) {
            const line = (r - 1 < sidebarLines.length)
                ? padToWidth(sidebarLines[r - 1], sidebarWidth)
                : " ".repeat(sidebarWidth);
            out += `\x1b[${r};${layout.sidebarStartCol}H${line}`;
        }
        return out;
    };

    /**
     * Renders conversation area lines in-place (Rows 3 to rows - 5).
     * Also updates header scroll indicator in Row 1 atomically.
     */
    const renderConversation = (layout = getLayout()) => {
        if (isExited) return;

        const allLines = formatConversationLines({
            messages,
            currentStreamingText,
            cardWidth: layout.cardWidth,
            leftWidth: layout.leftWidth
        });

        const maxScroll = Math.max(0, allLines.length - layout.convHeight);
        scrollOffset = Math.max(0, Math.min(scrollOffset, maxScroll));

        let displayed = [];
        if (allLines.length <= layout.convHeight) {
            displayed = [...allLines];
            while (displayed.length < layout.convHeight) {
                displayed.push("");
            }
        } else {
            const startIdx = allLines.length - layout.convHeight - scrollOffset;
            displayed = allLines.slice(startIdx, startIdx + layout.convHeight);
        }

        process.stdout.write("\x1b[?25l\x1b[?7l");
        try {
            let out = "";
            // Update header row 1 & row 2 scroll state
            out += renderHeader(layout);

            // Write conversation lines strictly within leftWidth
            const safeLeftWidth = Math.max(1, Math.min(layout.leftWidth, layout.dividerCol - 1));
            for (let i = 0; i < layout.convHeight; i++) {
                const r = layout.convStartRow + i;
                const line = padToWidth(displayed[i] || "", safeLeftWidth);
                out += `\x1b[${r};1H${line}`;
            }
            process.stdout.write(out);
        } finally {
            const { cursorRow, cursorCol } = getCursorPos(layout);
            process.stdout.write(`\x1b[?7h\x1b[${cursorRow};${cursorCol}H\x1b[?25h`);
        }
    };

    /**
     * Renders fixed bottom input box lines in-place with strict pane boundaries and DECAWM protection.
     * Every card row keeps cardBg active across all padding spaces before resetting ANSI.
     */
    const renderInputBox = (layout = getLayout()) => {
        if (isExited) return;

        const safeInputWidth = Math.max(1, Math.min(layout.safeInputWidth ?? (layout.leftWidth - 1), layout.leftWidth - 1));
        const innerCardWidth = Math.max(4, Math.min(layout.cardWidth, Math.max(4, safeInputWidth - 2)));
        const targetPromptRows = Math.max(1, layout.inputContentRows || 1);
        const placeholder = "Ask anything... (/models, /hosts, /clear, /exit)";
        const cardLines = [];

        // Card Line 1: Top padding
        cardLines.push(buildCardPadRow(innerCardWidth));

        // Card Prompt Lines (explicitly clipped and padded inside cardBg)
        if (!inputVal) {
            cardLines.push(buildCardRow(placeholder, colors.dim, innerCardWidth));
            for (let i = 1; i < targetPromptRows; i++) {
                cardLines.push(buildCardRow("", colors.white, innerCardWidth));
            }
        } else {
            const promptLines = (layout.visiblePromptLines || [""]).slice(0, targetPromptRows);
            for (const line of promptLines) {
                cardLines.push(buildCardRow(line, colors.white, innerCardWidth));
            }
            for (let i = promptLines.length; i < targetPromptRows; i++) {
                cardLines.push(buildCardRow("", colors.white, innerCardWidth));
            }
        }

        // Card Model Line
        cardLines.push(buildCardRow(currentModel || "", colors.orange, innerCardWidth));

        // Card Bottom Padding
        cardLines.push(buildCardPadRow(innerCardWidth));

        // Hints line below card (explicitly bounded within safeInputWidth, no ESC[K)
        const hintMax = Math.max(0, safeInputWidth - 3);
        const hintText = clipToWidth("/help for commands", hintMax);
        const hintCells = getCellWidth(hintText);
        const hintPad = Math.max(0, safeInputWidth - 3 - hintCells);
        cardLines.push(`   ${colors.dim}${hintText}${colors.reset}${" ".repeat(hintPad)}`);

        // Temporarily disable autowrap (DECAWM) while rendering input rows
        process.stdout.write("\x1b[?25l\x1b[?7l");
        try {
            let out = "";
            for (let i = 0; i < cardLines.length; i++) {
                const r = layout.rows - layout.inputRows + 1 + i;
                out += `\x1b[${r};1H${cardLines[i]}`;
            }
            process.stdout.write(out);
        } finally {
            const { cursorRow, cursorCol } = getCursorPos(layout);
            process.stdout.write(`\x1b[?7h\x1b[${cursorRow};${cursorCol}H\x1b[?25h`);
        }
    };

    let currentInputRows = 5;

    /**
     * Synchronizes input box rendering and resizes the conversation viewport
     * dynamically if prompt wrapping adds or removes rows.
     */
    const syncInputBox = () => {
        const layout = getLayout();
        if (layout.inputRows !== currentInputRows) {
            currentInputRows = layout.inputRows;
            renderConversation(layout);
        }
        renderInputBox(layout);
    };

    /**
     * Full redraw: clears alternate screen and writes all persistent components.
     * Invoked only on initial mount or terminal window resize.
     */
    const renderFull = () => {
        if (isExited) return;
        const layout = getLayout();
        currentInputRows = layout.inputRows;
        process.stdout.write("\x1b[?25l\x1b[?7l\x1b[2J\x1b[H");
        try {
            let out = "";
            out += renderHeader(layout);
            out += renderDivider(layout);
            out += renderSidebar(layout);
            process.stdout.write(out);

            renderConversation(layout);
            renderInputBox(layout);
        } finally {
            const { cursorRow, cursorCol } = getCursorPos(layout);
            process.stdout.write(`\x1b[?7h\x1b[${cursorRow};${cursorCol}H\x1b[?25h`);
        }
    };

    /**
     * Throttles streaming updates to avoid stdout congestion and flickering.
     */
    const scheduleStreamRender = () => {
        const now = Date.now();
        const remaining = STREAM_RENDER_INTERVAL_MS - (now - lastStreamRenderTime);
        if (remaining <= 0) {
            if (streamRenderTimer) {
                clearTimeout(streamRenderTimer);
                streamRenderTimer = null;
            }
            lastStreamRenderTime = now;
            renderConversation();
        } else if (!streamRenderTimer) {
            streamRenderTimer = setTimeout(() => {
                streamRenderTimer = null;
                lastStreamRenderTime = Date.now();
                renderConversation();
            }, remaining);
        }
    };

    // Independent background hardware monitor (refreshes sidebar strictly in sidebar columns every 4s)
    const refreshTimer = setInterval(async () => {
        if (isExited || isStreaming) return;
        try {
            const fresh = await probeHost(currentHost.url, 2000);
            if (fresh) {
                currentHost = { ...currentHost, ...fresh, online: true };
            } else {
                currentHost.online = false;
            }
        } catch {
            currentHost.online = false;
        }
        if (!isExited && !isStreaming) {
            const layout = getLayout();
            process.stdout.write("\x1b[?25l\x1b[?7l");
            try {
                process.stdout.write(renderSidebar(layout));
            } finally {
                const { cursorRow, cursorCol } = getCursorPos(layout);
                process.stdout.write(`\x1b[?7h\x1b[${cursorRow};${cursorCol}H\x1b[?25h`);
            }
        }
    }, 4000);

    const isTTY = Boolean(process.stdin.isTTY && typeof process.stdin.setRawMode === "function");
    if (!isTTY) {
        renderFull();
        return;
    }

    // -------------------------------------------------------------
    // Terminal Mode Setup: Alternate Screen & Mouse Reporting
    // -------------------------------------------------------------
    // \x1b[?1049h : Enter alternate screen buffer (isolates from model picker / CLI scrollback)
    // \x1b[?1000h : Enable normal mouse button reporting
    // \x1b[?1002h : Enable button-event mouse tracking
    // \x1b[?1006h : Enable SGR mouse mode (extended coordinate reporting)
    process.stdout.write("\x1b[?1049h\x1b[?1000h\x1b[?1002h\x1b[?1006h\x1b[2J\x1b[H");

    // Detach any existing readline keypress listeners so rl does not echo keystrokes
    // or call _refreshLine() across the divider into the sidebar while raw TUI is active.
    const savedRlKeypressListeners = process.stdin.rawListeners("keypress").slice();
    process.stdin.removeAllListeners("keypress");

    if (rl) {
        rl.pause();
    }
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();

    // -------------------------------------------------------------
    // Mouse Event Interceptor on process.stdin
    // -------------------------------------------------------------
    // Intercepts raw SGR and X10 mouse reporting sequences directly from
    // the stdin stream so they don't break readline keypress parsing.
    let mousePartialBuffer = "";
    const origEmit = process.stdin.emit.bind(process.stdin);

    const handleMouseWheel = (btn) => {
        if ((btn & 64) !== 0) {
            const layout = getLayout();
            const maxScroll = getMaxScroll(layout);

            if ((btn & 3) === 0) {
                // Wheel UP: increase scrollOffset to look at earlier messages
                scrollOffset = Math.min(maxScroll, scrollOffset + 3);
                renderConversation(layout);
            } else if ((btn & 3) === 1) {
                // Wheel DOWN: decrease scrollOffset towards latest messages
                scrollOffset = Math.max(0, scrollOffset - 3);
                renderConversation(layout);
            }
        }
    };

    const mouseDataHandler = function (event, ...args) {
        if (event === "data" && args[0]) {
            let str = mousePartialBuffer + (typeof args[0] === "string" ? args[0] : args[0].toString("utf-8"));
            mousePartialBuffer = "";

            const sgrRegex = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/g;
            const normalRegex = /\x1b\[M([\s\S]{3})/g;

            let match;
            let hasMouse = false;

            while ((match = sgrRegex.exec(str)) !== null) {
                hasMouse = true;
                const btn = parseInt(match[1], 10);
                handleMouseWheel(btn);
            }

            while ((match = normalRegex.exec(str)) !== null) {
                hasMouse = true;
                const btn = match[1].charCodeAt(0) - 32;
                handleMouseWheel(btn);
            }

            if (hasMouse) {
                str = str.replace(sgrRegex, "").replace(normalRegex, "");
            }

            // Check if chunk ends with a partial escape sequence
            const partial = str.match(/\x1b(\[<?[0-9;]*)?$/);
            if (partial) {
                mousePartialBuffer = partial[0];
                str = str.slice(0, partial.index);
            }

            if (!str) {
                return true; // Fully consumed mouse sequences; do not forward to readline
            }
            args[0] = Buffer.from(str);
        }
        return origEmit(event, ...args);
    };

    process.stdin.emit = mouseDataHandler;

    // Initial render in alternate screen
    renderFull();

    const onResize = () => {
        renderFull();
    };
    process.stdout.on("resize", onResize);

    return new Promise((resolve) => {
        let cleanedUp = false;

        const restoreReadlineListeners = () => {
            for (const fn of savedRlKeypressListeners) {
                if (!process.stdin.rawListeners("keypress").includes(fn)) {
                    process.stdin.on("keypress", fn);
                }
            }
        };

        const detachReadlineListeners = () => {
            for (const fn of savedRlKeypressListeners) {
                process.stdin.removeListener("keypress", fn);
            }
        };

        const suspendChatMode = () => {
            process.stdout.write("\x1b[?7h\x1b[?1006l\x1b[?1002l\x1b[?1000l\x1b[?1049l\x1b[?25h");
            process.stdin.removeListener("keypress", onKey);
            if (origEmit) {
                process.stdin.emit = origEmit;
            }
            restoreReadlineListeners();
            if (typeof process.stdin.setRawMode === "function") {
                process.stdin.setRawMode(false);
            }
            if (rl) {
                rl.resume();
            }
        };

        const resumeChatMode = () => {
            process.stdout.write("\x1b[?1049h\x1b[?1000h\x1b[?1002h\x1b[?1006h\x1b[2J\x1b[H");
            detachReadlineListeners();
            if (rl) {
                rl.pause();
            }
            if (typeof process.stdin.setRawMode === "function") {
                process.stdin.setRawMode(true);
            }
            process.stdin.resume();
            process.stdin.emit = mouseDataHandler;
            process.stdin.on("keypress", onKey);
        };

        const cleanup = () => {
            if (cleanedUp) return;
            cleanedUp = true;
            isExited = true;

            if (streamRenderTimer) {
                clearTimeout(streamRenderTimer);
                streamRenderTimer = null;
            }
            clearInterval(refreshTimer);

            process.stdout.removeListener("resize", onResize);
            process.stdin.removeListener("keypress", onKey);
            process.removeListener("SIGINT", sigintHandler);
            process.removeListener("exit", exitHandler);

            // Restore original stdin.emit and detached readline listeners
            if (origEmit) {
                process.stdin.emit = origEmit;
            }
            restoreReadlineListeners();

            // Disable mouse reporting, restore autowrap, restore primary screen buffer, show cursor
            process.stdout.write("\x1b[?7h\x1b[?1006l\x1b[?1002l\x1b[?1000l\x1b[?1049l\x1b[?25h");

            if (typeof process.stdin.setRawMode === "function") {
                process.stdin.setRawMode(false);
            }
            if (rl) {
                rl.resume();
            }
        };

        const sigintHandler = () => {
            cleanup();
            process.exit(0);
        };
        process.on("SIGINT", sigintHandler);

        const exitHandler = () => {
            cleanup();
        };
        process.on("exit", exitHandler);

        const onKey = async (str, key) => {
            // Exit on Ctrl+C
            if (key && key.ctrl && key.name === "c") {
                cleanup();
                process.exit(0);
            }

            // Keyboard scrolling: PageUp / PageDown / Up / Down
            const layout = getLayout();
            const maxScroll = getMaxScroll(layout);

            if (key && (key.name === "pageup" || (key.name === "up" && (key.ctrl || key.shift || !inputVal)))) {
                const step = key.name === "pageup" ? Math.max(2, Math.floor(layout.convHeight / 2)) : 1;
                scrollOffset = Math.min(maxScroll, scrollOffset + step);
                renderConversation(layout);
                return;
            }
            if (key && (key.name === "pagedown" || (key.name === "down" && (key.ctrl || key.shift || !inputVal)))) {
                const step = key.name === "pagedown" ? Math.max(2, Math.floor(layout.convHeight / 2)) : 1;
                scrollOffset = Math.max(0, scrollOffset - step);
                renderConversation(layout);
                return;
            }

            // Backspace / Delete
            if (key && (key.name === "backspace" || key.name === "delete")) {
                if (inputVal.length > 0) {
                    inputVal = inputVal.slice(0, -1);
                    scrollOffset = 0;
                    syncInputBox();
                }
                return;
            }

            // Submit on Enter
            if (key && (key.name === "return" || key.name === "enter")) {
                if (isStreaming) {
                    return; // Ignore Enter while inference is active
                }

                const submitted = inputVal.trim();
                inputVal = "";
                scrollOffset = 0; // Automatically return to latest messages on submit
                const postLayout = getLayout();
                currentInputRows = postLayout.inputRows;

                if (!submitted) {
                    renderConversation(postLayout);
                    renderInputBox(postLayout);
                    return;
                }

                const cmd = submitted.toLowerCase();

                // 1. /exit or /quit
                if (cmd === "/exit" || cmd === "/quit") {
                    cleanup();
                    console.log(`${colors.dim}Exiting TeamGPU.${colors.reset}`);
                    resolve();
                    return;
                }

                // 2. /clear
                if (cmd === "/clear") {
                    messages.length = 0;
                    messages.push({ role: "system", content: "[Conversation history cleared]" });
                    renderConversation(postLayout);
                    renderInputBox(postLayout);
                    return;
                }

                // 3. /help
                if (cmd === "/help") {
                    messages.push({
                        role: "system",
                        content: "Available Commands:\n  /models  - Switch active model on this laptop\n  /hosts   - Switch to a different laptop on LAN\n  /clear   - Clear conversation history\n  /exit    - Exit chat"
                    });
                    renderConversation(postLayout);
                    renderInputBox(postLayout);
                    return;
                }

                // 4. /models or /model
                if (cmd === "/models" || cmd === "/model") {
                    suspendChatMode();

                    const newModel = await selectModelPrompt(rl, currentHost, currentModel);
                    if (newModel && newModel !== currentModel) {
                        currentModel = newModel;
                        messages.push({ role: "system", content: `[Switched active model to ${currentModel}]` });
                    }

                    resumeChatMode();
                    renderFull();
                    return;
                }

                // 5. /hosts or /host
                if (cmd === "/hosts" || cmd === "/host") {
                    suspendChatMode();

                    const newHost = await selectHostPrompt(rl);
                    if (newHost) {
                        currentHost = { ...newHost };
                        const newModel = await selectModelPrompt(rl, currentHost);
                        if (newModel) currentModel = newModel;
                        messages.length = 0;
                        messages.push({ role: "system", content: `[Connected to ${currentHost.name} (${currentModel})]` });
                    }

                    resumeChatMode();
                    renderFull();
                    return;
                }

                // 6. Regular user prompt -> Send to LLM
                messages.push({
                    role: "user",
                    content: submitted
                });

                // Immediately update conversation and clear input box
                renderConversation(postLayout);
                renderInputBox(postLayout);

                isStreaming = true;
                currentStreamingText = "";
                const startTime = Date.now();
                let tokenCount = 0;

                try {
                    const response = await fetch(`${currentHost.url}/api/generate`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            model: currentModel,
                            messages,
                            stream: true
                        })
                    });

                    if (!response.ok) {
                        const errBody = await response.text();
                        messages.push({
                            role: "assistant",
                            content: `[Error ${response.status}] ${errBody}`,
                            isError: true
                        });
                        isStreaming = false;
                        renderConversation(getLayout());
                        return;
                    }

                    const reader = response.body.getReader();
                    const decoder = new TextDecoder();
                    let buffer = "";

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        buffer += decoder.decode(value, { stream: true });
                        let newlineIdx;
                        while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
                            const line = buffer.slice(0, newlineIdx).trim();
                            buffer = buffer.slice(newlineIdx + 1);

                            if (!line) continue;
                            try {
                                const data = JSON.parse(line);
                                const token = data.message?.content || data.response || "";
                                if (token) {
                                    currentStreamingText += token;
                                    tokenCount++;
                                    scheduleStreamRender();
                                }
                            } catch {
                                // malformed or partial line; skip
                            }
                        }
                    }

                    // Flush remaining decoded buffer bytes
                    buffer += decoder.decode();
                    if (buffer.trim()) {
                        try {
                            const data = JSON.parse(buffer.trim());
                            const token = data.message?.content || data.response || "";
                            if (token) {
                                currentStreamingText += token;
                                tokenCount++;
                            }
                        } catch {
                            // ignore
                        }
                    }

                    // Cancel pending throttle timer and execute final render
                    if (streamRenderTimer) {
                        clearTimeout(streamRenderTimer);
                        streamRenderTimer = null;
                    }

                    const elapsedMs = Date.now() - startTime;
                    const tokPerSec = (tokenCount / Math.max(0.05, elapsedMs / 1000)).toFixed(1);

                    messages.push({
                        role: "assistant",
                        content: currentStreamingText,
                        meta: `${currentModel} · ${elapsedMs}ms · ${tokPerSec} tok/s`
                    });
                } catch (error) {
                    if (streamRenderTimer) {
                        clearTimeout(streamRenderTimer);
                        streamRenderTimer = null;
                    }
                    messages.push({
                        role: "assistant",
                        content: `Failed to communicate with ${currentHost.url}: ${error.message}`,
                        isError: true
                    });
                } finally {
                    isStreaming = false;
                    currentStreamingText = "";
                    const endLayout = getLayout();
                    currentInputRows = endLayout.inputRows;
                    renderConversation(endLayout);
                    renderInputBox(endLayout);
                }

                return;
            }

            // Normal typing or pasting printable characters into input box
            if (str && !key?.ctrl && !key?.meta && !/[\x00-\x1f\x7f]/.test(str)) {
                inputVal += str;
                scrollOffset = 0;
                syncInputBox();
            }
        };

        process.stdin.on("keypress", onKey);
    });
}
