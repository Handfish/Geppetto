# AI Watcher UI Enhancement Progress

**Last Updated**: [Not Started]
**Status**: Not Started
**Current Phase**: Phase 1: Backend - GitHub Issues Integration

---

## Phase Completion Overview

- [ ] Phase 1: Backend - GitHub Issues Integration (2-3 hours)
- [ ] Phase 2: Issues Modal UI (2-3 hours)
- [ ] Phase 3: AI Watcher Integration (1-2 hours)
- [ ] Phase 4: LED Status Indicators (2-3 hours)

**Total Estimated Time**: 1-2 days
**Time Spent**: 0 hours
**Progress**: 0%

---

## Phase 1: Backend - GitHub Issues Integration ⏳

**Status**: Not Started
**Duration**: TBD
**Target**: 2-3 hours
**Completed**: TBD

### 1.1 Define Issue Port & Schemas
- [ ] Create `src/main/github/issues/ports.ts` with IssuePort interface
- [ ] Create `src/shared/schemas/github/issue.ts` with Issue and IssueComment schemas
- [ ] Create `src/main/github/issues/errors.ts` with IssueError and IssueNotFoundError
- [ ] Verify schemas compile and parse correctly

### 1.2 Create GitHub Issue Adapter
- [ ] Create `src/main/github/issues/adapter.ts`
- [ ] Implement GitHubIssueAdapter as Effect.Service
- [ ] Implement `listIssues` method using GitHubHttpService
- [ ] Implement `getIssue` method with 404 → IssueNotFoundError mapping
- [ ] Implement `listComments` method
- [ ] Declare dependencies: [GitHubHttpService.Default]

### 1.3 Create Issue Service
- [ ] Create `src/main/github/issues/issue-service.ts`
- [ ] Implement IssueService as Effect.Service
- [ ] Implement `listRepositoryIssues` method
- [ ] Implement `getIssueDetails` method
- [ ] Declare dependencies: [GitHubIssueAdapter.Default]

### 1.4 Create IPC Contracts & Handlers
- [ ] Add GitHubIssueIpcContracts to `src/shared/ipc-contracts.ts`
  - [ ] `listRepositoryIssues` contract
  - [ ] `getIssue` contract
- [ ] Create `src/main/ipc/github-issue-handlers.ts`
- [ ] Register handlers using `registerIpcHandler`
- [ ] Add to `src/main/ipc/setup.ts` handler registration

### 1.5 Update Main Layer
- [ ] Import IssueService and GitHubIssueAdapter in `src/main/index.ts`
- [ ] Add to MainLayer composition
- [ ] Verify layer dependencies resolved

### 1.6 Create Issue Atoms
- [ ] Create `src/renderer/atoms/github-issue-atoms.ts`
- [ ] Create `repositoryIssuesAtom` family with TTL caching
- [ ] Create `issueDetailsAtom` family
- [ ] Add reactivity keys for cache invalidation

### 1.7 Create IPC Client
- [ ] Add GitHubIssueClient to `src/renderer/lib/ipc-client.ts`
- [ ] Implement `listRepositoryIssues` method
- [ ] Implement `getIssue` method
- [ ] Export client Default

### 1.8 Testing
- [ ] Run `pnpm compile:app` - verify no type errors
- [ ] Run `pnpm dev` - verify app starts
- [ ] Test issue fetching via dropdown
- [ ] Verify error handling works correctly
- [ ] Check atoms cache and invalidate properly

**Notes**: [Add any notes here]

---

## Phase 2: Issues Modal UI ⏳

**Status**: Not Started
**Duration**: TBD
**Target**: 2-3 hours
**Completed**: TBD

### 2.1 Add Button to RepositoryDropdown
- [ ] Open `src/renderer/components/ui/RepositoryDropdown.tsx`
- [ ] Add `ListTodo` icon import from lucide-react
- [ ] Add "View Issues" MenuItem after "Clone to Workspace"
- [ ] Add state for `showIssuesModal`
- [ ] Wire up onClick to open modal and close dropdown

### 2.2 Create Issues Modal Component
- [ ] Create `src/renderer/components/ai-watchers/IssuesModal.tsx`
- [ ] Implement modal with AnimatePresence backdrop
- [ ] Use `repositoryIssuesAtom` to fetch issues
- [ ] Implement shortlist state with Set<number>
- [ ] Create IssueRow component with checkbox
- [ ] Implement Result.builder for error handling
- [ ] Add header with repository info
- [ ] Add footer with shortlist count and launch button

