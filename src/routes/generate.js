import express from "express";
import multer from "multer";
import { generateImage } from "../controllers/generateController.js";

const router = express.Router();
const upload = multer(); // stores file in memory

router.post("/", upload.single("referenceImage"), generateImage);

export default router;
