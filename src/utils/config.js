import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * Returns the path to the .teamgpu configuration directory.
 * - Windows: %USERPROFILE%\.teamgpu
 * - Linux/macOS: ~/.teamgpu
 */
export function getConfigDir() {
    return path.join(os.homedir(), ".teamgpu");
}

/**
 * Returns the full path to config.json.
 */
export function getConfigPath() {
    return path.join(getConfigDir(), "config.json");
}

/**
 * Loads the user configuration safely.
 * Returns default configuration if missing or malformed.
 */
export function loadConfig() {
    const filePath = getConfigPath();
    try {
        if (!fs.existsSync(filePath)) {
            return {
                preferredMode: null,
                onboardingCompleted: false
            };
        }
        const raw = fs.readFileSync(filePath, "utf-8");
        const parsed = JSON.parse(raw);
        if (typeof parsed !== "object" || parsed === null) {
            return {
                preferredMode: null,
                onboardingCompleted: false
            };
        }
        return parsed;
    } catch {
        return {
            preferredMode: null,
            onboardingCompleted: false
        };
    }
}

/**
 * Merges updates into the user configuration and saves to disk.
 * Preserves unrelated existing configuration properties.
 */
export function saveConfig(updates = {}) {
    try {
        const dir = getConfigDir();
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        const current = loadConfig();
        const merged = { ...current, ...updates };
        const filePath = getConfigPath();
        fs.writeFileSync(filePath, JSON.stringify(merged, null, 2), "utf-8");
        return merged;
    } catch (err) {
        console.warn(`[TeamGPU Config] Warning: Failed to save config: ${err.message}`);
        return loadConfig();
    }
}

/**
 * Returns the currently preferred mode ('client', or null).
 */
export function getPreferredMode() {
    const config = loadConfig();
    return config.preferredMode || null;
}

/**
 * Sets the preferred mode.
 * Per requirements: Only 'client' can be saved as persistent preference.
 * Selecting 'host' must never permanently change the user's default mode.
 */
export function setPreferredMode(mode) {
    if (mode === "client") {
        return saveConfig({
            preferredMode: "client",
            onboardingCompleted: true
        });
    }
    // Host mode is never saved to preferredMode
    return loadConfig();
}
