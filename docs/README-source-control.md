# Source Control Domain Documentation

## Overview

The source control domain in Geppetto provides comprehensive git functionality through a unified hexagonal architecture that integrates:
- Local git operations (status, commit, branch, merge)
- Online repository providers (GitHub, GitLab, Bitbucket)
- Git visualization (commit graphs, diff views)
- Repository management and discovery

## Documentation Structure

### 📐 Architecture Documents

1. **[source-control-hexagonal-architecture.md](./source-control-hexagonal-architecture.md)**
   - Complete hexagonal architecture design
   - Port definitions (primary and secondary)
   - Adapter specifications
   - Domain model and services
   - Migration strategy from existing code

2. **[source-control-implementation-roadmap.md](./source-control-implementation-roadmap.md)**
   - 4-week implementation timeline
   - Day-by-day tasks with code examples
   - Migration checklist
   - Testing strategy
   - Risk mitigation

### 🌳 Git Tree Visualization (Legacy)

These documents describe the original Git Tree visualization plan, now integrated into the broader source-control domain:

3. **[git-tree-plan.md](./git-tree-plan.md)**
   - Original Git Tree implementation plan
   - Now superseded but contains valuable commit graph algorithms
   - Maps to new architecture components

4. **[git-tree-progress.md](./git-tree-progress.md)**
   - Progress tracker updated for new architecture
   - Week-by-week implementation timeline
   - Checklist of tasks

5. **[git-tree-implementation-prompts.md](./git-tree-implementation-prompts.md)**
   - Implementation prompts for AI-assisted development
   - Updated to reference new architecture

## Quick Start

### For Implementers

1. **Start Here**: Read [source-control-hexagonal-architecture.md](./source-control-hexagonal-architecture.md) to understand the overall design
2. **Follow Roadmap**: Use [source-control-implementation-roadmap.md](./source-control-implementation-roadmap.md) for step-by-step implementation
3. **Track Progress**: Update [git-tree-progress.md](./git-tree-progress.md) as you complete tasks
4. **Use Prompts**: Copy prompts from [git-tree-implementation-prompts.md](./git-tree-implementation-prompts.md) for AI assistance

### Key Directories

```
src/
├── main/
│   └── source-control/           # Main implementation directory
│       ├── domain/               # Domain logic (aggregates, value objects)
│       ├── ports/                # Port interfaces
│       │   ├── primary/          # UI-facing ports
│       │   └── secondary/        # Infrastructure ports
│       ├── adapters/             # Port implementations
│       │   ├── git/              # Git command execution
│       │   ├── file-system/      # File operations
│       │   └── providers/        # GitHub, GitLab, Bitbucket
│       └── services/             # Application services
│
├── shared/
│   └── schemas/
│       └── source-control/       # Shared schemas and types
│
└── renderer/
    ├── atoms/
    │   └── source-control-atoms.ts  # Reactive state
    └── components/
        └── source-control/           # UI components
```

## Architecture Highlights

### Hexagonal Architecture Benefits

- **Clear Boundaries**: Domain logic isolated from infrastructure
- **Testability**: All components testable via mock ports
- **Extensibility**: Easy to add new providers or git features
- **Maintainability**: Clear separation of concerns

### Key Components

1. **Domain Layer**
   - `Repository` aggregate: Represents a git repository
   - `CommitGraph` aggregate: Manages commit DAG structure
   - `WorkingTree` aggregate: Tracks file changes

2. **Port Layer**
   - Primary ports: Called by UI (e.g., `RepositoryManagementPort`)
   - Secondary ports: Implemented by infrastructure (e.g., `GitExecutorPort`)

3. **Adapter Layer**
   - `NodeGitExecutor`: Executes git commands via child_process
   - `GitHubProviderAdapter`: Integrates with GitHub API
   - `NodeFileSystemAdapter`: File system operations

4. **Service Layer**
   - `RepositoryService`: Repository discovery and management
   - `CommitGraphService`: Graph building and caching
   - `GitWorkflowService`: High-level git operations
   - `SyncService`: Remote synchronization

## Implementation Status

### Current State
- ✅ Basic git command execution (`NodeGitCommandRunner`)
- ✅ GitHub integration
- ✅ Account management
- ⏳ Repository discovery
- ⏳ Commit graph visualization
- ⏳ Provider abstraction
- ⏳ Git workflow operations

### Next Steps
1. Implement Week 1 tasks (domain model and ports)
2. Refactor existing code to new architecture
3. Build repository and graph services
4. Create UI components

## Related Documentation

- [CLAUDE.md](../CLAUDE.md) - Project conventions and patterns
- Effect Documentation: https://effect.website
- Hexagonal Architecture: https://alistair.cockburn.us/hexagonal-architecture/

## Contributing

When implementing new features:

1. Follow the hexagonal architecture pattern
2. Define ports before implementing adapters
3. Use Effect for all async operations
4. Maintain strict type safety (no `any` types)
5. Update progress tracking documents
6. Write tests for all new code

## Questions?

For questions about the architecture or implementation, refer to:
- Architecture design: `source-control-hexagonal-architecture.md`
- Implementation details: `source-control-implementation-roadmap.md`
- Progress tracking: `git-tree-progress.md`