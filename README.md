# Geppetto

> A keyboard-first Git workflow manager with intelligent AI agent assistance for power users.

Geppetto is a modern desktop application for managing Git-oriented workflows with seamless worktree management, multi-agent orchestration, and team collaboration. Built for developers who think in keyboard shortcuts and need AI agents working alongside them on GitHub/GitLab issues.

[![Watch the video](GeppettoThumbnail.jpg)](https://drive.google.com/file/d/1S6wbT_0SuZVjtQbAZM1wi9qU4lKYolQ5/preview)

## Overview

Geppetto combines the best of traditional Git clients with AI-powered automation:

- **Keyboard-First Navigation**: Complete keyboard control across the entire application with intelligent layer management
- **AI Agent Orchestration**: Spawn and monitor multiple AI agents (Claude, OpenAI, Cursor) working on issues simultaneously
- **Git Worktree Management**: Create, switch, and manage worktrees with visual indicators for agent activity
- **Multi-Account Support**: Switch between unlimited GitHub/GitLab accounts (Pro tier)
- **Hardware-Accelerated Git Graph**: WebGL-powered commit visualization with real-time search and filtering
- **Team Collaboration**: Companion SaaS service for enhanced team productivity (coming soon)

### Free vs Pro Tiers

Just some ideas of how to split this app into tiers. It's likely the full featured Electron app is all free - and a partnered service is paid.

#### Old Intentions:

**Free Tier**: Single GitHub account, core features, local AI agent support

**Pro Tier**: Unlimited accounts, multi-provider AI support, team collaboration features

## Power User Features

### Comprehensive Keyboard Navigation

Geppetto is designed for developers who prefer keyboards over mice. Every feature is accessible via keyboard shortcuts.

#### Global Shortcuts

| Shortcut | Action |
|----------|--------|
| `/` | Focus search |
| `Ctrl/Cmd + Shift + G` | Toggle overlay display |
| `Esc` | Clear selection / Close panels |

#### Repository Dropdown Navigation

| Shortcut | Action |
|----------|--------|
| `↑` / `↓` | Navigate menu items |
| `Enter` | Select focused item |
| `Esc` | Close dropdown |
| `Home` / `End` | Jump to first/last item |

#### Issues Modal Navigation

| Shortcut | Action |
|----------|--------|
| `↑` / `↓` | Navigate issues |
| `Space` | Toggle issue selection (shortlist) |
| `←` / `→` | Cycle AI agent for selected issue |
| `Enter` | Launch AI watchers for shortlisted issues |
| `Esc` | Close modal |

### Intelligent Keyboard Layer Management

Geppetto features a sophisticated keyboard layer system that prevents shortcut conflicts:

- **Layer Stack**: Modal → Dropdown → Carousel → Default
- **Context-Aware**: Active layer determines which shortcuts are available
- **IPC Coordination**: Main process and renderer stay synchronized
- **Visual Feedback**: Clear indicators show active layer and available shortcuts

**Example**: When Issues Modal is open, carousel arrow keys (Left/Right) are disabled in the main process, allowing the modal to handle agent selection. When modal closes, carousel controls automatically re-enable.

### Per-Issue AI Agent Selection

Each shortlisted issue can have its own AI agent:

- **Visual Badges**: See which agent is assigned to each issue
- **Quick Switching**: Use `←` / `→` to cycle agents while navigating issues
- **Smart Defaults**: Falls back to global provider selector
- **Launch Coordination**: Each agent starts working on its assigned issue with the appropriate provider

## AI Agent Features

### Multi-Provider Support

- **OpenAI**: GPT-4 and GPT-3.5 models
- **Claude**: Anthropic's Claude models
- **Cursor**: Cursor AI integration
- **Hexagonal Architecture**: Easily add new providers via ports & adapters pattern

### Agent Monitoring

- **Visual Indicators**: Real-time status badges (Pending, Running, Complete, Failed)
- **Usage Tracking**: Monitor AI provider usage across all agents
- **Live Updates**: Reactive state management shows agent progress in real-time
- **Per-Agent Logs**: View detailed output from each AI agent

### Worktree Integration

- **Automatic Worktree Creation**: Agents can create worktrees for isolated issue work
- **Parallel Processing**: Multiple agents working on different issues in separate worktrees
- **Clean Separation**: Each issue gets its own workspace with dedicated AI assistance

## Git Visualization

### Hardware-Accelerated Commit Graph

Built with PixiJS and WebGL for 60fps performance:

- **Interactive Graph**: Click commits to view details, right-click for context menu
- **Real-Time Search**: Client-side filtering by message, hash, author, or content
- **Smart Filtering**: Branch multi-select, author dropdown, max commits slider
- **Zoom & Pan**: Mouse wheel zoom (0.5x - 2.0x), click-drag panning
- **Display Settings**: Toggle merge commits, branch/tag labels, persist to localStorage

### Commit Details Panel

- **Full Information**: Hash, author, date, message, parent commits
- **File Changes**: Status badges (A/M/D/R), line additions/deletions
- **Tabs Interface**: Changes / Diff / Stats views
- **Side-by-Side Layout**: Graph and details simultaneously

## Technology Stack

### Modern Functional Architecture

- **Effect**: Functional programming with dependency injection, structured concurrency, and error handling
- **Effect Schema**: Runtime type validation across process boundaries
- **Effect Atoms**: Reactive state management with TTL caching and Result types
- **TypeScript**: Full end-to-end type safety (no `any` types)
- **Electron**: Three-process architecture (Main / Preload / Renderer)
- **React**: UI layer with Effect Atom integration
- **PixiJS v8**: Hardware-accelerated WebGL rendering

### Hexagonal Architecture

Geppetto uses Layer-based Hexagonal Architecture (Ports & Adapters):

- **Hot-Swappable Adapters**: Replace implementations for testing/mocking
- **Multi-Provider Orchestration**: Access multiple AI providers simultaneously
- **Clean Dependency Injection**: Adapters captured at construction time
- **Zero Coupling**: Business logic depends on abstract ports, not concrete implementations

**Example**: Adding a new AI provider (e.g., Gemini) requires only implementing the `AiProviderPort` interface and adding to `AdaptersLayer`. The registry auto-discovers it, IPC handlers work automatically, and the renderer can query via atoms.

## Development

### Prerequisites

- Node.js 18+
- pnpm 8+

### Setup

```bash
# Clone repository
git clone https://github.com/yourusername/geppetto.git
cd geppetto

# Install dependencies
pnpm install

# Setup environment
cp .env.example .env
# Edit .env with your GitHub OAuth credentials
```

### Development Commands

```bash
# Development with hot reload
pnpm dev              # Default (free tier)
pnpm dev:free         # Free tier build
pnpm dev:pro          # Pro tier build

# Compile application
pnpm compile:app       # Default
pnpm compile:app:free  # Free tier
pnpm compile:app:pro   # Pro tier

# Build packages
pnpm build             # Default
pnpm build:free        # Free tier package
pnpm build:pro         # Pro tier package
pnpm build:all         # Build both tiers

# Release (publish to GitHub/stores)
pnpm release           # Default
pnpm release:free      # Release free tier
pnpm release:pro       # Release pro tier

# Lint code
pnpm lint
pnpm lint:fix          # with auto-fix

# Clean development artifacts
pnpm clean:dev
```

### Environment Variables

**Required in `.env`**:
```bash
GITHUB_CLIENT_ID=your_github_oauth_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_client_secret
STORE_ENCRYPTION_KEY=your_secure_encryption_key
```

**Tier-specific (`.env.free`, `.env.pro`)**:
```bash
APP_TIER=free  # or "pro"
APP_NAME="Geppetto Free"  # or "Geppetto Pro"
APP_ID_SUFFIX=free  # or "pro"
```

## Architecture Highlights

### Three-Process Electron Architecture

1. **Main Process** (`src/main/`): Node.js environment with Effect Services for API operations and IPC handlers
2. **Preload Script** (`src/preload/`): Secure IPC bridge exposing typed APIs to renderer via `contextBridge`
3. **Renderer Process** (`src/renderer/`): React app using Effect Atoms for reactive state management

### Type-Safe IPC Communication

All IPC uses contract-based schemas with Effect Schema:

- **Runtime Validation**: Automatic validation at process boundaries
- **Error Mapping**: Domain errors → IPC errors → Shared schemas
- **Full Type Safety**: Extract types from schemas, end-to-end inference
- **Auto Registration**: `registerIpcHandler` utility handles validation, encoding, and error mapping

### Reactive State Management

Effect Atoms provide React integration with:

- **Atom Families**: Parameterized queries like `reposAtom(username)`, `aiUsageAtom(provider)`
- **Reactivity Keys**: Cache invalidation (`['account:context']`, `['github:auth']`)
- **TTL Caching**: `Atom.setIdleTTL(Duration.minutes(5))`
- **Result<T, E> Types**: Three states (`Initial`, `Success<T>`, `Failure<E>`) with builder pattern for UI rendering

### Domain-Driven Organization

Organized by domains (GitHub, AI, Account) with:

- **Ports**: Abstract interfaces defining contracts
- **Adapters**: Concrete implementations as Effect Layers
- **Services**: Business logic and orchestration
- **Errors**: Domain-specific error classes using `Data.TaggedError`
- **Schemas**: Domain-specific data models with Effect Schema

## Documentation

Comprehensive documentation in `docs/`:

### Core Architecture
- `EFFECT_ATOM_IPC_GUIDE.md`: Effect Atom + IPC integration, data flow, and patterns
- `RESULT_ERROR_HANDLING_PATTERNS.md`: Type-safe error handling patterns
- `RESULT_API_AND_ERROR_HANDLING.md`: Result.builder API reference

### Hexagonal Architecture
- `EFFECT_PORTS_AND_LAYERS_GUIDE.md`: Ports/adapters patterns with examples and anti-patterns
- `AI_ADAPTERS_HEXAGONAL_ARCHITECTURE.md`: Hexagonal architecture deep dive
- `AI_PROVIDER_LIFECYCLE.md`: Provider lifecycle and memoization
- `AI_LAYERS_HEXAGONAL_AGENTS_BENEFIT.md`: Multi-provider patterns for AI agents

### Features
- `KEYBOARD_LAYER_MANAGEMENT.md`: Keyboard layer system implementation
- `git-tree-ui-usage.md`: Git graph visualization user guide
- `git-tree-ui-plan.md`: Git graph design document

## Contributing

We welcome contributions! Please see `CONTRIBUTING.md` for guidelines.

### Key Principles

1. **Hexagonal Architecture**: Use Ports & Adapters for multi-provider domains
2. **Interface Constraint Pattern**: Preserve TypeScript type inference in Effect.gen functions
3. **Layer Memoization**: Share infrastructure via module-level constants
4. **Type Safety**: NO `any` types - use proper TypeScript patterns
5. **Effect Generators**: `Effect.gen` for all async operations
6. **Keyboard-First**: All features must be keyboard accessible

## License

AGPL-3.0 License - see `LICENSE` file for details.

Copyright (C) 2025 Kenneth Udovic

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published bythe Free Software Foundation, either version 3 of the License, or
(at your option) any later version.


## Team Collaboration (Coming Soon)

The companion SaaS service will add:

- **Team Workspaces**: Shared repositories and worktrees across team members
- **Cloud-Powered AI**: Access to cloud-hosted AI agents with team-wide usage tracking
- **Collaboration Features**: Real-time agent status sharing, team issue assignment
- **Enhanced Monitoring**: Team-wide analytics and AI usage insights

---

**Built with Effect, React, and Electron** • **Powered by PixiJS for 60fps visualization** • **Designed for keyboard warriors**
