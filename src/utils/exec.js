import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function run(command) {
    try {
        const { stdout } = await execAsync(command);

        return stdout.trim();
    } catch (err) {
        return null;
    }
}