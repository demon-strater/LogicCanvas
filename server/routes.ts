import type { Express } from "express";
import type { Server } from "http";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import multer from "multer";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { storage, storageMode } from "./storage";
import { parseDocumentWithAI, analyzeDocumentWorkflow, assignDocumentToGroup, getAIConfigStatus } from "./ai";
import { listNotionPages, fetchNotionPageContent, isNotionConfigured, isNotionOAuthConfigured } from "./notion";
import { syncNotionPages, getSyncStatus, setSyncEnabled, importSingleNotionPage } from "./notionSync";
import { insertDocumentSchema, insertNodeSchema, insertEdgeSchema, insertTaskSchema, insertDocumentGroupSchema } from "@shared/schema";
import { z } from "zod";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// Update schemas using insert schemas as base, omitting immutable fields
const nodeUpdateSchema = insertNodeSchema.pick({
  label: true,
  content: true,
  nodeType: true,
  x: true,
  y: true,
  isTagged: true,
  tagNote: true,
}).partial();

const taskUpdateSchema = insertTaskSchema.pick({
  title: true,
  description: true,
  status: true,
  priority: true,
}).partial();

const edgeUpdateSchema = insertEdgeSchema.pick({
  label: true,
  edgeType: true,
}).partial();

// Parse document input schema
const parseDocumentInputSchema = insertDocumentSchema.extend({
  title: z.string().min(1, "Title is required"),
  content: z.string().min(1, "Content is required"),
  createdAt: z.string().optional(),
});

const documentUpdateSchema = insertDocumentSchema.pick({
  title: true,
  content: true,
  summary: true,
  groupId: true,
  x: true,
  y: true,
}).extend({
  createdAt: z.string().optional(),
}).partial();

const rawGroupUpdateSchema = insertDocumentGroupSchema.pick({
  name: true,
  description: true,
  parentId: true,
  x: true,
  y: true,
  manualWidth: true,
  manualHeight: true,
  color: true,
}).partial();

const groupUpdateSchema = z.preprocess((data: any) => {
  if (data && typeof data === 'object') {
    const result = { ...data };
    if (typeof result.x === 'number') result.x = Math.round(result.x);
    if (typeof result.y === 'number') result.y = Math.round(result.y);
    if (typeof result.manualWidth === 'number') result.manualWidth = Math.round(result.manualWidth);
    if (typeof result.manualHeight === 'number') result.manualHeight = Math.round(result.manualHeight);
    return result;
  }
  return data;
}, rawGroupUpdateSchema);

function parseIdParam(idStr: string): number | null {
  const id = parseInt(idStr, 10);
  return isNaN(id) ? null : id;
}

function getNotionSessionToken(req: any): string | undefined {
  return req.session?.notionAccessToken;
}

function getNotionOAuthConfig() {
  return {
    clientId: process.env.NOTION_OAUTH_CLIENT_ID,
    clientSecret: process.env.NOTION_OAUTH_CLIENT_SECRET,
    redirectUri: process.env.NOTION_OAUTH_REDIRECT_URI,
  };
}

