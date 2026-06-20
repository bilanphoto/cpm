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

Extract all elements and map them to our canvas coordinates:
- The canvas width is 3000px and height is 1800px.
- Make sure to distribute nodes (circles, hexagons, diamonds) appropriately on this 3000x1800 space with at least 150px of padding from all sides.
- Do NOT overlap nodes. Space them out so connectors can be drawn clearly.
- Circle nodes should have radius r around 30px, hex milestones around 34px.
- Identify:
  1. Nodes:
     - type: "circle" (for process nodes), "hex" (for hand-over milestones/hexagons), or "diamond" (for hold/mode points/diamonds).
     - label: the number inside the node (usually the earliest start time or step number).
     - sublabel: the caption text above/below the node.
     - datetime: any date/time text displayed near the node (e.g., '20 Apr.25\\n04.00').
     - fill: the fill color of the node (e.g., "#ffffff" for process nodes, "#7fb56e" for green hexagons, "#f6d34d" for yellow hexagons/circles).
  2. Connectors:
     - fromIndex: 0-based index of the source node in your generated "nodes" array.
     - toIndex: 0-based index of the target node in your generated "nodes" array.
     - kind: always "arrow".
     - color: stroke color of the line (e.g., "#c0392b" for red lines).
     - dashed: true if the line is dashed/dotted, false if solid.
     - task: the task name text (usually written above the line).
     - duration: the duration text (usually written below the line, e.g. '(1)', '(4)', '(42)').
  3. Annotations:
     - type: "note" (for note boxes), "banner" (for section banners), or "text" (for free-text).
     - x, y: positions.
     - w, h: width and height.
     - color: fill/border color of the note.
     - text: text content inside.

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
                  x: { type: "NUMBER" },
                  y: { type: "NUMBER" },
                  r: { type: "NUMBER" },
                  fill: { type: "STRING" },
                  label: { type: "STRING" },
                  sublabel: { type: "STRING" },
                  datetime: { type: "STRING" }
                },
                required: ["type", "x", "y", "r", "fill"]
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
                required: ["fromIndex", "toIndex", "kind"]
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
                  color: { type: "STRING" },
                  text: { type: "STRING" }
                },
                required: ["type", "x", "y"]
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
