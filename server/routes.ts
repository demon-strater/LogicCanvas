import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { parseDocumentWithAI, analyzeDocumentWorkflow } from "./ai";
import { insertDocumentSchema, insertNodeSchema, insertEdgeSchema, insertTaskSchema, insertDocumentGroupSchema } from "@shared/schema";
import { z } from "zod";

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
  color: true,
}).partial();

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

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
      
      res.json({
        positions: documentPositions,
        groupPositions,
        edges,
        groups,
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

  const DOC_WIDTH = 320;
  const DOC_HEIGHT = 180;
  const DOC_GAP = 40;
  const GROUP_PADDING = 60;
  const GROUP_GAP = 100;
  const CANVAS_START_X = 150;
  const CANVAS_START_Y = 150;

  // Separate major groups (top-level) from nested groups
  const majorGroups = groups.filter(g => g.level === "major" && !groups.some(p => p.id !== g.id && groups.find(c => c.id === g.id)?.parentId === p.id));
  const docToGroup: Record<number, number> = {};
  
  // Build document-to-group mapping
  for (const group of groups) {
    for (const docId of group.documentIds || []) {
      docToGroup[docId] = group.id;
    }
  }

  // Calculate group sizes based on content
  const groupSizes: Record<number, { width: number; height: number; docCount: number }> = {};
  
  for (const group of groups) {
    const docsInGroup = (group.documentIds || []).length;
    const cols = Math.min(docsInGroup, 3);
    const rows = Math.ceil(docsInGroup / 3);
    
    groupSizes[group.id] = {
      width: Math.max(350, cols * (DOC_WIDTH + DOC_GAP) + GROUP_PADDING * 2),
      height: Math.max(250, rows * (DOC_HEIGHT + DOC_GAP) + GROUP_PADDING * 2 + 60),
      docCount: docsInGroup
    };
  }

  // Position major groups horizontally (left to right = time flow)
  let currentX = CANVAS_START_X;
  
  for (const group of majorGroups) {
    const size = groupSizes[group.id] || { width: 400, height: 300 };
    
    groupPositions[group.id] = {
      x: currentX,
      y: CANVAS_START_Y
    };

    // Position documents inside this group
    const docsInGroup = documents.filter(d => docToGroup[d.id] === group.id);
    let docX = currentX + GROUP_PADDING;
    let docY = CANVAS_START_Y + GROUP_PADDING + 50;
    let colIndex = 0;
    
    for (const doc of docsInGroup) {
      documentPositions[doc.id] = {
        x: docX + DOC_WIDTH / 2,
        y: docY + DOC_HEIGHT / 2,
        groupId: group.id
      };
      
      colIndex++;
      if (colIndex >= 3) {
        colIndex = 0;
        docX = currentX + GROUP_PADDING;
        docY += DOC_HEIGHT + DOC_GAP;
      } else {
        docX += DOC_WIDTH + DOC_GAP;
      }
    }

    currentX += size.width + GROUP_GAP;
  }

  // Handle documents not assigned to any group
  const unassignedDocs = documents.filter(d => !docToGroup[d.id]);
  let ungroupedY = CANVAS_START_Y + 600;
  let ungroupedX = CANVAS_START_X;
  
  for (const doc of unassignedDocs) {
    documentPositions[doc.id] = {
      x: ungroupedX + DOC_WIDTH / 2,
      y: ungroupedY + DOC_HEIGHT / 2
    };
    ungroupedX += DOC_WIDTH + DOC_GAP;
    if (ungroupedX > 1500) {
      ungroupedX = CANVAS_START_X;
      ungroupedY += DOC_HEIGHT + DOC_GAP;
    }
  }

  return { groupPositions, documentPositions };
}
