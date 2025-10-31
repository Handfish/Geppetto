# AI Watcher UI Enhancement Progress

**Last Updated**: 2025-10-30
**Status**: In Progress
**Current Phase**: Phase 2: Issues Modal UI

---

## Phase Completion Overview

- [x] Phase 1: Backend - GitHub Issues Integration (2-3 hours) ✅
- [~] Phase 2: Issues Modal UI (2-3 hours) 🔄
- [x] Phase 3: AI Watcher Integration with Git Worktrees (2-3 hours) ✅
- [ ] Phase 4: LED Status Indicators (2-3 hours)

**Total Estimated Time**: 1-2 days
**Time Spent**: ~5.5 hours
**Progress**: 80%

---

## Phase 1: Backend - GitHub Issues Integration ✅

**Status**: Completed
**Duration**: 2 hours
**Target**: 2-3 hours
**Completed**: 2025-10-30

### 1.1 Define Issue Port & Schemas ✅
- [x] Enhanced `src/shared/schemas/github/issue.ts` with GitHubLabel, GitHubIssue, GitHubIssueComment
- [x] Created `src/main/github/issues/errors.ts` with IssueError, IssueNotFoundError, IssueAccessDeniedError
- [x] Created `src/main/github/issues/ports.ts` with IssuePort interface
- [x] Verified schemas compile correctly

**Note**: Used existing `GitHubApiService` instead of creating separate adapter - more consistent with codebase patterns.

### 1.2 Extended GitHub API Service ✅
- [x] Extended `src/main/github/api-service.ts` with issue methods
- [x] Enhanced `getIssuesForAccount` with filters (state, labels, assignee, limit)
- [x] Added `getIssueForAccount` method
- [x] Added `getIssueCommentsForAccount` method
- [x] All methods use existing GitHubHttpService with proper error handling

### 1.3 Create IPC Contracts & Handlers ✅
- [x] Added GitHubIssueIpcContracts to `src/shared/ipc-contracts.ts`
  - [x] `github:list-repository-issues` contract
  - [x] `github:get-issue` contract
  - [x] `github:get-issue-comments` contract
- [x] Created `src/main/ipc/github-issue-handlers.ts`
- [x] Registered handlers using `registerIpcHandler`
- [x] Added to `src/main/index.ts` handler registration (setupGitHubIssueIpcHandlers)

### 1.4 Update Main Layer ✅
- [x] GitHubApiService already in MainLayer (no changes needed)
- [x] Verified layer dependencies resolved
- [x] All services compile correctly

### 1.5 Create Issue Atoms ✅
- [x] Created `src/renderer/atoms/github-issue-atoms.ts`
- [x] Created `repositoryIssuesAtom` family with 5min TTL caching
- [x] Created `issueDetailsAtom` family with 10min TTL
- [x] Created `issueCommentsAtom` family
- [x] Added reactivity keys for cache invalidation

### 1.6 Create IPC Client ✅
- [x] Added GitHubIssueClient to `src/renderer/lib/ipc-client.ts`
- [x] Implemented `listRepositoryIssues` method
- [x] Implemented `getIssue` method
- [x] Implemented `getIssueComments` method
- [x] Exported client with Default

### 1.7 Testing ✅
- [x] Ran `pnpm compile:app` - **SUCCESS, no type errors**
- [x] Verified all files compile correctly
- [x] Backend integration complete and ready for UI

**Notes**:
- Chose to extend existing `GitHubApiService` rather than create separate hexagonal layer - more consistent with existing architecture
- All IPC contracts follow existing patterns with proper schema validation
- Atoms use proper TTL caching and reactivity keys

---

## Phase 2: Issues Modal UI 🔄

**Status**: Mostly Complete (2.1-2.3 done, 2.4 pending testing)
**Duration**: 1.5 hours so far
**Target**: 2-3 hours
**Completed**: TBD

### 2.1 Add Button to RepositoryDropdown ✅
- [x] Opened `src/renderer/components/ui/RepositoryDropdown.tsx`
- [x] Added `ListTodo` icon import from lucide-react
- [x] Added "View Issues" MenuItem after "Clone to Workspace"
- [x] Added state for `showIssuesModal`
- [x] Wired up onClick to open modal and close dropdown