function getPublicBaseUrl(req: any): string {
  return process.env.PUBLIC_URL || `${req.protocol}://${req.get("host")}`;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get("/api/health", async (_req, res) => {
    const status = {
      ok: true,
      database: storageMode === "postgres",
      storage: storageMode,
      ai: getAIConfigStatus(),
      notionConfigured: isNotionConfigured(),
      notionOAuthConfigured: isNotionOAuthConfigured(),
      timestamp: new Date().toISOString(),
    };

    try {
      await storage.getAllDocuments();
      status.database = storageMode === "postgres";
    } catch (error) {
      status.ok = false;
      console.error("Health check database error:", error);
    }

    res.status(status.ok ? 200 : 503).json(status);
  });

  app.get("/api/download/planning-doc", (req, res) => {
    const filePath = path.resolve("LogicCanvas_기획서.docx");
    res.download(filePath, "LogicCanvas_기획서.docx", (err) => {
      if (err) {
        console.error("Download error:", err);
        res.status(500).json({ error: "파일 다운로드에 실패했습니다" });
      }
    });
  });

  app.post("/api/upload-file", upload.single("file"), async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "파일이 없습니다" });
      }
      if (file.buffer.length === 0) {
        return res.status(400).json({ error: "빈 파일입니다. 내용이 있는 파일을 업로드해 주세요." });
      }

      console.log(`[upload] Processing file: ${file.originalname} (${file.buffer.length} bytes, type: ${file.mimetype})`);

      const ext = path.extname(file.originalname).toLowerCase();
      let text = "";

      if (ext === ".txt" || ext === ".md" || ext === ".text") {
        text = file.buffer.toString("utf-8");
      } else if (ext === ".pdf") {
        try {
          const pdfHeader = file.buffer.slice(0, 5).toString("ascii");
          if (pdfHeader !== "%PDF-") {
            return res.status(400).json({ error: "올바른 PDF 파일이 아닙니다. 파일이 손상되었거나 다른 형식일 수 있습니다." });
          }

          const parser = new PDFParse({ data: file.buffer });
          const result = await parser.getText();

          text = result.pages
            .map((p: { text: string }) => p.text)
            .join("\n\n")
            .trim();

          if (!text) {
            text = result.text || "";
          }

          text = text.replace(/\n-- \d+ of \d+ --\n?/g, "\n").trim();

          try { await parser.destroy(); } catch {}

          if (!text) {
            return res.status(400).json({
              error: "PDF에서 텍스트를 추출할 수 없습니다. 스캔된 이미지 PDF일 수 있습니다. 텍스트가 포함된 PDF를 사용하거나, 내용을 직접 붙여넣기 해주세요."
            });
          }
        } catch (pdfError: any) {
          const errMsg = pdfError?.message || String(pdfError);
          console.error(`[upload] PDF parsing failed for ${file.originalname}:`, errMsg);

          if (errMsg.includes("password") || errMsg.includes("encrypted") || errMsg.includes("Password")) {
            return res.status(400).json({ error: "암호가 설정된 PDF입니다. 암호를 해제한 후 다시 업로드해 주세요." });
          }
          if (errMsg.includes("Invalid") || errMsg.includes("corrupt") || errMsg.includes("XRef") || errMsg.includes("startxref")) {
            return res.status(400).json({ error: "손상된 PDF 파일입니다. 다른 PDF 뷰어에서 파일을 열 수 있는지 확인해 주세요." });
          }
          return res.status(400).json({ error: `PDF 처리 중 오류가 발생했습니다: ${errMsg.substring(0, 100)}` });
        }
      } else if (ext === ".docx") {
        const result = await mammoth.extractRawText({ buffer: file.buffer });
        text = result.value;
      } else if (ext === ".xlsx" || ext === ".xls") {
        const workbook = XLSX.read(file.buffer, { type: "buffer" });
        const sheets: string[] = [];
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          sheets.push(`[${sheetName}]\n${XLSX.utils.sheet_to_csv(sheet)}`);
        }
        text = sheets.join("\n\n");
      } else if (ext === ".csv") {
        text = file.buffer.toString("utf-8");
      } else if (ext === ".pptx") {
        const JSZip = (await import("jszip")).default;
        const zip = await JSZip.loadAsync(file.buffer);
        const slideTexts: string[] = [];
        const slideFiles = Object.keys(zip.files)
          .filter(name => name.match(/^ppt\/slides\/slide\d+\.xml$/))
          .sort((a, b) => {
            const numA = parseInt(a.match(/slide(\d+)/)?.[1] || "0");
            const numB = parseInt(b.match(/slide(\d+)/)?.[1] || "0");
            return numA - numB;
          });
        for (const slideFile of slideFiles) {
          const xml = await zip.files[slideFile].async("string");
          const textContent = xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
          if (textContent) slideTexts.push(textContent);
        }
        text = slideTexts.join("\n\n");
      } else if (ext === ".hwp" || ext === ".hwpx") {
        return res.status(400).json({ error: "한글(HWP) 파일은 현재 지원되지 않습니다. PDF 또는 DOCX로 변환하여 다시 업로드해 주세요." });
      } else if (ext === ".json") {
        try {
          const jsonContent = JSON.parse(file.buffer.toString("utf-8"));
          text = JSON.stringify(jsonContent, null, 2);
        } catch {
          return res.status(400).json({ error: "올바른 JSON 형식이 아닙니다" });
        }
      } else if (ext === ".html" || ext === ".htm") {
        const html = file.buffer.toString("utf-8");
        text = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      } else {
        return res.status(400).json({ error: `지원되지 않는 파일 형식입니다: ${ext}` });
      }

      if (!text.trim()) {
        return res.status(400).json({ error: "파일에서 텍스트를 추출할 수 없습니다" });
      }

      console.log(`[upload] Successfully extracted ${text.length} chars from ${file.originalname}`);
      const suggestedTitle = file.originalname.replace(/\.[^/.]+$/, "");
      res.json({ text: text.trim(), suggestedTitle });
    } catch (error: any) {
      const errMsg = error?.message || String(error);
      console.error(`[upload] File upload error:`, errMsg, error?.stack?.substring(0, 500));
      res.status(500).json({ error: `파일 처리 중 오류가 발생했습니다: ${errMsg.substring(0, 150)}` });
    }
  });

  // Documents
  app.delete("/api/documents/deduplicate", async (req, res) => {
    try {
      const result = await storage.deduplicateDocuments();
      res.json(result);
    } catch (error) {
      console.error("Error deduplicating documents:", error);
      res.status(500).json({ error: "Failed to deduplicate documents" });
    }
  });

  app.get("/api/documents", async (req, res) => {
    try {
      const documents = await storage.getAllDocuments();
      res.json(documents);
    } catch (error) {
      console.error("Error fetching documents:", error);
      res.status(500).json({ error: "Failed to fetch documents" });
    }
  });

  app.get("/api/documents/:id", async (req, res) => {
    try {
      const id = parseIdParam(req.params.id);
      if (id === null) return res.status(400).json({ error: "유효하지 않은 문서 ID입니다" });
      const document = await storage.getDocument(id);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      res.json(document);
    } catch (error) {
      console.error("Error fetching document:", error);
      res.status(500).json({ error: "Failed to fetch document" });
    }
  });

  app.post("/api/documents/parse", async (req, res) => {
    try {
      const parseInput = parseDocumentInputSchema.safeParse(req.body);
      
      if (!parseInput.success) {
        return res.status(400).json({ error: parseInput.error.errors[0].message });
      }

      const { title, content, createdAt } = parseInput.data;

      // Parse document with AI
      const parseResult = await parseDocumentWithAI(content);

      const feedbackSummary = parseResult.feedback && parseResult.feedback.length > 0
        ? parseResult.feedback.map(f => {
            const levelLabel = f.level === 0 ? "[구조 반영]" : f.level === 1 ? "[명확화 필요]" : "[논리 보완]";
            return `${levelLabel} ${f.message}`;
          }).join("\n")
        : undefined;

      const document = await storage.createDocument({ 
        title, 
        content,
        ...(createdAt ? { createdAt: new Date(createdAt) } : {}),
        ...(feedbackSummary ? { summary: feedbackSummary } : {}),
      });

      const createdNodes = await storage.createNodes(
        parseResult.concepts.map((concept) => ({
          documentId: document.id,
          label: concept.label,
          content: concept.content,
          nodeType: concept.nodeType,
          x: 0,
          y: 0,
          isTagged: false,
        }))
      );

      // Create edges from parsed relations
      await storage.createEdges(
        parseResult.relations.map((relation) => ({
          documentId: document.id,
          sourceId: createdNodes[relation.sourceIndex].id,
          targetId: createdNodes[relation.targetIndex].id,
          label: relation.label,
          edgeType: relation.edgeType,
        }))
      );

      // Auto-assign document to a group
      try {
        const existingGroups = await storage.getAllGroups();
        const groupAssignment = await assignDocumentToGroup(title, content, existingGroups);

        let groupId: number | null = null;
        if (groupAssignment.action === "existing" && groupAssignment.existingGroupId) {
          groupId = groupAssignment.existingGroupId;
        } else if (groupAssignment.action === "new" && groupAssignment.newGroup) {
          const newGroup = await storage.createGroup({
            name: groupAssignment.newGroup.name,
            description: groupAssignment.newGroup.description,
            color: groupAssignment.newGroup.color,
            x: 100,
            y: 100,
          });
          groupId = newGroup.id;
        }

        if (groupId) {
          const updatedDoc = await storage.updateDocument(document.id, { groupId });
          if (updatedDoc) {
            return res.json(updatedDoc);
          }
        }
      } catch (groupError) {
        console.error("Auto group assignment failed (non-critical):", groupError);
      }

      res.json(document);
    } catch (error: any) {
      console.error("Error parsing document:", error);
      if (error?.code === "AI_NOT_CONFIGURED") {
        return res.status(503).json({ error: "AI 기능이 아직 설정되지 않았습니다. 배포 환경 변수에 OPENAI_API_KEY 또는 AI_INTEGRATIONS_OPENAI_API_KEY를 등록해야 합니다." });
      }
      res.status(500).json({ error: "Failed to parse document" });
    }
  });

  app.patch("/api/documents/:id", async (req, res) => {
    try {
      const id = parseIdParam(req.params.id);
      if (id === null) return res.status(400).json({ error: "유효하지 않은 문서 ID입니다" });
      const updateInput = documentUpdateSchema.safeParse(req.body);
      
      if (!updateInput.success) {
        return res.status(400).json({ error: updateInput.error.errors[0].message });
      }

      const updates: any = { ...updateInput.data };
      if (updates.createdAt) {
        updates.createdAt = new Date(updates.createdAt);
      }
      const document = await storage.updateDocument(id, updates);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      res.json(document);
    } catch (error) {
      console.error("Error updating document:", error);
      res.status(500).json({ error: "Failed to update document" });
    }
  });

  app.delete("/api/documents/:id", async (req, res) => {
    try {
      const id = parseIdParam(req.params.id);
      if (id === null) return res.status(400).json({ error: "유효하지 않은 문서 ID입니다" });
      await storage.deleteDocument(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting document:", error);
      res.status(500).json({ error: "Failed to delete document" });
    }
  });

  // Graph data (nodes and edges for a document)
  app.get("/api/documents/:id/graph", async (req, res) => {
    try {
      const documentId = parseIdParam(req.params.id);
      if (documentId === null) return res.status(400).json({ error: "유효하지 않은 문서 ID입니다" });
      const [nodes, edges] = await Promise.all([
        storage.getNodesByDocument(documentId),
        storage.getEdgesByDocument(documentId),
      ]);
      res.json({ nodes, edges });
    } catch (error) {
      console.error("Error fetching graph:", error);
      res.status(500).json({ error: "Failed to fetch graph" });
    }
  });

  // Nodes
  app.post("/api/documents/:id/nodes", async (req, res) => {
    try {
      const documentId = parseIdParam(req.params.id);
      if (documentId === null) return res.status(400).json({ error: "유효하지 않은 문서 ID입니다" });
      const nodeInput = insertNodeSchema.omit({ documentId: true }).safeParse(req.body);
      
      if (!nodeInput.success) {
        return res.status(400).json({ error: nodeInput.error.errors[0].message });
      }

      const node = await storage.createNode({
        ...nodeInput.data,
        documentId,
      });
      res.json(node);
    } catch (error) {
      console.error("Error creating node:", error);
      res.status(500).json({ error: "Failed to create node" });
    }
  });

  app.patch("/api/nodes/:id", async (req, res) => {
    try {
      const id = parseIdParam(req.params.id);
      if (id === null) return res.status(400).json({ error: "유효하지 않은 노드 ID입니다" });
      const updateInput = nodeUpdateSchema.safeParse(req.body);
      
      if (!updateInput.success) {
        return res.status(400).json({ error: updateInput.error.errors[0].message });
      }

      const node = await storage.updateNode(id, updateInput.data);
      if (!node) {
        return res.status(404).json({ error: "Node not found" });
      }
      res.json(node);
    } catch (error) {
      console.error("Error updating node:", error);
      res.status(500).json({ error: "Failed to update node" });
    }
  });

  app.patch("/api/nodes/:id/toggle-tag", async (req, res) => {
    try {
      const id = parseIdParam(req.params.id);
      if (id === null) return res.status(400).json({ error: "유효하지 않은 노드 ID입니다" });
      const tagNoteInput = z.object({ tagNote: z.string().optional() }).safeParse(req.body);
      
      if (!tagNoteInput.success) {
        return res.status(400).json({ error: tagNoteInput.error.errors[0].message });
      }
      
      const node = await storage.getNode(id);
      if (!node) {
        return res.status(404).json({ error: "Node not found" });
      }

      const updated = await storage.updateNode(id, {
        isTagged: !node.isTagged,
        tagNote: !node.isTagged ? tagNoteInput.data.tagNote || null : null,
      });
      res.json(updated);
    } catch (error) {
      console.error("Error toggling node tag:", error);
      res.status(500).json({ error: "Failed to toggle node tag" });
    }
  });

  app.delete("/api/nodes/:id", async (req, res) => {
    try {
      const id = parseIdParam(req.params.id);
      if (id === null) return res.status(400).json({ error: "유효하지 않은 노드 ID입니다" });
      await storage.deleteNode(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting node:", error);
      res.status(500).json({ error: "Failed to delete node" });
    }
  });

  // Edges
  app.get("/api/documents/:id/edges", async (req, res) => {
    try {
      const documentId = parseIdParam(req.params.id);
      if (documentId === null) return res.status(400).json({ error: "유효하지 않은 문서 ID입니다" });
      const edges = await storage.getEdgesByDocument(documentId);
      res.json(edges);
    } catch (error) {
      console.error("Error fetching edges:", error);
      res.status(500).json({ error: "Failed to fetch edges" });
    }
  });

  app.post("/api/documents/:id/edges", async (req, res) => {
    try {
      const documentId = parseIdParam(req.params.id);
      if (documentId === null) return res.status(400).json({ error: "유효하지 않은 문서 ID입니다" });
      const edgeInput = insertEdgeSchema.omit({ documentId: true }).safeParse(req.body);
      
      if (!edgeInput.success) {
        return res.status(400).json({ error: edgeInput.error.errors[0].message });
      }

      const edge = await storage.createEdge({
        documentId,
        ...edgeInput.data,
      });
      res.json(edge);
    } catch (error) {
      console.error("Error creating edge:", error);
      res.status(500).json({ error: "Failed to create edge" });
    }
  });

  app.patch("/api/edges/:id", async (req, res) => {
    try {
      const id = parseIdParam(req.params.id);
      if (id === null) return res.status(400).json({ error: "유효하지 않은 엣지 ID입니다" });
      const updateInput = edgeUpdateSchema.safeParse(req.body);
      
      if (!updateInput.success) {
        return res.status(400).json({ error: updateInput.error.errors[0].message });
      }

      const edge = await storage.updateEdge(id, updateInput.data);
      if (!edge) {
        return res.status(404).json({ error: "Edge not found" });
      }
      res.json(edge);
    } catch (error) {
      console.error("Error updating edge:", error);
      res.status(500).json({ error: "Failed to update edge" });
    }
  });

  app.delete("/api/edges/:id", async (req, res) => {
    try {
      const id = parseIdParam(req.params.id);
      if (id === null) return res.status(400).json({ error: "유효하지 않은 엣지 ID입니다" });
      await storage.deleteEdge(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting edge:", error);
      res.status(500).json({ error: "Failed to delete edge" });
    }
  });

  // Tasks
  app.get("/api/documents/:id/tasks", async (req, res) => {
    try {
      const documentId = parseIdParam(req.params.id);
      if (documentId === null) return res.status(400).json({ error: "유효하지 않은 문서 ID입니다" });
      const tasks = await storage.getTasksByDocument(documentId);
      res.json(tasks);
    } catch (error) {
      console.error("Error fetching tasks:", error);
      res.status(500).json({ error: "Failed to fetch tasks" });
    }
  });

  app.post("/api/documents/:id/tasks", async (req, res) => {
    try {
      const documentId = parseIdParam(req.params.id);
      if (documentId === null) return res.status(400).json({ error: "유효하지 않은 문서 ID입니다" });
      const taskInput = insertTaskSchema.omit({ documentId: true, status: true }).safeParse(req.body);
      
      if (!taskInput.success) {
        return res.status(400).json({ error: taskInput.error.errors[0].message });
      }

      const task = await storage.createTask({
        ...taskInput.data,
        documentId,
        status: "pending",
      });
      res.json(task);
    } catch (error) {
      console.error("Error creating task:", error);
      res.status(500).json({ error: "Failed to create task" });
    }
  });

  app.patch("/api/tasks/:id", async (req, res) => {
    try {
      const id = parseIdParam(req.params.id);
      if (id === null) return res.status(400).json({ error: "유효하지 않은 할일 ID입니다" });
      const updateInput = taskUpdateSchema.safeParse(req.body);
      
      if (!updateInput.success) {
        return res.status(400).json({ error: updateInput.error.errors[0].message });
      }

      const updates: any = { ...updateInput.data };
      
      // Handle completion timestamp
      if (updates.status === "completed") {
        updates.completedAt = new Date();
      } else if (updates.status && updates.status !== "completed") {
        updates.completedAt = null;
      }

      const task = await storage.updateTask(id, updates);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }
      res.json(task);
    } catch (error) {
      console.error("Error updating task:", error);
      res.status(500).json({ error: "Failed to update task" });
    }
  });

  app.delete("/api/tasks/:id", async (req, res) => {
    try {
      const id = parseIdParam(req.params.id);
      if (id === null) return res.status(400).json({ error: "유효하지 않은 할일 ID입니다" });
      await storage.deleteTask(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting task:", error);
      res.status(500).json({ error: "Failed to delete task" });
    }
  });

  // Document Edges (workflow relationships)
  app.get("/api/document-edges", async (req, res) => {
    try {
      const edges = await storage.getAllDocumentEdges();
      res.json(edges);
    } catch (error) {
      console.error("Error fetching document edges:", error);
      res.status(500).json({ error: "Failed to fetch document edges" });
    }
  });

  // Document Groups
  app.get("/api/groups", async (req, res) => {
    try {
      const groups = await storage.getAllGroups();
      res.json(groups);
    } catch (error) {
      console.error("Error fetching groups:", error);
      res.status(500).json({ error: "Failed to fetch groups" });
    }
  });

  app.get("/api/groups/:id", async (req, res) => {
    try {
      const id = parseIdParam(req.params.id);
      if (id === null) return res.status(400).json({ error: "유효하지 않은 그룹 ID입니다" });
      const group = await storage.getGroup(id);
      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }
      res.json(group);
    } catch (error) {
      console.error("Error fetching group:", error);
      res.status(500).json({ error: "Failed to fetch group" });
    }
  });

  app.post("/api/groups", async (req, res) => {
    try {
      const groupInput = insertDocumentGroupSchema.safeParse(req.body);
      
      if (!groupInput.success) {
        return res.status(400).json({ error: groupInput.error.errors[0].message });
      }

      const group = await storage.createGroup(groupInput.data);
      res.json(group);
    } catch (error) {
      console.error("Error creating group:", error);
      res.status(500).json({ error: "Failed to create group" });
    }
  });

  app.patch("/api/groups/:id", async (req, res) => {
    try {
      const id = parseIdParam(req.params.id);
      if (id === null) return res.status(400).json({ error: "유효하지 않은 그룹 ID입니다" });
      const updateInput = groupUpdateSchema.safeParse(req.body);
      
      if (!updateInput.success) {
        return res.status(400).json({ error: updateInput.error.errors[0].message });
      }

      const group = await storage.updateGroup(id, updateInput.data);
      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }
      res.json(group);
    } catch (error) {
      console.error("Error updating group:", error);
      res.status(500).json({ error: "Failed to update group" });
    }
  });

  app.delete("/api/groups/:id", async (req, res) => {
    try {
      const id = parseIdParam(req.params.id);
      if (id === null) return res.status(400).json({ error: "유효하지 않은 그룹 ID입니다" });
      await storage.deleteGroup(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting group:", error);
      res.status(500).json({ error: "Failed to delete group" });
    }
  });

  // Group Edges
  app.get("/api/group-edges", async (req, res) => {
    try {
      const edges = await storage.getAllGroupEdges();
      res.json(edges);
    } catch (error) {
      console.error("Error fetching group edges:", error);
      res.status(500).json({ error: "Failed to fetch group edges" });
    }
  });

  // Notion integration routes
  app.get("/api/notion/oauth/status", (req, res) => {
    res.json({
      connected: Boolean(req.session.notionAccessToken),
      workspaceId: req.session.notionWorkspaceId || null,
      workspaceName: req.session.notionWorkspaceName || null,
      oauthConfigured: isNotionOAuthConfigured(),
      fallbackConfigured: isNotionConfigured(),
    });
  });

  app.get("/api/notion/oauth/start", (req, res) => {
    const { clientId, redirectUri } = getNotionOAuthConfig();
    if (!clientId || !redirectUri) {
      return res.status(503).json({ error: "Notion OAuth가 설정되지 않았습니다. Render 환경 변수에 NOTION_OAUTH_CLIENT_ID, NOTION_OAUTH_CLIENT_SECRET, NOTION_OAUTH_REDIRECT_URI를 등록하세요." });
    }

    const state = randomUUID();
    req.session.notionOAuthState = state;

    const url = new URL("https://api.notion.com/v1/oauth/authorize");
    url.searchParams.set("owner", "user");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);

    res.redirect(url.toString());
  });

  app.get("/api/notion/oauth/callback", async (req, res) => {
    const { clientId, clientSecret, redirectUri } = getNotionOAuthConfig();
    const code = typeof req.query.code === "string" ? req.query.code : null;
    const state = typeof req.query.state === "string" ? req.query.state : null;
    const error = typeof req.query.error === "string" ? req.query.error : null;

    if (error) {
      return res.redirect(`${getPublicBaseUrl(req)}/?notion=denied`);
    }
    if (!clientId || !clientSecret || !redirectUri) {
      return res.status(503).json({ error: "Notion OAuth가 설정되지 않았습니다." });
    }
    if (!code || !state || state !== req.session.notionOAuthState) {
      return res.status(400).json({ error: "Notion OAuth state가 유효하지 않습니다. 다시 연결을 시도하세요." });
    }

    const encodedCredentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const response = await fetch("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Basic ${encodedCredentials}`,
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    const tokenPayload: any = await response.json().catch(() => ({}));
    if (!response.ok || !tokenPayload.access_token) {
      console.error("Notion OAuth token exchange failed:", tokenPayload);
      return res.status(502).json({ error: "Notion 토큰 교환에 실패했습니다.", details: tokenPayload.error || tokenPayload.message });
    }

    req.session.notionAccessToken = tokenPayload.access_token;
    req.session.notionRefreshToken = tokenPayload.refresh_token;
    req.session.notionWorkspaceId = tokenPayload.workspace_id;
    req.session.notionWorkspaceName = tokenPayload.workspace_name;
    req.session.notionOAuthState = undefined;

    req.session.save(() => {
      res.redirect(`${getPublicBaseUrl(req)}/?notion=connected`);
    });
  });

  app.post("/api/notion/oauth/disconnect", (req, res) => {
    req.session.notionAccessToken = undefined;
    req.session.notionRefreshToken = undefined;
    req.session.notionWorkspaceId = undefined;
    req.session.notionWorkspaceName = undefined;
    res.json({ connected: false });
  });

  app.get("/api/notion/pages", async (req, res) => {
    try {
      const pages = await listNotionPages(getNotionSessionToken(req));
      res.json(pages);
    } catch (error: any) {
      console.error("Error fetching Notion pages:", error);
      if (error?.code === "NOTION_NOT_CONFIGURED") {
        return res.status(503).json({ error: "Notion 연결이 설정되지 않았습니다. Notion 연결하기 버튼을 누르거나 Render 환경 변수에 NOTION_API_KEY를 등록하세요." });
      }
      if (error.message?.includes("not connected")) {
        return res.status(401).json({ error: "노션이 연결되지 않았습니다. 노션 연동을 먼저 설정해 주세요." });
      }
      res.status(500).json({ error: "노션 페이지 목록을 가져오는데 실패했습니다." });
    }
  });

  app.get("/api/notion/pages/:pageId", async (req, res) => {
    try {
      const pageContent = await fetchNotionPageContent(req.params.pageId, getNotionSessionToken(req));
      res.json(pageContent);
    } catch (error: any) {
      console.error("Error fetching Notion page content:", error);
      if (error?.code === "NOTION_NOT_CONFIGURED") {
        return res.status(503).json({ error: "Notion 연결이 설정되지 않았습니다. Notion 연결하기 버튼을 누르거나 Render 환경 변수에 NOTION_API_KEY를 등록하세요." });
      }
      res.status(500).json({ error: "노션 페이지 내용을 가져오는데 실패했습니다." });
    }
  });

  app.post("/api/notion/import", async (req, res) => {
    try {
      const { pageIds } = req.body;
      if (!Array.isArray(pageIds) || pageIds.length === 0) {
        return res.status(400).json({ error: "가져올 노션 페이지를 선택해 주세요." });
      }

      const importedDocs = [];
      const errors: { pageId: string; error: string }[] = [];

      for (const pageId of pageIds) {
        try {
          const existingDoc = await storage.getAllDocuments();
          const alreadyImported = existingDoc.find((d: any) => d.notionPageId === pageId);
          if (alreadyImported) {
            importedDocs.push(alreadyImported);
            continue;
          }

          const doc = await importSingleNotionPage(pageId, getNotionSessionToken(req));
          if (doc) {
            importedDocs.push(doc);
          }
        } catch (pageError: any) {
          console.error(`Error importing Notion page ${pageId}:`, pageError);
          if (pageError?.code === "NOTION_NOT_CONFIGURED") throw pageError;
          errors.push({ pageId, error: pageError?.message || String(pageError) });
        }
      }

      res.json({ imported: importedDocs.length, documents: importedDocs, errors });
    } catch (error: any) {
      console.error("Error importing from Notion:", error);
      if (error?.code === "NOTION_NOT_CONFIGURED") {
        return res.status(503).json({ error: "Notion 연결이 설정되지 않았습니다. Notion 연결하기 버튼을 누르거나 Render 환경 변수에 NOTION_API_KEY를 등록하세요." });
      }
      res.status(500).json({ error: "노션에서 가져오기에 실패했습니다." });
    }
  });

  app.get("/api/notion/sync-status", async (_req, res) => {
    res.json(getSyncStatus());
  });

  app.post("/api/notion/sync", async (req, res) => {
    try {
      const result = await syncNotionPages(getNotionSessionToken(req));
      if (result.busy) {
        return res.status(409).json({ error: "이미 동기화가 진행 중입니다.", busy: true });
      }
      res.json(result);
    } catch (error: any) {
      console.error("Error syncing Notion:", error);
      if (error?.code === "NOTION_NOT_CONFIGURED") {
        return res.status(503).json({ error: "Notion 연결이 설정되지 않았습니다. Notion 연결하기 버튼을 누르거나 Render 환경 변수에 NOTION_API_KEY를 등록하세요." });
      }
      res.status(500).json({ error: "노션 동기화에 실패했습니다." });
    }
  });

  app.post("/api/notion/sync-toggle", async (req, res) => {
    const { enabled } = req.body;
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ error: "enabled 값이 필요합니다." });
    }
    setSyncEnabled(enabled);
    res.json(getSyncStatus());
  });

  // Analyze workflow and auto-layout documents
  app.post("/api/analyze-workflow", async (req, res) => {
    try {
      const documents = await storage.getAllDocuments();
      
      if (documents.length === 0) {
        return res.json({ 
          positions: {}, 
          edges: [],
          groups: [],
          summary: "문서가 없습니다" 
        });
      }

      // Use AI to analyze document relationships and create groups
      const analysis = await analyzeDocumentWorkflow(documents);

      // Report boxes should stay unlinked; only group-level workflow arrows remain.
      await storage.clearAllDocumentEdges();

      // Clear existing groups and create new ones based on AI analysis
      await storage.clearAllGroups();
      
      const createdGroups = await createGroupsFromAnalysis(analysis.groups, null, 0);

      // Calculate auto-layout positions for groups and documents
      const { groupPositions, documentPositions } = calculateGroupedLayout(
        documents, 
        createdGroups,
        analysis
      );

      // Update group positions in DB
      for (const group of createdGroups) {
        const pos = groupPositions[group.id];
        if (pos) {
          await storage.updateGroup(group.id, {
            x: pos.x,
            y: pos.y,
            manualWidth: pos.manualWidth ?? null,
            manualHeight: pos.manualHeight ?? null,
          });
        }
      }

      // Update document positions and group assignments in DB
      for (const doc of documents) {
        const pos = documentPositions[doc.id];
        if (pos) {
          await storage.updateDocument(doc.id, { 
            x: pos.x, 
            y: pos.y,
            groupId: pos.groupId || null
          });
        }
      }

      const edges: any[] = [];
      const groups = await storage.getAllGroups();
      
      // Create group-to-group edges based on AI analysis
      await storage.clearAllGroupEdges();
      if (analysis.groupRelations && analysis.groupRelations.length > 0) {
        // Build a map of original AI group names to created group IDs
        // Only map major/parent groups (parentId is null) for workflow connections
        const majorGroups = groups.filter(g => g.parentId === null);
        
        // Create normalized name-to-ID map for major groups only
        const normalizeGroupName = (name: string): string => {
          // Remove month/phase labels and trim
          return name.replace(/\s*\([^)]*\)\s*/g, '').trim().toLowerCase();
        };
        
        const groupEdgesToCreate = analysis.groupRelations
          .map(rel => {
            const sourceNameNorm = normalizeGroupName(rel.sourceGroupName);
            const targetNameNorm = normalizeGroupName(rel.targetGroupName);
            
            // Find matching major groups by normalized name
            const sourceGroup = majorGroups.find(g => {
              const gNameNorm = normalizeGroupName(g.name);
              return gNameNorm === sourceNameNorm || 
                     gNameNorm.includes(sourceNameNorm) ||
                     sourceNameNorm.includes(gNameNorm);
            });
            
            const targetGroup = majorGroups.find(g => {
              const gNameNorm = normalizeGroupName(g.name);
              return gNameNorm === targetNameNorm || 
                     gNameNorm.includes(targetNameNorm) ||
                     targetNameNorm.includes(gNameNorm);
            });
            
            if (sourceGroup && targetGroup && sourceGroup.id !== targetGroup.id) {
              return {
                sourceGroupId: sourceGroup.id,
                targetGroupId: targetGroup.id,
                label: rel.label,
                edgeType: rel.edgeType
              };
            }
            
            // Log unmatched relations for debugging
            if (!sourceGroup || !targetGroup) {
              console.log(`Group relation not matched: ${rel.sourceGroupName} -> ${rel.targetGroupName}`);
            }
            
            return null;
          })
          .filter((e): e is NonNullable<typeof e> => e !== null);
        
        // Deduplicate edges (same source/target pair)
        const uniqueEdges = groupEdgesToCreate.filter((edge, idx, arr) => 
          arr.findIndex(e => e.sourceGroupId === edge.sourceGroupId && e.targetGroupId === edge.targetGroupId) === idx
        );
        
        if (uniqueEdges.length > 0) {
          await storage.createGroupEdges(uniqueEdges);
        }
      }
      
      const groupEdges = await storage.getAllGroupEdges();
      
      res.json({
        positions: documentPositions,
        groupPositions,
        edges,
        groups,
        groupEdges,
        summary: analysis.summary
      });
    } catch (error: any) {
      console.error("Error analyzing workflow:", error);
      if (error?.code === "AI_NOT_CONFIGURED") {
        return res.status(503).json({ error: "AI 기능이 아직 설정되지 않았습니다. 배포 환경 변수에 OPENAI_API_KEY 또는 AI_INTEGRATIONS_OPENAI_API_KEY를 등록해야 합니다." });
      }
      res.status(500).json({ error: "Failed to analyze workflow" });
    }
  });

  // Helper function to create groups recursively
  async function createGroupsFromAnalysis(
    groupDefs: any[], 
    parentId: number | null,
    startX: number
  ): Promise<any[]> {
    const created: any[] = [];
    const GROUP_WIDTH = 400;
    const GAP = 50;

    for (let i = 0; i < groupDefs.length; i++) {
      const def = groupDefs[i];
      
      // Create group name with month/phase labels
      let name = def.name;
      if (def.monthLabel && !name.includes(def.monthLabel)) {
        name = `${def.phaseLabel || name} (${def.monthLabel})`;
      }

      const group = await storage.createGroup({
        name,
        description: def.description || "",
        parentId,
        color: def.color || "#6366f1",
        x: startX + i * (GROUP_WIDTH + GAP),
        y: parentId ? 200 : 100,
        monthStart: def.monthStart || null,
        monthEnd: def.monthEnd || null,
      });

      // Update documents to belong to this group
      for (const docId of def.documentIds || []) {
        await storage.updateDocument(docId, { groupId: group.id });
      }

      created.push({
        ...group,
        level: def.level,
        documentIds: def.documentIds || [],
      });

      // Create child groups recursively
      if (def.childGroups && def.childGroups.length > 0) {
        const children = await createGroupsFromAnalysis(
          def.childGroups, 
          group.id,
          startX + i * (GROUP_WIDTH + GAP)
        );
        created.push(...children);
      }
    }

    return created;
  }

  // Re-layout existing groups and documents (timeline-aligned swim lanes)
  app.post("/api/relayout", async (req, res) => {
    try {
      const groups = await storage.getAllGroups();
      const documents = await storage.getAllDocuments();

      if (groups.length === 0 && documents.length === 0) {
        return res.json({ success: true, message: "정렬할 항목이 없습니다" });
      }

      const groupsWithDocumentIds = groups.map((group) => ({
        ...group,
        documentIds: documents.filter((doc) => doc.groupId === group.id).map((doc) => doc.id),
      }));
      const { groupPositions, documentPositions } = calculateGroupedLayout(
        documents,
        groupsWithDocumentIds,
        { hierarchyLevels: {}, relations: [] },
      );

      for (const [groupIdStr, pos] of Object.entries(groupPositions)) {
        await storage.updateGroup(parseInt(groupIdStr), {
          x: Math.round(pos.x),
          y: Math.round(pos.y),
          manualWidth: pos.manualWidth ?? null,
          manualHeight: pos.manualHeight ?? null,
        });
      }

      for (const [docIdStr, pos] of Object.entries(documentPositions)) {
        await storage.updateDocument(parseInt(docIdStr), { x: Math.round(pos.x), y: Math.round(pos.y) });
      }

      res.json({ success: true, message: "타임라인에 맞게 재정렬되었습니다" });
    } catch (error) {
      console.error("Relayout error:", error);
      res.status(500).json({ error: "레이아웃 재정렬 중 오류가 발생했습니다" });
    }
  });

  return httpServer;
}

