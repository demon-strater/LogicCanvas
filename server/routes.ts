import type { Express } from "express";
import type { Server } from "http";
import path from "path";
import fs from "fs";
import multer from "multer";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { storage } from "./storage";
import { parseDocumentWithAI, analyzeDocumentWorkflow, assignDocumentToGroup } from "./ai";
import { listNotionPages, fetchNotionPageContent } from "./notion";
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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

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

      const { title, content } = parseInput.data;

      // Parse document with AI
      const parseResult = await parseDocumentWithAI(content);

      // Create document
      const document = await storage.createDocument({ title, content });

      // Create nodes from parsed concepts
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
    } catch (error) {
      console.error("Error parsing document:", error);
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
  app.get("/api/notion/pages", async (_req, res) => {
    try {
      const pages = await listNotionPages();
      res.json(pages);
    } catch (error: any) {
      console.error("Error fetching Notion pages:", error);
      if (error.message?.includes("not connected")) {
        return res.status(401).json({ error: "노션이 연결되지 않았습니다. 노션 연동을 먼저 설정해 주세요." });
      }
      res.status(500).json({ error: "노션 페이지 목록을 가져오는데 실패했습니다." });
    }
  });

  app.get("/api/notion/pages/:pageId", async (req, res) => {
    try {
      const pageContent = await fetchNotionPageContent(req.params.pageId);
      res.json(pageContent);
    } catch (error: any) {
      console.error("Error fetching Notion page content:", error);
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

      for (const pageId of pageIds) {
        try {
          const existingDoc = await storage.getAllDocuments();
          const alreadyImported = existingDoc.find((d: any) => d.notionPageId === pageId);
          if (alreadyImported) {
            importedDocs.push(alreadyImported);
            continue;
          }

          const pageContent = await fetchNotionPageContent(pageId);
          
          if (!pageContent.content.trim()) {
            continue;
          }

          const parseResult = await parseDocumentWithAI(pageContent.content);

          const document = await storage.createDocument({
            title: pageContent.title,
            content: pageContent.content,
            images: pageContent.images.length > 0 ? pageContent.images : null,
            notionPageId: pageId,
          });

          if (parseResult.concepts.length > 0) {
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

            if (parseResult.relations.length > 0) {
              await storage.createEdges(
                parseResult.relations
                  .filter(r => r.sourceIndex < createdNodes.length && r.targetIndex < createdNodes.length)
                  .map((relation) => ({
                    documentId: document.id,
                    sourceId: createdNodes[relation.sourceIndex].id,
                    targetId: createdNodes[relation.targetIndex].id,
                    label: relation.label,
                    edgeType: relation.edgeType,
                  }))
              );
            }
          }

          // Auto-assign to group
          try {
            const existingGroups = await storage.getAllGroups();
            const groupAssignment = await assignDocumentToGroup(pageContent.title, pageContent.content, existingGroups);

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
              importedDocs.push(updatedDoc || document);
            } else {
              importedDocs.push(document);
            }
          } catch {
            importedDocs.push(document);
          }
        } catch (pageError) {
          console.error(`Error importing Notion page ${pageId}:`, pageError);
        }
      }

      res.json({ imported: importedDocs.length, documents: importedDocs });
    } catch (error: any) {
      console.error("Error importing from Notion:", error);
      res.status(500).json({ error: "노션에서 가져오기에 실패했습니다." });
    }
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

      // Clear existing document edges and create new ones
      await storage.clearAllDocumentEdges();
      
      if (analysis.relations.length > 0) {
        await storage.createDocumentEdges(
          analysis.relations.map(r => ({
            sourceDocId: r.sourceDocId,
            targetDocId: r.targetDocId,
            label: r.label,
            edgeType: r.edgeType,
          }))
        );
      }

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
          await storage.updateGroup(group.id, { x: pos.x, y: pos.y });
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

      const edges = await storage.getAllDocumentEdges();
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
    } catch (error) {
      console.error("Error analyzing workflow:", error);
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

      // Timeline constants (must match frontend DocumentCanvas)
      const MONTH_WIDTH = 800;
      const OFFSET_X = 150;
      const TIMELINE_START_YEAR = 2025;
      const TIMELINE_START_MONTH = 12;

      // Layout constants
      const DOC_WIDTH = 260;
      const DOC_HEIGHT = 140;
      const DOC_GAP_X = 30;
      const DOC_GAP_Y = 40;
      const GROUP_PADDING = 40;
      const GROUP_HEADER = 60;
      const CHILD_GROUP_GAP_Y = 80;
      const TOP_GROUP_GAP_Y = 120;
      const CANVAS_START_Y = 200;
      const MAX_DOCS_PER_ROW = 2;

      const getMonthCenterX = (year: number, month: number): number => {
        const monthIndex = (year - TIMELINE_START_YEAR) * 12 + month - TIMELINE_START_MONTH;
        return OFFSET_X + monthIndex * MONTH_WIDTH + MONTH_WIDTH / 2;
      };

      const getYearMonth = (date: Date | string | null): { year: number; month: number } => {
        if (!date) return { year: 2026, month: 2 };
        const d = new Date(date);
        return { year: d.getFullYear(), month: d.getMonth() + 1 };
      };

      const getMonthKey = (date: Date | string | null): string => {
        const ym = getYearMonth(date);
        return `${ym.year}-${ym.month}`;
      };

      // Build parent-child relationships
      const groupIdSet = new Set(groups.map(g => g.id));
      const childrenOf: Record<number, typeof groups> = {};
      for (const group of groups) {
        if (group.parentId && groupIdSet.has(group.parentId)) {
          if (!childrenOf[group.parentId]) childrenOf[group.parentId] = [];
          childrenOf[group.parentId].push(group);
        }
      }

      // Get workflow order for sorting top-level groups vertically
      const getWorkflowOrder = (name: string): number => {
        const n = name.toLowerCase();
        if (n.includes("기획") || n.includes("planning")) return 0;
        if (n.includes("리서치") || n.includes("research") || n.includes("조사")) return 1;
        if (n.includes("설계") || n.includes("design")) return 2;
        if (n.includes("실행") || n.includes("execution")) return 3;
        if (n.includes("분석") || n.includes("analysis")) return 4;
        if (n.includes("보고") || n.includes("report")) return 5;
        return 3;
      };

      // Position docs in a group at their timeline month X, stacking within the same month
      // Returns { maxRows, allDocPositions } so we know the height consumed
      const positionDocsInMonthColumns = (
        docs: typeof documents,
        baseY: number
      ): { maxRows: number; positions: Record<number, { x: number; y: number }> } => {
        if (docs.length === 0) return { maxRows: 0, positions: {} };

        const byMonth: Record<string, typeof docs> = {};
        for (const doc of docs) {
          const key = getMonthKey(doc.createdAt);
          if (!byMonth[key]) byMonth[key] = [];
          byMonth[key].push(doc);
        }

        const positions: Record<number, { x: number; y: number }> = {};
        let maxRows = 0;

        for (const [monthKey, monthDocs] of Object.entries(byMonth)) {
          const [yr, mo] = monthKey.split("-").map(Number);
          const monthCx = getMonthCenterX(yr, mo);
          const cols = Math.min(MAX_DOCS_PER_ROW, monthDocs.length);
          const totalRowWidth = cols * DOC_WIDTH + (cols - 1) * DOC_GAP_X;
          const startX = monthCx - totalRowWidth / 2 + DOC_WIDTH / 2;

          for (let i = 0; i < monthDocs.length; i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const docX = startX + col * (DOC_WIDTH + DOC_GAP_X);
            const docY = baseY + row * (DOC_HEIGHT + DOC_GAP_Y) + DOC_HEIGHT / 2;
            positions[monthDocs[i].id] = { x: docX, y: docY };
            maxRows = Math.max(maxRows, row + 1);
          }
        }

        return { maxRows, positions };
      };

      // Get all descendant document IDs for a group (including nested child groups)
      const getDescendantDocs = (groupId: number): typeof documents => {
        const direct = documents.filter(d => d.groupId === groupId);
        const children = childrenOf[groupId] || [];
        const childDocs = children.flatMap(c => getDescendantDocs(c.id));
        return [...direct, ...childDocs];
      };

      // Top-level groups sorted by workflow order (stacked vertically as swim lanes)
      const topLevelGroups = groups
        .filter(g => !g.parentId || !groupIdSet.has(g.parentId))
        .sort((a, b) => getWorkflowOrder(a.name) - getWorkflowOrder(b.name));

      let currentRowY = CANVAS_START_Y;
      const allDocPositions: Record<number, { x: number; y: number }> = {};

      for (const topGroup of topLevelGroups) {
        const children = childrenOf[topGroup.id] || [];
        const directDocs = documents.filter(d => d.groupId === topGroup.id);
        let contentY = currentRowY + GROUP_HEADER;

        // Position direct docs of the top-level group
        if (directDocs.length > 0) {
          const { maxRows, positions } = positionDocsInMonthColumns(directDocs, contentY);
          Object.assign(allDocPositions, positions);
          contentY += maxRows * (DOC_HEIGHT + DOC_GAP_Y);
        }

        // Position child groups as sub-rows
        if (children.length > 0) {
          if (directDocs.length > 0) contentY += 40;

          children.sort((a, b) => getWorkflowOrder(a.name) - getWorkflowOrder(b.name));

          for (const child of children) {
            const childDocs = documents.filter(d => d.groupId === child.id);
            const childContentY = contentY + GROUP_HEADER;

            if (childDocs.length > 0) {
              const { maxRows, positions } = positionDocsInMonthColumns(childDocs, childContentY);
              Object.assign(allDocPositions, positions);

              const childHeight = GROUP_HEADER + maxRows * (DOC_HEIGHT + DOC_GAP_Y) + GROUP_PADDING;

              // Set child group center based on its document bounds
              const docXValues = childDocs.map(d => {
                const p = positions[d.id];
                return p ? p.x : getMonthCenterX(getYearMonth(d.createdAt).year, getYearMonth(d.createdAt).month);
              });
              const centerX = (Math.min(...docXValues) + Math.max(...docXValues)) / 2;
              await storage.updateGroup(child.id, {
                x: Math.round(centerX),
                y: Math.round(contentY + childHeight / 2)
              });

              contentY += childHeight + CHILD_GROUP_GAP_Y;
            } else {
              const emptyHeight = DOC_HEIGHT + GROUP_HEADER + GROUP_PADDING;
              await storage.updateGroup(child.id, {
                x: getMonthCenterX(2026, 2),
                y: Math.round(contentY + emptyHeight / 2)
              });
              contentY += emptyHeight + CHILD_GROUP_GAP_Y;
            }
          }
        }

        // Set top-level group center based on all its descendants
        const allDesc = getDescendantDocs(topGroup.id);
        if (allDesc.length > 0) {
          const docXValues = allDesc.map(d => {
            const p = allDocPositions[d.id];
            return p ? p.x : getMonthCenterX(getYearMonth(d.createdAt).year, getYearMonth(d.createdAt).month);
          });
          const centerX = (Math.min(...docXValues) + Math.max(...docXValues)) / 2;
          const totalHeight = contentY - currentRowY;
          await storage.updateGroup(topGroup.id, {
            x: Math.round(centerX),
            y: Math.round(currentRowY + totalHeight / 2)
          });
        } else {
          await storage.updateGroup(topGroup.id, {
            x: getMonthCenterX(2026, 2),
            y: Math.round(currentRowY + 200)
          });
        }

        currentRowY = contentY + TOP_GROUP_GAP_Y;
      }

      // Handle ungrouped documents at the bottom, also timeline-aligned
      const ungroupedDocs = documents.filter(d => !d.groupId);
      if (ungroupedDocs.length > 0) {
        const { positions } = positionDocsInMonthColumns(ungroupedDocs, currentRowY);
        Object.assign(allDocPositions, positions);
      }

      // Write all document positions to DB
      for (const [docIdStr, pos] of Object.entries(allDocPositions)) {
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
  groupPositions: Record<number, { x: number; y: number }>;
  documentPositions: Record<number, { x: number; y: number; groupId?: number }>;
} {
  const groupPositions: Record<number, { x: number; y: number }> = {};
  const documentPositions: Record<number, { x: number; y: number; groupId?: number }> = {};

  // Timeline constants (must match frontend)
  const MONTH_WIDTH = 800;
  const OFFSET_X = 150;
  const TIMELINE_START_YEAR = 2025;
  const TIMELINE_START_MONTH = 12;

  const DOC_WIDTH = 260;
  const DOC_HEIGHT = 140;
  const DOC_GAP_X = 30;
  const DOC_GAP_Y = 40;
  const GROUP_HEADER = 60;
  const CHILD_GROUP_GAP_Y = 80;
  const TOP_GROUP_GAP_Y = 120;
  const CANVAS_START_Y = 200;
  const MAX_DOCS_PER_ROW = 2;

  function getMonthCenterX(year: number, month: number): number {
    const monthIndex = (year - TIMELINE_START_YEAR) * 12 + month - TIMELINE_START_MONTH;
    return OFFSET_X + monthIndex * MONTH_WIDTH + MONTH_WIDTH / 2;
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
      const monthCx = getMonthCenterX(yr, mo);
      const cols = Math.min(MAX_DOCS_PER_ROW, monthDocs.length);
      const totalRowWidth = cols * DOC_WIDTH + (cols - 1) * DOC_GAP_X;
      const startX = monthCx - totalRowWidth / 2 + DOC_WIDTH / 2;

      for (let i = 0; i < monthDocs.length; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        documentPositions[monthDocs[i].id] = {
          x: startX + col * (DOC_WIDTH + DOC_GAP_X),
          y: baseY + row * (DOC_HEIGHT + DOC_GAP_Y) + DOC_HEIGHT / 2,
          groupId
        };
        maxRows = Math.max(maxRows, row + 1);
      }
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

  let currentRowY = CANVAS_START_Y;

  for (const topGroup of topLevelGroups) {
    const children = childrenOf[topGroup.id] || [];
    const directDocs = documents.filter((d: any) => docToGroup[d.id] === topGroup.id);
    let contentY = currentRowY + GROUP_HEADER;

    if (directDocs.length > 0) {
      const { maxRows } = positionDocsInMonthColumns(directDocs, contentY, topGroup.id);
      contentY += maxRows * (DOC_HEIGHT + DOC_GAP_Y);
    }

    if (children.length > 0) {
      if (directDocs.length > 0) contentY += 40;
      children.sort((a: any, b: any) => getWorkflowOrder(a.name) - getWorkflowOrder(b.name));

      for (const child of children) {
        const childDocs = documents.filter((d: any) => docToGroup[d.id] === child.id);
        const childContentY = contentY + GROUP_HEADER;

        if (childDocs.length > 0) {
          const { maxRows } = positionDocsInMonthColumns(childDocs, childContentY, child.id);
          const childHeight = GROUP_HEADER + maxRows * (DOC_HEIGHT + DOC_GAP_Y) + 60;

          const docXValues = childDocs.map((d: any) => {
            const p = documentPositions[d.id];
            return p ? p.x : getMonthCenterX(getYearMonth(d.createdAt).year, getYearMonth(d.createdAt).month);
          });
          const centerX = (Math.min(...docXValues) + Math.max(...docXValues)) / 2;
          groupPositions[child.id] = { x: Math.round(centerX), y: Math.round(contentY + childHeight / 2) };
          contentY += childHeight + CHILD_GROUP_GAP_Y;
        } else {
          const emptyHeight = DOC_HEIGHT + GROUP_HEADER + 60;
          groupPositions[child.id] = { x: getMonthCenterX(2026, 2), y: Math.round(contentY + emptyHeight / 2) };
          contentY += emptyHeight + CHILD_GROUP_GAP_Y;
        }
      }
    }

    // Set top-level group center
    const allDocIds = [...(topGroup.documentIds || [])];
    for (const child of children) {
      allDocIds.push(...(child.documentIds || []));
    }
    const allX = allDocIds
      .map((id: number) => documentPositions[id]?.x)
      .filter((x: number | undefined): x is number => x !== undefined);
    
    if (allX.length > 0) {
      const centerX = (Math.min(...allX) + Math.max(...allX)) / 2;
      const totalHeight = contentY - currentRowY;
      groupPositions[topGroup.id] = { x: Math.round(centerX), y: Math.round(currentRowY + totalHeight / 2) };
    } else {
      groupPositions[topGroup.id] = { x: getMonthCenterX(2026, 2), y: Math.round(currentRowY + 200) };
    }

    currentRowY = contentY + TOP_GROUP_GAP_Y;
  }

  // Handle unpositioned documents
  const unpositionedDocs = documents.filter((d: any) => !documentPositions[d.id]);
  if (unpositionedDocs.length > 0) {
    positionDocsInMonthColumns(unpositionedDocs, currentRowY);
  }

  return { groupPositions, documentPositions };
}
