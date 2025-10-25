# Geppetto Documentation Index

## Architecture Analysis Documents

### New Documents (Tmux AI Watchers Analysis)

1. **ARCHITECTURE_ANALYSIS_SUMMARY.md** (START HERE)
   - Complete overview of the tmux AI watchers architecture
   - Synthesizes TmuxPrompts, error-refactor-plan, and Geppetto's current design
   - Design decisions and rationale
   - Implementation roadmap with 4-week phases
   - Success criteria and metrics
   - **Read this first** to understand the overall design

2. **TMUX_AI_WATCHERS_ARCHITECTURE.md** (DETAILED REFERENCE)
   - Complete port and service specifications
   - Error types and mapping strategy
   - IPC contracts with type safety patterns
   - Renderer integration with atoms and components
   - File structure templates
   - Code examples throughout
   - **Use this** for detailed implementation guidance

3. **QUICK_REFERENCE.md** (LOOKUP GUIDE)
   - Condensed patterns and templates
   - Code snippets for common tasks
   - Error handling flow diagrams
   - File structure quick reference
   - Troubleshooting guide
   - **Use this** for quick lookups during implementation

---

## Foundation Documents (Required Reading)

### From this Repository

4. **CLAUDE.md** (PROJECT PHILOSOPHY)
   - Overall project design philosophy
   - Effect-based service architecture
   - Hexagonal architecture patterns
   - Type-safe IPC communication
   - Current layer composition
   - **Read first** for project context

5. **error-refactor-plan.md** (ERROR HANDLING BLUEPRINT)
   - Complete error handling refactor plan
   - Defect vs typed error decision tree
   - Hexagonal error handling ports
   - Error presenter and recovery strategies
   - 9-phase implementation plan
   - **Referenced throughout** for error patterns

### TmuxPrompts Design (Process Logging)

6. **TmuxPrompts/ULTIMATE_GUIDE.md**
   - Complete overview of all logger types
   - Comparison matrix of different approaches
   - Decision tree for choosing a logger
   - EffectTS pattern catalog
   - Learning path and package structure

7. **TmuxPrompts/TMUX_LOGGER_GUIDE.md**
   - Complete tmux-based logger guide
   - Architecture and workflow diagrams
   - User interaction patterns
   - Rolling log management
   - Activity tracking implementation
   - Common patterns and use cases

8. **TmuxPrompts/STRUCTURED_CONCURRENCY.md**
   - Deep dive into structured concurrency
   - Why Effect.forkScoped, not forkDaemon
   - Scope lifecycle management
   - Resource cleanup guarantees
   - Comparison of fork vs forkDaemon vs forkScoped

---

## Other Documentation (Reference)

### Error Handling Guides

9. **RESULT_API_AND_ERROR_HANDLING.md**
   - Complete Result API documentation
   - Result.builder pattern explained
   - Error handling in React components
   - Safe data extraction patterns
   - Common mistakes to avoid

10. **TOAST_USAGE.md**
    - Toast notification patterns
    - Error presentation strategies
    - User feedback best practices

### Architecture Guides

11. **EFFECT_ATOM_IPC_GUIDE.md**
    - Effect atoms for state management
    - IPC-driven state synchronization
    - Reactor pattern implementation

12. **CROSS_WINDOW_STATE_SYNC.md**
    - Multi-window state synchronization
    - Console and main window coordination

### Additional Resources

13. **connect-github-flow.md** - GitHub authentication flow

---

## Reading Order

### For Getting Started (1-2 hours)

1. Start: **ARCHITECTURE_ANALYSIS_SUMMARY.md**
   - Understand the big picture
   - Learn design decisions

2. Background: **CLAUDE.md** (sections on hexagonal architecture)
   - Understand Geppetto's current patterns

3. Reference: **QUICK_REFERENCE.md**
   - Quick lookup for patterns

### For Implementation (4 weeks)

