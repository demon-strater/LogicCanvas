import { storage } from "./storage";
import { listNotionPages, fetchNotionPageContent } from "./notion";
import { parseDocumentWithAI, assignDocumentToGroup } from "./ai";
import { log } from "./index";

let syncInterval: ReturnType<typeof setInterval> | null = null;
let lastSyncTime: Date | null = null;
let syncEnabled = true;
let isSyncing = false;
let lastSyncResult: { imported: number; skipped: number; errors: number } | null = null;

const SYNC_INTERVAL_MS = 5 * 60 * 1000;

export function getSyncStatus() {
  return {
    enabled: syncEnabled,
    lastSyncTime: lastSyncTime?.toISOString() || null,
    isSyncing,
    lastSyncResult,
    intervalMs: SYNC_INTERVAL_MS,
  };
}

export function setSyncEnabled(enabled: boolean) {
  syncEnabled = enabled;
  if (enabled && !syncInterval) {
    startSyncLoop();
  } else if (!enabled && syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

export async function importSingleNotionPage(pageId: string): Promise<any | null> {
  const pageContent = await fetchNotionPageContent(pageId);

  if (!pageContent.content.trim()) {
    return null;
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
      return updatedDoc || document;
    }
  } catch {
  }

  return document;
}

export async function syncNotionPages(): Promise<{ imported: number; skipped: number; errors: number; busy?: boolean }> {
  if (isSyncing) {
    return { imported: 0, skipped: 0, errors: 0, busy: true };
  }

  isSyncing = true;
  const result = { imported: 0, skipped: 0, errors: 0 };

  try {
    const notionPages = await listNotionPages();
    const existingDocs = await storage.getAllDocuments();
    const existingNotionIds = new Set(
      existingDocs
        .filter(d => d.notionPageId)
        .map(d => d.notionPageId!)
    );

    const newPages = notionPages.filter(page => !existingNotionIds.has(page.id));

    if (newPages.length === 0) {
      lastSyncTime = new Date();
      lastSyncResult = result;
      isSyncing = false;
      return result;
    }

    log(`Notion sync: ${newPages.length} new pages found`, "notion-sync");

    for (const page of newPages) {
      try {
        const doc = await importSingleNotionPage(page.id);
        if (doc) {
          result.imported++;
          log(`Notion sync: imported "${page.title}"`, "notion-sync");
        } else {
          result.skipped++;
        }
      } catch (err) {
        result.errors++;
        log(`Notion sync: error importing "${page.title}": ${err}`, "notion-sync");
      }
    }

    lastSyncTime = new Date();
    lastSyncResult = result;
  } catch (err) {
    log(`Notion sync: failed to sync: ${err}`, "notion-sync");
    result.errors++;
    lastSyncTime = new Date();
    lastSyncResult = result;
  } finally {
    isSyncing = false;
  }

  return result;
}

export function startSyncLoop() {
  if (syncInterval) {
    clearInterval(syncInterval);
  }

  syncInterval = setInterval(async () => {
    if (!syncEnabled) return;
    try {
      await syncNotionPages();
    } catch (err) {
      log(`Notion sync loop error: ${err}`, "notion-sync");
    }
  }, SYNC_INTERVAL_MS);

  log(`Notion auto-sync started (interval: ${SYNC_INTERVAL_MS / 1000}s)`, "notion-sync");
}

export function stopSyncLoop() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}
