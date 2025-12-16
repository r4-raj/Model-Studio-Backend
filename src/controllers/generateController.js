    import { genAI } from "../config/gemini.js";

    /**
     * generateImage - with HARD_STRICT_MODE toggle
     *
     * Put HARD_STRICT_MODE=true in .env to enable strict prompt enforcement.
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

        const changedFields = Object.keys(attributes).filter(
          (k) => !k.endsWith("Note") && attributes[k] !== null
        );

        /* -------------------- Zoom Detection -------------------- */
        const poseText = (attributes.pose || "") + " " + (attributes.poseNote || "");
        const zoomKeywords = ["zoom", "close up", "close-up", "head to knees", "closeup"];
        const isZoom = zoomKeywords.some((kw) =>
          poseText.toLowerCase().includes(kw)
        );

        /* -------------------- Defaults -------------------- */
        const defaults = {
          modelType: "Indian woman, medium height, average build, realistic proportions",
          modelExpression: "natural relaxed expression, age 20–40",
          hair: "classic Indian hairstyle, neat bun or braid",
          pose: "full body front pose, standing naturally, weight balanced",
          location: "modern living room interior, home environment",
          accessories: "light traditional jewellery only",
          otherOption: "match saree design, border, motifs, and colours exactly from primary reference image",
        };

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

        /* ------------------ Living Room Detection ------------------ */
        const isLivingRoom =
          (attrPhrases.location || "").toLowerCase().includes("living room") ||
          (attrPhrases.location || "").toLowerCase().includes("home");

        /* -------------------- Prompt Assembly -------------------- */
        const promptParts = [];

        if (HARD_STRICT_MODE) {
          promptParts.push("!!! STRICT MODE ENABLED. FOLLOW ALL RULES EXACTLY.");
        }

        promptParts.push(
          "You are a world-class commercial lifestyle photographer. Create ONE completely photorealistic photograph. The final image must look like a real indoor photograph, never a studio cutout."
        );

        /* -------------------- HARD RULES -------------------- */
        const hardRules = [
          "FIRST image is the MASTER FRONTAL saree reference. Copy design, border, embroidery, motifs, and colors exactly.",
          "SECOND image (if provided) is ONLY for back-side saree reference.",
          "Do NOT add text, logos, watermarks, or extra people.",
          "Do NOT distort anatomy or fabric geometry.",
          `Allowed changes: ${changedFields.length ? changedFields.join(", ") : "none"}.`,
        ];

        if (HARD_STRICT_MODE) {
          hardRules.push(
            "STRICT MODE: DO NOT change saree pattern, colors, border, or motifs unless explicitly requested."
          );
          hardRules.push(
            "STRICT MODE: Camera perspective, scale, and lighting must match the background exactly."
          );
        }

        promptParts.push(`[HARD_RULES]\n- ${hardRules.join("\n- ")}\n[/HARD_RULES]`);

        /* -------------------- MODEL -------------------- */
        promptParts.push(`
    [MODEL_DESCRIPTION]
    Model type: ${attrPhrases.modelType}
    Expression: ${attrPhrases.modelExpression}
    Hair: ${attrPhrases.hair}
    [/MODEL_DESCRIPTION]
    `);

        /* -------------------- CAMERA & LENS (CRITICAL FIX) -------------------- */
        promptParts.push(`
    [CAMERA_AND_LENS_REALISM]
    - Camera height: 130–145 cm from floor (natural indoor photography)
    - Lens: 35–50mm full-frame equivalent
    - Perspective must align with sofa height, window lines, and ceiling lines
    - Model must NOT appear closer to the camera than nearby furniture
    [/CAMERA_AND_LENS_REALISM]
    `);

        /* -------------------- POSE -------------------- */
        promptParts.push(`
    [POSE_AND_FRAMING]
    Pose: ${attrPhrases.pose}
    Framing: full body unless zoom is explicitly requested
    Ensure saree pleats, pallu, and borders are clearly visible
    [/POSE_AND_FRAMING]
    `);

        /* -------------------- SCENE INTEGRATION -------------------- */
        promptParts.push(`
    [SCENE_INTEGRATION_AND_BACKGROUND]
    Location: ${attrPhrases.location}

    - Background photographed naturally, not artificial blur
    - Optical depth of field only (lens-based)
    - Background blur increases gradually with distance
    - Floor and model feet remain sharp

    LIGHTING & REALISM:
    - Lighting must come ONLY from room sources (windows, lamps)
    - Warm indoor bounce from furniture and floor
    - Cooler daylight from windows affects highlights
    - Environmental color bleed on skin and saree

    GROUNDING:
    - Strong contact shadows beneath feet and saree hem
    - Ambient occlusion in pleats and fabric overlaps
    - No floating or visible gaps between feet and floor
    [/SCENE_INTEGRATION_AND_BACKGROUND]
    `);

        /* -------------------- ACCESSORIES -------------------- */
        promptParts.push(`
    [ACCESSORIES]
    ${attrPhrases.accessories}
    Do not block saree details
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
    Use second image ONLY for reverse/back saree details
    [/SECONDARY_IMAGE_USAGE]
    `);
        }

        /* -------------------- QUALITY -------------------- */
        promptParts.push(`
    [QUALITY_AND_REALISM]
    - Must look like a real lifestyle photograph
    - No cutout edges, halos, or studio lighting
    - Correct proportions and natural skin texture
    - No text, logos, or artifacts
    [/QUALITY_AND_REALISM]
    `);

        const promptText = promptParts.join("\n");

        /* -------------------- Gemini Call -------------------- */
        const contents = [
          { inlineData: { mimeType: file.mimetype, data: base64Image } },
        ];

        if (base64Image2) {
          contents.push({ inlineData: { mimeType: secondaryFile.mimetype, data: base64Image2 } });
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
          provider: "gemini",
          debug: {
            HARD_STRICT_MODE,
            isLivingRoom,
            changedFields,
          },
        });

      } catch (err) {
        console.error("Gemini error:", err);
        return res.status(500).json({ error: err.message || "Something went wrong." });
      }
    };
