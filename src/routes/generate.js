import express from "express";

const router = express.Router();

/*
POST /api/generate

Forwards a generation request to the local Ollama instance.
*/

router.post("/", async (req, res) => {

    try {

        const { model, prompt } = req.body;

        if (!model || !prompt) {

            return res.status(400).json({

                error: "Both model and prompt are required."

            });

        }

        const response = await fetch(

            "http://127.0.0.1:11434/api/generate",

            {

                method: "POST",

                headers: {

                    "Content-Type": "application/json"

                },

                body: JSON.stringify({

                    model,

                    prompt,

                    stream: false

                })

            }

        );

        if (!response.ok) {

            return res.status(response.status).json({

                error: "Failed to communicate with Ollama."

            });

        }

        const data = await response.json();

        return res.json(data);

    }

    catch (err) {

        console.error(err);

        return res.status(500).json({

            error: "Internal Server Error"

        });

    }

});

export default router;