### 2.2 Create Issues Modal Component ✅
- [x] Created `src/renderer/components/ai-watchers/IssuesModal.tsx`
- [x] Implemented modal with AnimatePresence backdrop
- [x] Used `repositoryIssuesAtom` to fetch issues
- [x] Implemented shortlist state with Set<number>
- [x] Created IssueRow component with checkbox and click to toggle
- [x] Implemented Result.builder for error handling (AuthenticationError, NetworkError, NotFoundError, Defect)
- [x] Added header with repository info and ListTodo icon
- [x] Added footer with shortlist count and "Launch AI Watchers" button
- [x] Wired modal into RepositoryDropdown with accountId, owner, repo props
- [x] Added React fragment wrapper for multiple return elements
- [x] Placeholder onLaunchWatchers handler (logs and shows toast)

### 2.3 Keyboard Shortcuts ✅
- [x] Implemented inline keyboard shortcuts in IssuesModal (simpler than separate hook)
- [x] Escape key closes modal
- [x] Enter key launches watchers (when shortlist not empty)
- [x] Event listeners properly added/removed based on isOpen
- [x] Keyboard shortcuts respect modifier keys (no trigger if Shift/Ctrl/Meta pressed)

### 2.4 Testing ⏳
- [ ] Run `pnpm dev`
- [ ] Open repository dropdown
- [ ] Click "View Issues"
- [ ] Verify modal appears with issues
- [ ] Click issues to toggle shortlist
- [ ] Verify checkbox toggles correctly
- [ ] Verify shortlist counter updates
- [ ] Press Escape to close
- [ ] Press Enter to launch watchers
- [ ] Verify keyboard shortcuts work

**Notes**:
- Keyboard shortcuts implemented inline in IssuesModal rather than separate hook for simplicity
- Modal uses accountId from ProviderRepository (already available)
- Result.builder properly handles all error types from repositoryIssuesAtom
- IssueRow displays: number, title, labels (color-coded), author, date, comments
- AnimatePresence provides smooth backdrop and modal animations
- onLaunchWatchers is a placeholder - will be implemented after Phase 3 watcher launcher hook
- Compilation successful (exit code 0), bundle size 3,356 kB

---

## Phase 3: AI Watcher Integration with Git Worktrees ✅

**Status**: Completed
**Duration**: 1.5 hours
**Target**: 2-3 hours
**Completed**: 2025-10-30

### 3.1 Fix Command Bug ✅
- [x] Opened `src/main/ai-watchers/ai-watcher-service.ts`
- [x] Found `getAiAgentCommand` function (line 56)
- [x] Changed `case 'claude-code': return { command: 'claude-code' }`
- [x] To `case 'claude-code': return { command: 'claude' }`
- [x] Added comment: `// ✅ FIXED: bash process is 'claude', not 'claude-code'`

### 3.2 Add Git Worktree IPC Contracts ✅
- [x] Added three new IPC contracts to `src/shared/ipc-contracts.ts`:
  - `source-control:create-worktree-for-issue` - Creates worktree with issue branch
  - `source-control:remove-worktree` - Removes a worktree
  - `source-control:list-worktrees` - Lists all worktrees
- [x] All contracts follow proper schema patterns with RepositoryId, error types

### 3.3 Implement Git Worktree Operations in GitCommandService ✅
- [x] Added imports to `src/main/source-control/git-command-service.ts`:
  - RepositoryService, RepositoryId, NotFoundError, GitOperationError, path module
- [x] Added RepositoryService to dependencies
- [x] Implemented `createWorktreeForIssue` method:
  - Checks if branch `issue#<number>` exists
  - Creates branch from baseBranch (defaults to repo.defaultBranch or 'main') if doesn't exist
  - Creates worktree in `../worktree-issue#<number>` relative to repo root
  - Returns worktreePath, branchName, branchExisted
