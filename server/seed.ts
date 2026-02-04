import { db } from "./db";
import { documents, nodes, edges, tasks } from "@shared/schema";
import { sql } from "drizzle-orm";

export async function seedDatabase() {
  // Check if we already have data
  const existingDocs = await db.select().from(documents);
  if (existingDocs.length > 0) {
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

  console.log("Database seeded successfully!");
}
