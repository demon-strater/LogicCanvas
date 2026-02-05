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
- `documents`: Source content that gets parsed
- `nodes`: Extracted concepts with position, type, and tagging
- `edges`: Relationships between nodes (related, supports, contradicts, implies)
- `tasks`: Work items linked to documents
- `users`: Authentication support (prepared for future use)

### AI Integration
- **Provider**: OpenAI API (via Replit AI Integrations)
- **Model**: GPT for document parsing
- **Purpose**: Extract logical structure (concepts, claims, evidence, questions) and relationships from text

The AI returns structured JSON matching the `ParseResult` type, which is then stored as nodes and edges in the database.

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