### 2.3 Create Keyboard Shortcuts Hook
- [ ] Create `src/renderer/hooks/useIssueModalKeyboardShortcuts.ts`
- [ ] Handle Escape to close
- [ ] Handle Enter to launch watchers
- [ ] Ignore events from input/textarea elements
- [ ] Wire up to modal component

### 2.4 Testing
- [ ] Run `pnpm dev`
- [ ] Open repository dropdown
- [ ] Click "View Issues"
- [ ] Verify modal appears with issues
- [ ] Press Space on issue to toggle shortlist
- [ ] Verify checkbox toggles correctly
- [ ] Verify shortlist counter updates
- [ ] Press Escape to close
- [ ] Verify keyboard shortcuts work

**Notes**: [Add any notes here]

---

## Phase 3: AI Watcher Integration ⏳

**Status**: Not Started
**Duration**: TBD
**Target**: 1-2 hours
**Completed**: TBD

### 3.1 Fix Command Bug
- [ ] Open `src/main/ai-watchers/ai-watcher-service.ts`
- [ ] Find `getAiAgentCommand` function (around line 56)
- [ ] Change `case 'claude-code': return { command: 'claude-code' }`
- [ ] To `case 'claude-code': return { command: 'claude' }`
- [ ] Save and verify compilation

### 3.2 Add Issue Context to Watcher Config
- [ ] Open `src/shared/schemas/ai-watchers.ts`
- [ ] Add `issueContext` optional field to AiWatcherConfig:
  ```typescript
  issueContext: Schema.optional(Schema.Struct({
    owner: Schema.String,
    repo: Schema.String,
    issueNumber: Schema.Number,
    issueTitle: Schema.String,
  }))
  ```
- [ ] Verify schema compiles

### 3.3 Create Watcher Launcher Hook
- [ ] Create `src/renderer/hooks/useAiWatcherLauncher.ts`
- [ ] Use `createWatcherAtom` from ai-watcher-atoms
- [ ] Implement `launchWatcherForIssue` function
- [ ] Include issue context in watcher config
- [ ] Return launch function and loading state

### 3.4 Integrate Launcher in Modal
- [ ] Open `src/renderer/components/ai-watchers/IssuesModal.tsx`
- [ ] Import `useAiWatcherLauncher` hook
- [ ] Add provider selector (claude-code/codex) to footer
- [ ] Update "Launch AI Watchers" button onClick
- [ ] Map shortlisted issues to watcher launches
- [ ] Close modal after launch

### 3.5 Testing
- [ ] Run `pnpm dev`
- [ ] Open issues modal
- [ ] Shortlist multiple issues
- [ ] Select Claude Code provider
- [ ] Click "Launch AI Watchers"
- [ ] Verify watchers created with correct command ('claude' not 'claude-code')
- [ ] Verify watcher names include issue context
- [ ] Check tmux sessions created correctly

**Notes**: [Add any notes here]

---

## Phase 4: LED Status Indicators ⏳

**Status**: Not Started
**Duration**: TBD
**Target**: 2-3 hours
**Completed**: TBD

