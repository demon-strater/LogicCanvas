import OpenAI from "openai";
import type { ParseResult, ParsedConcept, ParsedRelation, Document, NodeType, EdgeType, TQIFeedback } from "@shared/schema";

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
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY || "missing-api-key",
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const DEFAULT_ANALYSIS_MODEL = "gpt-4.1-mini";
const DEFAULT_GROUP_MODEL = "gpt-4.1-mini";

function getModelList(primary: string | undefined, fallback: string[] = []): string[] {
  const configuredFallbacks = (process.env.LOGICCANVAS_AI_FALLBACK_MODELS || "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);

  return Array.from(new Set([
    primary,
    ...fallback,
    ...configuredFallbacks,
  ].filter(Boolean) as string[]));
}

function getAnalysisModels(): string[] {
  return getModelList(
    process.env.LOGICCANVAS_ANALYSIS_MODEL || process.env.LOGICCANVAS_AI_MODEL || DEFAULT_ANALYSIS_MODEL,
    DEFAULT_ANALYSIS_MODEL === "gpt-4.1-mini" ? ["gpt-4.1", "gpt-4o-mini"] : [DEFAULT_ANALYSIS_MODEL, "gpt-4.1-mini", "gpt-4o-mini"],
  );
}

function getGroupModels(): string[] {
  return getModelList(
    process.env.LOGICCANVAS_GROUP_MODEL || process.env.LOGICCANVAS_AI_MODEL || DEFAULT_GROUP_MODEL,
    ["gpt-4.1-mini", "gpt-4o-mini"],
  );
}

function logOpenAIError(context: string, model: string, error: any) {
  console.error(`[ai] ${context} failed with ${model}:`, {
    status: error?.status,
    code: error?.code,
    type: error?.type,
    message: error?.message,
  });
}

async function createJsonChatCompletion(
  context: string,
  models: string[],
  messages: any[],
  maxCompletionTokens: number,
) {
  let lastError: any;

  for (const model of models) {
    const attempts = [
      { response_format: { type: "json_object" }, max_completion_tokens: maxCompletionTokens },
      { response_format: { type: "json_object" }, max_tokens: maxCompletionTokens },
      { max_completion_tokens: maxCompletionTokens },
      { max_tokens: maxCompletionTokens },
    ];

    for (const attempt of attempts) {
      try {
        return await openai.chat.completions.create({
          model,
          messages,
          ...attempt,
        } as any);
      } catch (error: any) {
        lastError = error;
        logOpenAIError(context, model, error);

        if (error?.status === 401 || error?.code === "invalid_api_key") {
          throw error;
        }

        if (error?.status === 429 || error?.code === "insufficient_quota") {
          break;
        }
      }
    }
  }

  throw lastError || new Error(`${context} failed`);
}

function parseJsonResponse<T>(raw: string): T {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return JSON.parse(fenced ? fenced[1] : trimmed) as T;
}

export function isAIConfigured(): boolean {
  return Boolean(process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY);
}

export function getAIConfigStatus() {
  return {
    configured: isAIConfigured(),
    provider: process.env.AI_INTEGRATIONS_OPENAI_API_KEY ? "ai-integrations" : process.env.OPENAI_API_KEY ? "openai" : null,
    baseURLConfigured: Boolean(process.env.AI_INTEGRATIONS_OPENAI_BASE_URL),
    analysisModels: getAnalysisModels(),
    groupModels: getGroupModels(),
  };
}

function assertAIConfigured() {
  if (!isAIConfigured()) {
    const error = new Error("AI service is not configured. Set OPENAI_API_KEY or AI_INTEGRATIONS_OPENAI_API_KEY in the deployment environment.");
    (error as Error & { code?: string }).code = "AI_NOT_CONFIGURED";
    throw error;
  }
}

const SYSTEM_PROMPT = `You are the LogicCanvas Engine, a specialized AI for Rhetorical Structure Analysis and Meta-cognitive Augmentation. Your primary goal is to deconstruct linear text into a non-linear rhetorical graph and serve as a Cognitive Mirror for the user.

## Step 1: Discourse Segmentation and RST Mapping
- Parse the input text into Elementary Discourse Units (EDUs).
- Identify the logical role of each EDU: Claim, Evidence, Premise, Concept, Question, Elaboration, or Contrast.
- Determine the relationship hierarchy using Rhetorical Structure Theory (RST).
- For every pair of units, identify which is the Nucleus (central information, weight=2) and which is the Satellite (supporting information, weight=1).

## Step 2: Structural Gap Analysis
- Detect logical leaps where a Nucleus lacks a supporting Satellite (e.g., a claim without evidence).
- Identify circular reasoning or redundant nodes that do not add rhetorical value.
- Locate contradictions in the rhetorical flow.

## Step 3: TQI Response (Teaching Quality Index)
Based on the analysis, provide meta-cognitive feedback:
- Level 0 (Mirroring): Reflect the user's logical structure back, including inconsistencies, without correcting them.
- Level 1 (Clarifying Probe): Ask for specific definitions or evidence for ambiguous nodes.
- Level 2 (Socratic Gap): Ask challenging questions about missing logical links or hidden premises.

## Output Format
Respond with valid JSON:
{
  "concepts": [
    { "label": "Short title (2-5 words)", "content": "Detailed explanation (1-2 sentences)", "nodeType": "concept|claim|evidence|question|premise|elaboration|contrast", "weight": 1 or 2 }
  ],
  "relations": [
    { "sourceIndex": 0, "targetIndex": 1, "label": "relationship description", "edgeType": "related|supports|contradicts|implies|cause|result|elaboration|contrast" }
  ],
  "feedback": [
    { "level": 0, "message": "Meta-cognitive feedback message" }
  ]
}

## Guidelines
- Extract 5-15 discourse units depending on document length and complexity
- Assign weight=2 to Nucleus nodes (central arguments) and weight=1 to Satellite nodes (supporting details)
- Create 5-20 meaningful rhetorical relationships
- Use concise, clear Korean labels when the source document is in Korean
- Focus on the spatial relationship of ideas, not simple summarization
- Highlight the rhetorical weight of each argument
- Provide 1-3 TQI feedback items that help the user see structural gaps or strengths
- If the document is unclear or too short, extract what you can and note the gap in feedback`;

const VALID_NODE_TYPES: NodeType[] = ["concept", "claim", "evidence", "question", "premise", "elaboration", "contrast"];
const VALID_EDGE_TYPES: EdgeType[] = ["related", "supports", "contradicts", "implies", "cause", "result", "elaboration", "contrast"];

export async function parseDocumentWithAI(content: string): Promise<ParseResult> {
  assertAIConfigured();

  try {
    const response = await createJsonChatCompletion(
      "parse document",
      getAnalysisModels(),
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Perform Rhetorical Structure Analysis on this document. Segment it into discourse units, map their rhetorical relationships, identify structural gaps, and provide TQI feedback:\n\n${content}` },
      ],
      4096,
    );

    const result = response.choices[0]?.message?.content;
    if (!result) {
      throw new Error("No response from AI");
    }

    const parsed = parseJsonResponse<ParseResult>(result);
    
    if (!Array.isArray(parsed.concepts) || !Array.isArray(parsed.relations)) {
      throw new Error("Invalid response structure");
    }

    parsed.concepts = parsed.concepts.map((c: any) => ({
      label: String(c.label || "Untitled"),
      content: String(c.content || ""),
      nodeType: VALID_NODE_TYPES.includes(c.nodeType) ? c.nodeType : "concept",
      weight: typeof c.weight === "number" ? Math.min(Math.max(c.weight, 1), 2) : 1,
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
        edgeType: VALID_EDGE_TYPES.includes(r.edgeType) ? r.edgeType : "related",
      })) as ParsedRelation[];

    parsed.feedback = Array.isArray(parsed.feedback)
      ? parsed.feedback
          .filter((f: any) => typeof f.level === "number" && typeof f.message === "string")
          .map((f: any) => ({
            level: [0, 1, 2].includes(f.level) ? f.level : 0,
            message: String(f.message),
          })) as TQIFeedback[]
      : [];

    return parsed;
  } catch (e) {
    console.error("[ai] Falling back to local document parser:", e);
    return buildLocalParseResult(content);
  }
}

function buildLocalParseResult(content: string): ParseResult {
  const sentences = content
    .replace(/\r/g, "\n")
    .split(/(?<=[.!?。！？])\s+|\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 8);

  const sourceUnits = sentences.length > 0 ? sentences : [content.trim() || "No content provided."];
  const concepts: ParsedConcept[] = sourceUnits.map((sentence, index) => {
    const normalized = sentence.replace(/\s+/g, " ");
    const label = normalized.length > 28 ? `${normalized.slice(0, 28)}...` : normalized;
    const lower = normalized.toLowerCase();
    const nodeType: NodeType =
      normalized.includes("?") || normalized.includes("왜") || lower.includes("why")
        ? "question"
        : normalized.includes("근거") || normalized.includes("because") || normalized.includes("때문")
          ? "evidence"
          : index === 0
            ? "claim"
            : "concept";

    return {
      label: label || `Unit ${index + 1}`,
      content: normalized,
      nodeType,
      weight: index === 0 ? 2 : 1,
    };
  });

  const relations: ParsedRelation[] = concepts.slice(1).map((_, index) => ({
    sourceIndex: index,
    targetIndex: index + 1,
    label: index === 0 ? "supports" : "related",
    edgeType: index === 0 ? "supports" : "related",
  }));

  return {
    concepts,
    relations,
    feedback: [
      {
        level: 1,
        message: "AI 분석 서비스 응답이 지연되어 기본 문장 구조 기반 로직맵을 생성했습니다. 핵심 주장, 근거, 질문을 검토해 노드를 보완할 수 있습니다.",
      },
    ],
  };
}

export type GroupAssignmentResult = {
  action: "existing" | "new";
  existingGroupId?: number;
  newGroup?: {
    name: string;
    description: string;
    color: string;
    level: "major";
  };
};

const GROUP_ASSIGNMENT_PROMPT = `You are a document organization assistant. Given a new document and existing groups, decide where the document belongs.

RULES:
- If an existing group clearly fits the document's topic/purpose, assign it to that group.
- If no existing group fits well, create a NEW group for it.
- New groups should use short Korean names (2-4 characters). Examples: "리서치", "기획", "실행", "분석", "보고서", "회의록", "자료조사", "전략", "마케팅"
- Be generous about matching - if a document is even loosely related to an existing group's purpose, use that group.
- Only create a new group if the document's topic is genuinely different from all existing groups.

Respond with valid JSON:
{
  "action": "existing" or "new",
  "existingGroupId": <id if action is "existing">,
  "newGroup": { "name": "그룹명", "description": "간단 설명", "color": "#hex" } (only if action is "new")
}`;

export async function assignDocumentToGroup(
  docTitle: string,
  docContent: string,
  existingGroups: { id: number; name: string; description: string | null; parentId: number | null; color: string | null }[]
): Promise<GroupAssignmentResult> {
  assertAIConfigured();

  const contentPreview = docContent.substring(0, 2000);
  
  const groupList = existingGroups.length > 0
    ? existingGroups.map(g => `- ID: ${g.id}, Name: "${g.name}", Description: "${g.description || ""}", ParentId: ${g.parentId || "null"}`).join("\n")
    : "(그룹이 없습니다)";

  const usedColors = new Set(existingGroups.map(g => g.color).filter(Boolean));
  const availableColors = GROUP_COLORS.filter(c => !usedColors.has(c));
  const suggestedColor = availableColors.length > 0 ? availableColors[0] : GROUP_COLORS[Math.floor(Math.random() * GROUP_COLORS.length)];

  const response = await createJsonChatCompletion(
    "assign document to group",
    getGroupModels(),
    [
      { role: "system", content: GROUP_ASSIGNMENT_PROMPT },
      { role: "user", content: `New document:\nTitle: ${docTitle}\nContent preview:\n${contentPreview}\n\nExisting groups:\n${groupList}\n\nIf creating a new group, suggest a color from these available colors: ${availableColors.join(", ")}. If none available, use: ${suggestedColor}` },
    ],
    512,
  );

  const result = response.choices[0]?.message?.content;
  if (!result) {
    return { action: "new", newGroup: { name: "기타", description: "미분류 문서", color: suggestedColor, level: "major" } };
  }

  try {
    const parsed = parseJsonResponse<GroupAssignmentResult>(result);
    
    if (parsed.action === "existing" && parsed.existingGroupId) {
      const validGroup = existingGroups.find(g => g.id === parsed.existingGroupId);
      if (validGroup) return parsed;
    }
    
    if (parsed.action === "new" && parsed.newGroup) {
      parsed.newGroup.level = "major";
      if (!parsed.newGroup.name || parsed.newGroup.name.trim().length === 0) parsed.newGroup.name = "기타";
      if (!parsed.newGroup.description || parsed.newGroup.description.trim().length === 0) parsed.newGroup.description = "미분류 문서";
      if (!parsed.newGroup.color || !parsed.newGroup.color.startsWith("#")) parsed.newGroup.color = suggestedColor;
      return parsed;
    }

    return { action: "new", newGroup: { name: "기타", description: "미분류 문서", color: suggestedColor, level: "major" } };
  } catch {
    return { action: "new", newGroup: { name: "기타", description: "미분류 문서", color: suggestedColor, level: "major" } };
  }
}

const WORKFLOW_ANALYSIS_PROMPT = `You are a project management and business workflow analyst. Given a list of documents, analyze their relationships and organize them into SIMPLE, broad groups.

IMPORTANT RULES - KEEP IT SIMPLE:
- Create only 2-4 MAJOR groups total (대그룹). Do NOT create too many groups.
- Only create medium groups (중그룹) if a major group has 5+ documents. Otherwise put documents directly in the major group.
- NEVER create minor groups (소그룹). Keep hierarchy flat.
- Each medium group should have at least 2 documents. Do not make a group for a single document.

Group categories should be BROAD workflow stages:
- Examples: "리서치", "기획", "실행", "분석" — use simple, short names
- Do NOT over-categorize. If in doubt, merge into fewer groups.

Timeline: Each group can include monthStart/monthEnd (1-12) for timing context.

For document relationships (keep minimal, only clear connections):
- **flow**: Clear sequential step (A → B)
- **depends**: B clearly requires A
- **related**: Only if strongly related

For GROUP-TO-GROUP relationships:
- Only create flow/depends edges between MAJOR groups
- Keep it to 2-4 group edges maximum

Respond with valid JSON:
{
  "relations": [
    { "sourceId": 1, "targetId": 2, "label": "description", "edgeType": "flow|depends|related" }
  ],
  "groupRelations": [
    { "sourceGroupName": "리서치", "targetGroupName": "기획", "label": "조사 후 기획", "edgeType": "flow" }
  ],
  "hierarchyLevels": { "1": 0, "2": 1 },
  "groups": [
    {
      "name": "리서치",
      "description": "조사 단계",
      "level": "major",
      "monthStart": 12,
      "monthEnd": 1,
      "documentIds": [1, 2, 3],
      "childGroups": []
    }
  ],
  "summary": "Overall workflow summary"
}

Guidelines:
- FEWER groups is BETTER. Aim for 2-4 major groups.
- Only split into medium groups when a major group would have 5+ documents.
- Place EVERY document into exactly one group
- Use short Korean labels
- Do not create empty groups`;

const WORKFLOW_ANALYSIS_PROMPT_V2 = `You are a workflow analyst. Convert the supplied documents into a hierarchical workflow graph.

Hard requirements:
- Always produce 2 to 4 major groups when there are 4 or more documents.
- Use medium child groups under a major group whenever that major group has multiple documents. For larger sets, prefer 2 to 3 medium groups per major group.
- Do not leave documents ungrouped.
- Every document must appear exactly once in the final hierarchy.
- Use major groups as broad stages, and medium groups as the actual buckets that hold documents.
- Major group names may be broad workflow stages such as planning, execution, analysis, or reporting.
- Medium child group names must be more specific than their parent. Name them from the actual report topics, deliverables, decisions, audience, or work package. Avoid generic medium names such as planning, execution, analysis, report, misc, or data.
- Keep labels concise and concrete. Korean labels are preferred.
- Use monthStart/monthEnd only when timing helps the grouping.

Workflow edges:
- Do not create document-to-document relations. Always return an empty "relations" array.
- Create groupRelations only between major groups, and order them in workflow sequence.
- If there is no obvious relation, omit the edge rather than inventing one.

Return valid JSON in this shape:
{
  "relations": [
    { "sourceId": 1, "targetId": 2, "label": "description", "edgeType": "flow|depends|related" }
  ],
  "groupRelations": [
    { "sourceGroupName": "기획", "targetGroupName": "실행", "label": "기획 -> 실행", "edgeType": "flow" }
  ],
  "hierarchyLevels": { "1": 0, "2": 1 },
  "groups": [
    {
      "name": "기획",
      "description": "상위 단계",
      "level": "major",
      "monthStart": 12,
      "monthEnd": 1,
      "documentIds": [],
      "childGroups": [
        {
          "name": "자료 정리",
          "description": "중간 단계",
          "level": "medium",
          "documentIds": [1, 2]
        }
      ]
    }
  ],
  "summary": "Overall workflow summary"
}`;

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

  if (!isAIConfigured()) {
    return buildFallbackWorkflowAnalysis(documents);
  }

  const docSummaries = documents.map(doc => ({
    id: doc.id,
    title: doc.title,
    createdAt: doc.createdAt,
    preview: (doc.summary || doc.content || "").slice(0, 500)
  }));

  try {
    const response = await createJsonChatCompletion(
      "analyze document workflow",
      getAnalysisModels(),
      [
        { role: "system", content: WORKFLOW_ANALYSIS_PROMPT_V2 },
        {
          role: "user",
          content: `Analyze the workflow relationships and create hierarchical groups for these documents:\n\n${JSON.stringify(docSummaries, null, 2)}`,
        },
      ],
      4096,
    );

    const result = response.choices[0]?.message?.content;
    if (!result) {
      throw new Error("No response from AI");
    }

    try {
      const parsed = parseJsonResponse<any>(result);
      const docIds = new Set(documents.map(d => d.id));
    
    const validRelations: DocumentRelation[] = [];

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
      let groups = processGroups(parsed.groups || [], docIds, assignedDocIds, 0);

      const needsSyntheticHierarchy =
        documents.length >= 4 &&
        groups.length > 0 &&
        groups.every(group => !group.childGroups || group.childGroups.length === 0);

      if (needsSyntheticHierarchy) {
        const orderedDocs = [...documents].sort((a, b) => {
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : Number.MAX_SAFE_INTEGER;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : Number.MAX_SAFE_INTEGER;
          if (aTime !== bTime) return aTime - bTime;
          return a.title.localeCompare(b.title);
        });

        const stageNames = ["기획", "준비", "실행", "정리"];
        const majorCount = Math.min(4, Math.max(2, Math.ceil(orderedDocs.length / 5)));
        const docsPerMajor = Math.ceil(orderedDocs.length / majorCount);

        groups = [];
        assignedDocIds.clear();

        for (let i = 0; i < majorCount; i++) {
          const majorDocs = orderedDocs.slice(i * docsPerMajor, (i + 1) * docsPerMajor);
          if (majorDocs.length === 0) continue;

          const majorName = stageNames[i] || `단계 ${i + 1}`;
          const majorGroup: GroupDefinition = {
            name: majorName,
            description: `${majorName} 단계`,
            color: GROUP_COLORS[i % GROUP_COLORS.length],
            level: "major",
            documentIds: [],
            childGroups: [],
          };

          majorDocs.forEach((doc) => assignedDocIds.add(doc.id));

          if (majorDocs.length >= 5) {
            const mediumCount = Math.min(3, Math.max(2, Math.ceil(majorDocs.length / 3)));
            const docsPerMedium = Math.ceil(majorDocs.length / mediumCount);
            majorGroup.childGroups = [];

            for (let j = 0; j < mediumCount; j++) {
              const mediumDocs = majorDocs.slice(j * docsPerMedium, (j + 1) * docsPerMedium);
              if (mediumDocs.length === 0) continue;
              majorGroup.childGroups.push({
                name: `${majorName} ${j + 1}`,
                description: `${majorName} 세부 단계`,
                color: GROUP_COLORS[(i + j + 1) % GROUP_COLORS.length],
                level: "medium",
                documentIds: mediumDocs.map((doc) => doc.id),
              });
            }
          } else {
            majorGroup.documentIds = majorDocs.map((doc) => doc.id);
          }

          groups.push(majorGroup);
        }
      }

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
      let groupRelations: GroupRelation[] = (parsed.groupRelations || [])
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

      if (groupRelations.length === 0 && groups.length > 1) {
        const toTime = (docId: number): number => {
          const doc = documents.find(d => d.id === docId);
          return doc?.createdAt ? new Date(doc.createdAt).getTime() : Number.MAX_SAFE_INTEGER;
        };

        const groupOrder = [...groups].sort((a, b) => {
          const aMin = Math.min(...(a.documentIds || []).map(toTime), Number.MAX_SAFE_INTEGER);
          const bMin = Math.min(...(b.documentIds || []).map(toTime), Number.MAX_SAFE_INTEGER);
          if (aMin !== bMin) return aMin - bMin;
          return String(a.name).localeCompare(String(b.name));
        });

        groupRelations = groupOrder.slice(0, -1).map((group, index) => ({
          sourceGroupName: group.name,
          targetGroupName: groupOrder[index + 1].name,
          label: "workflow flow",
          edgeType: "flow" as const,
        }));
      }
      
      return {
        relations: validRelations,
        hierarchyLevels,
      groups,
      groupRelations,
      summary: String(parsed.summary || "Workflow analysis complete")
    };
    } catch (e) {
      console.error("Failed to parse workflow analysis:", result);
      return buildFallbackWorkflowAnalysis(documents);
    }
  } catch (error) {
    console.error("Workflow analysis request failed:", error);
    return buildFallbackWorkflowAnalysis(documents);
  }
}

function buildFallbackWorkflowAnalysis(documents: Document[]): WorkflowAnalysisResult {
  const orderedDocs = [...documents].sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : Number.MAX_SAFE_INTEGER;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : Number.MAX_SAFE_INTEGER;
    if (aTime !== bTime) return aTime - bTime;
    return a.title.localeCompare(b.title);
  });

  const majorCount = Math.min(4, Math.max(2, Math.ceil(orderedDocs.length / 4)));
  const docsPerMajor = Math.ceil(orderedDocs.length / majorCount);
  const stageNames = ["기획", "준비", "실행", "정리"];
  const groups: GroupDefinition[] = [];
  const hierarchyLevels: Record<number, number> = {};
  const relations: DocumentRelation[] = [];
  const groupRelations: GroupRelation[] = [];

  orderedDocs.forEach((doc, index) => {
    hierarchyLevels[doc.id] = index;
  });

  for (let i = 0; i < majorCount; i++) {
    const majorDocs = orderedDocs.slice(i * docsPerMajor, (i + 1) * docsPerMajor);
    if (majorDocs.length === 0) continue;

    const majorName = stageNames[i] || `단계 ${i + 1}`;
    const group: GroupDefinition = {
      name: majorName,
      description: `${majorName} 단계`,
      color: GROUP_COLORS[i % GROUP_COLORS.length],
      level: "major",
      documentIds: [],
      childGroups: [],
    };

    if (majorDocs.length >= 5) {
      const mediumCount = Math.min(3, Math.max(2, Math.ceil(majorDocs.length / 3)));
      const docsPerMedium = Math.ceil(majorDocs.length / mediumCount);
      for (let j = 0; j < mediumCount; j++) {
        const mediumDocs = majorDocs.slice(j * docsPerMedium, (j + 1) * docsPerMedium);
        if (mediumDocs.length === 0) continue;
        group.childGroups?.push({
          name: `${majorName} ${j + 1}`,
          description: `${majorName} 세부 단계`,
          color: GROUP_COLORS[(i + j + 1) % GROUP_COLORS.length],
          level: "medium",
          documentIds: mediumDocs.map((doc) => doc.id),
        });
      }
    } else {
      group.documentIds = majorDocs.map((doc) => doc.id);
    }

    groups.push(group);
  }

  for (let i = 0; i < orderedDocs.length - 1; i++) {
    relations.push({
      sourceDocId: orderedDocs[i].id,
      targetDocId: orderedDocs[i + 1].id,
      label: "workflow flow",
      edgeType: "flow",
    });
  }

  for (let i = 0; i < groups.length - 1; i++) {
    groupRelations.push({
      sourceGroupName: groups[i].name,
      targetGroupName: groups[i + 1].name,
      label: "workflow flow",
      edgeType: "flow",
    });
  }

  return {
    relations,
    hierarchyLevels,
    groups,
    groupRelations,
    summary: "Fallback workflow analysis generated from document order",
  };
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
