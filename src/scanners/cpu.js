import os from "os";

export async function scanCPU() {

    const cpus = os.cpus();

    if (!cpus || cpus.length === 0) {
        return {
            detected: false,
            reason: "Unable to detect CPU."
        };
    }

    const firstCPU = cpus[0];

    return {
        detected: true,

        manufacturer: getManufacturer(firstCPU.model),

        model: firstCPU.model,

        architecture: os.arch(),

        logicalCores: cpus.length,

        speedMHz: firstCPU.speed,

        speedGHz: Number((firstCPU.speed / 1000).toFixed(2))
    };

}

function getManufacturer(model) {

    const upper = model.toUpperCase();

    if (upper.includes("INTEL"))
        return "Intel";

    if (upper.includes("AMD"))
        return "AMD";

    if (upper.includes("APPLE"))
        return "Apple";

    return "Unknown";

}