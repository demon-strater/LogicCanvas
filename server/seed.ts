import { db } from "./db";
import { documentGroups, documents, nodes, edges, tasks } from "@shared/schema";
import { eq } from "drizzle-orm";

export async function seedDatabase() {
  // Check if we already have data
  const existingDocs = await db.select().from(documents);
  if (existingDocs.length > 0) {
    await seedGrowthStrategyData();
    console.log("Database already seeded, skipping...");
    return;
  }

  console.log("Seeding database with example data...");

  // Create a sample document about design thinking
  const [doc1] = await db.insert(documents).values({
    title: "Introduction to Design Thinking",
    content: "Design thinking is a human-centered approach to innovation...",
  }).returning();

  // Create nodes for the design thinking document
  const doc1Nodes = await db.insert(nodes).values([
    {
      documentId: doc1.id,
      label: "Design Thinking",
      content: "A human-centered approach to innovation that integrates the needs of people, technology, and business requirements.",
      nodeType: "concept",
      x: 400,
      y: 200,
    },
    {
      documentId: doc1.id,
      label: "Empathy Phase",
      content: "Understanding the problem from the user's perspective through observation, engagement, and immersion.",
      nodeType: "concept",
      x: 200,
      y: 350,
    },
    {
      documentId: doc1.id,
      label: "Define Phase",
      content: "Synthesizing findings from empathy work to form a point of view that is meaningful and actionable.",
      nodeType: "concept",
      x: 350,
      y: 400,
    },
    {
      documentId: doc1.id,
      label: "Ideate Phase",
      content: "Generating a broad range of creative solutions through brainstorming and other ideation techniques.",
      nodeType: "concept",
      x: 500,
      y: 350,
    },
    {
      documentId: doc1.id,
      label: "User interviews reveal deeper needs",
      content: "Conducting structured interviews with target users uncovers hidden needs and pain points not visible through surveys.",
      nodeType: "claim",
      x: 150,
      y: 500,
    },
    {
      documentId: doc1.id,
      label: "IDEO Study 2019",
      content: "Research by IDEO showed that companies using design thinking had 32% higher innovation success rates.",
      nodeType: "evidence",
      x: 300,
      y: 550,
    },
    {
      documentId: doc1.id,
      label: "How to measure empathy impact?",
      content: "What metrics best capture the effectiveness of empathy-building exercises in the design process?",
      nodeType: "question",
      x: 100,
      y: 300,
      isTagged: true,
      tagNote: "Need to research measurement frameworks",
    },
    {
      documentId: doc1.id,
      label: "Prototype Phase",
      content: "Building quick, low-fidelity representations of ideas to learn and gather feedback.",
      nodeType: "concept",
      x: 600,
      y: 400,
    },
    {
      documentId: doc1.id,
      label: "Test Phase",
      content: "Getting feedback on prototypes from real users to refine solutions.",
      nodeType: "concept",
      x: 700,
      y: 300,
    },
  ]).returning();

  // Create edges between nodes
  await db.insert(edges).values([
    { documentId: doc1.id, sourceId: doc1Nodes[0].id, targetId: doc1Nodes[1].id, edgeType: "related", label: "starts with" },
    { documentId: doc1.id, sourceId: doc1Nodes[1].id, targetId: doc1Nodes[2].id, edgeType: "implies" },
    { documentId: doc1.id, sourceId: doc1Nodes[2].id, targetId: doc1Nodes[3].id, edgeType: "implies" },
    { documentId: doc1.id, sourceId: doc1Nodes[3].id, targetId: doc1Nodes[7].id, edgeType: "implies" },
    { documentId: doc1.id, sourceId: doc1Nodes[7].id, targetId: doc1Nodes[8].id, edgeType: "implies" },
    { documentId: doc1.id, sourceId: doc1Nodes[4].id, targetId: doc1Nodes[1].id, edgeType: "supports" },
    { documentId: doc1.id, sourceId: doc1Nodes[5].id, targetId: doc1Nodes[4].id, edgeType: "supports" },
    { documentId: doc1.id, sourceId: doc1Nodes[6].id, targetId: doc1Nodes[1].id, edgeType: "related" },
    { documentId: doc1.id, sourceId: doc1Nodes[8].id, targetId: doc1Nodes[1].id, edgeType: "related", label: "feeds back to" },
  ]);

  // Create sample tasks
  await db.insert(tasks).values([
    {
      documentId: doc1.id,
      nodeId: doc1Nodes[6].id,
      title: "Research empathy measurement frameworks",
      description: "Find academic papers on measuring empathy effectiveness in design processes.",
      status: "pending",
      priority: "high",
    },
    {
      documentId: doc1.id,
      title: "Create user interview template",
      description: "Draft a structured interview guide for the empathy phase.",
      status: "in_progress",
      priority: "medium",
    },
    {
      documentId: doc1.id,
      title: "Review IDEO case studies",
      status: "completed",
      priority: "low",
    },
  ]);

  await seedGrowthStrategyData();

  console.log("Database seeded successfully!");
}

