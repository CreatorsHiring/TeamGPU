import express from "express";
import machineRoute from "./routes/machine.js";
import generateRoute from "./routes/generate.js";
import { startHostDiscovery, stopHostDiscovery } from "./discovery/host.js";
import { getLocalIPs, getDeviceIdentity } from "./utils/device.js";

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";

app.use(express.json());

app.use("/machine", machineRoute);
app.use("/api/generate", generateRoute);

const server = app.listen(PORT, HOST, () => {
    const identity = getDeviceIdentity();
    const ips = getLocalIPs();

    console.log("=========================================");
    console.log(`TeamGPU Agent Running`);
    console.log(`Device: ${identity.name} (${identity.id})`);
    console.log(`Local:   http://localhost:${PORT}`);
    if (ips.length > 0) {
        for (const item of ips) {
            console.log(`Network: http://${item.address}:${PORT} (${item.interface})`);
        }
    }
    console.log("=========================================");

    startHostDiscovery({ httpPort: PORT });
});

function gracefulShutdown() {
    console.log("\nShutting down TeamGPU Agent...");
    stopHostDiscovery();
    server.close(() => {
        process.exit(0);
    });
}

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);
