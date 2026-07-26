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

    const data = await response.json();

    console.log("========== Response ==========\n");
    console.log(data.response);
}

main().catch(console.error);