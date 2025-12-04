import express from "express";
import cors from "cors";
import generateRouter from "./routes/generate.js";

const app = express();

app.use(
  cors({
    origin: "*", // for dev; later restrict to your frontend domain
  })
);

app.use(express.json());

// routes
app.use("/api/generate-image", generateRouter);

export default app;
