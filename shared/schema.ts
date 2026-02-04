import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table (kept for future auth)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Documents - source content that gets parsed into nodes
export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;

// Nodes - logical concepts extracted from documents
export const nodes = pgTable("nodes", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  content: text("content").notNull(),
  nodeType: text("node_type").notNull().default("concept"), // concept, claim, evidence, question
  x: integer("x").notNull().default(0),
  y: integer("y").notNull().default(0),
  isTagged: boolean("is_tagged").notNull().default(false),
  tagNote: text("tag_note"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertNodeSchema = createInsertSchema(nodes).omit({
  id: true,
  createdAt: true,
});

export type InsertNode = z.infer<typeof insertNodeSchema>;
export type Node = typeof nodes.$inferSelect;

// Edges - relationships between nodes
export const edges = pgTable("edges", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  sourceId: integer("source_id").notNull().references(() => nodes.id, { onDelete: "cascade" }),
  targetId: integer("target_id").notNull().references(() => nodes.id, { onDelete: "cascade" }),
  label: text("label"),
  edgeType: text("edge_type").notNull().default("related"), // related, supports, contradicts, implies
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertEdgeSchema = createInsertSchema(edges).omit({
  id: true,
  createdAt: true,
});

export type InsertEdge = z.infer<typeof insertEdgeSchema>;
export type Edge = typeof edges.$inferSelect;

// Tasks - generated from tagged nodes for action items
export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  nodeId: integer("node_id").references(() => nodes.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("pending"), // pending, in_progress, completed
  priority: text("priority").notNull().default("medium"), // low, medium, high
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  completedAt: timestamp("completed_at"),
});

export const insertTaskSchema = createInsertSchema(tasks).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});

export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasks.$inferSelect;

// Graph data structure for frontend
export type GraphData = {
  nodes: Node[];
  edges: Edge[];
};

// AI parsing result structure
export type ParsedConcept = {
  label: string;
  content: string;
  nodeType: "concept" | "claim" | "evidence" | "question";
};

export type ParsedRelation = {
  sourceIndex: number;
  targetIndex: number;
  label?: string;
  edgeType: "related" | "supports" | "contradicts" | "implies";
};

export type ParseResult = {
  concepts: ParsedConcept[];
  relations: ParsedRelation[];
};
