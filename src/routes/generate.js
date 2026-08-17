import express from "express";

const router = express.Router();

/*
POST /api/generate

Receives a conversation from the TeamGPU CLI
and forwards it to the local Ollama /api/chat endpoint.
*/

router.post("/", async (req, res) => {

    try {

        const { model, messages } = req.body;

        // Validate model
        if (!model) {

            return res.status(400).json({
                error: "Model is required."
            });

        }

        // Validate messages
        if (!Array.isArray(messages) || messages.length === 0) {

            return res.status(400).json({
                error: "Messages must be a non-empty array."
            });

        }


        /*
        ---------------------------------------
        Send conversation to local Ollama
        ---------------------------------------
        */

        const response = await fetch(
            "http://127.0.0.1:11434/api/chat",
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
        Check Ollama response
        ---------------------------------------
        */

        if (!response.ok) {

            const errorText = await response.text();

            return res.status(response.status).json({
                error: "Failed to communicate with Ollama.",
                details: errorText
            });

        }


        /*
        ---------------------------------------
        Forward Ollama stream to CLI
        ---------------------------------------
        */

        res.setHeader(
            "Content-Type",
            "application/x-ndjson"
        );


        const reader = response.body.getReader();


        while (true) {

            const { done, value } = await reader.read();

            if (done) {
                break;
            }

            res.write(Buffer.from(value));

        }


        res.end();

    }

    catch (error) {

        console.error("Generation error:", error);

        if (!res.headersSent) {

            return res.status(500).json({
                error: "Internal Server Error"
            });

        }

        res.end();

    }

});


export default router;