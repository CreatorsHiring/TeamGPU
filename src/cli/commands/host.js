import express from "express";
import machineRoute from "../../routes/machine.js";
import generateRoute from "../../routes/generate.js";
import heartbeatRoute from "../../routes/heartbeat.js";
import { startHostDiscovery, stopHostDiscovery } from "../../discovery/host.js";
import { scanMachine } from "../../scanner.js";
import { createSystemMonitor } from "../../utils/monitor.js";
import {
    colors,
    colorFire,
    stripAnsi,
    getTerminalDimensions,
    centerText
} from "../tui.js";
import { getCellWidth, clipToWidth } from "../chatTui.js";

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

const CARD_ROW_COUNT = 13;
const LOGO_WIDTH = 64; // TEAM_ASCII[0].length (36) + 1 space + GPU_ASCII[0].length (27)

/**
 * Computes dashboard layout dimensions ensuring all sections center uniformly.
 */
export function getDashboardLayout() {
    const { rows, cols } = getTerminalDimensions();
    // Use matching width with logo (64) or scale down gracefully for narrow terminals
    const cardWidth = Math.max(48, Math.min(cols - 4, 64));
    const leftPadLen = Math.max(0, Math.floor((cols - cardWidth) / 2));
    const leftCol = leftPadLen + 1;
    const leftPad = " ".repeat(leftPadLen);

    // Total content lines = logo (6) + gap (1) + heading (1) + subtitle (1) + gap (1) + card (13) + gap (1) + footer1 (1) + footer2 (1) = 26
    const totalLines = 26;
    const topPad = Math.max(0, Math.floor((rows - totalLines) / 2));
    const cardTopRow = topPad + 6 + 1 + 1 + 1 + 1 + 1; // 1-based row where card starts

    return {
        rows,
        cols,
        cardWidth,
        leftCol,
        leftPad,
        topPad,
        cardTopRow
    };
}

/**
 * Builds formatted card rows from the latest system metrics.
 * Every row has an explicitly enforced visible width identical to cardWidth.
 */
