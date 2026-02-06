# LogicCanvas

## Overview

LogicCanvas is a cognitive mapping application that transforms complex documents into interactive visual logic maps. Users can upload or paste documents, which are then processed by AI to extract key concepts, claims, evidence, and questions. These elements are visualized as an interactive node-graph canvas where users can explore relationships, tag important nodes, and manage related tasks.

The application follows a full-stack TypeScript architecture with a React frontend and Express backend, using PostgreSQL for data persistence and OpenAI for document parsing.

## User Preferences

Preferred communication style: Simple, everyday language.
UI Language: Korean (한국어)

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state, local React state for UI
- **Styling**: Tailwind CSS with shadcn/ui component library (New York style)
- **Build Tool**: Vite with custom plugins for Replit integration

The frontend is a single-page application centered around an interactive canvas. Key components include:
- `GraphCanvas`: Force-directed graph visualization using custom physics simulation
- `DocumentsSidebar`: Document management and selection
- `NodeDetailPanel`: Node editing and tagging interface
- `TaskPanel`: Task management linked to document nodes

### Backend Architecture
- **Framework**: Express 5 (ESM modules)
- **Language**: TypeScript compiled with tsx
- **API Style**: RESTful JSON API under `/api/*` routes

The backend provides:
- Document CRUD operations with AI-powered parsing
- Node and edge management for the graph structure
- Task management linked to documents and nodes
- Storage abstraction through `IStorage` interface

### Data Storage
- **Database**: PostgreSQL via `pg` driver
- **ORM**: Drizzle ORM with Zod schema validation
- **Schema Location**: `shared/schema.ts` (shared between frontend and backend)

Core entities:
- `documents`: Source content that gets parsed, with x/y position data for canvas placement
- `documentEdges`: Relationships between documents (flow, depends, related, parent types)
- `documentGroups`: Hierarchical groups to organize documents (name, description, parentId, color, x/y position)
- `groupEdges`: Relationships between groups (similar to documentEdges)
- `nodes`: Extracted concepts with position, type, and tagging
- `edges`: Relationships between nodes (related, supports, contradicts, implies)
- `tasks`: Work items linked to documents
- `users`: Authentication support (prepared for future use)

### Group System
Documents can be organized into hierarchical groups:
- Groups can have a parent group (parentId) creating nested hierarchies
- Each group has a color for visual distinction (10 preset colors available)
- Groups are rendered as boxes on the canvas that can be expanded/collapsed
- Documents can belong to a group via groupId field
- Ungrouped documents are displayed directly on the canvas root level
- Groups support drag-and-drop positioning with Ctrl+Z undo support

### AI Integration
- **Provider**: OpenAI API (via Replit AI Integrations)
- **Model**: GPT for document parsing and workflow analysis
- **Purpose**: 
  - Extract logical structure (concepts, claims, evidence, questions) and relationships from text
  - Analyze multiple documents to identify workflow relationships, dependencies, and hierarchies
  - **Simple hierarchical grouping** of documents into:
    - **대그룹 (Major Groups)**: Broad workflow stages (리서치, 기획, 실행, 분석) — only 2-4 groups
    - **중그룹 (Medium Groups)**: Only created when a major group has 5+ documents
    - No minor groups (소그룹) — keep hierarchy flat and simple

The AI returns structured JSON matching the `ParseResult` type for document parsing, or workflow analysis data with positions, edges, and group definitions for document layout. Groups are automatically created and documents are assigned based on content analysis and business flow. Results are stored in the database.

### Document Canvas Features
- **Timeline Layout**: Documents positioned on X axis by createdAt date, each month column = 800px wide
  - Formula: X = 150 + monthIndex * 800 + 400, where monthIndex = (year - 2025) * 12 + month - 12
  - Timeline starts Dec 2025 (month 12), extends dynamically based on document dates
  - Within same month, docs arrange in 2-column grid to prevent overlap
  - Top-level groups stack vertically as swim lanes
- **Connection Lines**: SVG-based arrows connecting related documents with color-coded edge types:
  - Flow (primary): Sequential workflow steps
  - Depends (red): Dependency relationships  
  - Parent (green): Hierarchical relationships
  - Related (muted dashed): General associations
- **Dynamic Timeline**: Month range auto-expands when new documents are added to future months

### Build and Development
- **Development**: `tsx` for direct TypeScript execution with Vite dev server
- **Production Build**: esbuild for server, Vite for client
- **Database Migrations**: Drizzle Kit with `db:push` command

## External Dependencies

### Database
- **PostgreSQL**: Required, connection via `DATABASE_URL` environment variable
- **connect-pg-simple**: Session storage (prepared for auth)

### AI Services
- **OpenAI API**: Document parsing via Replit AI Integrations
  - Requires `AI_INTEGRATIONS_OPENAI_API_KEY` and `AI_INTEGRATIONS_OPENAI_BASE_URL` environment variables

### Replit Integrations
The `server/replit_integrations/` and `client/replit_integrations/` directories contain optional integrations for:
- **Audio**: Voice chat with speech-to-text and text-to-speech
- **Image**: Image generation via OpenAI
- **Chat**: Conversation management for AI chat interfaces
- **Batch**: Rate-limited batch processing utilities

These are pre-built utilities that can be enabled by registering their routes.

### Key NPM Packages
- **Frontend**: React, TanStack Query, Radix UI primitives, Tailwind CSS
- **Backend**: Express, Drizzle ORM, OpenAI SDK, Zod
- **Shared**: drizzle-zod for schema validation