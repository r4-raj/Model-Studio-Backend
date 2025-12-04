import express from "express";
import cors from "cors";
import generateRouter from "./routes/generate.js";

const app = express();

app.use(
  cors({
    origin: "*", // for dev / testing; later restrict to your frontend domain
  })
);

app.use(express.json());

// health check
app.get("/", (req, res) => {
  res.send("Model Studio backend is running");
});

// main route
app.use("/api/generate-image", generateRouter);

export default app;