**Week 1: Foundation**
- Read: **TMUX_AI_WATCHERS_ARCHITECTURE.md** Part 1-4
- Reference: **TmuxPrompts/ULTIMATE_GUIDE.md** for process logger patterns
- Reference: **TmuxPrompts/STRUCTURED_CONCURRENCY.md** for concurrency patterns

**Week 2: Services**
- Read: **TMUX_AI_WATCHERS_ARCHITECTURE.md** Part 5-6
- Reference: **error-refactor-plan.md** Phase 1-2
- Reference: **CLAUDE.md** error handling section

**Week 3: IPC & Frontend**
- Read: **TMUX_AI_WATCHERS_ARCHITECTURE.md** Part 7-8
- Reference: **EFFECT_ATOM_IPC_GUIDE.md** for atoms
- Reference: **RESULT_API_AND_ERROR_HANDLING.md** for components

**Week 4: Testing & Polish**
- Read: **ARCHITECTURE_ANALYSIS_SUMMARY.md** Part 12-14
- Reference: **error-refactor-plan.md** Phase 8-9
- Reference: **TOAST_USAGE.md** for error presentation

---

## Document Organization

### By Purpose

**Architecture & Design:**
- ARCHITECTURE_ANALYSIS_SUMMARY.md
- TMUX_AI_WATCHERS_ARCHITECTURE.md
- CLAUDE.md

**Implementation Patterns:**
- QUICK_REFERENCE.md
- error-refactor-plan.md
- TmuxPrompts/ULTIMATE_GUIDE.md
- EFFECT_ATOM_IPC_GUIDE.md

**Detailed Guides:**
- TmuxPrompts/TMUX_LOGGER_GUIDE.md
- TmuxPrompts/STRUCTURED_CONCURRENCY.md
- RESULT_API_AND_ERROR_HANDLING.md
- TOAST_USAGE.md

### By Technology

**Effect Framework:**
- TmuxPrompts/ULTIMATE_GUIDE.md (patterns)
- TmuxPrompts/STRUCTURED_CONCURRENCY.md (concurrency)
- error-refactor-plan.md (error handling)
- EFFECT_ATOM_IPC_GUIDE.md (state management)

**Hexagonal Architecture:**
- ARCHITECTURE_ANALYSIS_SUMMARY.md (overview)
- TMUX_AI_WATCHERS_ARCHITECTURE.md (specs)
- CLAUDE.md (current implementation)

**React & Frontend:**
- RESULT_API_AND_ERROR_HANDLING.md (error handling)
- EFFECT_ATOM_IPC_GUIDE.md (atoms)
- TOAST_USAGE.md (notifications)

**Process Management:**
- TmuxPrompts/TMUX_LOGGER_GUIDE.md (implementation)
- TmuxPrompts/STRUCTURED_CONCURRENCY.md (concurrency)
- TMUX_AI_WATCHERS_ARCHITECTURE.md (integration)

---

## Key Concepts Glossary

### Architectural Patterns

**Hexagonal Architecture**
- Port: Interface defining external contracts
- Adapter: Implementation of a port
- Service: High-level business logic using ports
- See: ARCHITECTURE_ANALYSIS_SUMMARY.md Part 1

**Structured Concurrency**
- Effect.scoped: Creates lifetime scope
- Effect.forkScoped: Ties fiber to scope
- Automatic cleanup on scope close
- See: TmuxPrompts/STRUCTURED_CONCURRENCY.md

**Domain-Driven Organization**
- Folder per domain (github/, ai/, source-control/)
- Each domain has errors, ports, services, adapters
- See: CLAUDE.md, TMUX_AI_WATCHERS_ARCHITECTURE.md Part 3.2

### Error Handling

**Defect vs Typed Error**
- Defect: Programming bugs (<5% of errors)
- Typed Error: All recoverable errors are typed
- See: error-refactor-plan.md, ARCHITECTURE_ANALYSIS_SUMMARY.md Part 3

