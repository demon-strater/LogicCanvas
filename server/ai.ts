import OpenAI from "openai";
import type { ParseResult, ParsedConcept, ParsedRelation, Document } from "@shared/schema";

export type DocumentRelation = {
  sourceDocId: number;
  targetDocId: number;
  label: string;
  edgeType: "flow" | "depends" | "related" | "parent";
};

export type GroupDefinition = {
  name: string;
  description: string;
  color: string;
  level: "major" | "medium" | "minor"; // 대그룹, 중그룹, 소그룹
  monthStart?: number; // 1-12 for January-December
  monthEnd?: number; // 1-12 for January-December
  documentIds: number[];
  childGroups?: GroupDefinition[];
};

export type GroupRelation = {
  sourceGroupName: string;
  targetGroupName: string;
  label: string;
  edgeType: "flow" | "depends" | "related";
};

export type WorkflowAnalysisResult = {
  relations: DocumentRelation[];
  hierarchyLevels: Record<number, number>;
  groups: GroupDefinition[];
  groupRelations: GroupRelation[];
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
    
    if (!Array.isArray(parsed.concepts) || !Array.isArray(parsed.relations)) {
      throw new Error("Invalid response structure");
    }

    parsed.concepts = parsed.concepts.map((c: any) => ({
      label: String(c.label || "Untitled"),
      content: String(c.content || ""),
      nodeType: ["concept", "claim", "evidence", "question"].includes(c.nodeType) 
        ? c.nodeType 
        : "concept",
    })) as ParsedConcept[];

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

const WORKFLOW_ANALYSIS_PROMPT = `You are a project management and business workflow analyst. Given a list of documents, analyze their relationships and organize them into a hierarchical group structure based on WORKFLOW STAGES (not time phases).

IMPORTANT: Create a 2-level group hierarchy:
1. **대그룹 (Major Groups)**: Project WORKFLOW STAGES based on typical project management
   - Examples: "리서치 (Research)", "기획 (Planning)", "설계 (Design)", "실행 (Execution)", "분석 (Analysis)", "보고 (Reporting)"
   - Group documents by their PURPOSE and FUNCTION in the project
   - NOT by time (no 초기/중기/후기)
   
2. **중그룹 (Medium Groups)**: Specific sub-categories within each workflow stage
   - Examples under "리서치": "데스크 리서치", "현장 조사", "인터뷰"
   - Examples under "기획": "컨셉 개발", "전략 수립"

3. **Timeline Info**: Each group should include which month(s) the work occurred
   - Use monthStart and monthEnd to indicate timing (1-12)
   - Groups with similar months should be positioned at similar Y-axis levels

For document relationships:
- **flow**: Sequential workflow step (A → B)
- **depends**: B requires/depends on A
- **related**: Share common topics

For GROUP-TO-GROUP relationships (IMPORTANT - show workflow between groups):
- **flow**: One stage leads to another (리서치 → 기획)
- **depends**: One stage depends on outputs from another
- Create edges between MAJOR groups to show the overall project workflow

Respond with valid JSON:
{
  "relations": [
    { "sourceId": 1, "targetId": 2, "label": "description", "edgeType": "flow|depends|related" }
  ],
  "groupRelations": [
    { "sourceGroupName": "리서치", "targetGroupName": "기획", "label": "리서치 결과를 기획에 반영", "edgeType": "flow" },
    { "sourceGroupName": "기획", "targetGroupName": "실행", "label": "기획 완료 후 실행", "edgeType": "flow" }
  ],
  "hierarchyLevels": { "1": 0, "2": 1 },
  "groups": [
    {
      "name": "리서치",
      "description": "조사 및 데이터 수집 단계",
      "level": "major",
      "monthStart": 12,
      "monthEnd": 1,
      "documentIds": [],
      "childGroups": [
        {
          "name": "데스크 리서치",
          "description": "문헌 및 데이터 조사",
          "level": "medium",
          "monthStart": 12,
          "monthEnd": 12,
          "documentIds": [1, 2],
          "childGroups": []
        }
      ]
    }
  ],
  "summary": "Overall workflow summary"
}

Guidelines:
- MAJOR groups = WORKFLOW STAGES (리서치, 기획, 설계, 실행, 분석, 보고 등)
- Place EVERY document into exactly one group (at any level)
- Analyze content to determine workflow stage, and dates to determine month
- Use Korean labels for groups
- Groups that work in parallel (same months) should have similar monthStart/monthEnd
- X-axis = workflow stage order (리서치 left → 보고 right)
- Y-axis = similar timing (groups with overlapping months at similar heights)`;

const GROUP_COLORS = [
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#f43f5e", // rose
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#3b82f6", // blue
];

export async function analyzeDocumentWorkflow(documents: Document[]): Promise<WorkflowAnalysisResult> {
  if (documents.length === 0) {
    return { relations: [], hierarchyLevels: {}, groups: [], groupRelations: [], summary: "No documents to analyze" };
  }

  if (documents.length === 1) {
    return { 
      relations: [], 
      hierarchyLevels: { [documents[0].id]: 0 },
      groups: [{
        name: "문서",
        description: "단일 문서",
        color: GROUP_COLORS[0],
        level: "major",
        documentIds: [documents[0].id],
      }],
      groupRelations: [],
      summary: "Single document - no workflow relationships" 
    };
  }

  const docSummaries = documents.map(doc => ({
    id: doc.id,
    title: doc.title,
    createdAt: doc.createdAt,
    preview: (doc.summary || doc.content || "").slice(0, 500)
  }));

  const response = await openai.chat.completions.create({
    model: "gpt-5.2",
    messages: [
      { role: "system", content: WORKFLOW_ANALYSIS_PROMPT },
      { 
        role: "user", 
        content: `Analyze the workflow relationships and create hierarchical groups for these documents:\n\n${JSON.stringify(docSummaries, null, 2)}` 
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 4096,
  });

  const result = response.choices[0]?.message?.content;
  if (!result) {
    throw new Error("No response from AI");
  }

  try {
    const parsed = JSON.parse(result);
    const docIds = new Set(documents.map(d => d.id));
    
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

    const hierarchyLevels: Record<number, number> = {};
    if (parsed.hierarchyLevels) {
      for (const [idStr, level] of Object.entries(parsed.hierarchyLevels)) {
        const id = Number(idStr);
        if (docIds.has(id) && typeof level === "number") {
          hierarchyLevels[id] = level;
        }
      }
    }
    
    for (const doc of documents) {
      if (!(doc.id in hierarchyLevels)) {
        hierarchyLevels[doc.id] = 0;
      }
    }

    // Process groups with validation and color assignment
    const assignedDocIds = new Set<number>();
    const groups = processGroups(parsed.groups || [], docIds, assignedDocIds, 0);

    // If no groups were created by AI, create a single default group with all docs
    if (groups.length === 0) {
      groups.push({
        name: "전체 문서",
        description: "모든 문서",
        color: GROUP_COLORS[0],
        level: "major" as const,
        documentIds: documents.map(d => d.id),
      });
      // Mark all docs as assigned
      documents.forEach(d => assignedDocIds.add(d.id));
    } else {
      // Ensure every document is assigned exactly once
      // If some documents are not assigned, create a fallback group
      const unassignedDocs = documents.filter(d => !assignedDocIds.has(d.id));
      if (unassignedDocs.length > 0) {
        groups.push({
          name: "기타 문서",
          description: "분류되지 않은 문서",
          color: GROUP_COLORS[groups.length % GROUP_COLORS.length],
          level: "major" as const,
          documentIds: unassignedDocs.map(d => d.id),
        });
      }
    }

    // Process group relations
    const groupRelations: GroupRelation[] = (parsed.groupRelations || [])
      .filter((r: any) => 
        typeof r.sourceGroupName === "string" && 
        typeof r.targetGroupName === "string" &&
        r.sourceGroupName !== r.targetGroupName
      )
      .map((r: any) => ({
        sourceGroupName: String(r.sourceGroupName),
        targetGroupName: String(r.targetGroupName),
        label: String(r.label || ""),
        edgeType: ["flow", "depends", "related"].includes(r.edgeType) 
          ? r.edgeType as "flow" | "depends" | "related"
          : "flow"
      }));

    return {
      relations: validRelations,
      hierarchyLevels,
      groups,
      groupRelations,
      summary: String(parsed.summary || "Workflow analysis complete")
    };
  } catch (e) {
    console.error("Failed to parse workflow analysis:", result);
    throw new Error("Failed to parse workflow analysis as JSON");
  }
}

function processGroups(
  groups: any[], 
  validDocIds: Set<number>,
  assignedDocIds: Set<number>,
  colorIndex: number
): GroupDefinition[] {
  return groups.map((g: any, idx: number) => {
    const color = GROUP_COLORS[(colorIndex + idx) % GROUP_COLORS.length];
    
    // Filter document IDs: must be valid and not already assigned to another group
    const documentIds = (g.documentIds || [])
      .map((id: any) => Number(id))
      .filter((id: number) => validDocIds.has(id) && !assignedDocIds.has(id));
    
    // Mark these documents as assigned
    documentIds.forEach((id: number) => assignedDocIds.add(id));

    const childGroups = g.childGroups 
      ? processGroups(g.childGroups, validDocIds, assignedDocIds, colorIndex + idx + 1)
      : undefined;

    return {
      name: String(g.name || "그룹"),
      description: String(g.description || ""),
      color,
      level: (["major", "medium", "minor"].includes(g.level) ? g.level : "major") as "major" | "medium" | "minor",
      monthLabel: g.monthLabel ? String(g.monthLabel) : undefined,
      phaseLabel: g.phaseLabel ? String(g.phaseLabel) : undefined,
      documentIds,
      childGroups: childGroups && childGroups.length > 0 ? childGroups : undefined,
    };
  });
}
