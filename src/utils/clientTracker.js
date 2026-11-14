import { getDeviceIdentity } from "./device.js";

const clients = new Map();
const DEFAULT_HEARTBEAT_TIMEOUT_MS = 10000; // 10 seconds

/**
 * Registers or updates a client heartbeat.
 * Automatically ignores heartbeats from the host machine itself.
 */
export function registerHeartbeat(clientId, clientInfo = {}) {
    if (!clientId || typeof clientId !== "string") return;

    try {
        const hostIdentity = getDeviceIdentity();
        // Do not count the host itself as a client
        if (hostIdentity && clientId === hostIdentity.id) {
            return;
        }
    } catch {
        // ignore device identity lookup error
    }

    const now = Date.now();
    const existing = clients.get(clientId);

    clients.set(clientId, {
        id: clientId,
        name: clientInfo.name || existing?.name || "Client",
        ip: clientInfo.ip || existing?.ip || null,
        lastSeen: now,
        connectedAt: existing?.connectedAt || now
    });
}

/**
 * Explicitly unregisters a client when it disconnects.
 */
export function unregisterClient(clientId) {
    if (clientId) {
        clients.delete(clientId);
    }
}

/**
 * Returns the number of currently active clients, purging expired ones.
 */
export function getConnectedClientCount(timeoutMs = DEFAULT_HEARTBEAT_TIMEOUT_MS) {
    const now = Date.now();
    const effectiveTimeout = typeof timeoutMs === "number" ? timeoutMs : DEFAULT_HEARTBEAT_TIMEOUT_MS;
    for (const [id, client] of clients.entries()) {
        if (now - client.lastSeen >= effectiveTimeout) {
            clients.delete(id);
        }
    }
    return clients.size;
}

/**
 * Returns the list of currently active clients.
 */
export function getConnectedClients(timeoutMs = DEFAULT_HEARTBEAT_TIMEOUT_MS) {
    const now = Date.now();
    const effectiveTimeout = typeof timeoutMs === "number" ? timeoutMs : DEFAULT_HEARTBEAT_TIMEOUT_MS;
    const active = [];
    for (const [id, client] of clients.entries()) {
        if (now - client.lastSeen < effectiveTimeout) {
            active.push(client);
        } else {
            clients.delete(id);
        }
    }
    return active;
}

/**
 * Resets all client records (useful for testing or server restart).
 */
export function clearClients() {
    clients.clear();
}
