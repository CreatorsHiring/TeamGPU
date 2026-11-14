import { promptOnboardingInput } from "../tui.js";
import { setPreferredMode } from "../../utils/config.js";
import { startHostMode } from "./host.js";
import { run } from "./run.js";

/**
 * First-time onboarding / role selection flow.
 * Displays welcome screen and prompts the user to select Host or Client.
 */
export async function showOnboarding(options = {}) {
    const choice = await promptOnboardingInput();

    if (choice === "1" || choice === "host") {
        // Temporary Host mode for current session only
        // Does NOT save Host as preferred mode
        await startHostMode(options);
    } else {
        // Client mode - save persistent preference
        setPreferredMode("client");
        // Navigate directly to existing available-hosts screen
        await run(null, options);
    }
}
