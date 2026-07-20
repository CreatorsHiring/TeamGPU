import readline from "node:readline";

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function ask(question) {
    return new Promise(resolve => {
        rl.question(question, resolve);
    });
}

async function main() {
    try {
        const server = await ask("TeamGPU Server (default: http://localhost:3000): ");

        const model = await ask("Model: ");

        const prompt = await ask("Prompt: ");

        console.log("\nGenerating...\n");

        const response = await fetch(
            (server || "http://localhost:3000") + "/api/generate",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model,
                    prompt
                })
            }
        );

        if (!response.ok) {
            throw new Error(`Server returned ${response.status}`);
        }

        const data = await response.json();

        console.log("========== Response ==========\n");

        console.log(data.response);

    } catch (err) {
        console.error(err.message);
    } finally {
        rl.close();
    }
}

main();