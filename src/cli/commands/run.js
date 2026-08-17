import readline from "node:readline";

const SERVER = "http://localhost:3000";


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


/*
---------------------------------------
Read streamed response from TeamGPU
---------------------------------------
*/

async function streamResponse(response) {

    const reader = response.body.getReader();

    const decoder = new TextDecoder();

    let buffer = "";

    let assistantResponse = "";


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


                /*
                Ollama /api/chat returns:

                {
                    message: {
                        role: "assistant",
                        content: "Hello"
                    },
                    done: false
                }
                */


                if (data.message?.content) {

                    const content =
                        data.message.content;


                    // Print immediately
                    process.stdout.write(content);


                    // Save for conversation memory
                    assistantResponse += content;

                }

            }

            catch (error) {

                console.error(
                    "\nFailed to parse response chunk."
                );

            }

        }

    }


    /*
    ---------------------------------------
    Decode final remaining bytes
    ---------------------------------------
    */

    buffer += decoder.decode();


    if (buffer.trim()) {

        try {

            const data = JSON.parse(buffer);


            if (data.message?.content) {

                const content =
                    data.message.content;

                process.stdout.write(content);

                assistantResponse += content;

            }

        }

        catch (error) {

            console.error(
                "\nFailed to parse final response."
            );

        }

    }


    return assistantResponse;

}


/*
---------------------------------------
Main CLI command
---------------------------------------
*/

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


    console.log(
        "\nConnecting to TeamGPU..."
    );

    console.log(
        `Server: ${SERVER}`
    );

    console.log(
        `Model: ${model}`
    );

    console.log(
        "\nType /exit to quit."
    );

    console.log(
        "Type /clear to clear conversation memory.\n"
    );


    /*
    ---------------------------------------
    Conversation memory
    ---------------------------------------
    */

    const messages = [];


    const rl = createInterface();


    try {

        while (true) {

            const prompt =
                await ask(rl, ">>> ");


            /*
            Ignore empty prompts
            */

            if (!prompt.trim()) {
                continue;
            }


            /*
            ---------------------------------------
            Exit
            ---------------------------------------
            */

            if (
                prompt.trim() === "/exit" ||
                prompt.trim() === "/quit"
            ) {

                break;

            }


            /*
            ---------------------------------------
            Clear conversation
            ---------------------------------------
            */

            if (prompt.trim() === "/clear") {

                messages.length = 0;

                console.log(
                    "\nConversation cleared.\n"
                );

                continue;

            }


            /*
            ---------------------------------------
            Add user message
            ---------------------------------------
            */

            messages.push({

                role: "user",

                content: prompt

            });


            try {

                /*
                ---------------------------------------
                Send entire conversation to Agent
                ---------------------------------------
                */

                const response = await fetch(
                    `${SERVER}/api/generate`,
                    {

                        method: "POST",

                        headers: {
                            "Content-Type": "application/json"
                        },

                        body: JSON.stringify({

                            model,

                            messages,

                            stream: true

                        })

                    }
                );


                /*
                ---------------------------------------
                Check response
                ---------------------------------------
                */

                if (!response.ok) {

                    console.error(
                        `\nServer returned ${response.status}`
                    );

                    console.error(
                        await response.text()
                    );


                    /*
                    Remove the user message because
                    the request failed.
                    */

                    messages.pop();

                    continue;

                }


                process.stdout.write("\n");


                /*
                ---------------------------------------
                Stream response
                ---------------------------------------
                */

                const assistantResponse =
                    await streamResponse(response);


                /*
                ---------------------------------------
                Save assistant response
                ---------------------------------------
                */

                messages.push({

                    role: "assistant",

                    content: assistantResponse

                });


                process.stdout.write("\n\n");

            }

            catch (error) {

                console.error(
                    `\nFailed to connect to TeamGPU: ${error.message}\n`
                );


                /*
                Remove failed user message
                */

                messages.pop();

            }

        }

    }

    finally {

        rl.close();

    }

}