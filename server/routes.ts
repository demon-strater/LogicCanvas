import type { Express } from "express";
import type { Server } from "http";
import path from "path";
import fs from "fs";
import multer from "multer";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { storage } from "./storage";
import { parseDocumentWithAI, analyzeDocumentWorkflow } from "./ai";
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
}).partial();

const groupUpdateSchema = insertDocumentGroupSchema.pick({
  name: true,
  description: true,
  parentId: true,
  x: true,
  y: true,
  manualWidth: true,
  manualHeight: true,
  color: true,
}).partial();

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

      const ext = path.extname(file.originalname).toLowerCase();
      let text = "";

      if (ext === ".txt" || ext === ".md" || ext === ".text") {
        text = file.buffer.toString("utf-8");
      } else if (ext === ".pdf") {
        const parser = new PDFParse({ data: file.buffer });
        const result = await parser.getText();
        text = result.text;
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

      const suggestedTitle = file.originalname.replace(/\.[^/.]+$/, "");
      res.json({ text: text.trim(), suggestedTitle });
    } catch (error) {
      console.error("File upload error:", error);
      res.status(500).json({ error: "파일 처리 중 오류가 발생했습니다" });
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
      const id = parseInt(req.params.id);
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

      res.json(document);
    } catch (error) {
      console.error("Error parsing document:", error);
      res.status(500).json({ error: "Failed to parse document" });
    }
  });

  app.patch("/api/documents/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updateInput = documentUpdateSchema.safeParse(req.body);
      
      if (!updateInput.success) {
        return res.status(400).json({ error: updateInput.error.errors[0].message });
      }

      const document = await storage.updateDocument(id, updateInput.data);
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
      const id = parseInt(req.params.id);
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
      const documentId = parseInt(req.params.id);
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
      const documentId = parseInt(req.params.id);
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
      const id = parseInt(req.params.id);
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
      const id = parseInt(req.params.id);
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
      const id = parseInt(req.params.id);
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
      const documentId = parseInt(req.params.id);
      const edges = await storage.getEdgesByDocument(documentId);
      res.json(edges);
    } catch (error) {
      console.error("Error fetching edges:", error);
      res.status(500).json({ error: "Failed to fetch edges" });
    }
  });

  app.post("/api/documents/:id/edges", async (req, res) => {
    try {
      const documentId = parseInt(req.params.id);
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
      const id = parseInt(req.params.id);
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
      const id = parseInt(req.params.id);
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
      const documentId = parseInt(req.params.id);
      const tasks = await storage.getTasksByDocument(documentId);
      res.json(tasks);
    } catch (error) {
      console.error("Error fetching tasks:", error);
      res.status(500).json({ error: "Failed to fetch tasks" });
    }
  });

  app.post("/api/documents/:id/tasks", async (req, res) => {
    try {
      const documentId = parseInt(req.params.id);
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
      const id = parseInt(req.params.id);
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
      const id = parseInt(req.params.id);
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
      const id = parseInt(req.params.id);
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
      const id = parseInt(req.params.id);
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
      const id = parseInt(req.params.id);
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

  // Re-layout existing groups and documents (mind-map style diagram)
  app.post("/api/relayout", async (req, res) => {
    try {
      const groups = await storage.getAllGroups();
      const documents = await storage.getAllDocuments();
      const documentEdges = await storage.getAllDocumentEdges();

      if (groups.length === 0 && documents.length === 0) {
        return res.json({ success: true, message: "정렬할 항목이 없습니다" });
      }

      // Layout constants for mind-map style (ultra wide spacing)
      const DOC_WIDTH = 350;
      const DOC_HEIGHT = 200;
      const DOC_GAP_X = 500;
      const DOC_GAP_Y = 400;
      const GROUP_PADDING = 350;
      const GROUP_HEADER = 200;
      const GROUP_GAP = 600;
      const GROUP_GAP_Y = 500; // Vertical gap between groups
      const CANVAS_START_X = 500;
      const CANVAS_START_Y = 200; // Moved up from 500

      // Build connection map for documents
      const docConnections: Record<number, Set<number>> = {};
      for (const edge of documentEdges) {
        if (!docConnections[edge.sourceDocId]) docConnections[edge.sourceDocId] = new Set();
        if (!docConnections[edge.targetDocId]) docConnections[edge.targetDocId] = new Set();
        docConnections[edge.sourceDocId].add(edge.targetDocId);
        docConnections[edge.targetDocId].add(edge.sourceDocId);
      }

      // Build parent-child relationships for groups
      const groupIdSet = new Set(groups.map(g => g.id));
      const childrenOf: Record<number, typeof groups> = {};
      for (const group of groups) {
        if (group.parentId && groupIdSet.has(group.parentId)) {
          if (!childrenOf[group.parentId]) childrenOf[group.parentId] = [];
          childrenOf[group.parentId].push(group);
        }
      }

      // Get workflow stage order for X-axis positioning (left to right)
      const getWorkflowOrder = (name: string): number => {
        const lowerName = name.toLowerCase();
        if (lowerName.includes("리서치") || lowerName.includes("research") || lowerName.includes("조사")) return 0;
        if (lowerName.includes("기획") || lowerName.includes("planning") || lowerName.includes("계획")) return 1;
        if (lowerName.includes("설계") || lowerName.includes("design") || lowerName.includes("디자인")) return 2;
        if (lowerName.includes("실행") || lowerName.includes("execution") || lowerName.includes("개발")) return 3;
        if (lowerName.includes("분석") || lowerName.includes("analysis") || lowerName.includes("평가")) return 4;
        if (lowerName.includes("보고") || lowerName.includes("report") || lowerName.includes("정리")) return 5;
        return 3; // Default to middle
      };

      // Get subgroup order within a workflow stage
      const getSubgroupOrder = (name: string): number => {
        const lowerName = name.toLowerCase();
        if (lowerName.includes("데스크") || lowerName.includes("desk")) return 0;
        if (lowerName.includes("현장") || lowerName.includes("field")) return 1;
        if (lowerName.includes("인터뷰") || lowerName.includes("interview")) return 2;
        if (lowerName.includes("데이터") || lowerName.includes("data")) return 3;
        return 4;
      };

      // Calculate grid layout for documents in a group (spread across X and Y)
      const getDocGridLayout = (docCount: number): { cols: number; rows: number } => {
        if (docCount <= 1) return { cols: 1, rows: 1 };
        if (docCount <= 2) return { cols: 2, rows: 1 };
        if (docCount <= 4) return { cols: 2, rows: 2 };
        if (docCount <= 6) return { cols: 3, rows: 2 };
        const cols = Math.ceil(Math.sqrt(docCount));
        const rows = Math.ceil(docCount / cols);
        return { cols, rows };
      };

      // Calculate content size for a group (child groups are stacked vertically)
      const calculateGroupContentSize = (gId: number): { width: number; height: number } => {
        const docsInGroup = documents.filter(d => d.groupId === gId);
        const children = childrenOf[gId] || [];
        
        // Documents in grid layout
        const grid = getDocGridLayout(docsInGroup.length);
        const docWidth = grid.cols * (DOC_WIDTH + DOC_GAP_X) - DOC_GAP_X;
        const docHeight = grid.rows * (DOC_HEIGHT + DOC_GAP_Y) - DOC_GAP_Y;
        
        // Child groups are stacked VERTICALLY - sum up all their heights
        let maxChildWidth = 0;
        let totalChildHeight = 0;
        
        for (const child of children) {
          const childSize = calculateGroupContentSize(child.id);
          const childGroupWidth = childSize.width + GROUP_PADDING * 2;
          const childGroupHeight = childSize.height + GROUP_HEADER + GROUP_PADDING;
          
          maxChildWidth = Math.max(maxChildWidth, childGroupWidth);
          totalChildHeight += childGroupHeight + GROUP_GAP_Y;
        }
        
        // Remove extra gap after last child
        if (children.length > 0) {
          totalChildHeight -= GROUP_GAP_Y;
        }

        const contentWidth = Math.max(docWidth, maxChildWidth, 300);
        const contentHeight = docHeight + (children.length > 0 ? 100 + totalChildHeight : 0);

        return { 
          width: contentWidth, 
          height: Math.max(150, contentHeight)
        };
      };

      // Get top-level groups and sort by workflow order (horizontal positioning)
      const topLevelGroups = groups
        .filter(g => !g.parentId || !groupIdSet.has(g.parentId))
        .sort((a, b) => getWorkflowOrder(a.name) - getWorkflowOrder(b.name));

      // First pass: calculate all group sizes
      const groupSizes: Map<number, { width: number; height: number }> = new Map();
      
      for (const group of topLevelGroups) {
        const contentSize = calculateGroupContentSize(group.id);
        const groupWidth = contentSize.width + GROUP_PADDING * 2;
        const groupHeight = contentSize.height + GROUP_HEADER + GROUP_PADDING;
        groupSizes.set(group.id, { width: groupWidth, height: groupHeight });
      }
      
      // Second pass: position top-level groups HORIZONTALLY with large gaps
      const groupLayouts: Array<{group: typeof groups[0], width: number, height: number, x: number, y: number}> = [];
      let currentX = CANVAS_START_X;
      const fixedY = CANVAS_START_Y + 100; // All top-level groups at same Y
      
      for (const group of topLevelGroups) {
        const size = groupSizes.get(group.id)!;
        
        groupLayouts.push({
          group,
          width: size.width,
          height: size.height,
          x: currentX,
          y: fixedY
        });
        
        // Move X position for next group (horizontal layout)
        currentX += size.width + GROUP_GAP;
      }
      
      // Second pass: position groups and their documents
      for (const layout of groupLayouts) {
        const { group, width: groupWidth, height: groupHeight, x: currentX, y: currentY } = layout;

        // Store group position (center point)
        await storage.updateGroup(group.id, { 
          x: currentX + groupWidth / 2, 
          y: currentY + groupHeight / 2 
        });

        // Position documents in grid within group
        const docsInGroup = documents.filter(d => d.groupId === group.id);
        const grid = getDocGridLayout(docsInGroup.length);
        
        let docIdx = 0;
        for (let dRow = 0; dRow < grid.rows && docIdx < docsInGroup.length; dRow++) {
          for (let dCol = 0; dCol < grid.cols && docIdx < docsInGroup.length; dCol++) {
            const doc = docsInGroup[docIdx];
            const docX = currentX + GROUP_PADDING + dCol * (DOC_WIDTH + DOC_GAP_X) + DOC_WIDTH / 2;
            const docY = currentY + GROUP_HEADER + dRow * (DOC_HEIGHT + DOC_GAP_Y) + DOC_HEIGHT / 2;
            
            await storage.updateDocument(doc.id, { x: docX, y: docY });
            docIdx++;
          }
        }

        // Position child groups VERTICALLY (stacked) to avoid overlapping
        const children = childrenOf[group.id] || [];
        if (children.length > 0) {
          children.sort((a, b) => getSubgroupOrder(a.name) - getSubgroupOrder(b.name));
          let childY = currentY + GROUP_HEADER + grid.rows * (DOC_HEIGHT + DOC_GAP_Y) + 100;
          const childX = currentX + GROUP_PADDING;
          
          for (const child of children) {
            const childContentSize = calculateGroupContentSize(child.id);
            const childGroupWidth = childContentSize.width + GROUP_PADDING * 2;
            const childGroupHeight = childContentSize.height + GROUP_HEADER + GROUP_PADDING;

            await storage.updateGroup(child.id, { 
              x: childX + childGroupWidth / 2, 
              y: childY + childGroupHeight / 2 
            });

            // Position docs in child group
            const childDocs = documents.filter(d => d.groupId === child.id);
            const childDocGrid = getDocGridLayout(childDocs.length);
            let childDocIdx = 0;
            
            for (let cdRow = 0; cdRow < childDocGrid.rows && childDocIdx < childDocs.length; cdRow++) {
              for (let cdCol = 0; cdCol < childDocGrid.cols && childDocIdx < childDocs.length; cdCol++) {
                const cdoc = childDocs[childDocIdx];
                const cdocX = childX + GROUP_PADDING + cdCol * (DOC_WIDTH + DOC_GAP_X) + DOC_WIDTH / 2;
                const cdocY = childY + GROUP_HEADER + cdRow * (DOC_HEIGHT + DOC_GAP_Y) + DOC_HEIGHT / 2;
                
                await storage.updateDocument(cdoc.id, { x: cdocX, y: cdocY });
                childDocIdx++;
              }
            }

            // Stack child groups vertically with large gap
            childY += childGroupHeight + GROUP_GAP_Y;
          }
        }
      }

      // Find the maximum Y position used by groups
      const maxGroupY = groupLayouts.reduce((max, layout) => 
        Math.max(max, layout.y + layout.height), CANVAS_START_Y);

      // Handle ungrouped documents in a grid at the bottom
      const ungroupedDocs = documents.filter(d => !d.groupId);
      if (ungroupedDocs.length > 0) {
        const ungroupedGrid = getDocGridLayout(ungroupedDocs.length);
        let udIdx = 0;
        const ungroupedStartY = maxGroupY + 100;
        
        for (let row = 0; row < ungroupedGrid.rows && udIdx < ungroupedDocs.length; row++) {
          for (let col = 0; col < ungroupedGrid.cols && udIdx < ungroupedDocs.length; col++) {
            const doc = ungroupedDocs[udIdx];
            await storage.updateDocument(doc.id, {
              x: CANVAS_START_X + col * (DOC_WIDTH + DOC_GAP_X) + DOC_WIDTH / 2,
              y: ungroupedStartY + row * (DOC_HEIGHT + DOC_GAP_Y) + DOC_HEIGHT / 2
            });
            udIdx++;
          }
        }
      }

      res.json({ success: true, message: "다이어그램 형태로 재정렬되었습니다 (X/Y축 활용)" });
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

// Calculate layout positions for documents organized in groups
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

  const DOC_WIDTH = 280;
  const DOC_HEIGHT = 160;
  const DOC_GAP = 24;
  const GROUP_PADDING = 32;
  const GROUP_GAP = 48;
  const CANVAS_START_X = 80;
  const CANVAS_START_Y = 80;
  const MAX_COLS_PER_GROUP = 2; // 그룹 내 문서 최대 2열
  const TOP_LEVEL_COLS = 3; // 대그룹 3열 배치

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

  // Calculate group sizes recursively (includes children's sizes)
  function calculateGroupSize(group: any, depth: number = 0): { width: number; height: number } {
    const docsInGroup = (group.documentIds || []).length;
    const maxCols = depth === 0 ? MAX_COLS_PER_GROUP : 2;
    const cols = Math.max(1, Math.min(docsInGroup, maxCols));
    const rows = Math.max(1, Math.ceil(docsInGroup / maxCols));
    
    let baseWidth = Math.max(320, cols * (DOC_WIDTH + DOC_GAP) + GROUP_PADDING * 2);
    let baseHeight = rows * (DOC_HEIGHT + DOC_GAP) + GROUP_PADDING * 2 + 48;

    // Add space for children (stack vertically for compact layout)
    const children = childrenOf[group.id] || [];
    if (children.length > 0) {
      let maxChildWidth = 0;
      let totalChildHeight = 0;
      for (const child of children) {
        const childSize = calculateGroupSize(child, depth + 1);
        maxChildWidth = Math.max(maxChildWidth, childSize.width);
        totalChildHeight += childSize.height + DOC_GAP;
      }
      baseWidth = Math.max(baseWidth, maxChildWidth + GROUP_PADDING * 2);
      baseHeight += totalChildHeight;
    }

    return { width: baseWidth, height: Math.max(200, baseHeight) };
  }

  // Recursive function to position a group and its contents
  function positionGroup(
    group: any, 
    startX: number, 
    startY: number,
    depth: number = 0
  ): { width: number; height: number } {
    groupPositions[group.id] = { x: startX, y: startY };

    const headerOffset = 40 + depth * 8;
    let currentY = startY + headerOffset;
    const maxCols = depth === 0 ? MAX_COLS_PER_GROUP : 2;

    // Position documents in this group
    const docsInGroup = documents.filter(d => docToGroup[d.id] === group.id);
    let docX = startX + GROUP_PADDING;
    let colIndex = 0;
    
    for (const doc of docsInGroup) {
      documentPositions[doc.id] = {
        x: docX + DOC_WIDTH / 2,
        y: currentY + DOC_HEIGHT / 2,
        groupId: group.id
      };
      
      colIndex++;
      if (colIndex >= maxCols) {
        colIndex = 0;
        docX = startX + GROUP_PADDING;
        currentY += DOC_HEIGHT + DOC_GAP;
      } else {
        docX += DOC_WIDTH + DOC_GAP;
      }
    }
    
    if (docsInGroup.length > 0 && colIndex !== 0) {
      currentY += DOC_HEIGHT + DOC_GAP;
    }

    // Position child groups vertically (stacked for compact layout)
    const children = childrenOf[group.id] || [];
    for (const child of children) {
      const childSize = positionGroup(child, startX + GROUP_PADDING, currentY, depth + 1);
      currentY += childSize.height + DOC_GAP;
    }

    if (children.length > 0) {
      currentY += GROUP_PADDING / 2;
    } else {
      currentY += GROUP_PADDING;
    }

    return calculateGroupSize(group, depth);
  }

  // Position top-level groups in a grid (3 columns)
  const topLevelGroups = groups.filter(g => !g.parentId || !groupIdSet.has(g.parentId));
  
  // Calculate sizes first to determine column heights
  const groupSizes = topLevelGroups.map(g => calculateGroupSize(g, 0));
  
  // Arrange in columns using a balanced approach
  const columnHeights = Array(TOP_LEVEL_COLS).fill(CANVAS_START_Y);
  const columnX = Array(TOP_LEVEL_COLS).fill(0).map((_, i) => 
    CANVAS_START_X + i * (Math.max(...groupSizes.map(s => s.width)) + GROUP_GAP)
  );
  
  for (let i = 0; i < topLevelGroups.length; i++) {
    // Find the shortest column
    const minColIndex = columnHeights.indexOf(Math.min(...columnHeights));
    const group = topLevelGroups[i];
    const size = positionGroup(group, columnX[minColIndex], columnHeights[minColIndex], 0);
    columnHeights[minColIndex] += size.height + GROUP_GAP;
  }

  // Handle any unpositioned documents
  const unpositionedDocs = documents.filter(d => !documentPositions[d.id]);
  let ungroupedY = CANVAS_START_Y + 700;
  let ungroupedX = CANVAS_START_X;
  
  for (const doc of unpositionedDocs) {
    documentPositions[doc.id] = {
      x: ungroupedX + DOC_WIDTH / 2,
      y: ungroupedY + DOC_HEIGHT / 2
    };
    ungroupedX += DOC_WIDTH + DOC_GAP;
    if (ungroupedX > 1600) {
      ungroupedX = CANVAS_START_X;
      ungroupedY += DOC_HEIGHT + DOC_GAP;
    }
  }

  return { groupPositions, documentPositions };
}
