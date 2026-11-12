import { discoverHosts } from "../../discovery/client.js";
import { printBanner, printHostCards, colors } from "../tui.js";

export async function listDevices(options = {}) {
    printBanner();
    console.log(`${colors.dim}Searching for TeamGPU laptops on the local network...${colors.reset}\n`);

    const hosts = await discoverHosts({ timeoutMs: options.timeout || 2000 });

    if (hosts.length === 0) {
        console.log(`
${colors.yellow}No TeamGPU laptops found on the local network.${colors.reset}

${colors.dim}Make sure:
1. TeamGPU is running on the host laptop ('npm start').
2. Both laptops are connected to the same Wi-Fi / LAN.${colors.reset}
`);
        return [];
    }

    printHostCards(hosts);
    return hosts;
}
