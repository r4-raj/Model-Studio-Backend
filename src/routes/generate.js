import express from "express";
import multer from "multer";
import { generateImage } from "../controllers/generateController.js";

const router = express.Router();
// Stores file in memory, as required for multer and most AI endpoints
const upload = multer(); 

// 🚨 FIX HERE: Changed path from "/" to "/generate-image"
// Full Path = (app.js: /api) + (router: /generate-image) = /api/generate-image
router.post("/generate-image", upload.single("referenceImage"), generateImage);

export default router;