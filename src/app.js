import express from "express";
import cors from "cors";
import generateRouter from "./routes/generate.js"; // Assume this file is still called generate.js

const app = express();

app.use(
  cors({
    origin: "*", // Keeping permissive CORS for now, but ensure it's secure later
  })
);

app.use(express.json({ limit: '50mb' })); // Ensure body parser handles large image data

// health check
app.get("/", (req, res) => {
  res.send("Model Studio backend is running");
});

// 🚨 FIX HERE: Set base path to /api
// The full path will now be /api + /generate-image (defined in generateRouter)
app.use("/api", generateRouter);

export default app;