export function buildDashboardCardRows(metrics, port, layout, isAlreadyRunning = false) {
    const { cardWidth } = layout;
    const innerWidth = cardWidth - 1; // subtract 1 for orange accent bar '▌'
    const contentWidth = Math.max(10, innerWidth - 2); // 1 space left pad, 1 space right pad

    const fitAnsi = (str, maxCells) => {
        const visibleLen = getCellWidth(str);
        if (visibleLen <= maxCells) {
            return str + " ".repeat(maxCells - visibleLen);
        }
        return clipToWidth(str, maxCells);
    };

    const renderCardRow = (content = "") => {
        const contentCells = getCellWidth(content);
        const padCells = Math.max(0, contentWidth - contentCells);
        // Re-establish cardBg and white foreground immediately after any internal reset so the background remains solid and continuous
        const continuousContent = content.replace(/\x1b\[0m/g, `\x1b[0m${colors.cardBg}${colors.white}`);
        return `${colors.orange}▌${colors.reset}${colors.cardBg}${colors.white} ${continuousContent}${" ".repeat(padCells)} ${colors.reset}`;
    };

    const makeStatusRow = (leftText, rightText) => {
        const leftCells = getCellWidth(leftText);
        const rightCells = getCellWidth(rightText);
        const gap = Math.max(1, contentWidth - leftCells - rightCells);
        return renderCardRow(`${leftText}${" ".repeat(gap)}${rightText}`);
    };

    const colWidth = Math.max(10, Math.floor((contentWidth - 4) / 2));
    const colGap = Math.max(1, contentWidth - (colWidth * 2));

    const makeTwoColRow = (leftText, rightText) => {
        const leftPart = fitAnsi(leftText, colWidth);
        const rightPart = fitAnsi(rightText, colWidth);
        return renderCardRow(`${leftPart}${" ".repeat(colGap)}${rightPart}`);
    };

    // Format metric values safely
    const cpuPercentStr = metrics.cpu?.usagePercent !== null && metrics.cpu?.usagePercent !== undefined
        ? `${metrics.cpu.usagePercent}%`
        : "N/A";
    const cpuModelStr = metrics.cpu?.modelShort || "CPU";

    const gpuPercentStr = metrics.gpu?.detected && metrics.gpu?.usagePercent !== null && metrics.gpu?.usagePercent !== undefined
        ? `${metrics.gpu.usagePercent}%`
        : (metrics.gpu?.detected ? "0%" : "N/A");
    const gpuModelStr = metrics.gpu?.modelShort || "No dedicated GPU";

    const ramPercentStr = `${metrics.ram?.usagePercent ?? 0}%`;
    const ramSummaryStr = metrics.ram?.summary || "0.00 / 0.00 GB";

    const clientCount = metrics.clients?.count ?? 0;
    const clientDescStr = clientCount === 1 ? "1 active connection" : "Active connections";

    const ollamaOnline = Boolean(metrics.ollama?.running);
    const ollamaStatusText = ollamaOnline ? "Online" : "Offline";
    const modelsCount = metrics.ollama?.modelsCount ?? 0;
    const modelsText = ollamaOnline
        ? `${modelsCount} model${modelsCount === 1 ? "" : "s"} available`
        : "Server not running";

    const portText = isAlreadyRunning ? `Port ${port} (active)` : `Port ${port}`;

    const rows = [];
    // Line 0: Top padding inside card
    rows.push(renderCardRow(""));

    // Line 1: Header / Status (Host Active in green, Port in white)
    rows.push(makeStatusRow(
        `${colors.green}${colors.bold}● HOST ACTIVE${colors.reset}`,
        `${colors.white}${portText}${colors.reset}`
    ));

    // Line 2: Gap
    rows.push(renderCardRow(""));

    // Line 3: Metric Headers (Row 1 - white)
    rows.push(makeTwoColRow(
        `${colors.white}CPU UTILIZATION${colors.reset}`,
        `${colors.white}GPU UTILIZATION${colors.reset}`
    ));

    // Line 4: Metric Values (Row 1 - white)
    rows.push(makeTwoColRow(
        `${colors.white}${colors.bold}${cpuPercentStr}${colors.reset}`,
        `${colors.white}${colors.bold}${gpuPercentStr}${colors.reset}`
    ));

    // Line 5: Metric Subtitles (Row 1 - white)
    rows.push(makeTwoColRow(
        `${colors.white}${cpuModelStr}${colors.reset}`,
        `${colors.white}${gpuModelStr}${colors.reset}`
    ));

    // Line 6: Gap
    rows.push(renderCardRow(""));

    // Line 7: Metric Headers (Row 2 - white)
    rows.push(makeTwoColRow(
        `${colors.white}RAM UTILIZATION${colors.reset}`,
        `${colors.white}CONNECTED CLIENTS${colors.reset}`
    ));

    // Line 8: Metric Values (Row 2 - white)
    rows.push(makeTwoColRow(
        `${colors.white}${colors.bold}${ramPercentStr}${colors.reset}`,
        `${colors.white}${colors.bold}${clientCount}${colors.reset}`
    ));

    // Line 9: Metric Subtitles (Row 2 - white)
    rows.push(makeTwoColRow(
        `${colors.white}${ramSummaryStr}${colors.reset}`,
        `${colors.white}${clientDescStr}${colors.reset}`
    ));

    // Line 10: Gap
    rows.push(renderCardRow(""));

    // Line 11: Ollama status row (aligned to two columns, modelsText in column 2 under GPU/Active connections)
    rows.push(makeTwoColRow(
        `${colors.white}Ollama: ${ollamaStatusText}${colors.reset}`,
        `${colors.white}${modelsText}${colors.reset}`
    ));

    // Line 12: Bottom padding inside card
    rows.push(renderCardRow(""));

    return rows;
}

/**
 * Performs full initial draw of the centered Host Dashboard composition.
 */
export function renderFullDashboard(metricsOrOptions = {}, portArg = 3000, layoutArg = null, isAlreadyRunningArg = false) {
    let metrics = metricsOrOptions;
    let port = portArg || 3000;
    let layout = layoutArg;
    let isAlreadyRunning = isAlreadyRunningArg;

    if (metricsOrOptions && metricsOrOptions.scan) {
        port = metricsOrOptions.port || port;
        isAlreadyRunning = Boolean(metricsOrOptions.isAlreadyRunning);
        const scan = metricsOrOptions.scan;
        metrics = {
            cpu: { usagePercent: 15, modelShort: scan.cpu?.model ? scan.cpu.model.slice(0, 16).trim() : "CPU" },
            gpu: { detected: Boolean(scan.gpu?.detected), usagePercent: scan.gpu?.utilizationPercent ?? 0, modelShort: scan.gpu?.model || "GPU" },
            ram: { usagePercent: 50, summary: `${scan.memory?.usedGB || "8.0"} / ${scan.memory?.totalGB || "16.0"} GB` },
            clients: { count: 0 },
            ollama: { running: Boolean(scan.ollama?.running), modelsCount: scan.ollama?.models?.length || 0 }
        };
    }

    if (!layout) {
        layout = getDashboardLayout();
    }

    const { cols, topPad, leftPad } = layout;

    console.clear();
    process.stdout.write("\x1b[?25l"); // Hide cursor

    let out = "";
    if (topPad > 0) {
        out += "\n".repeat(topPad);
    }

    // 1. TeamGPU ASCII Logo (centered uniformly)
    for (let r = 0; r < TEAM_ASCII.length; r++) {
        const line = colors.white + TEAM_ASCII[r] + colors.reset + " " + colorFire(GPU_ASCII[r]);
        out += centerText(line, cols) + "\n";
    }
    out += "\n";

    // 2. Heading & Subtitle
    out += centerText(`${colors.white}${colors.bold}TeamGPU Host Dashboard${colors.reset}`, cols) + "\n";
    out += centerText(`${colors.dim}Sharing your GPU compute with the network${colors.reset}`, cols) + "\n\n";

    // 3. Card Rows
    const cardRows = buildDashboardCardRows(metrics, port, layout, isAlreadyRunning);
    for (const row of cardRows) {
        out += `${leftPad}${row}\n`;
    }
    out += "\n";

    // 4. Footers
    out += centerText(`${colors.dim}Clients can now connect and run models.${colors.reset}`, cols) + "\n";
    out += centerText(`${colors.dim}Press ${colors.reset}${colors.white}Ctrl+C${colors.reset}${colors.dim} to stop hosting.${colors.reset}`, cols) + "\n";

    process.stdout.write(out);
}

// Backwards-compatible alias for renderFullDashboard
export const renderHostDashboard = renderFullDashboard;

/**
 * Updates only the card region using ANSI cursor positioning without redrawing or clearing.
 */
export function updateDashboardMetrics(metrics, port, layout, isAlreadyRunning = false) {
    const { cardTopRow, leftPad } = layout;
    const cardRows = buildDashboardCardRows(metrics, port, layout, isAlreadyRunning);

    process.stdout.write("\x1b[?25l\x1b[?7l");
    let patch = "";
    for (let i = 0; i < cardRows.length; i++) {
        const r = cardTopRow + i;
        patch += `\x1b[${r}H\x1b[1G${leftPad}${cardRows[i]}`;
    }
    process.stdout.write(patch);
}

/**
 * Starts the Host mode: sets up server, discovery, hardware monitor,
 * renders the live dashboard, and updates dynamically.
 */
export async function startHostMode(options = {}) {
    const port = Number(options.port || process.env.PORT || 3000);
    const host = process.env.HOST || "0.0.0.0";

    console.clear();
    console.log(`\n${colors.dim}Starting TeamGPU Host Setup...${colors.reset}`);
    console.log(`${colors.dim}Scanning machine hardware & GPU specifications...${colors.reset}`);

    // Pre-flight initial hardware scan
    await scanMachine();

    // Initialize live hardware monitor
    const monitor = createSystemMonitor();

    // Start HTTP Server & Discovery
    let server = null;
    let isAlreadyRunning = false;

    const app = express();
    app.use(express.json());
    app.use("/machine", machineRoute);
    app.use("/api/generate", generateRoute);
    app.use("/api/heartbeat", heartbeatRoute);
    app.use("/api/client", heartbeatRoute);

    try {
        await new Promise((resolve, reject) => {
            server = app.listen(port, host, () => {
                startHostDiscovery({ httpPort: port });
                resolve();
            });

            server.on("error", (err) => {
                if (err.code === "EADDRINUSE") {
                    isAlreadyRunning = true;
                    // An instance is already running on this port
                    startHostDiscovery({ httpPort: port });
                    resolve();
                } else {
                    reject(err);
                }
            });
        });
    } catch (err) {
        console.warn(`[TeamGPU Host] Warning: ${err.message}`);
    }

    let layout = getDashboardLayout();
    let initialMetrics = await monitor.getMetrics();
    renderFullDashboard(initialMetrics, port, layout, isAlreadyRunning);

    // Live refresh timer: periodically updates dynamic metrics in-place
    const REFRESH_INTERVAL_MS = 1500;
    let refreshTimer = null;
    let isUpdating = false;

    const tick = async () => {
        if (isUpdating) return;
        isUpdating = true;
        try {
            const metrics = await monitor.getMetrics();
            updateDashboardMetrics(metrics, port, layout, isAlreadyRunning);
        } catch {
            // ignore transient monitor read errors
        } finally {
            isUpdating = false;
        }
    };

    refreshTimer = setInterval(tick, REFRESH_INTERVAL_MS);

    // Handle terminal resize dynamically
    const onResize = () => {
        layout = getDashboardLayout();
        monitor.getMetrics().then((m) => {
            renderFullDashboard(m, port, layout, isAlreadyRunning);
        }).catch(() => {});
    };
    process.stdout.on("resize", onResize);

    // Wait for exit signal
    return new Promise((resolve) => {
        let isCleaningUp = false;

        const cleanup = () => {
            if (isCleaningUp) return;
            isCleaningUp = true;

            if (refreshTimer) {
                clearInterval(refreshTimer);
                refreshTimer = null;
            }

            process.stdout.removeListener("resize", onResize);
            process.removeListener("SIGINT", cleanup);
            process.removeListener("SIGTERM", cleanup);

            // Restore terminal cursor visibility
            process.stdout.write("\x1b[?25h\x1b[?7h\n");
            console.log(`${colors.dim}Stopping TeamGPU Host service...${colors.reset}`);

            try {
                stopHostDiscovery();
            } catch {
                // ignore
            }

            if (server && !isAlreadyRunning) {
                server.close(() => {
                    resolve();
                });
            } else {
                resolve();
            }
        };

        process.once("SIGINT", cleanup);
        process.once("SIGTERM", cleanup);
    });
}
