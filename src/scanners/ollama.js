import { run } from "../utils/exec.js";

export async function scanOllama() {

    const result = {
        detected: false,
        running: false,
        version: null,
        models: []
    };

    /*
    ---------------------------------------
    STEP 1
    Is Ollama installed?
    ---------------------------------------
    */

    const versionOutput = await run("ollama --version");

    if (!versionOutput) {
        return result;
    }

    result.detected = true;

    result.version = versionOutput
        .replace("ollama version is", "")
        .trim();

    /*
    ---------------------------------------
    STEP 2
    Is Ollama server running?
    ---------------------------------------
    */

    try {

        const response = await fetch("http://127.0.0.1:11434/api/tags", {
            signal: AbortSignal.timeout(1000)
        });

        if (response.ok) {

            result.running = true;

            const data = await response.json();

            result.models = (data.models || []).map(model => ({

                name: model.name,

                size: model.size,

                modifiedAt: model.modified_at

            }));

        }

    } catch (err) {

        result.running = false;

    }

    return result;

}
