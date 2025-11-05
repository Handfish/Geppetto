# AI Runner UI Enhancement Implementation Prompts

These prompts help you implement the AI Runner UI enhancement in incremental, manageable steps. Use them to start, continue, or resume the work.

---

## 1. Initial Implementation Prompt

```
Implement the AI Runner UI Enhancement following the plan in `/docs/ai-runner-ui-plan.md`. Start with Phase 1: Backend - GitHub Issues Integration. Create the hexagonal architecture ports and adapters for GitHub Issues (Port → Schema → Adapter → Service → IPC → Atoms). Follow the hexagonal architecture patterns from CLAUDE.md exactly - use Schema.parse not validate, implement proper error handling with Effect, keep ports abstract and adapters concrete. After Phase 1, continue with Phase 2: Issues Modal UI, then Phase 3: AI Runner Integration with Git Worktrees (CRITICAL: each runner must run in an isolated git worktree with branch name `issue#<number>`, creating the branch from main/default if it doesn't exist), and finally Phase 4: LED Status Indicators. Update `/docs/ai-runner-ui-progress.md` after completing each phase, checking off items as you finish. Test thoroughly after each phase to ensure no regressions.
```

**When to use**: Starting the feature implementation from scratch

**What it does**:
- Creates GitHub Issues port, schemas, and adapter using hexagonal architecture
- Implements IssueService with proper Effect error handling
- Creates IPC contracts and handlers following type-safe patterns
- Builds atoms for reactive state management
- Creates Issues Modal UI with keyboard shortcuts
- **Implements git worktree operations** - creates isolated worktrees per issue with branch name `issue#<number>`
- Integrates AI runner launching from shortlisted issues **in dedicated worktrees**
- Fixes 'claude-code' command bug (should use 'claude' bash process)
- Implements LED status indicators in top-right quadrant
- Updates progress tracker after each phase

**Expected duration**: ~6-8 hours total across 4 phases

**Expected outcome**:
- ✅ GitHub Issues integration complete with hexagonal architecture
- ✅ Issues modal with keyboard-driven shortlist
- ✅ **Git worktree creation** - isolated worktrees for each issue with proper branch management
- ✅ AI runners launchable from issue shortlist **in dedicated worktrees**
- ✅ Command bug fixed
- ✅ Beautiful LED status indicators showing runner states
- ✅ All phases marked complete in progress tracker

---

## 2. Continue Progress Prompt

```
Continue implementing the AI Runner UI Enhancement from where you left off. First, read `/docs/ai-runner-ui-progress.md` to see which phases and sections are completed. Then proceed with the next uncompleted phase from `/docs/ai-runner-ui-plan.md`. Work through each checklist item systematically, testing as you go. Follow hexagonal architecture patterns - ports are abstract interfaces, adapters are concrete Effect Services, schemas use Schema.parse not validate. Handle all errors in an Effectful way using Effect.fail and tagged errors. Keep the implementation clean and simple for the best DX. Update the progress document after completing each section, checking off items and adding notes. If you encounter issues, document them in the progress file.
```

**When to use**: Continuing work in the same or a new session

**What it does**:
- Reads current progress from `ai-runner-ui-progress.md`
- Identifies next incomplete phase/section
- Continues implementation from that point
- Tests each change incrementally
- Updates progress tracker with checkmarks
- Documents issues and discoveries

**Expected behavior**:
- Picks up exactly where previous session left off
- Works through next phase systematically
- Maintains hexagonal architecture patterns
- Updates progress metrics

**Phases it might continue**:
- Phase 1: Backend - GitHub Issues Integration
- Phase 2: Issues Modal UI
- Phase 3: AI Runner Integration with Git Worktrees
- Phase 4: LED Status Indicators

---

## 3. Resume After Context Loss Prompt

