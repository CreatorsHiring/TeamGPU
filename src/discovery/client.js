import dgram from "node:dgram";
import { getBroadcastAddresses, getCachedHosts, saveCachedHosts } from "../utils/device.js";

const DEFAULT_DISCOVERY_PORT = 35890;

/**
 * Probes a specific host URL via HTTP GET /machine.
 * Returns host details if reachable, or null otherwise.
 */
export async function probeHost(rawUrl, timeoutMs = 3000) {
    try {
        let normalized = rawUrl.trim();
        if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
            normalized = `http://${normalized}`;
        }
        normalized = normalized.replace(/\/+$/, "");

        const urlObj = new URL(normalized);
        const endpoint = `${urlObj.origin}/machine`;

        const res = await fetch(endpoint, {
            signal: AbortSignal.timeout(timeoutMs),
            headers: { "Accept": "application/json" }
        });

        if (!res.ok) {
            return null;
        }

        const data = await res.json();

        const models = Array.isArray(data.ollama?.models)
            ? data.ollama.models.map(m => (typeof m === "string" ? m : m.name))
            : [];

        return {
            deviceId: data.device?.id || urlObj.hostname,
            name: data.device?.name || urlObj.hostname,
            url: urlObj.origin,
            ip: urlObj.hostname,
            port: Number(urlObj.port) || 3000,
            gpu: data.gpu || { detected: false },
            cpu: data.cpu || {},
            memory: data.memory || {},
            ollama: data.ollama || { detected: false, running: false, models: [] },
            models
        };
    } catch {
        return null;
    }
}

/**
 * Discovers available TeamGPU hosts across the local network and local machine.
 *
 * @param {Object} options
 * @param {number} [options.timeoutMs=2000] Discovery duration
 * @param {string} [options.directServer] Optional explicit server URL to verify directly
 * @param {number} [options.discoveryPort=35890] UDP discovery port
 * @returns {Promise<Array>} List of verified, reachable host objects
 */
export async function discoverHosts({
    timeoutMs = 2000,
    directServer = null,
    discoveryPort = DEFAULT_DISCOVERY_PORT
} = {}) {
    // If a direct server is specified, test and return it immediately
    if (directServer) {
        const probed = await probeHost(directServer, timeoutMs);
        return probed ? [probed] : [];
    }

    const candidateUrls = new Set();

    // 1. Always check localhost / loopback for local development or host
    candidateUrls.add("http://127.0.0.1:3000");
    candidateUrls.add("http://localhost:3000");

    // 2. Add cached hosts from previous runs
    const cached = getCachedHosts();
    if (Array.isArray(cached)) {
        for (const host of cached) {
            if (host?.url) candidateUrls.add(host.url);
            if (host?.ip && host?.port) candidateUrls.add(`http://${host.ip}:${host.port}`);
        }
    }

    // 3. UDP Broadcast Discovery
    await new Promise((resolve) => {
        let client = null;
        let timer = null;

        const cleanup = () => {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            if (client) {
                try {
                    client.close();
                } catch {
                    // ignore
                }
                client = null;
            }
            resolve();
        };

        try {
            client = dgram.createSocket({ type: "udp4", reuseAddr: true });

            client.on("error", () => {
                cleanup();
            });

            client.on("message", (msg, rinfo) => {
                try {
                    const data = JSON.parse(msg.toString());
                    if (data.type === "TEAMGPU_ANNOUNCE") {
                        const port = data.port || 3000;
                        candidateUrls.add(`http://${rinfo.address}:${port}`);

                        if (Array.isArray(data.ips)) {
                            for (const ip of data.ips) {
                                candidateUrls.add(`http://${ip}:${port}`);
                            }
                        }
                    }
                } catch {
                    // Ignore non-json or unexpected packets
                }
            });

            client.bind(0, () => {
                try {
                    client.setBroadcast(true);
                } catch {
                    // ignore
                }

                const payload = Buffer.from(JSON.stringify({ type: "TEAMGPU_DISCOVER", timestamp: Date.now() }));
                const broadcastAddrs = getBroadcastAddresses();

                // Send to all broadcast targets
                for (const target of broadcastAddrs) {
                    try {
                        client.send(payload, discoveryPort, target, () => {});
                    } catch {
                        // ignore
                    }
                }

                // Also send directly to localhost
                try {
                    client.send(payload, discoveryPort, "127.0.0.1", () => {});
                } catch {
                    // ignore
                }

                timer = setTimeout(cleanup, timeoutMs);
            });
        } catch {
            cleanup();
        }
    });

    // 4. Concurrently probe each candidate URL via HTTP /machine
    const probePromises = Array.from(candidateUrls).map(url => probeHost(url, 3000));
    const results = await Promise.all(probePromises);

    // 5. Deduplicate live hosts by deviceId or URL
    const seen = new Set();
    const liveHosts = [];

    for (const host of results) {
        if (!host) continue;

        const key = host.deviceId || host.url;
        if (!seen.has(key)) {
            seen.add(key);
            liveHosts.push(host);
        }
    }

    // Update cache with discovered live hosts
    if (liveHosts.length > 0) {
        saveCachedHosts(liveHosts);
    }

    return liveHosts;
}