// Calculate hierarchical layout positions for documents
function calculateHierarchicalLayout(
  documents: any[], 
  analysis: { hierarchyLevels: Record<number, number>; relations: any[] }
): Record<number, { x: number; y: number }> {
  const positions: Record<number, { x: number; y: number }> = {};
  
  const BOX_WIDTH = 320;
  const BOX_HEIGHT = 180;
  const HORIZONTAL_GAP = 80;
  const VERTICAL_GAP = 120;
  const CANVAS_PADDING = 200;

  // Group documents by hierarchy level
  const levelGroups: Record<number, number[]> = {};
  for (const doc of documents) {
    const level = analysis.hierarchyLevels[doc.id] ?? 0;
    if (!levelGroups[level]) {
      levelGroups[level] = [];
    }
    levelGroups[level].push(doc.id);
  }

  // Sort levels
  const sortedLevels = Object.keys(levelGroups).map(Number).sort((a, b) => a - b);

  // Calculate positions for each level
  for (const level of sortedLevels) {
    const docsInLevel = levelGroups[level];
    const levelWidth = docsInLevel.length * (BOX_WIDTH + HORIZONTAL_GAP) - HORIZONTAL_GAP;
    const startX = CANVAS_PADDING + (level === 0 ? 0 : BOX_WIDTH / 2);
    
    docsInLevel.forEach((docId, index) => {
      positions[docId] = {
        x: startX + index * (BOX_WIDTH + HORIZONTAL_GAP) + BOX_WIDTH / 2,
        y: CANVAS_PADDING + level * (BOX_HEIGHT + VERTICAL_GAP) + BOX_HEIGHT / 2
      };
    });
  }

  return positions;
}

