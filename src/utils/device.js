import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const CONFIG_DIR = path.join(os.homedir(), ".teamgpu");
const DEVICE_FILE = path.join(CONFIG_DIR, "device.json");
const HOSTS_FILE = path.join(CONFIG_DIR, "hosts.json");

/**
 * Ensures ~/.teamgpu directory exists.
 */
function ensureConfigDir() {
    try {
        if (!fs.existsSync(CONFIG_DIR)) {
            fs.mkdirSync(CONFIG_DIR, { recursive: true });
        }
    } catch {
        // Fall back gracefully if homedir is read-only
    }
}

/**
 * Gets or creates a persistent device ID and display name for this machine.
 */
export function getDeviceIdentity() {
    ensureConfigDir();

    let identity = null;

    try {
        if (fs.existsSync(DEVICE_FILE)) {
            const data = fs.readFileSync(DEVICE_FILE, "utf-8");
            identity = JSON.parse(data);
        }
    } catch {
        // file corrupted or unreadable
    }

    if (!identity || !identity.id) {
        identity = {
            id: crypto.randomUUID(),
            name: os.hostname(),
            createdAt: new Date().toISOString()
        };

        try {
            fs.writeFileSync(DEVICE_FILE, JSON.stringify(identity, null, 2), "utf-8");
        } catch {
            // ignore write error
        }
    }

    return {
        id: identity.id,
        name: identity.name || os.hostname(),
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch()
    };
}

/**
 * Retrieves all active, non-internal IPv4 addresses and their interfaces.
 */
export function getLocalIPs() {
    const interfaces = os.networkInterfaces();
    const addresses = [];

    for (const [name, nets] of Object.entries(interfaces)) {
        if (!nets) continue;

        for (const net of nets) {
            if (net.family === "IPv4" && !net.internal) {
                addresses.push({
                    interface: name,
                    address: net.address,
                    netmask: net.netmask,
                    mac: net.mac
                });
            }
        }
    }

    return addresses;
}

/**
 * Calculates broadcast addresses for all active IPv4 interfaces.
 */
export function getBroadcastAddresses() {
    const ips = getLocalIPs();
    const broadcasts = new Set();

    // Universal broadcast
    broadcasts.add("255.255.255.255");

    for (const item of ips) {
        try {
            const ipParts = item.address.split(".").map(Number);
            const maskParts = item.netmask.split(".").map(Number);
            const bcast = ipParts.map((part, i) => (part | (~maskParts[i] & 255)));
            broadcasts.add(bcast.join("."));
        } catch {
            // Ignore malformed masks
        }
    }

    return Array.from(broadcasts);
}

/**
 * Reads cached hosts from ~/.teamgpu/hosts.json.
 */
export function getCachedHosts() {
    ensureConfigDir();
    try {
        if (fs.existsSync(HOSTS_FILE)) {
            const data = fs.readFileSync(HOSTS_FILE, "utf-8");
            return JSON.parse(data);
        }
    } catch {
        // ignore
    }
    return [];
}

/**
 * Saves reachable hosts to ~/.teamgpu/hosts.json.
 */
export function saveCachedHosts(hosts) {
    ensureConfigDir();
    try {
        fs.writeFileSync(HOSTS_FILE, JSON.stringify(hosts, null, 2), "utf-8");
    } catch {
        // ignore
    }
}