**Error Mapping**
- Domain → IPC → Renderer flow
- mapDomainErrorToIpcError() transforms errors
- Result<T, E> types for exhaustive handling
- See: RESULT_API_AND_ERROR_HANDLING.md

**Result Type**
- Result.builder() for exhaustive handling
- .onInitial(), .onErrorTag(), .onDefect(), .onSuccess()
- No silent failures, all paths handle errors
- See: RESULT_API_AND_ERROR_HANDLING.md

### Frontend

**Atoms**
- Effect-driven state management
- Automatic caching and invalidation
- Integration with React via hooks
- See: EFFECT_ATOM_IPC_GUIDE.md

**IPC Contracts**
- Schema-based type safety
- Schema.decodeUnknown() validates at boundary
- Dual-type definitions prevent erasure
- See: CLAUDE.md CRITICAL section, TMUX_AI_WATCHERS_ARCHITECTURE.md Part 6

---

## Quick Start Checklist

### Day 1: Understanding
- [ ] Read ARCHITECTURE_ANALYSIS_SUMMARY.md
- [ ] Skim CLAUDE.md sections on hexagonal architecture
- [ ] Review QUICK_REFERENCE.md patterns

### Day 2: Deep Dive
- [ ] Read TMUX_AI_WATCHERS_ARCHITECTURE.md
- [ ] Review TmuxPrompts/ULTIMATE_GUIDE.md
- [ ] Study TmuxPrompts/STRUCTURED_CONCURRENCY.md

### Day 3: Patterns
- [ ] Study error-refactor-plan.md Phase 1-2
- [ ] Review RESULT_API_AND_ERROR_HANDLING.md
- [ ] Understand EFFECT_ATOM_IPC_GUIDE.md

### Week 1: Implementation
- [ ] Create src/main/ai-watchers/ structure
- [ ] Define ProcessMonitorPort and AiWatcherPort
- [ ] Implement TmuxSessionManagerService
- [ ] Write unit tests

---

## File Locations

### Documentation Root
`/home/ken-udovic/Workspace/node/geppetto/docs/`

### This Index
`/home/ken-udovic/Workspace/node/geppetto/docs/INDEX.md`

### Main Analysis Documents
- `ARCHITECTURE_ANALYSIS_SUMMARY.md`
- `TMUX_AI_WATCHERS_ARCHITECTURE.md`
- `QUICK_REFERENCE.md`

### Foundation Documents
- `error-refactor-plan.md`
- `CLAUDE.md` (in repo root)
- `TmuxPrompts/` (directory)

### Implementation Guides
- `RESULT_API_AND_ERROR_HANDLING.md`
- `EFFECT_ATOM_IPC_GUIDE.md`
- `TOAST_USAGE.md`

---

## Contributing to This Documentation

When adding new sections:

1. **Update this INDEX.md** with the new document location
2. **Add cross-references** to related documents
3. **Link to QUICK_REFERENCE.md** for code patterns
4. **Use consistent formatting** (markdown headers, code blocks)
5. **Provide concrete examples** with file paths

---

## Version History

- **2025-10-25**: Initial architecture analysis documents created
  - ARCHITECTURE_ANALYSIS_SUMMARY.md
  - TMUX_AI_WATCHERS_ARCHITECTURE.md
  - QUICK_REFERENCE.md
  - INDEX.md (this file)

---

## Support & Questions

If you have questions about:

- **Architecture**: See ARCHITECTURE_ANALYSIS_SUMMARY.md
- **Implementation**: See TMUX_AI_WATCHERS_ARCHITECTURE.md
- **Patterns**: See QUICK_REFERENCE.md
- **Error handling**: See error-refactor-plan.md or RESULT_API_AND_ERROR_HANDLING.md
- **Effect/Concurrency**: See TmuxPrompts/ guides
- **Hexagonal design**: See CLAUDE.md

