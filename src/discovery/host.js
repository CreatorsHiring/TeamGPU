import dgram from "node:dgram";
import { getDeviceIdentity, getLocalIPs, getBroadcastAddresses } from "../utils/device.js";

const DEFAULT_DISCOVERY_PORT = 35890;
let discoverySocket = null;
let broadcastInterval = null;

/**
 * Creates the host announcement payload.
 */
function createAnnouncement(httpPort) {
    const device = getDeviceIdentity();
    const network = getLocalIPs();
    const ips = network.map(item => item.address);

    return JSON.stringify({
        type: "TEAMGPU_ANNOUNCE",
        deviceId: device.id,
        name: device.name,
        port: httpPort,
        ips,
        timestamp: Date.now()
    });
}

/**
 * Starts the UDP discovery service on the host.
 * Listens for client discovery probes and periodically announces the host on the LAN.
 */
export function startHostDiscovery({ httpPort = 3000, discoveryPort = DEFAULT_DISCOVERY_PORT } = {}) {
    if (discoverySocket) {
        return;
    }

    try {
        discoverySocket = dgram.createSocket({ type: "udp4", reuseAddr: true });

        discoverySocket.on("error", (err) => {
            console.warn(`[TeamGPU Discovery] Socket error: ${err.message}`);
        });

        discoverySocket.on("message", (msg, rinfo) => {
            try {
                const data = JSON.parse(msg.toString());
                if (data.type === "TEAMGPU_DISCOVER") {
                    const announcement = Buffer.from(createAnnouncement(httpPort));
                    discoverySocket.send(announcement, rinfo.port, rinfo.address, (err) => {
                        if (err) {
                            // ignore send error
                        }
                    });
                }
            } catch {
                // Ignore invalid or unrelated UDP packets
            }
        });

        discoverySocket.bind({ port: discoveryPort, exclusive: false }, () => {
            try {
                discoverySocket.setBroadcast(true);
            } catch {
                // Ignore broadcast flag error if unsupported
            }

            console.log(`[TeamGPU Discovery] Host service listening on UDP port ${discoveryPort}`);

            // Send an immediate announcement
            sendBroadcastAnnouncement(httpPort, discoveryPort);

            // Announce periodically every 10 seconds
            broadcastInterval = setInterval(() => {
                sendBroadcastAnnouncement(httpPort, discoveryPort);
            }, 10000);
        });
    } catch (err) {
        console.warn(`[TeamGPU Discovery] Failed to start discovery service: ${err.message}`);
    }
}

/**
 * Sends a broadcast announcement to all local broadcast addresses.
 */
function sendBroadcastAnnouncement(httpPort, discoveryPort) {
    if (!discoverySocket) return;

    try {
        const payload = Buffer.from(createAnnouncement(httpPort));
        const targets = getBroadcastAddresses();

        for (const target of targets) {
            discoverySocket.send(payload, discoveryPort, target, () => {});
        }
    } catch {
        // Ignore broadcast failure
    }
}

/**
 * Stops the UDP discovery service.
 */
export function stopHostDiscovery() {
    if (broadcastInterval) {
        clearInterval(broadcastInterval);
        broadcastInterval = null;
    }

    if (discoverySocket) {
        try {
            discoverySocket.close();
        } catch {
            // ignore
        }
        discoverySocket = null;
    }
}
