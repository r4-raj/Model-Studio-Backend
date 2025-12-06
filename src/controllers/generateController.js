import { genAI } from "../config/gemini.js";

export const generateImage = async (req, res) => {
  try {
    const files = req.files || {};
    const file = files.referenceImage?.[0];
    const secondaryFile = files.referenceImage2?.[0];
    
    // Destructuring all fields, including the split Model fields and new Hair field
    const {
      pose,
      location,
      accessories,
      modelType,         
      modelExpression,   
      hair,              
      otherOption,
      otherDetails,
      poseNote,
      locationNote,
      accessoriesNote,
      modelTypeNote,
      modelExpressionNote, 
      hairNote,
      otherOptionNote,
    } = req.body;

    if (!file) {
      return res.status(400).json({ error: "Reference image is required." });
    }

    const base64Image = file.buffer.toString("base64");
    const base64Image2 = secondaryFile?.buffer?.toString("base64");

    const promptParts = [];

    // --- HELPER FUNCTIONS ---
    
    const mergeChoice = (dropdown, note, fallback) => {
      if (dropdown && note) return `${dropdown}. Extra note: ${note}`;
      if (dropdown) return dropdown;
      if (note) return note;
      return fallback;
    };
    
    // Helper function for multi-select (Expression/Age checkboxes)
    const formatExpression = (selected, note) => {
        let parts = [];
        if (selected) {
            const selectedArray = Array.isArray(selected) ? selected : [selected];
            parts.push(selectedArray.join(', '));
        }

        if (note) {
            parts.push(note);
        }
        if (parts.length === 0) return "natural expression, age 20-40";
        
        return parts.join(' and ');
    };

    // --- 🚨 PROMPT ASSEMBLY (PRIORITY ADJUSTMENT) 🚨 ---
    
    // 1. Base Quality and Instruction
    promptParts.push(
      "A professional ecommerce catalog photo of a female model. Ultra high quality, cinematic lighting. "
    );
    
    // 2. MODEL/HAIR/POSE (The user's direct, non-negotiable selections)
    
    const modelTypePrompt = mergeChoice(
        modelType,
        modelTypeNote,
        "Indian woman, medium height, average build, neutral catalog look"
    );
    const modelExpressionPrompt = formatExpression(
        modelExpression,
        modelExpressionNote
    );
    
    // 🚨 PRIORITY MOVE: Put Model Type, Expression, Hair, and Pose FIRST to override the image model.
    promptParts.push(`RENDER THE MODEL EXACTLY AS DESCRIBED HERE: Model description: ${modelTypePrompt}, Expression and Age: ${modelExpressionPrompt}.`);
    
    promptParts.push(`Model hair style: ${mergeChoice(
        hair,
        hairNote,
        "classic Indian style, neat bun"
      )}.`
    );

    promptParts.push(
      `Model pose: ${mergeChoice(
        pose,
        poseNote,
        "front pose – full body, facing camera, standing straight"
      )}.`
    );
    
    // 3. CLOTHING INSTRUCTION (Strict Design Lock-In)
    // The design instructions remain strict, but they appear *after* the model identity instructions.
    promptParts.push(
        "THE REFERENCE IMAGE IS ONLY FOR CLOTHING: Use the uploaded reference image to generate the saree design, print, border, fabric pattern, and color. The design MUST NOT change due to pose/model alteration."
    );
    promptParts.push(
        "STRICTLY match the saree's border, print, and overall fabric pattern from the reference image."
    );
    
    // 4. Background / location
    promptParts.push(
      `Background / location: ${mergeChoice(
        location,
        locationNote,
        "plain white studio background, soft shadows"
      )}.`
    );

    // 5. Accessories
    promptParts.push(
      `Accessories and jewellery: ${mergeChoice(
        accessories,
        accessoriesNote,
        "light traditional jewellery, nothing too heavy"
      )}.`
    );

    // 6. Other (preset + detailed)
    const designChoice = mergeChoice(
      otherOption,
      otherOptionNote,
      "keep the saree or dress design and colours as close as possible to the reference image"
    );
    promptParts.push(`Design change: ${designChoice}.`);
    
    if (otherDetails) {
      promptParts.push(
        `Detailed custom instructions to follow exactly: ${otherDetails}.`
      );
    }

    // 7. SECONDARY IMAGE INSTRUCTION (Style Adherence)
    if (base64Image2) {
      promptParts.push(
        "The second image provided must be used to define specific styling, such as hair texture or exact jewelry placement. Match the style shown in the second reference image for these features."
      );
    }

    // 8. Global constraints
    promptParts.push(
      "Framing: full body visible unless the chosen pose is zoomed-in. Do NOT add any text, logos, watermarks, or extra people."
    );

    const promptText = promptParts.join(" ");

    // --- GEMINI API CALL (remains the same) ---

    const contents = [
      {
        inlineData: {
          mimeType: file.mimetype,
          data: base64Image,
        },
      },
    ];

    if (base64Image2) {
      contents.push({
        inlineData: {
          mimeType: secondaryFile.mimetype,
          data: base64Image2,
        },
      });
    }

    contents.push({ text: promptText });

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