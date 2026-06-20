// /api/import-diagram.js
// Vercel Serverless Function (Node.js 18+)

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );

  // Handle OPTIONS request for CORS preflight
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Only POST requests allowed" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "GEMINI_API_KEY environment variable is not configured on Vercel." });
    return;
  }

  try {
    const { imageData } = req.body;
    if (!imageData || !imageData.data || !imageData.mimeType) {
      res.status(400).json({ error: "Missing imageData payload." });
      return;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
    const prompt = `You are a critical path method (CPM) diagram analysis expert. 
Analyze the uploaded image of a CPM diagram and reconstruct it into our structured diagram format.

A CPM diagram consists of:
1. Nodes (circles, hexagons, diamonds) representing events/milestones.
2. Connectors (arrow lines) representing tasks between nodes.
3. Annotations (banners, note boxes, text) representing headers or task lists.

Follow these strict rules to ensure high accuracy:

--- DETECTION RULES ---
1. **Nodes vs. Durations**:
   - Nodes are actual shapes (circles, hexagons, diamonds). The number inside the shape is the node's "label".
   - Durations are numbers in parentheses (e.g. '(20)', '(52)', '(4)') written near the connector lines. 
   - **CRITICAL**: Do NOT create a node for a duration value in parentheses. For example, if a line has '(20)' below it, do NOT create a node named '20'.

2. **Grid Placement & Alignment ('row' and 'col')**:
   - You MUST assign a horizontal 'row' (0-based integer) and vertical 'col' (0-based integer) to each node to place them on a clean grid.
   - Identify the horizontal rows (swimlanes/paths) in the diagram. Nodes in the same horizontal path MUST share the exact same 'row' value.
   - Vertically aligned nodes (e.g. all nodes labeled '13' that align vertically, or the '72' hand-over milestones) MUST share the exact same 'col' value.
   - Ensure 'col' values increase strictly from left to right (e.g. 0 for the leftmost node, up to 12 for the rightmost).
   - Every node must have a unique combination of 'row' and 'col'.

3. **Color Codes**:
   - Process nodes (circles) are usually white ("#ffffff") or yellow ("#f6d34d" / "#f1c40f").
   - Milestone nodes (hexagons) are usually green ("#7fb56e" / "#2ecc71") or yellow.
   - Identify node fill colors accurately as hex strings.

4. **Connectors (Arrows)**:
   - Determine which node connects to which by following the arrow lines.
   - For each connector, identify the 'task' name (text above the line) and 'duration' (number in parentheses below or near the line, e.g. '(20)', '(52)', '(4)').
   - Keep durations formatted like '(20)'.
   - Vertical lines connecting nodes of the same value are usually dummy tasks (dashed or solid). Ensure these are captured as connectors.

5. **Annotations (Text & Note Boxes)**:
   - Identify all banners (e.g., 'Change Cold box 3304E07' in the yellow-green box at the top, or 'CPM SHUT DOWN TURNAROUND GSP#3' at the very top).
   - Identify all note boxes (e.g., 'Task list' on the right, containing lists like '1. Line side draw corrosion...').
   - **CRITICAL**: You MUST extract the actual text content inside these boxes and set it in the 'text' field. Do not leave the text empty.
   - For annotation colors, choose from the following color tokens: 'orange', 'green', 'yellow', 'peach', 'white', 'none', 'pink'. Do NOT output raw hex color strings.
   - For annotation text colors, choose from: 'black', 'red', 'blue', 'green'.

--- COORDINATES MAPPING ---
- The output canvas is 3000px wide and 1800px high.
- Map the coordinates proportionally to this 3000x1800 space.
- Circle nodes should have radius r around 30px, hex milestones around 34px.
- Space elements out to prevent text or nodes from overlapping.

Ensure all positions are numbers (integers or floats). Return the result matching the response schema.`;

    const requestPayload = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: imageData.mimeType,
                data: imageData.data
              }
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            nodes: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  type: { type: "STRING", enum: ["circle", "hex", "diamond"] },
                  row: { type: "INTEGER" },
                  col: { type: "INTEGER" },
                  x: { type: "NUMBER" },
                  y: { type: "NUMBER" },
                  r: { type: "NUMBER" },
                  fill: { type: "STRING" },
                  label: { type: "STRING" },
                  sublabel: { type: "STRING" },
                  datetime: { type: "STRING" }
                },
                required: ["type", "row", "col", "x", "y", "r", "fill", "label", "sublabel", "datetime"]
              }
            },
            connectors: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  fromIndex: { type: "INTEGER" },
                  toIndex: { type: "INTEGER" },
                  kind: { type: "STRING", enum: ["arrow", "line"] },
                  color: { type: "STRING" },
                  dashed: { type: "BOOLEAN" },
                  duration: { type: "STRING" },
                  task: { type: "STRING" }
                },
                required: ["fromIndex", "toIndex", "kind", "duration", "task"]
              }
            },
            annotations: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  type: { type: "STRING", enum: ["note", "banner", "pin", "text"] },
                  x: { type: "NUMBER" },
                  y: { type: "NUMBER" },
                  w: { type: "NUMBER" },
                  h: { type: "NUMBER" },
                  color: { type: "STRING", enum: ["orange", "green", "yellow", "peach", "white", "none", "pink"] },
                  textColor: { type: "STRING", enum: ["black", "red", "blue", "green"] },
                  text: { type: "STRING" },
                  fontSize: { type: "NUMBER" },
                  bold: { type: "BOOLEAN" }
                },
                required: ["type", "x", "y", "w", "h", "text", "color"]
              }
            }
          }
        }
      }
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestPayload)
    });

    if (!response.ok) {
      const errText = await response.text();
      res.status(502).json({ error: `Gemini API Error: ${response.status} - ${errText}` });
      return;
    }

    const data = await response.json();
    if (!data.candidates || data.candidates.length === 0) {
      res.status(502).json({ error: "No response candidates from Gemini API." });
      return;
    }

    const textResponse = data.candidates[0].content.parts[0].text;
    res.status(200).json(JSON.parse(textResponse));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
