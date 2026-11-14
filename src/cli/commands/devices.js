import { discoverHosts } from "../../discovery/client.js";
import { printCenteredLogo, formatGPU, colors } from "../tui.js";

export async function listDevices(options = {}) {
    printCenteredLogo();
    console.log(`${colors.dim}Searching for TeamGPU laptops on the local network...${colors.reset}\n`);

    const hosts = await discoverHosts({ timeoutMs: options.timeout || 2000 });

    if (hosts.length === 0) {
        console.log(`
${colors.yellow}No TeamGPU laptops found on the local network.${colors.reset}

${colors.dim}Make sure:
1. TeamGPU is running on the host laptop ('npm start' or 'teamgpu host').
2. Both laptops are connected to the same Wi-Fi / LAN.${colors.reset}
`);
        return [];
    }

    console.log(`Found ${hosts.length} TeamGPU host(s) on LAN:\n`);
    hosts.forEach((h, idx) => {
        const status = h.ollama?.running ? `${colors.green}● Online${colors.reset}` : `${colors.dim}○ Offline${colors.reset}`;
        console.log(`  [${idx + 1}] ${colors.white}${colors.bold}${h.name}${colors.reset} (${h.url})`);
        console.log(`      GPU:    ${formatGPU(h.gpu)}`);
        console.log(`      Models: ${h.models?.length || 0} installed · Status: ${status}\n`);
    });

    return hosts;
}
