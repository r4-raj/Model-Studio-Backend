import { genAI } from "../config/gemini.js";

/**
 * generateImage - with HARD_STRICT_MODE toggle
 */
export const generateImage = async (req, res) => {
  try {
    const HARD_STRICT_MODE = process.env.HARD_STRICT_MODE === "true";

    const files = req.files || {};
    const file = files.referenceImage?.[0];
    const secondaryFile = files.referenceImage2?.[0];

    const raw = req.body || {};

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
    } = raw;

    if (!file) {
      return res.status(400).json({ error: "Reference image is required." });
    }

    const base64Image = file.buffer.toString("base64");
    const base64Image2 = secondaryFile?.buffer?.toString("base64");

    /* ---------------------------- Helpers ---------------------------- */
    const present = (v) => v !== undefined && v !== null && String(v).trim() !== "";
    const isArrayPresent = (v) => Array.isArray(v) ? v.length > 0 : present(v);

    const mergeChoice = (dropdown, note, fallback) => {
      if (isArrayPresent(dropdown)) {
        const arr = Array.isArray(dropdown) ? dropdown : [dropdown];
        return `${arr.join(", ")}${note ? `. Extra note: ${note}` : ""}`;
      }
      if (dropdown && note) return `${dropdown}. Extra note: ${note}`;
      if (dropdown) return dropdown;
      if (note) return note;
      return fallback;
    };

    const formatExpression = (selected, note) => {
      let parts = [];
      if (selected) {
        const arr = Array.isArray(selected) ? selected : [selected];
        parts.push(arr.join(", "));
      }
      if (note) parts.push(note);
      if (parts.length === 0) return "natural expression, age 20–40";
      return parts.join(" and ");
    };

    /* ------------------------ Attributes ------------------------ */
    const attributes = {
      modelType: present(modelType) ? modelType : null,
      modelExpression: isArrayPresent(modelExpression) ? modelExpression : null,
      hair: present(hair) ? hair : null,
      pose: present(pose) ? pose : null,
      location: present(location) ? location : null,
      accessories: present(accessories) ? accessories : null,
      otherOption: present(otherOption) ? otherOption : null,
      otherDetails: present(otherDetails) ? otherDetails : null,
    };

    const changedFields = Object.keys(attributes).filter(
      (k) => attributes[k] !== null
    );

    /* -------------------- Blur Detection (GLOBAL FIX) -------------------- */
    const locationText =
      (location || "") + " " + (locationNote || "");
    const isBlurredBackground =
      locationText.toLowerCase().includes("blur");

    /* -------------------- Defaults -------------------- */
    const defaults = {
      modelType: "Indian woman, medium height, average build, realistic proportions",
      modelExpression: "natural relaxed expression, age 20–40",
      hair: "classic Indian hairstyle, neat bun or braid",
      pose: "full body front pose, standing naturally",
      location: "professional indoor environment",
      accessories: "light traditional jewellery only",
      otherOption:
        "match saree design, border, motifs, and colours exactly from primary reference image",
    };

    const attrPhrases = {
      modelType: mergeChoice(modelType, modelTypeNote, defaults.modelType),
      modelExpression: formatExpression(modelExpression, modelExpressionNote),
      hair: mergeChoice(hair, hairNote, defaults.hair),
      pose: mergeChoice(pose, poseNote, defaults.pose),
      location: mergeChoice(location, locationNote, defaults.location),
      accessories: mergeChoice(accessories, accessoriesNote, defaults.accessories),
      otherOption: mergeChoice(otherOption, otherOptionNote, defaults.otherOption),
      otherDetails: otherDetails || "",
    };

    /* -------------------- Prompt Assembly -------------------- */
    const promptParts = [];

    if (HARD_STRICT_MODE) {
      promptParts.push("!!! STRICT MODE ENABLED. FOLLOW ALL RULES EXACTLY.");
    }

    promptParts.push(
      "You are a professional lifestyle and corporate photographer. Create ONE completely photorealistic photograph. The final image must look like a real camera-captured photo, never an artificial composite."
    );

    /* -------------------- HARD RULES -------------------- */
    const hardRules = [
      "FIRST image is the MASTER saree design reference. Copy design, border, motifs, embroidery, and colors exactly.",
      "SECOND image (if provided) is ONLY for back-side saree reference.",
      "Do NOT add text, logos, watermarks, or extra people.",
      "Do NOT distort anatomy, fabric geometry, or perspective.",
      `Allowed changes: ${changedFields.length ? changedFields.join(", ") : "none"}.`,
    ];

    if (HARD_STRICT_MODE) {
      hardRules.push(
        "STRICT MODE: Saree design must remain IDENTICAL to the reference image."
      );
      hardRules.push(
        "STRICT MODE: Background perspective and lighting must be physically realistic."
      );
    }

    promptParts.push(`[HARD_RULES]\n- ${hardRules.join("\n- ")}\n[/HARD_RULES]`);

    /* -------------------- MODEL -------------------- */
    promptParts.push(`
[MODEL_DESCRIPTION]
Model: ${attrPhrases.modelType}
Expression: ${attrPhrases.modelExpression}
Hair: ${attrPhrases.hair}
[/MODEL_DESCRIPTION]
`);

    /* -------------------- CAMERA -------------------- */
    promptParts.push(`
[CAMERA_AND_LENS_REALISM]
- Camera height: 130–145 cm from floor
- Lens: 35–50mm full-frame equivalent
- Perspective must align with floor, desks, sofas, windows, and ceiling lines
- Model must not appear cut-out or closer than nearby objects
[/CAMERA_AND_LENS_REALISM]
`);

    /* -------------------- POSE -------------------- */
    promptParts.push(`
[POSE_AND_FRAMING]
Pose: ${attrPhrases.pose}
Framing: full body unless zoom is explicitly requested
[/POSE_AND_FRAMING]
`);

    /* -------------------- BACKGROUND (BLUR FIX HERE) -------------------- */
    promptParts.push(`
[SCENE_AND_BACKGROUND_REALISM]
Location: ${attrPhrases.location}

${isBlurredBackground ? `
- Background must use OPTICAL DEPTH OF FIELD (camera lens blur), NOT artificial blur
- Blur must be subtle and realistic, never strong or creamy
- Blur increases gradually with distance from the model
- Foreground floor, feet, and nearby objects remain sharp
- Subject and background must share lighting and color temperature
` : `
- Background must be sharp and naturally lit
`}

LIGHTING:
- Lighting must come from real scene sources (office lights, windows)
- Indoor office: neutral corporate lighting, soft shadows
- No studio lighting or spotlighting

GROUNDING:
- Strong contact shadows beneath feet
- Ambient occlusion where saree touches floor
- No floating or pasted look
[/SCENE_AND_BACKGROUND_REALISM]
`);

    /* -------------------- ACCESSORIES -------------------- */
    promptParts.push(`
[ACCESSORIES]
${attrPhrases.accessories}
[/ACCESSORIES]
`);

    /* -------------------- DESIGN -------------------- */
    promptParts.push(`
[DESIGN_CHANGE]
${attrPhrases.otherOption}
Extra details: ${attrPhrases.otherDetails}
[/DESIGN_CHANGE]
`);

    if (base64Image2) {
      promptParts.push(`
[SECONDARY_IMAGE_USAGE]
Use second image ONLY for back or reverse saree details
[/SECONDARY_IMAGE_USAGE]
`);
    }

    /* -------------------- QUALITY -------------------- */
    promptParts.push(`
[QUALITY_AND_REALISM]
- Indistinguishable from a real corporate or lifestyle photograph
- No halos, cut edges, or subject isolation
- Natural skin texture and fabric fall
- No text, logos, or artifacts
[/QUALITY_AND_REALISM]
`);

    const promptText = promptParts.join("\n");

    /* -------------------- Gemini Call -------------------- */
    const contents = [
      { inlineData: { mimeType: file.mimetype, data: base64Image } },
    ];

    if (base64Image2) {
      contents.push({
        inlineData: { mimeType: secondaryFile.mimetype, data: base64Image2 },
      });
    }

    contents.push({ text: promptText });

    const response = await genAI.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents,
      config: {
        imageConfig: { aspectRatio: "3:4" },
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
      provider: "gemini",
      debug: {
        HARD_STRICT_MODE,
        isBlurredBackground,
        changedFields,
      },
    });

  } catch (err) {
    console.error("Gemini error:", err);
    return res.status(500).json({ error: err.message || "Something went wrong." });
  }
};
