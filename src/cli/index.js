#!/usr/bin/env node
const command = process.argv[2];

switch (command) {

    case "run": {

        const model = process.argv[3];

        const { run } = await import("./commands/run.js");

        await run(model);

        break;
    }

    case "models":

        await import("./commands/models.js");

        break;

    case "status":

        await import("./commands/status.js");

        break;

    default:

        console.log(`
TeamGPU CLI

Usage:

teamgpu run <model>

teamgpu models

teamgpu status

Example:

teamgpu run qwen2.5-coder:1.5b
`);

}