```
Resume the AI Runner UI Enhancement implementation. First, analyze the current state by: 1) Reading `/docs/ai-runner-ui-progress.md` to see what phases are marked complete, 2) Checking which files from the plan exist by running `git status` and looking for new files in `src/main/github/issues/`, `src/renderer/components/ai-runners/`, `src/shared/schemas/github/`, 3) Running `git log --oneline --all -20` to see recent commits related to this feature, 4) Scanning key files to verify actual implementation: check for IssuePort in `src/main/github/issues/ports.ts`, IssuesModal in `src/renderer/components/ai-runners/IssuesModal.tsx`, RunnerStatusLED in `src/renderer/components/ai-runners/RunnerStatusLED.tsx`, and the command fix in `src/main/ai-runners/ai-runner-service.ts`. Compare the actual code state against what's marked complete in the progress document. Then continue from the next uncompleted item in `/docs/ai-runner-ui-plan.md`. Follow CLAUDE.md patterns exactly - hexagonal architecture with ports & adapters, Schema.parse, and Effectful error handling.
```

**When to use**: Starting a new conversation after losing context

**What it does**:
1. **State Analysis**:
   - Reads progress document
   - Checks git status for new/modified files
   - Reviews recent git commits
   - Inspects actual file contents
   - Compares actual state vs. documented progress

2. **Validation**:
   - Verifies claimed completions are real
   - Identifies partially completed work
   - Detects any inconsistencies

3. **Resume**:
   - Continues from correct point
   - Completes any partial work
   - Proceeds with next phase

**Key files to check**:
- `src/main/github/issues/ports.ts` - IssuePort definition
- `src/main/github/issues/issue-service.ts` - Issue orchestration
- `src/shared/schemas/github/issue.ts` - Issue schemas
- `src/shared/ipc-contracts.ts` - Issue & worktree IPC contracts
- `src/renderer/atoms/github-issue-atoms.ts` - Issue atoms
- `src/main/source-control/git-command-service.ts` - **Git worktree operations**
- `src/renderer/hooks/useAiRunnerLauncher.ts` - **Runner launcher with worktree support**
- `src/renderer/components/ai-runners/IssuesModal.tsx` - Modal UI
- `src/renderer/components/ai-runners/RunnerStatusLED.tsx` - LED indicators
- `src/main/ai-runners/ai-runner-service.ts` - Command fix

**Expected outcome**:
- Accurate understanding of current state
- Clean continuation from correct point
- No duplicate or skipped work

---

## Tips for Using These Prompts

### For Best Results

1. **Always check progress first**: Review the progress document before starting work
2. **Update progress frequently**: Check off items as you complete them
3. **Test incrementally**: Run the app after each major change to catch issues early
4. **Follow hexagonal architecture**: Ports are abstract, adapters are concrete Services
5. **Use Schema.parse**: Never use Schema.decode or validate
6. **Handle errors Effectfully**: Use Effect.fail with tagged errors, never throw

### Prompt Selection Guide

| Situation | Use This Prompt |
|-----------|----------------|
| Starting fresh | #1: Initial Implementation |
| Continuing same session | #2: Continue Progress |
| New conversation | #3: Resume After Context Loss |

### Architecture Reminders

**Hexagonal Architecture Pattern**:
- Port (abstract interface) → Schema (types) → Adapter (concrete Service) → Domain Service → IPC → Atoms → UI

**Effect Patterns**:
- Use `Effect.gen` for all async operations
- Use `Schema.parse` for validation (throws ParseError in Effect context)
- Use tagged errors with `Data.TaggedError`
- Declare dependencies in Service definitions

**UI Patterns**:
- Use `Result.builder` for rendering with error handling
- Use keyboard shortcuts hook pattern from git-tree-ui
- Use glassy/minimal design like AIUsageBars
- Use Framer Motion for animations

---

## Quick Reference Commands

```bash
# Run development server
pnpm dev

# Compile and check types
pnpm compile:app

# Check progress
cat docs/ai-runner-ui-progress.md | grep "Status:"

# See recent changes
git status
git diff --stat

# Check for new files
ls -la src/main/github/issues/
ls -la src/renderer/components/ai-runners/
ls -la src/shared/schemas/github/

# Search for specific implementations
grep -r "IssuePort" src/main
grep -r "claude-code" src/main/ai-runners
grep -r "RunnerStatusLED" src/renderer
```

---

Happy implementing! 🚀
