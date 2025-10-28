# Git Tree Implementation Prompts

> **Updated**: The Git Tree implementation is now part of the comprehensive source-control domain. Use these updated prompts that reference the new architecture.

## 1. Initial Implementation Prompt (Source Control Domain)

Implement the source-control domain following the hexagonal architecture in `/docs/source-control-hexagonal-architecture.md` and the roadmap in `/docs/source-control-implementation-roadmap.md`. Start with Week 1, Day 1-2: Domain Model Setup. Create the directory structure under `src/main/source-control/domain/` with aggregates, value objects, and domain events. Follow the Effect-TS patterns, hexagonal architecture principles, and type-safety requirements from CLAUDE.md exactly. Update `/docs/git-tree-progress.md` after completing each day's tasks. The Git Tree visualization features are now part of the CommitGraphService and UI components.

## 2. Continue Progress Prompt (Source Control Domain)

Continue implementing the source-control domain from where you left off. Check `/docs/git-tree-progress.md` for completed items in the "New Implementation Timeline" section, then proceed with the next uncompleted day from `/docs/source-control-implementation-roadmap.md`. Update the progress document after each section. Key focus areas:
- Wrap existing `NodeGitCommandRunner` as `GitExecutorPort` adapter
- Build `RepositoryService` and `CommitGraphService`
- Create IPC contracts under `SourceControlIpcContracts`
- Maintain strict type safety, Effect patterns, and hexagonal architecture principles

## 3. Resume After Context Loss Prompt (Source Control Domain)

Resume the source-control domain implementation. First, analyze the current state by:
1) Reading `/docs/git-tree-progress.md` "New Implementation Timeline" section to see what's completed
2) Checking which files from `/docs/source-control-implementation-roadmap.md` exist in:
   - `src/main/source-control/domain/`
   - `src/main/source-control/ports/`
   - `src/main/source-control/adapters/`
   - `src/main/source-control/services/`
3) Reviewing existing code in `src/main/source-control/` to understand what can be refactored
4) Running `git status` and `git log -5 --oneline` to see recent changes

Then continue from the next uncompleted day in the roadmap. The Git Tree features are integrated as part of CommitGraphService and related UI components. Update the progress document as you complete sections. Follow CLAUDE.md patterns and hexagonal architecture principles exactly.

## 4. Provider Integration Prompt

Add a new provider (GitLab or Bitbucket) to the source-control domain. Follow the provider abstraction pattern in `/docs/source-control-hexagonal-architecture.md` Section "Provider Port Abstraction". Steps:
1) Create new adapter in `src/main/source-control/adapters/providers/{provider}/`
2) Implement `ProviderPort` interface
3) Add to provider factory
4) Update IPC contracts if needed
5) Follow the GitHub adapter pattern as reference
Maintain Effect patterns and type safety throughout.

## 5. Testing Implementation Prompt

Implement tests for the source-control domain following the testing strategy in `/docs/source-control-implementation-roadmap.md` Day 20. Create:
1) Mock implementations of ports in `__tests__/mocks/`
2) Unit tests for services using mock ports
3) Integration tests for adapters
4) Contract tests for IPC handlers
Use Vitest and Effect testing utilities. Ensure minimum 80% coverage for new code.
