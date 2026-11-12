import { discoverHosts, probeHost } from "../../discovery/client.js";

export async function listModels(options = {}) {
    const directServer = options.server || process.env.TEAMGPU_SERVER || null;

    let host = null;
    if (directServer) {
        host = await probeHost(directServer, 2000);
    } else {
        console.log("Searching for TeamGPU host...");
        const hosts = await discoverHosts({ timeoutMs: 1500 });
        if (hosts.length > 0) {
            host = hosts[0];
        }
    }

    if (!host) {
        console.log("\nNo reachable TeamGPU host found on the network.");
        return;
    }

    console.log(`\nModels available on ${host.name} (${host.url}):`);
    if (!host.models || host.models.length === 0) {
        console.log("  No models currently installed or Ollama is offline.");
    } else {
        host.models.forEach(m => console.log(`  • ${m}`));
    }
    console.log();
}
