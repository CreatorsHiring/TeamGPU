import express from "express";

import { scanMachine } from "../scanner.js";

const router = express.Router();

/*
GET /machine

Returns complete machine information.
*/

router.get("/", async (req, res) => {

    try {

        const machine = await scanMachine();

        res.status(200).json(machine);

    } catch (error) {

        console.error(error);

        res.status(500).json({

            error: "Failed to scan machine."

        });

    }

});

export default router;