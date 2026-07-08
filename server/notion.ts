// Notion integration via standard Notion SDK
import { Client } from '@notionhq/client';

export function getNotionApiKey(): string | undefined {
  return process.env.NOTION_API_KEY || process.env.NOTION_TOKEN;
}

export function isNotionConfigured(): boolean {
  return Boolean(getNotionApiKey());
}

export function isNotionOAuthConfigured(): boolean {
  return Boolean(
    process.env.NOTION_OAUTH_CLIENT_ID &&
    process.env.NOTION_OAUTH_CLIENT_SECRET &&
    process.env.NOTION_OAUTH_REDIRECT_URI
  );
}

function assertNotionConfigured(authToken?: string) {
  if (!authToken && !isNotionConfigured()) {
    const error = new Error("Notion is not configured. Set NOTION_API_KEY in the deployment environment.");
    (error as Error & { code?: string }).code = "NOTION_NOT_CONFIGURED";
    throw error;
  }
}

export function getNotionClient(authToken?: string) {
  assertNotionConfigured(authToken);
  return new Client({ auth: authToken || getNotionApiKey() });
}

export type NotionPageSummary = {
  id: string;
  title: string;
  icon?: string;
  lastEditedTime: string;
};

export async function listNotionPages(authToken?: string): Promise<NotionPageSummary[]> {
  const notion = getNotionClient(authToken);
  const response = await notion.search({
    filter: { property: "object", value: "page" },
    sort: { direction: "descending", timestamp: "last_edited_time" },
    page_size: 50,
  });

  return response.results
    .filter((page: any) => page.object === "page")
    .map((page: any) => {
      let title = "Untitled";
      const titleProp = page.properties?.title || page.properties?.Name;
      if (titleProp?.title && titleProp.title.length > 0) {
        title = titleProp.title.map((t: any) => t.plain_text).join("");
      } else if (page.properties) {
        for (const key of Object.keys(page.properties)) {
          const prop = page.properties[key];
          if (prop.type === "title" && prop.title?.length > 0) {
            title = prop.title.map((t: any) => t.plain_text).join("");
            break;
          }
        }
      }

      let icon: string | undefined;
      if (page.icon?.type === "emoji") {
        icon = page.icon.emoji;
      }

      return {
        id: page.id,
        title,
        icon,
        lastEditedTime: page.last_edited_time,
      };
    });
}

export type NotionPageContent = {
  title: string;
  content: string;
  images: string[];
};

export async function fetchNotionPageContent(pageId: string, authToken?: string): Promise<NotionPageContent> {
  const notion = getNotionClient(authToken);
  const page = await notion.pages.retrieve({ page_id: pageId }) as any;

  let title = "Untitled";
  if (page.properties) {
    for (const key of Object.keys(page.properties)) {
      const prop = page.properties[key];
      if (prop.type === "title" && prop.title?.length > 0) {
        title = prop.title.map((t: any) => t.plain_text).join("");
        break;
      }
    }
  }

  const blocks = await getAllBlocks(pageId, authToken);
  const { text, images } = convertBlocksToText(blocks);

  return { title, content: text, images };
}

async function getAllBlocks(blockId: string, authToken?: string): Promise<any[]> {
  const notion = getNotionClient(authToken);
  const blocks: any[] = [];
  let cursor: string | undefined = undefined;

  do {
    const response: any = await notion.blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
      page_size: 100,
    });

    blocks.push(...response.results);
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);

  for (const block of blocks) {
    if (block.has_children && block.type !== "child_page" && block.type !== "child_database") {
      block.children = await getAllBlocks(block.id, authToken);
    }
  }

  return blocks;
}

function extractRichText(richTextArray: any[]): string {
  if (!richTextArray || !Array.isArray(richTextArray)) return "";
  return richTextArray.map((t: any) => t.plain_text || "").join("");
}

function convertBlocksToText(blocks: any[], depth: number = 0): { text: string; images: string[] } {
  const lines: string[] = [];
  const images: string[] = [];
  const indent = "  ".repeat(depth);

  for (const block of blocks) {
    switch (block.type) {
      case "paragraph":
        lines.push(indent + extractRichText(block.paragraph?.rich_text));
        break;
      case "heading_1":
        lines.push("\n" + indent + "# " + extractRichText(block.heading_1?.rich_text));
        break;
      case "heading_2":
        lines.push("\n" + indent + "## " + extractRichText(block.heading_2?.rich_text));
        break;
      case "heading_3":
        lines.push("\n" + indent + "### " + extractRichText(block.heading_3?.rich_text));
        break;
      case "bulleted_list_item":
        lines.push(indent + "- " + extractRichText(block.bulleted_list_item?.rich_text));
        break;
      case "numbered_list_item":
        lines.push(indent + "1. " + extractRichText(block.numbered_list_item?.rich_text));
        break;
      case "to_do":
        const checked = block.to_do?.checked ? "[x]" : "[ ]";
        lines.push(indent + `- ${checked} ` + extractRichText(block.to_do?.rich_text));
        break;
      case "toggle":
        lines.push(indent + "▸ " + extractRichText(block.toggle?.rich_text));
        break;
      case "quote":
        lines.push(indent + "> " + extractRichText(block.quote?.rich_text));
        break;
      case "callout":
        const calloutIcon = block.callout?.icon?.emoji || "";
        lines.push(indent + calloutIcon + " " + extractRichText(block.callout?.rich_text));
        break;
      case "code":
        lines.push(indent + "```" + (block.code?.language || ""));
        lines.push(indent + extractRichText(block.code?.rich_text));
        lines.push(indent + "```");
        break;
      case "divider":
        lines.push(indent + "---");
        break;
      case "image": {
        let imageUrl = "";
        if (block.image?.type === "file") {
          imageUrl = block.image.file.url;
        } else if (block.image?.type === "external") {
          imageUrl = block.image.external.url;
        }
        if (imageUrl) {
          images.push(imageUrl);
          const caption = extractRichText(block.image?.caption);
          lines.push(indent + `[이미지${caption ? ": " + caption : ""}]`);
        }
        break;
      }
      case "bookmark":
        const bookmarkUrl = block.bookmark?.url || "";
        lines.push(indent + `[북마크: ${bookmarkUrl}]`);
        break;
      case "embed":
        const embedUrl = block.embed?.url || "";
        lines.push(indent + `[임베드: ${embedUrl}]`);
        break;
      case "table":
        if (block.children) {
          for (const row of block.children) {
            if (row.type === "table_row") {
              const cells = row.table_row?.cells?.map((cell: any[]) => extractRichText(cell)) || [];
              lines.push(indent + "| " + cells.join(" | ") + " |");
            }
          }
        }
        break;
      default:
        break;
    }

    if (block.children && block.type !== "table") {
      const childResult = convertBlocksToText(block.children, depth + 1);
      if (childResult.text) lines.push(childResult.text);
      images.push(...childResult.images);
    }
  }

  return {
    text: lines.filter(l => l.trim() !== "").join("\n"),
    images,
  };
}
