import { genAI } from "../config/gemini.js";

export const generateImage = async (req, res) => {
  try {
    const file = req.file;
    const {
      pose,
      location,
      accessories,
      model,
      otherOption,
      otherDetails,
    } = req.body;

    if (!file) {
      return res.status(400).json({ error: "Reference image is required." });
    }

    const base64Image = file.buffer.toString("base64");

    const promptParts = [];

    // Base description
    promptParts.push(
      "Ultra high quality ecommerce catalog photo of a female model wearing an Indian saree or ethnic dress."
    );
    promptParts.push(
      "Use the uploaded reference image as the base clothing design. Match the saree or dress drape, silhouette and border work closely unless the user asks to change it."
    );

    // Pose
    if (pose) {
      promptParts.push(`Model pose: ${pose}.`);
    } else {
      promptParts.push(
        "Model pose: front pose – full body, facing camera, standing straight."
      );
    }

    // Background / location
    if (location) {
      promptParts.push(`Background / location: ${location}.`);
    } else {
      promptParts.push(
        "Background / location: plain white studio background, soft shadows."
      );
    }

    // Model style
    if (model) {
      promptParts.push(`Model description: ${model}.`);
    } else {
      promptParts.push(
        "Model description: Indian woman, medium height, average build, neutral catalog look."
      );
    }

    // Accessories
    if (accessories) {
      promptParts.push(`Accessories and jewellery: ${accessories}.`);
    } else {
      promptParts.push(
        "Accessories and jewellery: light traditional jewellery, nothing too heavy."
      );
    }

    // Other (preset + detailed)
    if (otherOption) {
      promptParts.push(`Design change preset: ${otherOption}.`);
    }
    if (otherDetails) {
      promptParts.push(
        `Detailed custom instructions to follow exactly: ${otherDetails}.`
      );
    } else if (!otherOption) {
      promptParts.push(
        "Design instructions: keep the saree or dress design and colours as close as possible to the reference image."
      );
    }

    // Global constraints
    promptParts.push(
      "Lighting: bright, even, professional studio lighting with no harsh shadows."
    );
    promptParts.push(
      "Framing: full body visible unless the chosen pose is zoomed-in."
    );
    promptParts.push(
      "Do NOT add any text, logos, watermarks, extra people, or distracting props."
    );

    const promptText = promptParts.join(" ");

    const contents = [
      {
        inlineData: {
          mimeType: file.mimetype,
          data: base64Image,
        },
      },
      { text: promptText },
    ];

    const response = await genAI.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents,
      config: {
        imageConfig: {
          aspectRatio: "3:4",
        },
      },
    });

    const parts = response?.candidates?.[0]?.content?.parts || [];
    let imageBase64 = null;

    for (const part of parts) {
      if (part.inlineData?.data) {
        imageBase64 = part.inlineData.data;
        break;
      }
    }

    if (!imageBase64) {
      return res.status(500).json({ error: "No image returned from Gemini." });
    }

    return res.json({
      imageBase64,
      promptUsed: promptText,
    });
  } catch (err) {
    console.error("Gemini error:", err);
    return res
      .status(500)
      .json({ error: err.message || "Something went wrong." });
  }
};
