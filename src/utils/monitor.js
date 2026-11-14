import os from "node:os";
import { scanGPU } from "../scanners/gpu.js";
import { getConnectedClientCount } from "./clientTracker.js";

/**
 * Returns raw CPU idle and total ticks across all logical cores.
 */
export function getCpuSnapshot() {
    const cpus = os.cpus();
    if (!cpus || cpus.length === 0) return null;

    let idle = 0;
    let total = 0;
    for (const cpu of cpus) {
        for (const type in cpu.times) {
            total += cpu.times[type];
        }
        idle += cpu.times.idle;
    }
    return { idle, total };
}

/**
 * Calculates CPU utilization percentage between two snapshots.
 */
export function calculateCpuUsage(prev, curr) {
    if (!prev || !curr) return null;
    const idleDiff = curr.idle - prev.idle;
    const totalDiff = curr.total - prev.total;

    if (totalDiff <= 0) return 0;
    const usage = 100 - (100 * idleDiff / totalDiff);
    return Math.max(0, Math.min(100, Math.round(usage)));
}

/**
 * Shortens CPU model string to fit cleanly within compact card columns.
 * Example: "AMD Ryzen 7 260 w/ Radeon 780M Graphics" -> "AMD Ryzen 7"
 * Example: "13th Gen Intel(R) Core(TM) i7-13700H" -> "Intel Core i7"
 */
export function formatCpuShort(rawModel) {
    if (!rawModel) return "CPU";
    let name = rawModel
        .replace(/w\/\s*Radeon.*$/i, "")
        .replace(/with\s*Radeon.*$/i, "")
        .replace(/@.*$/i, "")
        .replace(/\(R\)|\(TM\)/gi, "")
        .replace(/Processor/gi, "")
        .replace(/CPU/gi, "")
        .replace(/\d+-Core/gi, "")
        .trim();

    // Match patterns like "AMD Ryzen 7" or "Intel Core i7"
    const ryzenMatch = name.match(/AMD\s+Ryzen\s+\d+/i);
    if (ryzenMatch) return ryzenMatch[0];

    const intelMatch = name.match(/Intel\s+Core\s+i\d+/i);
    if (intelMatch) return intelMatch[0];

    // Clean up multiple spaces
    name = name.replace(/\s+/g, " ").trim();
    return name.slice(0, 20);
}

/**
 * Shortens GPU model string and formats with VRAM.
 * Example: "NVIDIA GeForce RTX 5050 Laptop GPU" -> "RTX 5050 · 8 GB"
 */
export function formatGpuShort(rawModel, memoryMB = 0) {
    if (!rawModel) return "No GPU";
    let name = rawModel
        .replace(/NVIDIA\s+GeForce\s+/i, "")
        .replace(/\s+Laptop\s+GPU/i, "")
        .replace(/\s+GPU/i, "")
        .replace(/\(R\)|\(TM\)/gi, "")
        .trim();

    const vramGB = memoryMB > 0 ? `${(memoryMB / 1024).toFixed(0)} GB` : "";
    if (vramGB) {
        return `${name} · ${vramGB}`;
    }
    return name;
}

/**
 * Returns RAM metrics: percentage, used GB, and total GB.
 */
export function getRamMetrics() {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    const usagePercent = total > 0 ? Math.round((used / total) * 100) : 0;
    const usedGB = (used / (1024 ** 3)).toFixed(2);
    const totalGB = (total / (1024 ** 3)).toFixed(2);

    return {
        usagePercent,
        usedGB,
        totalGB,
        summary: `${usedGB} / ${totalGB} GB`
    };
}

/**
 * Probes local Ollama instance for status and model count.
 */
export async function getOllamaMetrics() {
    try {
        const res = await fetch("http://127.0.0.1:11434/api/tags", {
            signal: AbortSignal.timeout(600)
        });
        if (res.ok) {
            const data = await res.json();
            const models = Array.isArray(data.models) ? data.models : [];
            return {
                running: true,
                modelsCount: models.length
            };
        }
    } catch {
        // offline or timeout
    }
    return {
        running: false,
        modelsCount: 0
    };
}

/**
 * Factory for creating a live hardware metrics monitor.
 */
export function createSystemMonitor() {
    let lastCpuSnapshot = getCpuSnapshot();
    let lastCpuUsage = null;

    return {
        async getMetrics() {
            // 1. CPU
            const currentCpuSnapshot = getCpuSnapshot();
            const cpuUsage = calculateCpuUsage(lastCpuSnapshot, currentCpuSnapshot);
            if (cpuUsage !== null) {
                lastCpuUsage = cpuUsage;
            }
            lastCpuSnapshot = currentCpuSnapshot;

            const cpus = os.cpus();
            const cpuModelRaw = cpus && cpus.length > 0 ? cpus[0].model : "Unknown CPU";
            const cpuModelShort = formatCpuShort(cpuModelRaw);

            // 2. RAM
            const ram = getRamMetrics();

            // 3. GPU (query live)
            let gpu;
            try {
                gpu = await scanGPU();
            } catch {
                gpu = { detected: false };
            }

            const gpuUsage = gpu.detected && typeof gpu.utilizationPercent === "number"
                ? gpu.utilizationPercent
                : null;
            const gpuModelShort = gpu.detected
                ? formatGpuShort(gpu.model, gpu.memoryMB)
                : "No dedicated GPU";

            // 4. Connected Clients
            const clientCount = getConnectedClientCount();

            // 5. Ollama
            const ollama = await getOllamaMetrics();

            return {
                cpu: {
                    usagePercent: lastCpuUsage,
                    modelShort: cpuModelShort,
                    modelFull: cpuModelRaw
                },
                gpu: {
                    detected: gpu.detected,
                    usagePercent: gpuUsage,
                    modelShort: gpuModelShort,
                    modelFull: gpu.model || "None",
                    memoryMB: gpu.memoryMB || 0,
                    memoryUsedMB: gpu.memoryUsedMB || 0
                },
                ram,
                clients: {
                    count: clientCount
                },
                ollama
            };
        }
    };
}
