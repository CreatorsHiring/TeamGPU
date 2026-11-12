import { scanMachine } from "../../scanner.js";
import { probeHost, discoverHosts } from "../../discovery/client.js";

function formatGPU(gpu) {
    if (!gpu || !gpu.detected) return "No dedicated GPU detected";
    const memGB = gpu.memoryMB ? (gpu.memoryMB / 1024).toFixed(1) + " GB" : "Unknown VRAM";
    const util = gpu.utilizationPercent !== undefined ? ` (Util: ${gpu.utilizationPercent}%)` : "";
    return `${gpu.model || "NVIDIA GPU"} - ${memGB} VRAM${util}`;
}

export async function showStatus(options = {}) {
    const directServer = options.server || process.env.TEAMGPU_SERVER || null;

    if (directServer) {
        console.log(`Checking status for ${directServer}...`);
        const host = await probeHost(directServer, 2000);
        if (!host) {
            console.log(`Unable to reach TeamGPU at ${directServer}`);
            return;
        }
        printHostProfile("Remote Host", host);
        return;
    }

    // Check local machine scan first
    console.log("Scanning local machine...");
    const local = await scanMachine();
    console.log(`\n================ Local Machine Profile ================`);
    console.log(`Device:      ${local.device?.name || "Local"} (${local.device?.id || "N/A"})`);
    console.log(`GPU:         ${formatGPU(local.gpu)}`);
    console.log(`CPU:         ${local.cpu?.model?.trim() || "Unknown"}`);
    console.log(`RAM:         ${local.memory?.usedGB} GB / ${local.memory?.totalGB} GB used`);
    console.log(`Ollama:      ${local.ollama?.running ? "Running" : "Offline"}`);
    if (local.ollama?.models?.length > 0) {
        console.log(`Models:      ${local.ollama.models.map(m => m.name).join(", ")}`);
    }

    // Check discovered network hosts
    console.log(`\nChecking LAN for remote TeamGPU hosts...`);
    const hosts = await discoverHosts({ timeoutMs: 1500 });
    const remoteHosts = hosts.filter(h => h.deviceId !== local.device?.id);

    if (remoteHosts.length === 0) {
        console.log(`No other TeamGPU hosts found on the LAN.`);
    } else {
        console.log(`Found ${remoteHosts.length} remote host(s) on LAN:`);
        remoteHosts.forEach((h, i) => {
            console.log(`  [${i + 1}] ${h.name} (${h.url}) - GPU: ${formatGPU(h.gpu)}`);
        });
    }
    console.log(`=======================================================\n`);
}

function printHostProfile(label, host) {
    console.log(`\n================ ${label} Profile ================`);
    console.log(`Name:        ${host.name}`);
    console.log(`URL:         ${host.url}`);
    console.log(`Device ID:   ${host.deviceId}`);
    console.log(`GPU:         ${formatGPU(host.gpu)}`);
    console.log(`CPU:         ${host.cpu?.model?.trim() || "Unknown"}`);
    console.log(`RAM:         ${host.memory?.totalGB ? host.memory.totalGB + " GB" : "Unknown"}`);
    console.log(`Ollama:      ${host.ollama?.running ? "Online" : "Offline"}`);
    console.log(`Models:      ${host.models?.length > 0 ? host.models.join(", ") : "None"}`);
    console.log(`=======================================================\n`);
}
