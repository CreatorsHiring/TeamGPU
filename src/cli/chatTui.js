import readline from "node:readline";
import { spawn, execSync } from "node:child_process";
import { colors, stripAnsi, getTerminalDimensions, openSettingsModalPopup } from "./tui.js";
import { discoverHosts, probeHost } from "../discovery/client.js";
import { getPreferredMode, setPreferredMode } from "../utils/config.js";
import { getDeviceIdentity } from "../utils/device.js";

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
export function buildCardRow(text, textColor, cardWidth, selStartInLine = 0, selEndInLine = 0) {
    const safeWidth = Math.max(4, cardWidth);
    const leftInnerPad = 2;
    const minRightInnerPad = 1;
    const maxTextWidth = Math.max(1, safeWidth - leftInnerPad - minRightInnerPad);
    const clipped = clipToWidth(text, maxTextWidth);
    const visCells = getCellWidth(clipped);
    const rightPad = Math.max(minRightInnerPad, safeWidth - leftInnerPad - visCells);

    const s0 = Math.max(0, Math.min(clipped.length, selStartInLine));
    const s1 = Math.max(0, Math.min(clipped.length, selEndInLine));
    let renderedText = `${textColor}${clipped}`;
    if (s0 < s1) {
        const before = clipped.slice(0, s0);
        const selected = clipped.slice(s0, s1);
        const after = clipped.slice(s1);
        const selStyle = "\x1b[48;2;255;168;108m\x1b[1;38;2;20;20;24m";
        renderedText = `${textColor}${before}${selStyle}${selected}\x1b[22m${colors.cardBg}${textColor}${after}`;
    }

    return ` ${colors.orange}▌${colors.cardBg}${" ".repeat(leftInnerPad)}${renderedText}${" ".repeat(rightPad)}${colors.reset}`;
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
        wrappedPrompt,
        visiblePromptLines,
        convStartRow,
        convEndRow,
        convHeight,
        cardWidth
    };
}

/**
 * Computes exact { line, start, end } character ranges in inputVal for each wrapped line.
 */
export function getWrappedLineRanges(inputVal, lines) {
    const ranges = [];
    let pos = 0;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const idx = line ? inputVal.indexOf(line, pos) : pos;
        const start = idx !== -1 ? idx : pos;
        const end = start + line.length;
        ranges.push({ line, start, end });
        pos = end;
        if (pos < inputVal.length && (inputVal[pos] === " " || inputVal[pos] === "\n")) {
            pos++;
        }
    }
    return ranges;
}

/**
 * Maps a flat character index in inputVal to { lineIndex, charOffset, lineStart } within wrapped lines.
 */
export function locateCursorInWrapped(inputVal, lines, cursorIndex) {
    const ranges = getWrappedLineRanges(inputVal, lines);
    for (let i = 0; i < ranges.length; i++) {
        const { line, start, end } = ranges[i];
        if (cursorIndex <= end || i === ranges.length - 1) {
            const offsetInLine = Math.max(0, Math.min(line.length, cursorIndex - start));
            return { lineIndex: i, charOffset: offsetInLine, lineStart: start };
        }
    }
    const lastIdx = Math.max(0, lines.length - 1);
    return { lineIndex: lastIdx, charOffset: (lines[lastIdx] || "").length, lineStart: 0 };
}

function copyToClipboard(text) {
    if (!text) return;
    try {
        if (process.platform === "win32") {
            const proc = spawn("clip", [], { stdio: ["pipe", "ignore", "ignore"] });
            proc.stdin.end(text);
        } else if (process.platform === "darwin") {
            const proc = spawn("pbcopy", [], { stdio: ["pipe", "ignore", "ignore"] });
            proc.stdin.end(text);
        } else {
            const proc = spawn("xclip", ["-selection", "clipboard"], { stdio: ["pipe", "ignore", "ignore"] });
            proc.on("error", () => {});
            proc.stdin.end(text);
        }
    } catch {
        // ignore clipboard binary failures; internalClipboard still works
    }
}

