import express from "express";

import machineRoute from "./routes/machine.js";
import generateRoute from "./routes/generate.js";

const app = express();

app.use(express.json());

app.use("/machine", machineRoute);

app.use("/api/generate", generateRoute);

app.listen(3000, () => {

    console.log("TeamGPU Agent Running");

});