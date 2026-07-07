import os from "os";

function bytesToGB(bytes) {
    return Number((bytes / (1024 ** 3)).toFixed(2));
}

export async function scanRam() {

    const total = os.totalmem();

    const free = os.freemem();

    const used = total - free;

    return {

        detected: true,

        totalBytes: total,

        freeBytes: free,

        usedBytes: used,

        totalGB: bytesToGB(total),

        freeGB: bytesToGB(free),

        usedGB: bytesToGB(used)

    };

}