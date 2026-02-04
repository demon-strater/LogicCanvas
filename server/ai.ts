import OpenAI from "openai";
import type { ParseResult, ParsedConcept, ParsedRelation } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const SYSTEM_PROMPT = `You are a cognitive mapping assistant that analyzes documents to extract logical structures. Your task is to identify key concepts, claims, evidence, and questions from text, then map how they relate to each other.

For each document, extract:
1. **Concepts**: Core ideas, themes, or topics
2. **Claims**: Assertions or arguments being made
3. **Evidence**: Facts, data, or examples supporting claims
4. **Questions**: Uncertainties, gaps, or areas needing investigation

Then identify relationships between these elements:
- **related**: General connection between concepts
- **supports**: Evidence or reasoning that backs a claim
- **contradicts**: Opposing or conflicting ideas
- **implies**: Logical consequence or inference

Respond with valid JSON matching this exact structure:
{
  "concepts": [
    { "label": "Short title (2-5 words)", "content": "Detailed explanation (1-2 sentences)", "nodeType": "concept|claim|evidence|question" }
  ],
  "relations": [
    { "sourceIndex": 0, "targetIndex": 1, "label": "optional relationship label", "edgeType": "related|supports|contradicts|implies" }
  ]
}

Guidelines:
- Extract 5-15 concepts depending on document length and complexity
- Create 5-20 meaningful relationships
- Use concise, clear labels
- Content should explain the concept in context of the original document
- Relationships should form a coherent logical network
- If the document is unclear or too short, extract what you can`;

export async function parseDocumentWithAI(content: string): Promise<ParseResult> {
  const response = await openai.chat.completions.create({
    model: "gpt-5.2",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Analyze this document and extract its logical structure:\n\n${content}` },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 4096,
  });

  const result = response.choices[0]?.message?.content;
  if (!result) {
    throw new Error("No response from AI");
  }

  try {
    const parsed = JSON.parse(result) as ParseResult;
    
    // Validate the structure
    if (!Array.isArray(parsed.concepts) || !Array.isArray(parsed.relations)) {
      throw new Error("Invalid response structure");
    }

    // Validate concepts
    parsed.concepts = parsed.concepts.map((c: any) => ({
      label: String(c.label || "Untitled"),
      content: String(c.content || ""),
      nodeType: ["concept", "claim", "evidence", "question"].includes(c.nodeType) 
        ? c.nodeType 
        : "concept",
    })) as ParsedConcept[];

    // Validate relations
    parsed.relations = parsed.relations
      .filter((r: any) => 
        typeof r.sourceIndex === "number" && 
        typeof r.targetIndex === "number" &&
        r.sourceIndex >= 0 && 
        r.sourceIndex < parsed.concepts.length &&
        r.targetIndex >= 0 && 
        r.targetIndex < parsed.concepts.length &&
        r.sourceIndex !== r.targetIndex
      )
      .map((r: any) => ({
        sourceIndex: r.sourceIndex,
        targetIndex: r.targetIndex,
        label: r.label || undefined,
        edgeType: ["related", "supports", "contradicts", "implies"].includes(r.edgeType) 
          ? r.edgeType 
          : "related",
      })) as ParsedRelation[];

    return parsed;
  } catch (e) {
    console.error("Failed to parse AI response:", result);
    throw new Error("Failed to parse AI response as JSON");
  }
}
