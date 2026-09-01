import express from "express";
import usersRouter from "./routes/users.js";

const app = express();

app.use(express.json());
app.use(usersRouter);

export default app;
