import { scanGPU } from "./scanners/gpu.js";
import { scanCPU } from "./scanners/cpu.js";
import { scanRam } from "./scanners/ram.js";
import { scanOllama } from "./scanners/ollama.js";
import { getDeviceIdentity, getLocalIPs } from "./utils/device.js";

export async function scanMachine() {

    const device = getDeviceIdentity();
    const network = getLocalIPs();

    const [gpu, cpu, memory, ollama] = await Promise.all([
        scanGPU(),
        scanCPU(),
        scanRam(),
        scanOllama()
    ]);

    return {

        device: {
            ...device,
            network
        },
        gpu,
        cpu,
        memory,
        ollama

    };

}
