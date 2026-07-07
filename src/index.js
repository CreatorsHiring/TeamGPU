import { scanMachine } from "./scanner.js";

const info = await scanMachine();

console.log(JSON.stringify(info, null, 2));