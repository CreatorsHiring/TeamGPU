import readline from "node:readline";

const SERVER = "http://20.20.27.60:3000";

function createInterface() {
    return readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
}

function ask(rl, question) {
    return new Promise(resolve => {
        rl.question(question, resolve);
    });
}

async function streamResponse(response) {

    const reader = response.body.getReader();

    const decoder = new TextDecoder();

    let buffer = "";

    while (true) {

        const { done, value } = await reader.read();

        if (done) {
            break;
        }

        buffer += decoder.decode(value, {
            stream: true
        });

        const lines = buffer.split("\n");

        buffer = lines.pop();

        for (const line of lines) {

            if (!line.trim()) {
                continue;
            }

            try {

                const data = JSON.parse(line);

                if (data.response) {
                    process.stdout.write(data.response);
                }

            } catch (error) {

                console.error("\nFailed to parse response.");
            }
        }
    }

    // Decode anything remaining in the decoder.
    buffer += decoder.decode();

    if (buffer.trim()) {

        try {

            const data = JSON.parse(buffer);

            if (data.response) {
                process.stdout.write(data.response);
            }

        } catch (error) {

            console.error("\nFailed to parse final response.");
        }
    }
}

export async function run(model) {

    if (!model) {

        console.log(`
Usage:

teamgpu run <model>

Example:

teamgpu run qwen2.5-coder:1.5b
`);

        return;
    }

    console.log(`\nConnecting to TeamGPU...`);
    console.log(`Server: ${SERVER}`);
    console.log(`Model: ${model}`);
    console.log(`\nType /exit to quit.\n`);

    const rl = createInterface();

    try {

        while (true) {

            const prompt = await ask(rl, ">>> ");

            if (!prompt.trim()) {
                continue;
            }

            if (
                prompt.trim() === "/exit" ||
                prompt.trim() === "/quit"
            ) {
                break;
            }

            try {

                const response = await fetch(
                    `${SERVER}/api/generate`,
                    {
                        method: "POST",

                        headers: {
                            "Content-Type": "application/json"
                        },

                        body: JSON.stringify({
                            model,
                            prompt,
                            stream: true
                        })
                    }
                );

                if (!response.ok) {

                    console.error(
                        `\nServer returned ${response.status}`
                    );

                    console.error(
                        await response.text()
                    );

                    continue;
                }

                process.stdout.write("\n");

                await streamResponse(response);

                process.stdout.write("\n\n");

            } catch (error) {

                console.error(
                    `\nFailed to connect to TeamGPU: ${error.message}\n`
                );
            }
        }

    } finally {

        rl.close();
    }
}