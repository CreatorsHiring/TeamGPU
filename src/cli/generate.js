function getArg(name) {
    const index = process.argv.indexOf(name);

    if (index === -1) {
        return null;
    }

    return process.argv[index + 1];
}

async function main() {
    const server = getArg("--server") || "http://localhost:3000";
    const model = getArg("--model");
    const prompt = getArg("--prompt");

    if (!model || !prompt) {
        console.log(`
Usage:

node src/cli/generate.js \
  --server http://localhost:3000 \
  --model qwen2.5-coder:1.5b \
  --prompt "Write Bubble Sort in Java"
`);
        process.exit(1);
    }

    console.log(`Connecting to ${server}`);
    console.log(`Model: ${model}`);
    console.log("Generating...\n");

    const response = await fetch(`${server}/api/generate`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model,
            prompt
        })
    });

    if (!response.ok) {
        console.error(`Server returned ${response.status}`);
        console.error(await response.text());
        process.exit(1);
    }

    console.log("========== Response ==========\n");

    const reader = response.body.getReader();

    const decoder = new TextDecoder();

    let buffer = "";

    while (true) {

        const { done, value } = await reader.read();

        if (done) {
            break;
        }

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");

        buffer = lines.pop();

        for (const line of lines) {

            if (!line.trim()) {
                continue;
            }

            const json = JSON.parse(line);

            if (json.response) {
                process.stdout.write(json.response);
            }
        }
    }

    console.log();
}

main().catch(console.error);