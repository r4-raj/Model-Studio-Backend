// routes/generate.js
import { Router } from "express";

const router = Router();

// 🚨 ESSENTIAL FIX: Define the POST route relative to the /api base path.
// The final URL is: /api/generate-image
router.post("/generate-image", async (req, res) => {
  // ----------------------------------------------------
  // Put your AI image generation logic here
  // Example:
  try {
    const { pose, location, accessories, model, otherOption, otherDetails } = req.body;
    
    // Process image, generate prompt, call model API...
    const generatedBase64 = "iVBORw0KGgoAAAANSUhEUgAAA..."; // Placeholder for actual image data

    if (!generatedBase64) {
      return res.status(500).json({ error: "Image generation failed" });
    }

    res.status(200).json({ imageBase64: generatedBase64 });
  } catch (error) {
    console.error("Image generation error:", error);
    // Ensure the server always returns a JSON error structure if possible
    res.status(500).json({ error: error.message || "Internal server error during generation" });
  }
  // ----------------------------------------------------
});

export default router;