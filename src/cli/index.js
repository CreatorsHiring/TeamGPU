const command = process.argv[2];

switch (command) {

    case "run":
        await import("./commands/run.js");
        break;

    case "models":
        await import("./commands/models.js");
        break;

    case "status":
        await import("./commands/status.js");
        break;

    default:

        console.log(`
Usage:

teamgpu run <model>

teamgpu models

teamgpu status
`);

}