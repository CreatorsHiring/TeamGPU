import { scanGPU } from "./scanners/gpu.js";
import { scanCPU } from "./scanners/cpu.js";
import { scanRam } from "./scanners/ram.js";
import { scanOllama } from "./scanners/ollama.js";

export async function scanMachine() {

    return {

        gpu: await scanGPU(),
        cpu: await scanCPU(),
        memory: await scanRam(),
        ollama: await scanOllama()

    };

}