### 4.1 Create WatcherStatusLED Component
- [ ] Create `src/renderer/components/ai-watchers/WatcherStatusLED.tsx`
- [ ] Implement `getProviderFavicon` helper
- [ ] Implement `getStatusColor` helper:
  - [ ] Green (#10b981) for running
  - [ ] Yellow (#fbbf24) for idle
  - [ ] Unlit (#374151) for stopped/errored
- [ ] Create LED square with glassmorphism
- [ ] Add favicon display
- [ ] Add pulsing glow animation for active states
- [ ] Add clear button (X) for dead watchers
- [ ] Add hover tooltip with watcher info
- [ ] Use Framer Motion for animations

### 4.2 Create Watchers Panel Component
- [ ] Create `src/renderer/components/ai-watchers/WatchersPanel.tsx`
- [ ] Use `aiWatchersAtom` to fetch active watchers
- [ ] Use `stopWatcherAtom` for clearing dead watchers
- [ ] Implement Result.builder for error handling
- [ ] Map watchers to WatcherStatusLED components
- [ ] Use AnimatePresence with `mode="popLayout"`
- [ ] Position panel in top-right with fixed positioning

### 4.3 Integrate Watchers Panel in Main Layout
- [ ] Find main layout component (likely `src/renderer/components/MainScreen.tsx`)
- [ ] Import WatchersPanel component
- [ ] Add below workflow button in top-right quadrant
- [ ] Verify positioning doesn't overlap with other UI
- [ ] Check z-index layering

### 4.4 Testing
- [ ] Run `pnpm dev`
- [ ] Launch AI watchers from issues
- [ ] Verify LED indicators appear in top-right
- [ ] Verify initial state is green (running)
- [ ] Wait 30s to verify yellow state (idle)
- [ ] Stop a watcher and verify unlit state
- [ ] Hover over LED to see tooltip
- [ ] Click X on dead watcher to clear
- [ ] Verify animations smooth (no jank)
- [ ] Test with multiple watchers
- [ ] Verify layout at different screen sizes

**Notes**: [Add any notes here]

---

## Code Quality Checklist

### Architecture
- [ ] Hexagonal architecture followed (Ports → Adapters → Services)
- [ ] All adapters extend Effect.Service
- [ ] Ports are abstract interfaces
- [ ] Dependencies correctly declared

### Type Safety
- [ ] No `any` types introduced
- [ ] Schema.parse used (never validate/decode)
- [ ] All IPC contracts properly typed
- [ ] Result types properly handled

### Error Handling
- [ ] All errors handled with Effect.fail
- [ ] Tagged errors used (Data.TaggedError)
- [ ] Domain errors preserved
- [ ] Error mapping in IPC handlers

### UI/UX
- [ ] Result.builder used for rendering
- [ ] Keyboard shortcuts intuitive
- [ ] Animations smooth (60fps)
- [ ] Glassy aesthetic matches AIUsageBars
- [ ] No layout shifts

---

## Feature Metrics

Track actual vs. expected outcomes:

| Metric | Expected | Actual | Status |
|--------|----------|--------|--------|
| Backend Integration | Hexagonal architecture | ? | ⏳ |
| Issues Modal | Keyboard-driven | ? | ⏳ |
| Watcher Launching | Multi-issue support | ? | ⏳ |
| Command Bug | Fixed to 'claude' | ? | ⏳ |
| LED Indicators | Color-coded + glassy | ? | ⏳ |
| Code Additions | ~800 lines | ? | ⏳ |

---

## Issues Encountered

Document any issues discovered during implementation:

### Issue 1: [Title]
- **Phase**: ?
- **Description**: ?
- **Solution**: ?
- **Impact**: ?

---

## Lessons Learned

Document insights and patterns discovered:

1. **[Lesson Title]**
   - What we learned
   - Why it matters
   - How to apply it

---

## Next Steps After Completion

- [ ] Update CLAUDE.md with new features
- [ ] Add screenshots to documentation
- [ ] Create PR with comprehensive description
- [ ] Test on both Free and Pro tiers
- [ ] Monitor for issues in usage
- [ ] Consider follow-up enhancements:
  - [ ] Watcher logs viewer
  - [ ] Pause/resume controls
  - [ ] Issue comment integration
  - [ ] GitLab/Bitbucket providers

---

## Rollback Information

**Backup Branch**: `backup/pre-ai-watcher-ui`
**Rollback Commands**:
```bash
# Full rollback
git checkout main
git reset --hard backup/pre-ai-watcher-ui
```

---

## Implementation Completion Checklist

### Pre-Completion
- [ ] All 4 phases completed
- [ ] No type errors (`pnpm compile:app`)
- [ ] App runs without errors (`pnpm dev`)
- [ ] All features tested manually

### Verification
- [ ] Issues fetch from GitHub
- [ ] Modal opens and closes correctly
- [ ] Keyboard shortcuts work
- [ ] Watchers launch with correct commands
- [ ] LEDs display correct states
- [ ] Clear button removes dead watchers

### Post-Completion
- [ ] Progress document finalized
- [ ] Code review completed
- [ ] Documentation updated
- [ ] PR created (if applicable)

**Implementation Completed**: ⏳ Not Started
**Completion Date**: TBD

---

## Final Summary

### What Was Completed ✅

[To be filled after completion]

### What Was Deferred ⏭️

[To be filled if any features deferred]

### Next Recommended Steps

[To be filled after completion]