function readFromClipboard(fallback = "") {
    try {
        if (process.platform === "win32") {
            const out = execSync("powershell -NoProfile -Command Get-Clipboard", { encoding: "utf-8", timeout: 1000 });
            return out ? out.replace(/\r?\n$/, "") : fallback;
        }
        if (process.platform === "darwin") {
            return execSync("pbpaste", { encoding: "utf-8", timeout: 1000 });
        }
        return execSync("xclip -selection clipboard -o", { encoding: "utf-8", timeout: 1000 });
    } catch {
        return fallback;
    }
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
    let cursorIndex = 0;
    let selectionAnchor = null;
    let isDraggingSelection = false;
    let internalClipboard = "";

    const getSelectionRange = () => {
        if (selectionAnchor === null || selectionAnchor === cursorIndex) return null;
        return [
            Math.min(selectionAnchor, cursorIndex),
            Math.max(selectionAnchor, cursorIndex)
        ];
    };
    let scrollOffset = 0;
    let isStreaming = false;
    let isExited = false;

    // Stream throttling configuration (~30 FPS)
    const STREAM_RENDER_INTERVAL_MS = 33;
    let streamRenderTimer = null;
    let lastStreamRenderTime = 0;

    // Client tracking & heartbeat
    const clientIdentity = getDeviceIdentity();
    let heartbeatTimer = null;

    const sendHeartbeat = (targetHost = currentHost) => {
        if (!targetHost?.url || isExited) return;
        fetch(`${targetHost.url}/api/heartbeat`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-client-id": clientIdentity.id
            },
            body: JSON.stringify({
                clientId: clientIdentity.id,
                name: clientIdentity.name
            }),
            signal: AbortSignal.timeout(2000)
        }).catch(() => {});
    };

    const sendDisconnect = (targetHost = currentHost) => {
        if (!targetHost?.url) return;
        fetch(`${targetHost.url}/api/client/disconnect`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-client-id": clientIdentity.id
            },
            body: JSON.stringify({
                clientId: clientIdentity.id
            }),
            signal: AbortSignal.timeout(1000)
        }).catch(() => {});
    };

    sendHeartbeat(currentHost);
    heartbeatTimer = setInterval(() => sendHeartbeat(currentHost), 3000);

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
     * Supports arbitrary cursor placement inside wrapped lines and never crosses dividerCol.
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

        const wrappedAll = layout.wrappedPrompt || layout.visiblePromptLines || [""];
        const visibleLines = (layout.visiblePromptLines || [""]).slice(0, Math.max(1, layout.inputContentRows || 1));
        const sliceStart = Math.max(0, wrappedAll.length - visibleLines.length);
        const { lineIndex, charOffset } = locateCursorInWrapped(inputVal, wrappedAll, cursorIndex);
        const visibleIdx = Math.max(0, Math.min(visibleLines.length - 1, lineIndex - sliceStart));

        const cursorRow = Math.max(1, startRow + 1 + visibleIdx);
        const beforeCursor = (visibleLines[visibleIdx] || "").slice(0, charOffset);
        const clippedBefore = clipToWidth(beforeCursor, maxTextWidth);
        const cursorCol = Math.min(maxCursorCol, 5 + getCellWidth(clippedBefore));
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

        // Card Prompt Lines (explicitly clipped and padded inside cardBg, with selection highlight)
        if (!inputVal) {
            cardLines.push(buildCardRow(placeholder, colors.dim, innerCardWidth));
            for (let i = 1; i < targetPromptRows; i++) {
                cardLines.push(buildCardRow("", colors.white, innerCardWidth));
            }
        } else {
            const sel = getSelectionRange();
            const wrappedAll = layout.wrappedPrompt || layout.visiblePromptLines || [""];
            const promptLines = (layout.visiblePromptLines || [""]).slice(0, targetPromptRows);
            const allRanges = getWrappedLineRanges(inputVal, wrappedAll);
            const visibleRanges = allRanges.slice(-promptLines.length);

            for (let i = 0; i < promptLines.length; i++) {
                const range = visibleRanges[i] || { line: promptLines[i], start: 0, end: promptLines[i].length };
                const sel0 = sel ? Math.max(0, sel[0] - range.start) : 0;
                const sel1 = sel ? Math.max(0, Math.min(promptLines[i].length, sel[1] - range.start)) : 0;
                cardLines.push(buildCardRow(promptLines[i], colors.white, innerCardWidth, sel0, sel1));
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

    let activePopup = null;

    // Independent background hardware monitor (refreshes sidebar strictly in sidebar columns every 4s)
    const refreshTimer = setInterval(async () => {
        if (isExited || isStreaming || activePopup) return;
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
        if (!isExited && !isStreaming && !activePopup) {
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
    // \x1b[1 q          : Blinking bold block cursor
    // \x1b]12;#ffffff\x07: Pure white cursor color
    process.stdout.write("\x1b[?1049h\x1b[?1000h\x1b[?1002h\x1b[?1006h\x1b[1 q\x1b]12;#ffffff\x07\x1b[2J\x1b[H");

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

    const locateCharFromMouse = (layout, col, row) => {
        if (!inputVal) return 0;
        const promptStartRow = layout.rows - layout.inputRows + 2;
        const wrappedAll = layout.wrappedPrompt || layout.visiblePromptLines || [""];
        const visibleLines = (layout.visiblePromptLines || [""]).slice(0, Math.max(1, layout.inputContentRows || 1));
        const allRanges = getWrappedLineRanges(inputVal, wrappedAll);
        const visibleRanges = allRanges.slice(-visibleLines.length);

        const clampedVisIdx = Math.max(0, Math.min(visibleRanges.length - 1, row - promptStartRow));
        const range = visibleRanges[clampedVisIdx];
        if (!range) return inputVal.length;

        if (row < promptStartRow) return range.start;
        if (row >= promptStartRow + visibleLines.length) return range.end;

        const targetCell = Math.max(0, col - 5);
        let cells = 0;
        let charCount = 0;
        for (const ch of range.line) {
            const w = charDisplayWidth(ch.codePointAt(0));
            if (cells + w / 2 >= targetCell) break;
            cells += w;
            charCount += ch.length;
        }
        return Math.max(0, Math.min(inputVal.length, range.start + charCount));
    };

    const handleMouseEvent = ({ btn, col, row, action }) => {
        if (activePopup) {
            activePopup.onMouse({ btn, col, row, action });
            return;
        }
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
            return;
        }

        const layout = getLayout();
        const inputStartRow = layout.rows - layout.inputRows + 1;
        const inputEndRow = layout.rows - 1;

        // Left mouse press inside input card -> place cursor & start selection
        if (btn === 0 && action === "M") {
            if (col <= layout.leftWidth && row >= inputStartRow && row <= inputEndRow) {
                const idx = locateCharFromMouse(layout, col, row);
                selectionAnchor = idx;
                cursorIndex = idx;
                isDraggingSelection = true;
                renderInputBox(layout);
            } else if (selectionAnchor !== null) {
                selectionAnchor = null;
                isDraggingSelection = false;
                renderInputBox(layout);
            }
            return;
        }

        // Mouse drag with left button held -> extend selection across input text
        if (isDraggingSelection && (btn & 32) !== 0) {
            const idx = locateCharFromMouse(layout, col, row);
            if (idx !== cursorIndex) {
                cursorIndex = idx;
                renderInputBox(layout);
            }
            return;
        }

        // Mouse button release -> finalize selection
        if (action === "m" && isDraggingSelection) {
            isDraggingSelection = false;
            if (selectionAnchor === cursorIndex) {
                selectionAnchor = null;
            }
            renderInputBox(layout);
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
                const col = parseInt(match[2], 10);
                const row = parseInt(match[3], 10);
                const action = match[4];
                handleMouseEvent({ btn, col, row, action });
            }

            while ((match = normalRegex.exec(str)) !== null) {
                hasMouse = true;
                const btn = match[1].charCodeAt(0) - 32;
                const col = match[1].charCodeAt(1) - 32;
                const row = match[1].charCodeAt(2) - 32;
                handleMouseEvent({ btn, col, row, action: "M" });
            }

            if (hasMouse) {
                str = str.replace(sgrRegex, "").replace(normalRegex, "");
            }

            // Check if chunk ends with a partial mouse escape sequence (\x1b[<... or \x1b[M...)
            const partial = str.match(/(\x1b\[<[0-9;]*|\x1b\[M[\s\S]{0,2})$/);
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
        if (activePopup) {
            activePopup.render();
        }
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

        const cleanup = () => {
            if (cleanedUp) return;
            cleanedUp = true;
            isExited = true;

            if (streamRenderTimer) {
                clearTimeout(streamRenderTimer);
                streamRenderTimer = null;
            }
            if (heartbeatTimer) {
                clearInterval(heartbeatTimer);
                heartbeatTimer = null;
            }
            sendDisconnect(currentHost);
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

            // Disable mouse reporting, restore cursor shape/color, restore autowrap, restore primary screen buffer, show cursor
            process.stdout.write("\x1b[?7h\x1b[?1003l\x1b[?1006l\x1b[?1002l\x1b[?1000l\x1b[0 q\x1b]112\x07\x1b[?1049l\x1b[?25h");

            if (typeof process.stdin.setRawMode === "function") {
                process.stdin.setRawMode(false);
            }
            if (rl) {
                rl.resume();
            }
        };

        /**
         * Opens an in-place centered modal popup over the chat interface.
         * Supports live Search filtering, Up/Down arrow navigation, mouse hover highlight,
         * mouse click selection, click-outside dismissal, and Esc cancellation.
         */
        const openSelectionPopup = ({
            title,
            items: initialItems = [],
            activeValue,
            emptyMessage = "No items available",
            subtitle = ""
        }) => {
            let allItems = [...initialItems];
            let currentSubtitle = subtitle;
            let searchQuery = "";
            let scrollTop = 0;
            let isClosed = false;

            const getFiltered = () => {
                if (!searchQuery.trim()) return allItems;
                const q = searchQuery.trim().toLowerCase();
                return allItems.filter((item) =>
                    (item.label || "").toLowerCase().includes(q) ||
                    (item.searchText || "").toLowerCase().includes(q)
                );
            };

            let filtered = getFiltered();
            let selectedIndex = Math.max(0, filtered.findIndex((it) => it.isActive || (activeValue !== undefined && it.value === activeValue)));

            const getPopupGeometry = () => {
                const { rows, cols } = getTerminalDimensions();
                const popupWidth = Math.max(36, Math.min(68, cols - 6));
                const leftCol = Math.max(2, Math.floor((cols - popupWidth) / 2) + 1);
                const rightCol = leftCol + popupWidth - 1;
                const innerWidth = popupWidth - 4;
                const maxVisibleItems = Math.max(3, Math.min(14, rows - 10));
                const visibleCount = Math.min(maxVisibleItems, Math.max(1, allItems.length));
                // 1 top pad + 1 header + 1 gap + 1 search + 1 gap + visibleCount + 1 gap + 1 footer + 1 bottom pad
                const totalHeight = 8 + visibleCount;
                const topRow = Math.max(2, Math.floor((rows - totalHeight) / 2) + 1);
                const bottomRow = topRow + totalHeight - 1;
                const listStartRow = topRow + 5;
                const listEndRow = listStartRow + visibleCount - 1;
                return {
                    rows, cols, popupWidth, leftCol, rightCol, innerWidth,
                    visibleCount, totalHeight, topRow, bottomRow, listStartRow, listEndRow
                };
            };

            const clampSelection = (geom) => {
                filtered = getFiltered();
                if (filtered.length === 0) {
                    selectedIndex = 0;
                    scrollTop = 0;
                    return;
                }
                selectedIndex = Math.max(0, Math.min(selectedIndex, filtered.length - 1));
                if (selectedIndex < scrollTop) {
                    scrollTop = selectedIndex;
                } else if (selectedIndex >= scrollTop + geom.visibleCount) {
                    scrollTop = selectedIndex - geom.visibleCount + 1;
                }
                scrollTop = Math.max(0, Math.min(scrollTop, Math.max(0, filtered.length - geom.visibleCount)));
            };

            const renderPopup = () => {
                if (isClosed || isExited) return;
                const geom = getPopupGeometry();
                clampSelection(geom);

                const modalBg = "\x1b[48;2;24;25;32m";
                const hoverBg = "\x1b[48;2;255;168;108m";
                const hoverFg = "\x1b[1;38;2;20;20;24m";
                const hoverMetaFg = "\x1b[22;38;2;65;50;35m";
                const cursorBlock = "\x1b[48;2;245;150;80m\x1b[38;2;20;20;24m";
                const normalMetaFg = "\x1b[22;2;37m";

                const makeModalRow = (content, contentCells) => {
                    const pad = Math.max(0, geom.innerWidth - contentCells);
                    return `${modalBg}  ${content}${modalBg}${" ".repeat(pad)}  ${colors.reset}`;
                };

                const rowsOut = [];
                // 1. Top padding
                rowsOut.push(`${modalBg}${" ".repeat(geom.popupWidth)}${colors.reset}`);

                // 2. Header: Title on left, status/esc on right
                const rightText = currentSubtitle ? `${currentSubtitle} · esc` : "esc";
                const clippedTitle = clipToWidth(title, Math.max(8, geom.innerWidth - getCellWidth(rightText) - 2));
                const titleGap = Math.max(1, geom.innerWidth - getCellWidth(clippedTitle) - getCellWidth(rightText));
                rowsOut.push(makeModalRow(
                    `${colors.white}${clippedTitle}${" ".repeat(titleGap)}${normalMetaFg}${rightText}`,
                    getCellWidth(clippedTitle) + titleGap + getCellWidth(rightText)
                ));

                // 3. Gap
                rowsOut.push(`${modalBg}${" ".repeat(geom.popupWidth)}${colors.reset}`);

                // 4. Search row
                if (!searchQuery) {
                    const searchContent = `${cursorBlock}S${modalBg}${normalMetaFg}earch`;
                    rowsOut.push(makeModalRow(searchContent, 6));
                } else {
                    const qClipped = clipToWidth(searchQuery, Math.max(1, geom.innerWidth - 1));
                    const qCells = getCellWidth(qClipped);
                    const searchContent = `${colors.white}${qClipped}${cursorBlock} ${modalBg}`;
                    rowsOut.push(makeModalRow(searchContent, qCells + 1));
                }

                // 5. Gap
                rowsOut.push(`${modalBg}${" ".repeat(geom.popupWidth)}${colors.reset}`);

                // 6. Item list rows
                if (filtered.length === 0) {
                    const emptyClipped = clipToWidth(emptyMessage, Math.max(4, geom.innerWidth - 2));
                    rowsOut.push(makeModalRow(`${normalMetaFg}  ${emptyClipped}`, 2 + getCellWidth(emptyClipped)));
                    for (let i = 1; i < geom.visibleCount; i++) {
                        rowsOut.push(`${modalBg}${" ".repeat(geom.popupWidth)}${colors.reset}`);
                    }
                } else {
                    for (let i = 0; i < geom.visibleCount; i++) {
                        const idx = scrollTop + i;
                        if (idx >= filtered.length) {
                            rowsOut.push(`${modalBg}${" ".repeat(geom.popupWidth)}${colors.reset}`);
                            continue;
                        }
                        const item = filtered[idx];
                        const isHovered = (idx === selectedIndex);
                        const isActive = Boolean(item.isActive || (activeValue !== undefined && item.value === activeValue));
                        const rowBg = isHovered ? hoverBg : modalBg;
                        const bullet = isActive ? "● " : "  ";
                        const bulletFg = isHovered ? hoverFg : (isActive ? colors.orange : "");
                        const labelFg = isHovered ? hoverFg : (isActive ? colors.orange : colors.white);
                        const metaFg = isHovered ? hoverMetaFg : normalMetaFg;

                        const metaText = item.meta ? clipToWidth(item.meta, Math.floor(geom.innerWidth * 0.42)) : "";
                        const metaCells = getCellWidth(metaText);
                        const maxLabelWidth = Math.max(4, geom.innerWidth - 2 - (metaCells > 0 ? metaCells + 2 : 0));
                        const labelText = clipToWidth(item.label, maxLabelWidth);
                        const labelCells = getCellWidth(labelText);
                        const gap = Math.max(0, geom.innerWidth - 2 - labelCells - metaCells);

                        rowsOut.push(
                            `${rowBg}  ${bulletFg}${bullet}${labelFg}${labelText}${" ".repeat(gap)}${metaFg}${metaText}  ${colors.reset}`
                        );
                    }
                }

                // 7. Gap
                rowsOut.push(`${modalBg}${" ".repeat(geom.popupWidth)}${colors.reset}`);

                // 8. Footer hints
                const footerText = clipToWidth("↑/↓ navigate   enter select   esc close", geom.innerWidth);
                rowsOut.push(makeModalRow(`${normalMetaFg}${footerText}`, getCellWidth(footerText)));

                // 9. Bottom padding
                rowsOut.push(`${modalBg}${" ".repeat(geom.popupWidth)}${colors.reset}`);

                process.stdout.write("\x1b[?25l\x1b[?7l");
                try {
                    let out = "";
                    for (let i = 0; i < rowsOut.length; i++) {
                        out += `\x1b[${geom.topRow + i};${geom.leftCol}H${rowsOut[i]}`;
                    }
                    process.stdout.write(out);
                } finally {
                    process.stdout.write("\x1b[?7h");
                }
            };

            let resolvePopup;
            const promise = new Promise((res) => {
                resolvePopup = res;
            });

            const closePopup = (result) => {
                if (isClosed) return;
                isClosed = true;
                activePopup = null;
                // Disable any-event mouse motion tracking when popup closes
                process.stdout.write("\x1b[?1003l");
                renderFull();
                resolvePopup(result);
            };

            activePopup = {
                render: renderPopup,
                onMouse: ({ btn, col, row, action }) => {
                    if (isClosed) return;
                    const geom = getPopupGeometry();

                    // Mouse wheel scroll inside popup
                    if ((btn & 64) !== 0) {
                        if (filtered.length > geom.visibleCount) {
                            if ((btn & 3) === 0) {
                                scrollTop = Math.max(0, scrollTop - 2);
                                selectedIndex = Math.max(0, selectedIndex - 2);
                            } else if ((btn & 3) === 1) {
                                scrollTop = Math.min(Math.max(0, filtered.length - geom.visibleCount), scrollTop + 2);
                                selectedIndex = Math.min(filtered.length - 1, selectedIndex + 2);
                            }
                            renderPopup();
                        }
                        return;
                    }

                    // Hover (motion bit 32)
                    if ((btn & 32) !== 0) {
                        if (col >= geom.leftCol && col <= geom.rightCol && row >= geom.listStartRow && row <= geom.listEndRow) {
                            const idx = scrollTop + (row - geom.listStartRow);
                            if (idx >= 0 && idx < filtered.length && idx !== selectedIndex) {
                                selectedIndex = idx;
                                renderPopup();
                            }
                        }
                        return;
                    }

                    // Left click (btn === 0, press 'M')
                    if (btn === 0 && action === "M") {
                        const insideBox = col >= geom.leftCol && col <= geom.rightCol && row >= geom.topRow && row <= geom.bottomRow;
                        if (!insideBox) {
                            closePopup(null);
                            return;
                        }
                        if (row >= geom.listStartRow && row <= geom.listEndRow) {
                            const idx = scrollTop + (row - geom.listStartRow);
                            if (idx >= 0 && idx < filtered.length) {
                                closePopup(filtered[idx].value);
                            }
                        }
                    }
                },
                onKey: (str, key) => {
                    if (isClosed) return;
                    if (key && key.name === "escape") {
                        closePopup(null);
                        return;
                    }
                    if (key && key.name === "up") {
                        if (filtered.length > 0) {
                            selectedIndex = (selectedIndex - 1 + filtered.length) % filtered.length;
                            renderPopup();
                        }
                        return;
                    }
                    if (key && key.name === "down") {
                        if (filtered.length > 0) {
                            selectedIndex = (selectedIndex + 1) % filtered.length;
                            renderPopup();
                        }
                        return;
                    }
                    if (key && (key.name === "return" || key.name === "enter")) {
                        const chosen = filtered[selectedIndex] ? filtered[selectedIndex].value : null;
                        closePopup(chosen);
                        return;
                    }
                    if (key && (key.name === "backspace" || key.name === "delete")) {
                        if (searchQuery.length > 0) {
                            searchQuery = searchQuery.slice(0, -1);
                            selectedIndex = 0;
                            scrollTop = 0;
                            renderPopup();
                        }
                        return;
                    }
                    if (str && !key?.ctrl && !key?.meta && !/[\x00-\x1f\x7f]/.test(str)) {
                        searchQuery += str;
                        selectedIndex = 0;
                        scrollTop = 0;
                        renderPopup();
                    }
                }
            };

            // Enable any-event mouse tracking (1003h) so hover highlights rows immediately
            process.stdout.write("\x1b[?1003h");
            renderPopup();

            return {
                promise,
                updateItems: (newItems, newSubtitle = "") => {
                    if (isClosed) return;
                    allItems = [...newItems];
                    currentSubtitle = newSubtitle;
                    const oldH = getPopupGeometry().totalHeight;
                    const newFiltered = getFiltered();
                    selectedIndex = Math.max(0, newFiltered.findIndex((it) => it.isActive || (activeValue !== undefined && it.value === activeValue)));
                    if (getPopupGeometry().totalHeight !== oldH) {
                        renderFull();
                    }
                    renderPopup();
                }
            };
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

            // Route all keyboard input to active modal popup when open
            if (activePopup) {
                activePopup.onKey(str, key);
                return;
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

            const deleteActiveSelection = () => {
                const sel = getSelectionRange();
                if (!sel) return false;
                inputVal = inputVal.slice(0, sel[0]) + inputVal.slice(sel[1]);
                cursorIndex = sel[0];
                selectionAnchor = null;
                return true;
            };

            // Ctrl+X: Cut selected text (or entire input if no selection) to clipboard
            if (key && key.ctrl && key.name === "x") {
                const sel = getSelectionRange();
                if (sel) {
                    const cutText = inputVal.slice(sel[0], sel[1]);
                    internalClipboard = cutText;
                    copyToClipboard(cutText);
                    deleteActiveSelection();
                    scrollOffset = 0;
                    syncInputBox();
                } else if (inputVal.length > 0) {
                    internalClipboard = inputVal;
                    copyToClipboard(inputVal);
                    inputVal = "";
                    cursorIndex = 0;
                    selectionAnchor = null;
                    scrollOffset = 0;
                    syncInputBox();
                }
                return;
            }

            // Ctrl+V / Ctrl+Y: Paste from clipboard at cursorIndex (replacing selection if any)
            if (key && key.ctrl && (key.name === "v" || key.name === "y")) {
                const pasted = readFromClipboard(internalClipboard).replace(/[\r\n]+/g, " ");
                if (pasted) {
                    deleteActiveSelection();
                    inputVal = inputVal.slice(0, cursorIndex) + pasted + inputVal.slice(cursorIndex);
                    cursorIndex += pasted.length;
                    scrollOffset = 0;
                    syncInputBox();
                }
                return;
            }

            // Ctrl+A: Select all text in input box
            if (key && key.ctrl && key.name === "a") {
                if (inputVal.length > 0) {
                    selectionAnchor = 0;
                    cursorIndex = inputVal.length;
                    renderInputBox(layout);
                }
                return;
            }

            // Home / Shift+Home
            if (key && key.name === "home") {
                if (key.shift) {
                    if (selectionAnchor === null) selectionAnchor = cursorIndex;
                } else {
                    selectionAnchor = null;
                }
                cursorIndex = 0;
                renderInputBox(layout);
                return;
            }

            // Ctrl+E / End / Shift+End
            if (key && ((key.ctrl && key.name === "e") || key.name === "end")) {
                if (key.shift && !key.ctrl) {
                    if (selectionAnchor === null) selectionAnchor = cursorIndex;
                } else {
                    selectionAnchor = null;
                }
                cursorIndex = inputVal.length;
                renderInputBox(layout);
                return;
            }

            // Ctrl+U: Delete from start of input to cursor
            if (key && key.ctrl && key.name === "u") {
                if (deleteActiveSelection() || cursorIndex > 0) {
                    if (cursorIndex > 0 && selectionAnchor === null) {
                        inputVal = inputVal.slice(cursorIndex);
                        cursorIndex = 0;
                    }
                    scrollOffset = 0;
                    syncInputBox();
                }
                return;
            }

            // Ctrl+K: Delete from cursor to end of input
            if (key && key.ctrl && key.name === "k") {
                if (deleteActiveSelection() || cursorIndex < inputVal.length) {
                    if (cursorIndex < inputVal.length && selectionAnchor === null) {
                        inputVal = inputVal.slice(0, cursorIndex);
                    }
                    scrollOffset = 0;
                    syncInputBox();
                }
                return;
            }

            // Ctrl+W / Ctrl+Backspace: Delete previous word (or active selection)
            if (key && key.ctrl && (key.name === "w" || key.name === "backspace")) {
                if (deleteActiveSelection()) {
                    scrollOffset = 0;
                    syncInputBox();
                    return;
                }
                if (cursorIndex > 0) {
                    const before = inputVal.slice(0, cursorIndex);
                    const trimmedEnd = before.replace(/\s+$/, "");
                    const lastSpace = trimmedEnd.lastIndexOf(" ");
                    const newIdx = lastSpace === -1 ? 0 : lastSpace + 1;
                    inputVal = inputVal.slice(0, newIdx) + inputVal.slice(cursorIndex);
                    cursorIndex = newIdx;
                    scrollOffset = 0;
                    syncInputBox();
                }
                return;
            }

            // Left / Shift+Left / Ctrl+Left / Ctrl+Shift+Left
            if (key && key.name === "left") {
                if (key.shift) {
                    if (selectionAnchor === null) selectionAnchor = cursorIndex;
                    if (cursorIndex > 0) {
                        if (key.ctrl) {
                            const before = inputVal.slice(0, cursorIndex).replace(/\s+$/, "");
                            const lastSpace = before.lastIndexOf(" ");
                            cursorIndex = lastSpace === -1 ? 0 : lastSpace + 1;
                        } else {
                            cursorIndex--;
                        }
                    }
                    if (selectionAnchor === cursorIndex) selectionAnchor = null;
                    renderInputBox(layout);
                    return;
                }
                const hadSel = getSelectionRange();
                if (hadSel) {
                    cursorIndex = hadSel[0];
                    selectionAnchor = null;
                    renderInputBox(layout);
                } else if (cursorIndex > 0) {
                    if (key.ctrl) {
                        const before = inputVal.slice(0, cursorIndex).replace(/\s+$/, "");
                        const lastSpace = before.lastIndexOf(" ");
                        cursorIndex = lastSpace === -1 ? 0 : lastSpace + 1;
                    } else {
                        cursorIndex--;
                    }
                    renderInputBox(layout);
                }
                return;
            }

            // Right / Shift+Right / Ctrl+Right / Ctrl+Shift+Right
            if (key && key.name === "right") {
                if (key.shift) {
                    if (selectionAnchor === null) selectionAnchor = cursorIndex;
                    if (cursorIndex < inputVal.length) {
                        if (key.ctrl) {
                            const after = inputVal.slice(cursorIndex);
                            const match = after.match(/^\s*\S+/);
                            cursorIndex = match ? cursorIndex + match[0].length : inputVal.length;
                        } else {
                            cursorIndex++;
                        }
                    }
                    if (selectionAnchor === cursorIndex) selectionAnchor = null;
                    renderInputBox(layout);
                    return;
                }
                const hadSel = getSelectionRange();
                if (hadSel) {
                    cursorIndex = hadSel[1];
                    selectionAnchor = null;
                    renderInputBox(layout);
                } else if (cursorIndex < inputVal.length) {
                    if (key.ctrl) {
                        const after = inputVal.slice(cursorIndex);
                        const match = after.match(/^\s*\S+/);
                        cursorIndex = match ? cursorIndex + match[0].length : inputVal.length;
                    } else {
                        cursorIndex++;
                    }
                    renderInputBox(layout);
                }
                return;
            }

            // Backspace: Delete active selection, or character before cursor
            if (key && key.name === "backspace") {
                if (deleteActiveSelection()) {
                    scrollOffset = 0;
                    syncInputBox();
                } else if (cursorIndex > 0) {
                    inputVal = inputVal.slice(0, cursorIndex - 1) + inputVal.slice(cursorIndex);
                    cursorIndex--;
                    scrollOffset = 0;
                    syncInputBox();
                }
                return;
            }

            // Delete: Delete active selection, or character at cursor
            if (key && key.name === "delete") {
                if (deleteActiveSelection()) {
                    scrollOffset = 0;
                    syncInputBox();
                } else if (cursorIndex < inputVal.length) {
                    inputVal = inputVal.slice(0, cursorIndex) + inputVal.slice(cursorIndex + 1);
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
                cursorIndex = 0;
                selectionAnchor = null;
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
                        content: "Available Commands:\n  /settings - Select preferred mode (Client / Host)\n  /models  - Switch active model on this laptop\n  /hosts   - Switch to a different laptop on LAN\n  /clear   - Clear conversation history\n  /exit    - Exit chat"
                    });
                    renderConversation(postLayout);
                    renderInputBox(postLayout);
                    return;
                }

                // 3.5. /settings -> In-place modal popup
                if (cmd === "/settings") {
                    renderConversation(postLayout);
                    renderInputBox(postLayout);

                    const preferred = getPreferredMode();
                    openSettingsModalPopup({
                        initialSavedMode: preferred,
                        onClose: () => {
                            renderFull();
                        },
                        onSelect: (chosenMode) => {
                            if (chosenMode === "client") {
                                setPreferredMode("client");
                                messages.push({ role: "system", content: "[Settings: Saved preferred mode 'Client']" });
                                renderFull();
                            } else if (chosenMode === "host") {
                                messages.push({ role: "system", content: "[Settings: To start Host mode, exit chat and run 'teamgpu host']" });
                                renderFull();
                            }
                        }
                    });
                    return;
                }

                // 4. /models or /model -> In-place centered popup
                if (cmd === "/models" || cmd === "/model") {
                    renderConversation(postLayout);
                    renderInputBox(postLayout);

                    const initialModels = currentHost.models || (currentModel ? [currentModel] : []);
                    const modelItems = (list) => list.map((m) => ({
                        label: m,
                        value: m,
                        isActive: m === currentModel,
                        meta: m === currentModel ? "Active" : ""
                    }));

                    const popup = openSelectionPopup({
                        title: "Select model",
                        items: modelItems(initialModels),
                        activeValue: currentModel,
                        emptyMessage: "No models found",
                        subtitle: currentHost.name || ""
                    });

                    // Refresh model list from host in background while popup is open
                    probeHost(currentHost.url, 1800).then((fresh) => {
                        if (fresh?.models?.length > 0) {
                            currentHost = { ...currentHost, ...fresh, online: true };
                            popup.updateItems(modelItems(fresh.models), currentHost.name || "");
                        }
                    }).catch(() => {});

                    const chosenModel = await popup.promise;
                    if (chosenModel && chosenModel !== currentModel) {
                        currentModel = chosenModel;
                        messages.push({ role: "system", content: `[Switched active model to ${currentModel}]` });
                        renderFull();
                    }
                    return;
                }

                // 5. /hosts or /host -> In-place centered popup
                if (cmd === "/hosts" || cmd === "/host") {
                    renderConversation(postLayout);
                    renderInputBox(postLayout);

                    const hostItems = (list) => list.map((h) => {
                        const isCur = h.url === currentHost.url || (h.name === currentHost.name && h.ip === currentHost.ip);
                        const gpuShort = h.gpu?.detected ? (h.gpu.model || "GPU").replace(/NVIDIA GeForce /i, "") : "CPU";
                        const statusDot = h.ollama?.running !== false ? "Online" : "Offline";
                        return {
                            label: h.name || h.ip || h.url,
                            value: h,
                            isActive: isCur,
                            searchText: `${h.ip || ""} ${gpuShort}`,
                            meta: `${gpuShort} · ${statusDot}`
                        };
                    });

                    const popup = openSelectionPopup({
                        title: "Select host",
                        items: hostItems([currentHost]),
                        activeValue: currentHost,
                        emptyMessage: "No TeamGPU hosts found",
                        subtitle: "Scanning LAN..."
                    });

                    // Discover hosts on LAN without leaving the chat screen
                    discoverHosts({ timeoutMs: 1800 }).then((found) => {
                        const list = found.length > 0 ? found : [currentHost];
                        if (!list.some((h) => h.url === currentHost.url)) {
                            list.unshift(currentHost);
                        }
                        popup.updateItems(hostItems(list), `${list.length} found`);
                    }).catch(() => {
                        popup.updateItems(hostItems([currentHost]), "1 host");
                    });

                    const chosenHost = await popup.promise;
                    if (chosenHost && (chosenHost.url !== currentHost.url || chosenHost.name !== currentHost.name)) {
                        sendDisconnect(currentHost);
                        currentHost = { ...chosenHost, online: true };
                        sendHeartbeat(currentHost);
                        if (Array.isArray(currentHost.models) && currentHost.models.length > 0) {
                            if (!currentHost.models.includes(currentModel)) {
                                currentModel = currentHost.models[0];
                            }
                        }
                        messages.push({ role: "system", content: `[Switched host to ${currentHost.name} (${currentModel})]` });
                        renderFull();
                    }
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
                        headers: {
                            "Content-Type": "application/json",
                            "x-client-id": clientIdentity.id
                        },
                        body: JSON.stringify({
                            model: currentModel,
                            messages,
                            stream: true,
                            clientId: clientIdentity.id,
                            clientName: clientIdentity.name
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
                deleteActiveSelection();
                inputVal = inputVal.slice(0, cursorIndex) + str + inputVal.slice(cursorIndex);
                cursorIndex += str.length;
                scrollOffset = 0;
                syncInputBox();
            }
        };

        process.stdin.on("keypress", onKey);
    });
}
