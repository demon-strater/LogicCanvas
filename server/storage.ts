import { db } from "./db";
import { documents, nodes, edges, tasks, users, documentEdges } from "@shared/schema";
import { eq, desc, or } from "drizzle-orm";
import type { Document, InsertDocument, Node, InsertNode, Edge, InsertEdge, Task, InsertTask, User, InsertUser, DocumentEdge, InsertDocumentEdge } from "@shared/schema";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  getAllDocuments(): Promise<Document[]>;
  getDocument(id: number): Promise<Document | undefined>;
  createDocument(doc: InsertDocument): Promise<Document>;
  updateDocument(id: number, updates: Partial<Document>): Promise<Document | undefined>;
  deleteDocument(id: number): Promise<void>;

  getNodesByDocument(documentId: number): Promise<Node[]>;
  getNode(id: number): Promise<Node | undefined>;
  createNode(node: InsertNode): Promise<Node>;
  createNodes(nodesData: InsertNode[]): Promise<Node[]>;
  updateNode(id: number, updates: Partial<Node>): Promise<Node | undefined>;
  deleteNode(id: number): Promise<void>;

  getEdgesByDocument(documentId: number): Promise<Edge[]>;
  getEdge(id: number): Promise<Edge | undefined>;
  createEdge(edge: InsertEdge): Promise<Edge>;
  createEdges(edgesData: InsertEdge[]): Promise<Edge[]>;
  updateEdge(id: number, updates: Partial<Edge>): Promise<Edge | undefined>;
  deleteEdge(id: number): Promise<void>;

  getTasksByDocument(documentId: number): Promise<Task[]>;
  getTask(id: number): Promise<Task | undefined>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: number, updates: Partial<Task>): Promise<Task | undefined>;
  deleteTask(id: number): Promise<void>;

  getAllDocumentEdges(): Promise<DocumentEdge[]>;
  createDocumentEdge(edge: InsertDocumentEdge): Promise<DocumentEdge>;
  createDocumentEdges(edgesData: InsertDocumentEdge[]): Promise<DocumentEdge[]>;
  deleteDocumentEdgesByDoc(docId: number): Promise<void>;
  clearAllDocumentEdges(): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getAllDocuments(): Promise<Document[]> {
    return db.select().from(documents).orderBy(desc(documents.createdAt));
  }

  async getDocument(id: number): Promise<Document | undefined> {
    const [doc] = await db.select().from(documents).where(eq(documents.id, id));
    return doc;
  }

  async createDocument(doc: InsertDocument): Promise<Document> {
    const [document] = await db.insert(documents).values(doc).returning();
    return document;
  }

  async updateDocument(id: number, updates: Partial<Document>): Promise<Document | undefined> {
    const [updated] = await db.update(documents).set(updates).where(eq(documents.id, id)).returning();
    return updated;
  }

  async deleteDocument(id: number): Promise<void> {
    await db.delete(documents).where(eq(documents.id, id));
  }

  async getNodesByDocument(documentId: number): Promise<Node[]> {
    return db.select().from(nodes).where(eq(nodes.documentId, documentId));
  }

  async getNode(id: number): Promise<Node | undefined> {
    const [node] = await db.select().from(nodes).where(eq(nodes.id, id));
    return node;
  }

  async createNode(node: InsertNode): Promise<Node> {
    const [created] = await db.insert(nodes).values(node).returning();
    return created;
  }

  async createNodes(nodesData: InsertNode[]): Promise<Node[]> {
    if (nodesData.length === 0) return [];
    return db.insert(nodes).values(nodesData).returning();
  }

  async updateNode(id: number, updates: Partial<Node>): Promise<Node | undefined> {
    const [updated] = await db.update(nodes).set(updates).where(eq(nodes.id, id)).returning();
    return updated;
  }

  async deleteNode(id: number): Promise<void> {
    await db.delete(nodes).where(eq(nodes.id, id));
  }

  async getEdgesByDocument(documentId: number): Promise<Edge[]> {
    return db.select().from(edges).where(eq(edges.documentId, documentId));
  }

  async getEdge(id: number): Promise<Edge | undefined> {
    const [edge] = await db.select().from(edges).where(eq(edges.id, id));
    return edge;
  }

  async createEdge(edge: InsertEdge): Promise<Edge> {
    const [created] = await db.insert(edges).values(edge).returning();
    return created;
  }

  async createEdges(edgesData: InsertEdge[]): Promise<Edge[]> {
    if (edgesData.length === 0) return [];
    return db.insert(edges).values(edgesData).returning();
  }

  async updateEdge(id: number, updates: Partial<Edge>): Promise<Edge | undefined> {
    const [updated] = await db.update(edges).set(updates).where(eq(edges.id, id)).returning();
    return updated;
  }

  async deleteEdge(id: number): Promise<void> {
    await db.delete(edges).where(eq(edges.id, id));
  }

  async getTasksByDocument(documentId: number): Promise<Task[]> {
    return db.select().from(tasks).where(eq(tasks.documentId, documentId)).orderBy(desc(tasks.createdAt));
  }

  async getTask(id: number): Promise<Task | undefined> {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    return task;
  }

  async createTask(task: InsertTask): Promise<Task> {
    const [created] = await db.insert(tasks).values(task).returning();
    return created;
  }

  async updateTask(id: number, updates: Partial<Task>): Promise<Task | undefined> {
    const [updated] = await db.update(tasks).set(updates).where(eq(tasks.id, id)).returning();
    return updated;
  }

  async deleteTask(id: number): Promise<void> {
    await db.delete(tasks).where(eq(tasks.id, id));
  }

  async getAllDocumentEdges(): Promise<DocumentEdge[]> {
    return db.select().from(documentEdges);
  }

  async createDocumentEdge(edge: InsertDocumentEdge): Promise<DocumentEdge> {
    const [created] = await db.insert(documentEdges).values(edge).returning();
    return created;
  }

  async createDocumentEdges(edgesData: InsertDocumentEdge[]): Promise<DocumentEdge[]> {
    if (edgesData.length === 0) return [];
    return db.insert(documentEdges).values(edgesData).returning();
  }

  async deleteDocumentEdgesByDoc(docId: number): Promise<void> {
    await db.delete(documentEdges).where(
      or(eq(documentEdges.sourceDocId, docId), eq(documentEdges.targetDocId, docId))
    );
  }

  async clearAllDocumentEdges(): Promise<void> {
    await db.delete(documentEdges);
  }
}

export const storage = new DatabaseStorage();
