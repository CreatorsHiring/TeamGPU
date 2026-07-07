import { run } from "../utils/exec.js";

export async function scanGPU() {

    const command =
        'nvidia-smi --query-gpu=name,memory.total,driver_version,temperature.gpu,utilization.gpu,power.draw --format=csv,noheader,nounits';

    const output = await run(command);

    if (!output) {

        return {
            detected: false,
            reason: "No NVIDIA GPU detected or nvidia-smi not installed."
        };

    }

    const values = output.split(",");

    return {

        detected: true,

        vendor: "NVIDIA",

        model: values[0].trim(),

        memoryMB: Number(values[1]),

        driverVersion: values[2].trim(),

        temperatureC: Number(values[3]),

        utilizationPercent: Number(values[4]),

        powerWatts: Number(values[5])

    };

}