- [x] Implemented `removeWorktree` method:
  - Removes worktree using `git worktree remove --force`
- [x] Implemented `listWorktrees` method:
  - Lists worktrees using `git worktree list --porcelain`
  - Parses porcelain output into structured array

### 3.4 Create IPC Handlers for Worktree Operations ✅
- [x] Updated `src/main/ipc/source-control-handlers.ts`:
  - Added GitCommandService import
  - Added GitCommandService to dependencies
  - Registered handler for `create-worktree-for-issue`
  - Registered handler for `remove-worktree`
  - Registered handler for `list-worktrees`
  - All handlers use proper domain type conversion (toDomainRepositoryId)

### 3.5 Add Issue Context to Watcher Config Schema ✅
- [x] Updated `src/main/ai-watchers/schemas.ts`
- [x] Added `issueContext` optional field to AiWatcherConfig:
  ```typescript
  issueContext: S.optional(
    S.Struct({
      owner: S.String,
      repo: S.String,
      issueNumber: S.Number,
      issueTitle: S.String,
    })
  )
  ```
- [x] Added descriptive comment about GitHub issue context usage

### 3.6 Testing ✅
- [x] Ran `pnpm compile:app` - **SUCCESS, exit code 0**
- [x] All new code compiles without errors
- [x] No type errors introduced

**Notes**:
- Command bug fix ensures claude processes are correctly identified by 'claude' not 'claude-code'
- Git worktree operations provide full isolation for each issue with automatic branch management
- Issue context in watcher config enables tracking which issue a watcher is working on
- Sequential watcher launches (to be implemented in Phase 2) will prevent git race conditions
- Worktree paths use `../worktree-issue#<number>` pattern for clean organization

**Frontend Integration Completed**:
- ✅ Created useAiWatcherLauncher hook
- ✅ Integrated launcher in IssuesModal
- ✅ Added SourceControlClient to ipc-client
- ✅ Updated RepositoryDropdown to pass repositoryId

**Remaining Work**:
- Test end-to-end worktree creation and watcher launching (manual testing with `pnpm dev`)

### 3.7 Frontend Integration: Watcher Launcher ✅
- [x] Created `src/renderer/lib/ipc-client.ts` SourceControlClient:
  - Added `createWorktreeForIssue` method
  - Added `removeWorktree` method
  - Added `listWorktrees` method
  - All methods use ElectronIpcClient with proper Effect wrapping
- [x] Created `src/renderer/hooks/useAiWatcherLauncher.ts`:
  - `launchWatcherForIssue` - launches single watcher with worktree
  - `launchWatchersForIssues` - launches multiple watchers sequentially
  - Creates git worktrees using SourceControlClient
  - Launches AI watchers with issue context
  - Toast notifications for user feedback
  - Loading state management (isLaunching)
- [x] Updated `src/renderer/components/ai-watchers/IssuesModal.tsx`:
  - Added repositoryId prop
  - Integrated useAiWatcherLauncher hook
  - Added provider selector dropdown (claude-code, codex, cursor)
  - Updated handleLaunch to call launchWatchersForIssues
  - Added loading state to Launch button (spinner + "Launching..." text)
  - Provider selector disabled during launch
- [x] Updated `src/renderer/components/ui/RepositoryDropdown.tsx`:
  - Added repositoryId prop to IssuesModal: `{{ value: repo.repositoryId }}`
  - Removed placeholder onLaunchWatchers toast

### 3.8 Compilation Testing ✅
- [x] Ran `pnpm compile:app` - **SUCCESS, exit code 0**
- [x] Bundle size: 3,362.46 kB (6 kB increase from Phase 2.2, expected)
- [x] All new code compiles without errors
- [x] No type errors introduced

**Notes**:
- SourceControlClient follows same pattern as other IPC clients
- useAiWatcherLauncher hook encapsulates all worktree + watcher logic
- Sequential launching in launchWatchersForIssues prevents git conflicts
- Provider selector allows choosing AI agent (claude-code, codex, cursor)
- Loading states provide good UX during async operations
- Issue context properly stored in watcher config for tracking

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
