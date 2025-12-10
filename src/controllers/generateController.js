// backend/controllers/generateController.js
import { genAI } from "../config/gemini.js";

/**
 * generateImage - with HARD_STRICT_MODE toggle
 *
 * Put HARD_STRICT_MODE=true in .env to enable the more forceful prompt template.
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

    // Build attributes map (server-normalized)
    const attributes = {
      modelType: present(modelType) ? modelType : null,
      modelTypeNote: present(modelTypeNote) ? modelTypeNote : null,
      modelExpression: isArrayPresent(modelExpression) ? modelExpression : null,
      modelExpressionNote: present(modelExpressionNote) ? modelExpressionNote : null,
      hair: present(hair) ? hair : null,
      hairNote: present(hairNote) ? hairNote : null,
      pose: present(pose) ? pose : null,
      poseNote: present(poseNote) ? poseNote : null,
      location: present(location) ? location : null,
      locationNote: present(locationNote) ? locationNote : null,
      accessories: present(accessories) ? accessories : null,
      accessoriesNote: present(accessoriesNote) ? accessoriesNote : null,
      otherOption: present(otherOption) ? otherOption : null,
      otherOptionNote: present(otherOptionNote) ? otherOptionNote : null,
      otherDetails: present(otherDetails) ? otherDetails : null,
    };

    const changedFields = Object.keys(attributes).filter((k) => {
      if (k.endsWith("Note")) return false;
      return attributes[k] !== null;
    });

    // Detect zoom
    const poseText = (attributes.pose || "") + " " + (attributes.poseNote || "");
    const zoomKeywords = ["zoom", "close up", "close-up", "head to knees", "head-to-knees", "zoomed", "closeup"];
    const isZoom = zoomKeywords.some((kw) => poseText.toLowerCase().includes(kw));

    // Defaults (not treated as 'changed')
    const defaults = {
      modelType: "Indian woman, medium height, average build, neutral catalog look",
      modelExpression: "natural expression, age 20–40",
      hair: "classic Indian hairstyle, neat bun or braid",
      pose: "front pose – full body, facing camera, standing straight",
      location: "plain white studio background, soft shadows",
      accessories: "light traditional jewellery, nothing too heavy",
      otherOption: "match the saree design and colours exactly from the primary reference image",
    };

    // Build final phrases
    const attrPhrases = {
      modelType: mergeChoice(attributes.modelType, attributes.modelTypeNote, defaults.modelType),
      modelExpression: formatExpression(attributes.modelExpression, attributes.modelExpressionNote),
      hair: mergeChoice(attributes.hair, attributes.hairNote, defaults.hair),
      pose: mergeChoice(attributes.pose, attributes.poseNote, defaults.pose),
      location: mergeChoice(attributes.location, attributes.locationNote, defaults.location),
      accessories: mergeChoice(attributes.accessories, attributes.accessoriesNote, defaults.accessories),
      otherOption: mergeChoice(attributes.otherOption, attributes.otherOptionNote, defaults.otherOption),
      otherDetails: attributes.otherDetails || "",
    };

    /* ---------------------- Prompt assembly ---------------------- */

    const promptParts = [];

    // Preface: strict header if enabled
    if (HARD_STRICT_MODE) {
      promptParts.push("!!!STRICT_MODE ENABLED. FOLLOW THESE INSTRUCTIONS EXACTLY.");
    }
    promptParts.push("You are a professional ecommerce catalog photography AI. Create a single photorealistic image of a female model wearing a saree.");

    // HARD_RULES block
    const hardRules = [
      "The FIRST uploaded image is the MASTER FRONTAL clothing reference. Copy frontal saree design, border, motifs, embroidery, and base colours from it unless the user explicitly requests a change.",
      "The SECOND uploaded image, if provided, is ONLY for BACK/REVERSE-SIDE reference (pallu-back, reverse border, pleat underside).",
      "Do NOT add text, logos, watermarks, or extra people.",
      "Do NOT distort body parts or fabric geometry (no warped hands, missing fingers, or broken pleats).",
      `Allowed changes: ${changedFields.length > 0 ? changedFields.join(", ") : "none (no fields explicitly selected)"}.`,
    ];

    // in HARD_STRICT_MODE, repeat the "DO NOT" block emphatically to increase model adherence
    if (HARD_STRICT_MODE) {
      hardRules.push(
        "!!! STRICT MODE: DO NOT CHANGE THE SAREE PATTERN, COLORS, BORDER, OR MOTIFS UNLESS THE USER EXPLICITLY REQUESTS. REPEAT: DO NOT CHANGE THE SAREE PATTERN, COLORS, BORDER, OR MOTIFS UNLESS EXPLICITLY REQUESTED."
      );
      hardRules.push("!!! STRICT MODE: IF ONLY ONE FIELD IS SELECTED, DO NOT CHANGE ANY OTHER ATTRIBUTE OR PART OF THE CLOTHING.");
    }

    promptParts.push(`[HARD_RULES]\n- ${hardRules.join("\n- ")}\n[/HARD_RULES]`);

    // Model, pose, background, accessories blocks
    promptParts.push(`
[MODEL_DESCRIPTION]
Model type/build: ${attrPhrases.modelType}
Expression / age: ${attrPhrases.modelExpression}
Hair: ${attrPhrases.hair}
[/MODEL_DESCRIPTION]
`);

    const framingBase = `
[POSE_AND_FRAMING]
Pose requested: ${attrPhrases.pose}
Framing: Prefer full body unless a zoom/close-up is explicitly requested.
Ensure saree pleats, pallu, and border are visible and undistorted.
[/POSE_AND_FRAMING]
`;
    promptParts.push(isZoom ? framingBase.replace("Prefer full body unless a zoom/close-up is explicitly requested.", "This is an explicit ZOOM/close-up request. Crop the frame accordingly and show the requested region.") : framingBase);

    promptParts.push(`
[BACKGROUND]
Background/location: ${attrPhrases.location}
Keep background minimal and complementary.
[/BACKGROUND]
`);

    promptParts.push(`
[ACCESSORIES]
Accessories: ${attrPhrases.accessories}
They must not obscure key saree details.
[/ACCESSORIES]
`);

    promptParts.push(`
[DESIGN_CHANGE]
Design preset: ${attrPhrases.otherOption}
Extra details: ${attrPhrases.otherDetails}
If a color or motif change is requested, apply only that change and preserve frontal structure otherwise.
[/DESIGN_CHANGE]
`);

    if (base64Image2) {
      promptParts.push(`
[SECONDARY_IMAGE_USAGE]
Use the SECOND image only for BACK/REVERSE-SIDE details (pleat underside, reverse border, back embroidery). Do NOT copy frontal features from this image.
[/SECONDARY_IMAGE_USAGE]
`);
    }

    promptParts.push(`
[QUALITY_AND_NEGATIVES]
- Ultra high quality, realistic textures, correct fabric reflections.
- No text, no logos, no extra people, no watermarks.
- Maintain correct human proportions and realistic hands.
[/QUALITY_AND_NEGATIVES]
    `);

    const promptText = promptParts.join("\n");

    // Debug logging
    console.log("===== Gemini Generation Request =====");
    console.log("HARD_STRICT_MODE:", HARD_STRICT_MODE);
    console.log("Parsed attributes (server-normalized):", { attributes, changedFields, isZoom, secondImageProvided: Boolean(base64Image2) });
    const MAX_LOG = 12000;
    console.log("Final prompt (truncated):");
    console.log(promptText.length > MAX_LOG ? promptText.slice(0, MAX_LOG) + "\n...[TRUNCATED]" : promptText);
    console.log("======================================");

    // Build contents
    const contents = [
      { inlineData: { mimeType: file.mimetype, data: base64Image } },
    ];
    if (base64Image2) {
      contents.push({ inlineData: { mimeType: secondaryFile.mimetype, data: base64Image2 } });
    }
    contents.push({ text: promptText });

    // Call Gemini
    const response = await genAI.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents,
      config: {
        imageConfig: {
          aspectRatio: isZoom ? "3:4" : "3:4",
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
      console.error("Gemini returned no image. Full response:", JSON.stringify(response || {}, null, 2));
      return res.status(500).json({ error: "No image returned from Gemini." });
    }

    const debugAttributes = {
      attributes,
      changedFields,
      isZoom,
      secondImageProvided: Boolean(base64Image2),
      HARD_STRICT_MODE,
      promptUsedTruncated: promptText.length > MAX_LOG ? promptText.slice(0, MAX_LOG) + "\n...[TRUNCATED]" : promptText,
    };

    return res.json({
      imageBase64,
      promptUsed: promptText,
      debugAttributes,
      provider: "gemini",
    });
  } catch (err) {
    console.error("Gemini error:", err);
    return res.status(500).json({ error: err.message || "Something went wrong." });
  }
};
