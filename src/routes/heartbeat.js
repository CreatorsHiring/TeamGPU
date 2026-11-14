import express from "express";
import { registerHeartbeat, unregisterClient, getConnectedClientCount } from "../utils/clientTracker.js";

const router = express.Router();

/**
 * POST /api/heartbeat or POST /api/client/heartbeat
 * Registers or touches client presence.
 */
router.post("/", (req, res) => {
    const { clientId, name } = req.body || {};
    const effectiveClientId = clientId || req.headers["x-client-id"];
    const ip = req.ip || req.socket?.remoteAddress;

    if (effectiveClientId) {
        registerHeartbeat(effectiveClientId, { name, ip });
    }

    res.json({
        ok: true,
        activeClients: getConnectedClientCount()
    });
});

/**
 * POST /api/heartbeat/disconnect or POST /api/client/disconnect
 * Explicitly unregisters a client upon disconnect/exit.
 */
router.post("/disconnect", (req, res) => {
    const { clientId } = req.body || {};
    const effectiveClientId = clientId || req.headers["x-client-id"];

    if (effectiveClientId) {
        unregisterClient(effectiveClientId);
    }

    res.json({
        ok: true,
        activeClients: getConnectedClientCount()
    });
});

export default router;