// Calculate layout positions for documents organized in groups (timeline-aligned)
function calculateGroupedLayout(
  documents: any[],
  groups: any[],
  analysis: { hierarchyLevels: Record<number, number>; relations: any[] }
): {
  groupPositions: Record<number, { x: number; y: number; manualWidth?: number; manualHeight?: number }>;
  documentPositions: Record<number, { x: number; y: number; groupId?: number }>;
} {
  const groupPositions: Record<number, { x: number; y: number; manualWidth?: number; manualHeight?: number }> = {};
  const documentPositions: Record<number, { x: number; y: number; groupId?: number }> = {};

  // Timeline constants (must match frontend)
  const MONTH_WIDTH = 800;
  const OFFSET_X = 150;
  const TIMELINE_START_YEAR = 2026;
  const TIMELINE_START_MONTH = 1;

  const DOC_WIDTH = 340;
  const DOC_HEIGHT = 190;
  const DOC_GAP_X = 24;
  const DOC_GAP_Y = 86;
  const GROUP_PADDING = 18;
  const GROUP_HEADER = 112;
  const GROUP_CONTENT_GAP = 12;
  const GROUP_MONTH_MARGIN = 56;
  const GROUP_GAP_X = 72;
  const GROUP_ROW_GAP_Y = 80;
  const CHILD_GROUP_INSET_X = 32;
  const CANVAS_START_Y = 200;
  const MAX_DOCS_PER_ROW = 2;

  function getMonthCenterX(year: number, month: number): number {
    const monthIndex = (year - TIMELINE_START_YEAR) * 12 + month - TIMELINE_START_MONTH;
    return OFFSET_X + monthIndex * MONTH_WIDTH + MONTH_WIDTH / 2;
  }

  function getMonthLeftX(year: number, month: number): number {
    const monthIndex = (year - TIMELINE_START_YEAR) * 12 + month - TIMELINE_START_MONTH;
    return OFFSET_X + monthIndex * MONTH_WIDTH;
  }

  function getYearMonth(date: Date | string | null): { year: number; month: number } {
    if (!date) return { year: 2026, month: 2 };
    const d = new Date(date);
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  }

  function getMonthKey(date: Date | string | null): string {
    const ym = getYearMonth(date);
    return `${ym.year}-${ym.month}`;
  }

  // Build document-to-group mapping
  const docToGroup: Record<number, number> = {};
  for (const group of groups) {
    for (const docId of group.documentIds || []) {
      docToGroup[docId] = group.id;
    }
  }

  // Build parent-child relationships
  const groupIdSet = new Set(groups.map(g => g.id));
  const childrenOf: Record<number, any[]> = {};
  for (const group of groups) {
    if (group.parentId && groupIdSet.has(group.parentId)) {
      if (!childrenOf[group.parentId]) childrenOf[group.parentId] = [];
      childrenOf[group.parentId].push(group);
    }
  }

  function getGroupDocIds(group: any): number[] {
    return Array.isArray(group.documentIds) ? group.documentIds : [];
  }

  function getDocsForGroup(group: any): any[] {
    const ids = new Set(getGroupDocIds(group));
    return documents.filter((doc: any) => docToGroup[doc.id] === group.id || doc.groupId === group.id || ids.has(doc.id));
  }

  function getDescendantDocs(group: any): any[] {
    const direct = getDocsForGroup(group);
    const childDocs = (childrenOf[group.id] || []).flatMap((child) => getDescendantDocs(child));
    return [...direct, ...childDocs];
  }

  function getDocMonthRange(docs: any[]): { left: number; right: number } {
    if (docs.length === 0) {
      const fallbackLeft = getMonthLeftX(2026, 2);
      return { left: fallbackLeft, right: fallbackLeft + MONTH_WIDTH };
    }

    let left = Infinity;
    let right = -Infinity;
    for (const doc of docs) {
      const { year, month } = getYearMonth(doc.createdAt);
      const monthLeft = getMonthLeftX(year, month);
      left = Math.min(left, monthLeft);
      right = Math.max(right, monthLeft + MONTH_WIDTH);
    }
    return { left, right };
  }

  function assignSiblingSlots<T extends { left: number; right: number }>(
    items: T[],
  ): (T & { centerX: number; manualWidth: number; layoutLeft: number; layoutRight: number; isSplit: boolean })[] {
    const MIN_SLOT_WIDTH = DOC_WIDTH;
    const SLOT_GAP_X = GROUP_GAP_X;
    const byRange = new Map<string, T[]>();

    for (const item of items) {
      const key = `${item.left}:${item.right}`;
      if (!byRange.has(key)) byRange.set(key, []);
      byRange.get(key)!.push(item);
    }

    const result: (T & { centerX: number; manualWidth: number; layoutLeft: number; layoutRight: number; isSplit: boolean })[] = [];
    for (const rangeItems of Array.from(byRange.values())) {
      const { left, right } = rangeItems[0];
      const innerLeft = left + GROUP_MONTH_MARGIN;
      const innerRight = right - GROUP_MONTH_MARGIN;
      const innerWidth = innerRight - innerLeft;
      const perRow = Math.max(1, Math.floor((innerWidth + SLOT_GAP_X) / (MIN_SLOT_WIDTH + SLOT_GAP_X)));
      const slotsPerRow = Math.min(rangeItems.length, perRow);

      for (let index = 0; index < rangeItems.length; index++) {
        const slotIndex = index % slotsPerRow;
        const rowSlots = Math.min(slotsPerRow, rangeItems.length - index + slotIndex);
        const slotWidth = (innerWidth - (rowSlots - 1) * SLOT_GAP_X) / rowSlots;
        const slotLeft = innerLeft + slotIndex * (slotWidth + SLOT_GAP_X);
        const slotRight = slotLeft + slotWidth;
        result.push({
          ...rangeItems[index],
          centerX: (slotLeft + slotRight) / 2,
          manualWidth: slotWidth,
          layoutLeft: slotLeft,
          layoutRight: slotRight,
          isSplit: rangeItems.length > 1 && slotsPerRow > 1,
        });
      }
    }

    return result;
  }

  function getMaxRowsByMonth(docs: any[]): number {
    if (docs.length === 0) return 0;

    const countsByMonth = docs.reduce((acc: Record<string, number>, doc: any) => {
      const key = getMonthKey(doc.createdAt);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    return Math.max(
      1,
      ...Object.values(countsByMonth).map((count) => Math.ceil(Number(count) / MAX_DOCS_PER_ROW)),
    );
  }

  function placeInRows<T extends { left: number; right: number; height: number }>(items: T[]): (T & { rowTop: number })[] {
    const rows: { right: number; height: number; top: number }[] = [];
    const placed: (T & { rowTop: number })[] = [];

    for (const item of items) {
      let rowIndex = rows.findIndex((row) => item.left >= row.right + GROUP_GAP_X);
      if (rowIndex === -1) {
        const previous = rows[rows.length - 1];
        rows.push({
          right: item.right,
          height: item.height,
          top: previous ? previous.top + previous.height + GROUP_ROW_GAP_Y : CANVAS_START_Y,
        });
        rowIndex = rows.length - 1;
      } else {
        rows[rowIndex].right = Math.max(rows[rowIndex].right, item.right);
        rows[rowIndex].height = Math.max(rows[rowIndex].height, item.height);
      }
      placed.push({ ...item, rowTop: rows[rowIndex].top });
    }

    return placed;
  }

  // Position docs in their timeline month columns
  function positionDocsInMonthColumns(
    docs: any[],
    baseY: number,
    groupId?: number
  ): { maxRows: number } {
    if (docs.length === 0) return { maxRows: 0 };

    const byMonth: Record<string, any[]> = {};
    for (const doc of docs) {
      const key = getMonthKey(doc.createdAt);
      if (!byMonth[key]) byMonth[key] = [];
      byMonth[key].push(doc);
    }

    let maxRows = 0;
    for (const [monthKey, monthDocs] of Object.entries(byMonth)) {
      const [yr, mo] = monthKey.split("-").map(Number);
      const monthLeft = getMonthLeftX(yr, mo);
      const availableWidth = MONTH_WIDTH - GROUP_MONTH_MARGIN * 2 - GROUP_PADDING * 2;
      const fittingCols = Math.max(
        1,
        Math.floor((availableWidth + DOC_GAP_X) / (DOC_WIDTH + DOC_GAP_X)),
      );
      const cols = Math.min(MAX_DOCS_PER_ROW, fittingCols, monthDocs.length);
      const totalRowWidth = cols * DOC_WIDTH + (cols - 1) * DOC_GAP_X;
      const startX = monthLeft + GROUP_MONTH_MARGIN + GROUP_PADDING + (availableWidth - totalRowWidth) / 2 + DOC_WIDTH / 2;

      for (let i = 0; i < monthDocs.length; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const proposedX = startX + col * (DOC_WIDTH + DOC_GAP_X);
        documentPositions[monthDocs[i].id] = {
          x: Math.min(
            monthLeft + MONTH_WIDTH - GROUP_MONTH_MARGIN - GROUP_PADDING - DOC_WIDTH / 2,
            Math.max(monthLeft + GROUP_MONTH_MARGIN + GROUP_PADDING + DOC_WIDTH / 2, proposedX),
          ),
          y: baseY + row * (DOC_HEIGHT + DOC_GAP_Y) + DOC_HEIGHT / 2,
          groupId
        };
        maxRows = Math.max(maxRows, row + 1);
      }
    }

    return { maxRows };
  }

  function positionDocsInSlotColumns(
    docs: any[],
    baseY: number,
    groupId: number | undefined,
    slotLeft: number,
    slotRight: number,
  ): { maxRows: number } {
    if (docs.length === 0) return { maxRows: 0 };

    const slotWidth = slotRight - slotLeft;
    const sidePadding = Math.min(GROUP_PADDING, Math.max(6, (slotWidth - DOC_WIDTH) / 2));
    const availableWidth = Math.max(DOC_WIDTH, slotWidth - sidePadding * 2);
    const fittingCols = Math.max(
      1,
      Math.floor((availableWidth + DOC_GAP_X) / (DOC_WIDTH + DOC_GAP_X)),
    );
    const cols = Math.min(MAX_DOCS_PER_ROW, fittingCols, docs.length);
    const totalRowWidth = cols * DOC_WIDTH + (cols - 1) * DOC_GAP_X;
    const startX = slotLeft + sidePadding + (availableWidth - totalRowWidth) / 2 + DOC_WIDTH / 2;
    let maxRows = 0;

    for (let i = 0; i < docs.length; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      documentPositions[docs[i].id] = {
        x: startX + col * (DOC_WIDTH + DOC_GAP_X),
        y: baseY + row * (DOC_HEIGHT + DOC_GAP_Y) + DOC_HEIGHT / 2,
        groupId,
      };
      maxRows = Math.max(maxRows, row + 1);
    }

    return { maxRows };
  }

  // Get workflow order for sorting
  function getWorkflowOrder(name: string): number {
    const n = (name || "").toLowerCase();
    if (n.includes("기획") || n.includes("planning")) return 0;
    if (n.includes("리서치") || n.includes("research")) return 1;
    if (n.includes("설계") || n.includes("design")) return 2;
    if (n.includes("실행") || n.includes("execution")) return 3;
    if (n.includes("분석") || n.includes("analysis")) return 4;
    if (n.includes("보고") || n.includes("report")) return 5;
    return 3;
  }

  // Top-level groups as swim lanes
  const topLevelGroups = groups
    .filter(g => !g.parentId || !groupIdSet.has(g.parentId))
    .sort((a: any, b: any) => getWorkflowOrder(a.name) - getWorkflowOrder(b.name));

  const topPlans = topLevelGroups
    .map((group: any) => {
      const docs = getDescendantDocs(group);
      const range = getDocMonthRange(docs);
      const directRows = getMaxRowsByMonth(getDocsForGroup(group));
      const directHeight = directRows > 0 ? directRows * (DOC_HEIGHT + DOC_GAP_Y) : 0;
      const childHeight = (childrenOf[group.id] || []).reduce((total: number, child: any) => {
        const childDocs = getDocsForGroup(child);
        const childRows = getMaxRowsByMonth(childDocs) || 1;
        const height = GROUP_HEADER + GROUP_CONTENT_GAP + childRows * (DOC_HEIGHT + DOC_GAP_Y) + GROUP_PADDING;
        return total + height + GROUP_ROW_GAP_Y;
      }, 0);
      const childOffset = directHeight > 0 && childHeight > 0 ? 60 : 0;
      const contentHeight = directHeight + childOffset + childHeight;
      return {
        group,
        left: range.left,
        right: range.right,
        centerX: (range.left + range.right) / 2,
        manualWidth: range.right - range.left - GROUP_MONTH_MARGIN * 2,
        height: GROUP_HEADER + GROUP_CONTENT_GAP + Math.max(DOC_HEIGHT, contentHeight) + GROUP_PADDING,
      };
    })
    .sort((a, b) => a.left - b.left || getWorkflowOrder(a.group.name) - getWorkflowOrder(b.group.name));

  let topRowY = CANVAS_START_Y;
  const placedTopPlans = topPlans.map((topPlan) => {
    const placed = { ...topPlan, rowTop: topRowY };
    topRowY += topPlan.height + GROUP_ROW_GAP_Y;
    return placed;
  });
  let layoutBottom = CANVAS_START_Y;

  for (const topPlan of placedTopPlans) {
    const topGroup = topPlan.group;
    const children = [...(childrenOf[topGroup.id] || [])].sort((a: any, b: any) => {
      const aRange = getDocMonthRange(getDescendantDocs(a));
      const bRange = getDocMonthRange(getDescendantDocs(b));
      return aRange.left - bRange.left || getWorkflowOrder(a.name) - getWorkflowOrder(b.name);
    });
    const directDocs = getDocsForGroup(topGroup);
    const directRows = getMaxRowsByMonth(directDocs);
    const directBaseY = topPlan.rowTop + GROUP_HEADER + GROUP_CONTENT_GAP;

    if (directDocs.length > 0) {
      positionDocsInMonthColumns(directDocs, directBaseY, topGroup.id);
    }

    const childPlans = children.map((child: any) => {
      const childDocs = getDocsForGroup(child);
      const range = getDocMonthRange(childDocs);
      const maxRowsByMonth = getMaxRowsByMonth(childDocs) || 1;
      const height = GROUP_HEADER + GROUP_CONTENT_GAP + maxRowsByMonth * (DOC_HEIGHT + DOC_GAP_Y) + GROUP_PADDING * 2;
      return {
        child,
        childDocs,
        left: range.left,
        right: range.right,
        centerX: (range.left + range.right) / 2,
        manualWidth: range.right - range.left - GROUP_MONTH_MARGIN * 2 - CHILD_GROUP_INSET_X * 2,
        height,
      };
    });

    const childRowStart = directDocs.length > 0
      ? directBaseY + directRows * (DOC_HEIGHT + DOC_GAP_Y) + 60
      : directBaseY;
    let childRowY = childRowStart;
    const placedChildren = childPlans.map((childPlan) => {
      const placed = { ...childPlan, rowTop: childRowY };
      childRowY += childPlan.height + GROUP_ROW_GAP_Y;
      return placed;
    });

    for (const childPlan of placedChildren) {
      const childContentY = childPlan.rowTop + GROUP_HEADER + GROUP_CONTENT_GAP;
      if (childPlan.childDocs.length > 0) {
        positionDocsInMonthColumns(childPlan.childDocs, childContentY, childPlan.child.id);
      }
      groupPositions[childPlan.child.id] = {
        x: Math.round(childPlan.centerX),
        y: Math.round(childPlan.rowTop + childPlan.height / 2),
        manualWidth: Math.round(Math.max(DOC_WIDTH + GROUP_PADDING * 2, childPlan.manualWidth)),
        manualHeight: Math.round(childPlan.height),
      };
    }

    const childBottom = placedChildren.length > 0
      ? Math.max(...placedChildren.map((childPlan) => childPlan.rowTop + childPlan.height))
      : directBaseY + (directDocs.length > 0 ? DOC_HEIGHT + GROUP_PADDING : 0);
    const topHeight = Math.max(
      GROUP_HEADER + GROUP_CONTENT_GAP + DOC_HEIGHT + GROUP_PADDING * 2,
      childBottom - topPlan.rowTop + GROUP_PADDING * 2,
    );
    groupPositions[topGroup.id] = {
      x: Math.round(topPlan.centerX),
      y: Math.round(topPlan.rowTop + topHeight / 2),
      manualWidth: Math.round(topPlan.manualWidth),
      manualHeight: Math.round(topHeight),
    };
    layoutBottom = Math.max(layoutBottom, topPlan.rowTop + topHeight);
  }

  // Handle unpositioned documents
  const unpositionedDocs = documents.filter((d: any) => !documentPositions[d.id]);
  if (unpositionedDocs.length > 0) {
    positionDocsInMonthColumns(unpositionedDocs, layoutBottom + GROUP_ROW_GAP_Y);
  }

  return { groupPositions, documentPositions };
}
