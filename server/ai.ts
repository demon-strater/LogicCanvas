import OpenAI from "openai";
import type { ParseResult, ParsedConcept, ParsedRelation, Document } from "@shared/schema";

export type DocumentRelation = {
  sourceDocId: number;
  targetDocId: number;
  label: string;
  edgeType: "flow" | "depends" | "related" | "parent";
};

export type WorkflowAnalysisResult = {
  relations: DocumentRelation[];
  hierarchyLevels: Record<number, number>; // docId -> level (0 is root)
  summary: string;
};

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

const WORKFLOW_ANALYSIS_PROMPT = `You are a business workflow analyst. Given a list of documents, analyze their relationships based on business flow, workflow sequence, and logical hierarchy.

For each pair of related documents, identify their relationship:
- **flow**: Document A leads to or continues into Document B (sequential workflow step)
- **depends**: Document B depends on or requires Document A
- **related**: Documents share common topics or themes
- **parent**: Document A is a parent/category that encompasses Document B

Also determine the hierarchy level for each document:
- Level 0: Root documents (starting points, high-level plans)
- Level 1: Direct children of root (major phases or categories)  
- Level 2+: Sub-items and detailed documents

Respond with valid JSON matching this exact structure:
{
  "relations": [
    { "sourceId": 1, "targetId": 2, "label": "description of relationship", "edgeType": "flow|depends|related|parent" }
  ],
  "hierarchyLevels": {
    "1": 0,
    "2": 1
  },
  "summary": "Brief summary of the overall workflow structure"
}

Guidelines:
- Analyze document titles and content to understand their purpose
- Create meaningful connections that show work progression
- Hierarchy should reflect natural business/project structure
- If documents are unrelated, don't force connections
- Flow relations should show temporal or logical sequence`;

export async function analyzeDocumentWorkflow(documents: Document[]): Promise<WorkflowAnalysisResult> {
  if (documents.length === 0) {
    return { relations: [], hierarchyLevels: {}, summary: "No documents to analyze" };
  }

  if (documents.length === 1) {
    return { 
      relations: [], 
      hierarchyLevels: { [documents[0].id]: 0 }, 
      summary: "Single document - no workflow relationships" 
    };
  }

  const docSummaries = documents.map(doc => ({
    id: doc.id,
    title: doc.title,
    preview: (doc.summary || doc.content || "").slice(0, 300)
  }));

  const response = await openai.chat.completions.create({
    model: "gpt-5.2",
    messages: [
      { role: "system", content: WORKFLOW_ANALYSIS_PROMPT },
      { 
        role: "user", 
        content: `Analyze the workflow relationships between these documents:\n\n${JSON.stringify(docSummaries, null, 2)}` 
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 2048,
  });

  const result = response.choices[0]?.message?.content;
  if (!result) {
    throw new Error("No response from AI");
  }

  try {
    const parsed = JSON.parse(result);
    const docIds = new Set(documents.map(d => d.id));
    
    // Validate and filter relations
    const validRelations: DocumentRelation[] = (parsed.relations || [])
      .filter((r: any) => 
        docIds.has(Number(r.sourceId)) && 
        docIds.has(Number(r.targetId)) &&
        r.sourceId !== r.targetId
      )
      .map((r: any) => ({
        sourceDocId: Number(r.sourceId),
        targetDocId: Number(r.targetId),
        label: String(r.label || ""),
        edgeType: ["flow", "depends", "related", "parent"].includes(r.edgeType) 
          ? r.edgeType as "flow" | "depends" | "related" | "parent"
          : "related"
      }));

    // Validate hierarchy levels
    const hierarchyLevels: Record<number, number> = {};
    if (parsed.hierarchyLevels) {
      for (const [idStr, level] of Object.entries(parsed.hierarchyLevels)) {
        const id = Number(idStr);
        if (docIds.has(id) && typeof level === "number") {
          hierarchyLevels[id] = level;
        }
      }
    }
    
    // Assign level 0 to any unassigned documents
    for (const doc of documents) {
      if (!(doc.id in hierarchyLevels)) {
        hierarchyLevels[doc.id] = 0;
      }
    }

    return {
      relations: validRelations,
      hierarchyLevels,
      summary: String(parsed.summary || "Workflow analysis complete")
    };
  } catch (e) {
    console.error("Failed to parse workflow analysis:", result);
    throw new Error("Failed to parse workflow analysis as JSON");
  }
}