async function seedGrowthStrategyData() {
  const MONTH_WIDTH = 800;
  const OFFSET_X = 150;
  const TIMELINE_START_YEAR = 2026;
  const TIMELINE_START_MONTH = 1;

  const monthCenterX = (year: number, month: number) => {
    const monthIndex = (year - TIMELINE_START_YEAR) * 12 + month - TIMELINE_START_MONTH;
    return OFFSET_X + monthIndex * MONTH_WIDTH + MONTH_WIDTH / 2;
  };

  const periodCenterX = (startMonth: number, endMonth: number) =>
    Math.round((monthCenterX(2026, startMonth) + monthCenterX(2026, endMonth)) / 2);

  const makeDate = (month: number) => new Date(Date.UTC(2026, month - 1, 15, 9, 0, 0));

  const ensureGroup = async (input: {
    name: string;
    description: string;
    parentId: number | null;
    monthStart: number;
    monthEnd: number;
    color: string;
    x: number;
    y: number;
    manualWidth?: number;
    manualHeight?: number;
  }) => {
    const existingGroups = await db.select().from(documentGroups);
    const existing = existingGroups.find(
      (group) => group.name === input.name && (group.parentId ?? null) === input.parentId,
    );

    const values = {
      name: input.name,
      description: input.description,
      parentId: input.parentId,
      monthStart: input.monthStart,
      monthEnd: input.monthEnd,
      color: input.color,
      x: input.x,
      y: input.y,
      manualWidth: input.manualWidth ?? null,
      manualHeight: input.manualHeight ?? null,
    };

    if (existing) {
      const [updated] = await db
        .update(documentGroups)
        .set(values)
        .where(eq(documentGroups.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await db.insert(documentGroups).values(values).returning();
    return created;
  };

  const ensureDocument = async (input: {
    title: string;
    content: string;
    summary: string;
    groupId: number;
    month: number;
    x: number;
    y: number;
  }) => {
    const existingDocs = await db.select().from(documents);
    const existing = existingDocs.find((doc) => doc.title === input.title);
    const values = {
      title: input.title,
      content: input.content,
      summary: input.summary,
      groupId: input.groupId,
      x: input.x,
      y: input.y,
      createdAt: makeDate(input.month),
      updatedAt: makeDate(input.month),
    };

    if (existing) {
      await db.update(documents).set(values).where(eq(documents.id, existing.id));
      return;
    }

    await db.insert(documents).values(values);
  };

  const marketingEngine = await ensureGroup({
    name: "마케팅 엔진 구축",
    description: "마케팅 실행 체계를 구축하고 성과를 확장하는 대그룹",
    parentId: null,
    monthStart: 5,
    monthEnd: 7,
    color: "#0891b2",
    x: periodCenterX(5, 7),
    y: 1350,
    manualWidth: 2300,
    manualHeight: 900,
  });

  const performanceOptimization = await ensureGroup({
    name: "퍼포먼스 마케팅 최적화",
    description: "5월부터 6월까지 퍼포먼스 마케팅을 개선하고 성과를 검증",
    parentId: marketingEngine.id,
    monthStart: 5,
    monthEnd: 6,
    color: "#16a34a",
    x: periodCenterX(5, 6),
    y: 1260,
    manualWidth: 1500,
    manualHeight: 320,
  });

  const salesPipeline = await ensureGroup({
    name: "영업 파이프라인 관리",
    description: "5월 영업 파이프라인 운영 현황과 관리 체계 정리",
    parentId: marketingEngine.id,
    monthStart: 5,
    monthEnd: 5,
    color: "#f59e0b",
    x: monthCenterX(2026, 5),
    y: 1640,
    manualWidth: 760,
    manualHeight: 300,
  });

  const brandAwareness = await ensureGroup({
    name: "브랜드 인지도 확산",
    description: "6월부터 7월까지 브랜드 인지도 확산 활동과 결과 정리",
    parentId: marketingEngine.id,
    monthStart: 6,
    monthEnd: 7,
    color: "#db2777",
    x: periodCenterX(6, 7),
    y: 2020,
    manualWidth: 1500,
    manualHeight: 320,
  });

  await ensureDocument({
    title: "퍼포먼스 마케팅 최적화 보고서1",
    content: "5월 퍼포먼스 마케팅 최적화 실행 내용과 초기 성과를 정리한 보고서입니다.",
    summary: "5월 퍼포먼스 마케팅 최적화 보고서",
    groupId: performanceOptimization.id,
    month: 5,
    x: monthCenterX(2026, 5),
    y: 1260,
  });

  await ensureDocument({
    title: "퍼포먼스 마케팅 최적화 보고서2",
    content: "6월 퍼포먼스 마케팅 최적화 후속 실험과 개선 결과를 정리한 보고서입니다.",
    summary: "6월 퍼포먼스 마케팅 최적화 보고서",
    groupId: performanceOptimization.id,
    month: 6,
    x: monthCenterX(2026, 6),
    y: 1260,
  });

  await ensureDocument({
    title: "영업 파이프라인 관리1 보고서",
    content: "5월 영업 파이프라인 관리 현황과 후속 액션을 정리한 보고서입니다.",
    summary: "5월 영업 파이프라인 관리 보고서",
    groupId: salesPipeline.id,
    month: 5,
    x: monthCenterX(2026, 5),
    y: 1640,
  });

  await ensureDocument({
    title: "브랜드 인지도 확산 보고서1",
    content: "6월 브랜드 인지도 확산 활동과 채널별 성과를 정리한 보고서입니다.",
    summary: "6월 브랜드 인지도 확산 보고서",
    groupId: brandAwareness.id,
    month: 6,
    x: monthCenterX(2026, 6),
    y: 2020,
  });

  await ensureDocument({
    title: "브랜드 인지도 확산 보고서 2",
    content: "7월 브랜드 인지도 확산 후속 캠페인과 누적 성과를 정리한 보고서입니다.",
    summary: "7월 브랜드 인지도 확산 보고서",
    groupId: brandAwareness.id,
    month: 7,
    x: monthCenterX(2026, 7),
    y: 2020,
  });

  console.log("Growth strategy timeline data seeded.");
}
