# Effect Platform Migration Implementation Prompts

These prompts help you implement the migration from custom Node.js wrappers to `@effect/platform` modules in incremental, manageable steps. Use them to start, continue, or resume the migration work.

---

## 1. Initial Implementation Prompt

```
Implement the Effect Platform Migration following the plan in `/docs/platform-migration-plan.md`. Start with Phase 1: Foundation Setup. Update dependencies to the latest @effect/platform version, create the PlatformLayer infrastructure, integrate it into CoreInfrastructureLayer, and verify everything compiles and runs correctly. Follow the Effect-TS patterns and hexagonal architecture requirements from CLAUDE.md exactly. Update `/docs/platform-migration-progress.md` after completing each section, checking off items as you finish them. Document any issues or deviations in `/docs/platform-migration-log.md`.
```

**When to use**: Starting the migration from scratch

**What it does**:
- Updates `@effect/platform` and `@effect/platform-node` to latest versions
- Creates `src/main/platform/platform-layer.ts` with NodeContext integration
- Integrates PlatformLayer into `CoreInfrastructureLayer`
- Creates migration log document
- Verifies build, tests, and application startup
- Updates progress tracker

**Expected duration**: ~1 hour

**Expected outcome**:
- ✅ Dependencies updated
- ✅ PlatformLayer created and integrated
- ✅ All tests still pass
- ✅ Application runs without errors
- ✅ Phase 1 marked complete in progress tracker

---

## 2. Continue Progress Prompt

```
Continue implementing the Effect Platform Migration from where you left off. First, read `/docs/platform-migration-progress.md` to see which sections are completed and which are pending. Then proceed with the next uncompleted phase from `/docs/platform-migration-plan.md`. Work through each checklist item systematically, testing as you go. Update the progress document after completing each section, checking off items and adding duration/notes. If you encounter any issues or need to deviate from the plan, document them in `/docs/platform-migration-log.md`. Maintain strict type safety, preserve domain-specific error handling, and follow Effect patterns as specified in CLAUDE.md.
```

**When to use**: Continuing work in the same or a new session

**What it does**:
- Reads current progress from `platform-migration-progress.md`
- Identifies next incomplete phase/section
- Continues implementation from that point
- Tests each change incrementally
- Updates progress tracker with checkmarks
- Documents issues in migration log

**Expected behavior**:
- Picks up exactly where previous session left off
- Works through next phase systematically
- Runs tests after major changes
- Updates metrics (code reduction, performance)

**Phases it might continue**:
- Phase 2: Path Migration
- Phase 3: FileSystem Migration
- Phase 4: Git Command Migration
- Phase 5: Tmux/Process Migration
- Phase 6: Cleanup & Documentation

---

## 3. Resume After Context Loss Prompt

```
Resume the Effect Platform Migration implementation. First, analyze the current state by: 1) Reading `/docs/platform-migration-progress.md` to see what phases and sections are marked complete, 2) Checking which files from the plan exist and have been modified by running `git status` and `git diff --stat`, 3) Running `git log --oneline --grep="platform" --grep="migration" --all -10` to see recent migration-related commits, 4) Scanning key files to verify actual implementation status: `src/main/platform/platform-layer.ts`, `src/main/core-infrastructure-layer.ts`, `src/main/source-control/adapters/file-system/node-file-system-adapter.ts`, `src/main/source-control/adapters/git/node-git-command-runner.ts`. Compare the actual code state against what's marked complete in the progress document to catch any discrepancies. Then continue from the next uncompleted item in `/docs/platform-migration-plan.md`. Update the progress document as you complete sections. Follow CLAUDE.md patterns exactly, preserving domain errors and hexagonal architecture.
```

**When to use**: Starting a new conversation after losing context

**What it does**:
1. **State Analysis**:
   - Reads progress document
   - Checks git status for uncommitted changes
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

**Special handling**:
- May need to complete partially done work
- May need to revert incomplete changes
- May need to run tests to verify previous work

**Expected outcome**:
- Accurate understanding of current state
- Clean continuation from correct point
- No duplicate or skipped work

---

## 4. Verify Phase Completion Prompt

```
Verify that [PHASE_NAME] of the Effect Platform Migration is fully complete. Review `/docs/platform-migration-progress.md` to see all checklist items for this phase. For each checked item, verify it was actually completed by: 1) Checking the relevant files exist and contain expected changes, 2) Running associated tests with `pnpm test [relevant-path]`, 3) Performing manual verification steps if specified. Compare actual implementation against the requirements in `/docs/platform-migration-plan.md`. If any items are marked complete but aren't actually done, update the progress tracker and complete them. If everything is verified, mark the phase as complete with timestamp and move to the next phase. Document verification results in `/docs/platform-migration-log.md`.
```

**When to use**: After completing a phase, or to verify previous work

**Replace `[PHASE_NAME]` with**:
- Phase 1: Foundation Setup
- Phase 2: Path Migration
- Phase 3: FileSystem Migration
- Phase 4: Git Command Migration
- Phase 5: Tmux/Process Migration
- Phase 6: Cleanup & Documentation

**What it does**:
- Verifies all checklist items actually complete
- Runs relevant tests
- Performs manual verification
- Updates progress with timestamp
- Identifies any gaps

**Verification steps**:
- ✅ Code exists and looks correct
- ✅ Tests pass
- ✅ Manual testing succeeds
- ✅ No compilation errors
- ✅ Performance acceptable

---

## 5. Handle Migration Issue Prompt

```
Investigate and resolve a migration issue in the Effect Platform Migration. The issue is: [DESCRIBE_ISSUE]. First, check if this issue is already documented in `/docs/platform-migration-log.md` under "Issues Encountered". If not, add a new entry with description, phase, and investigation notes. Review the relevant section in `/docs/platform-migration-plan.md` for guidance. Check if there's a rollback procedure needed. Investigate the root cause by: 1) Reading relevant code files, 2) Running targeted tests, 3) Checking Effect Platform documentation for the affected modules, 4) Looking for similar patterns in the codebase. Once you identify a solution, implement it, test it thoroughly, and document the resolution in the migration log. Update the progress tracker if any items need to be re-done. If the issue blocks progress, document a workaround or alternative approach.
```

**When to use**: Encountering an error or unexpected behavior during migration

**Replace `[DESCRIBE_ISSUE]` with**:
- Tests failing after migration
- Type errors with platform APIs
- Performance regression
- Cross-platform compatibility issue
- Error mapping not working correctly
- Etc.

**What it does**:
- Documents issue in migration log
- Investigates root cause
- Consults documentation
- Implements solution
- Tests fix thoroughly
- Updates progress tracker

**Issue categories handled**:
- Type errors
- Runtime errors
- Test failures
- Performance issues
- API misunderstandings
- Architectural conflicts

---

## 6. Quick Status Check Prompt

```
Provide a quick status check of the Effect Platform Migration. Read `/docs/platform-migration-progress.md` and report: 1) Which phases are complete, in progress, and not started, 2) Overall progress percentage, 3) Time spent vs. estimated time, 4) Any items marked complete in the last session, 5) Next phase/section to work on, 6) Any issues or blockers noted in `/docs/platform-migration-log.md`. Provide a brief summary in bullet points, then ask if I want to continue with the next phase or focus on something specific.
```

**When to use**: Checking migration status without making changes

**What it provides**:
- Phase completion summary
- Progress percentage
- Time tracking
- Recent work
- Next steps
- Known issues

**Example output**:
```
Effect Platform Migration Status:

✅ Phase 1: Foundation Setup - Complete (1h)
✅ Phase 2: Path Migration - Complete (2.5h)
🔄 Phase 3: FileSystem Migration - In Progress (3h / 4-6h estimated)
⏳ Phase 4: Git Command Migration - Not Started
⏳ Phase 5: Tmux/Process Migration - Not Started
⏳ Phase 6: Cleanup & Documentation - Not Started

Overall Progress: 35% (6.5h spent / ~18h estimated)

Last completed:
- Updated NodeFileSystemAdapter core methods
- Migrated WorkspaceService fs usage
- Tests passing

Next up:
- Complete Phase 3.4: Update AI Watchers fs operations
- Then: Phase 3.5 - Testing

Issues: None currently blocking

Ready to continue with Phase 3.4?
```

---

## 7. Roll Back Phase Prompt

```
Roll back [PHASE_NAME] of the Effect Platform Migration. First, check `/docs/platform-migration-progress.md` to see what was completed in this phase. Review `/docs/platform-migration-log.md` for the reason requiring rollback. Then: 1) Use `git status` and `git diff` to see uncommitted changes, 2) If changes are committed, use `git log --oneline -10` to find relevant commits, 3) Create a backup branch with `git checkout -b backup/rollback-[phase-name]-$(date +%Y%m%d)`, 4) Revert the phase changes using `git revert` for commits or `git restore` for files, 5) If using the feature flag approach, update the relevant layer file to use old implementation, 6) Run `pnpm test` to verify rollback succeeded, 7) Update progress tracker to mark phase as not started, 8) Document rollback reason and approach in migration log.
```

**When to use**: Need to undo a phase due to critical issues

**Replace `[PHASE_NAME]` with**:
- Phase 2: Path Migration
- Phase 3: FileSystem Migration
- Phase 4: Git Command Migration
- Phase 5: Tmux/Process Migration

**What it does**:
- Creates backup branch
- Reverts changes safely
- Optionally uses feature flags
- Verifies rollback with tests
- Updates documentation

**Rollback methods**:
1. **Git revert** - If committed
2. **Git restore** - If uncommitted
3. **Feature flag** - If keeping both implementations

---

## 8. Collect Metrics Prompt

```
Collect and update metrics for the Effect Platform Migration. Update the "Code Reduction Metrics" and "Performance Metrics" sections in `/docs/platform-migration-progress.md`. For code reduction: 1) Count lines in old adapter files (check git history if already deleted), 2) Count lines in new platform-based adapters, 3) Calculate actual savings, 4) Compare to expected savings. For performance: 1) Create a simple benchmark script to measure key operations (git status, file read, etc.), 2) Run it on current platform-based implementation, 3) Compare to baseline if available, 4) Document results. Also check `pnpm test -- --coverage` for test coverage changes. Update the metrics tables in the progress document with actual numbers. Document any significant deviations from expected metrics in the migration log.
```

**When to use**: After completing major phases or at end of migration

**What it measures**:
- Code reduction (lines saved)
- Performance (operation timing)
- Memory usage
- Test coverage

**Metrics collected**:
- FileSystemAdapter: before/after line count
- GitCommandRunner: before/after line count
- TmuxSessionManager: before/after line count
- ProcessMonitor: before/after line count
- Git operation timing
- File system operation timing
- Memory usage during operations

**Expected savings**: ~60-70% code reduction, similar/better performance

---

## 9. Create Pull Request Prompt

```
Create a pull request for the Effect Platform Migration. First, verify all phases are complete by checking `/docs/platform-migration-progress.md`. Ensure: 1) All 6 phases marked complete, 2) All tests passing with `pnpm test`, 3) Both tiers build successfully with `pnpm build:all`, 4) Migration log finalized in `/docs/platform-migration-log.md`, 5) All documentation updated. Then: Create a comprehensive PR description including: a) Migration overview and goals, b) Summary of changes per phase, c) Code reduction metrics, d) Performance metrics (if collected), e) Breaking changes (if any), f) Testing performed, g) Link to plan and progress documents, h) Any follow-up work needed. Use conventional commit format for the PR title: "feat(platform): migrate to @effect/platform modules". Request review from relevant team members.
```

**When to use**: After completing all 6 phases

**PR Requirements**:
- ✅ All phases complete
- ✅ All tests pass
- ✅ Both tiers build
- ✅ Documentation updated
- ✅ Migration log finalized

**PR Template**:
```markdown
# feat(platform): migrate to @effect/platform modules

## Overview
Migrates custom Node.js API wrappers to stable `@effect/platform` modules (Command, FileSystem, Path), reducing custom infrastructure code by ~60-70% while preserving hexagonal architecture and domain-specific error handling.

## Changes

### Phase 1: Foundation Setup
- Added @effect/platform and @effect/platform-node integration
- Created PlatformLayer with NodeContext

### Phase 2: Path Migration
- Migrated all path operations to @effect/platform/Path
- Updated 50+ files to use platform Path service

### Phase 3: FileSystem Migration
- Migrated NodeFileSystemAdapter to @effect/platform/FileSystem
- Updated WorkspaceService and AI Watchers file operations
- Preserved domain error types with error mapping

### Phase 4: Git Command Migration
- Migrated NodeGitCommandRunner to @effect/platform/Command
- Implemented streaming for git progress
- Preserved timeout handling and error types

### Phase 5: Tmux/Process Migration
- Migrated TmuxSessionManagerAdapter to Command API
- Migrated NodeProcessMonitorAdapter to Command API
- Updated FIFO handling with platform services

### Phase 6: Cleanup & Documentation
- Removed deprecated Node.js imports
- Updated CLAUDE.md, README.md, and architecture docs
- Created PLATFORM_USAGE.md guide

## Metrics

### Code Reduction
- FileSystemAdapter: 432 → X lines (-Y%)
- GitCommandRunner: 200 → X lines (-Y%)
- TmuxSessionManager: 319 → X lines (-Y%)
- ProcessMonitor: 782 → X lines (-Y%)
- **Total: 1,733 → X lines (-Y%)** (Target: -60-70%)

### Performance
- Git operations: Similar/Improved
- File operations: Similar/Improved
- Memory usage: Similar/Improved

## Testing
- ✅ All unit tests pass
- ✅ Manual testing on both tiers
- ✅ Git operations verified
- ✅ File operations verified
- ✅ AI watchers verified
- ✅ Cross-platform compatibility maintained

## Documentation
- `/docs/platform-migration-plan.md` - Migration plan
- `/docs/platform-migration-progress.md` - Completion tracking
- `/docs/platform-migration-log.md` - Issues and lessons
- `/docs/PLATFORM_USAGE.md` - Usage guide
- Updated `CLAUDE.md` architecture section

## Breaking Changes
[None / List any breaking changes]

## Follow-up Work
- [ ] Monitor production for issues
- [ ] Migrate file watching to platform when available
- [ ] Consider Windows alternative to tmux

## Review Notes
Please review:
- Error mapping preserves domain errors correctly
- Scoped resources cleaned up properly
- Platform service dependencies declared correctly
- No performance regressions

---

Related: Closes #[issue-number] (if applicable)
```

---

## Tips for Using These Prompts

### For Best Results

1. **Always check progress first**: Before using any prompt, review the progress document to understand current state

2. **Update progress frequently**: Check off items as you complete them, don't batch updates

3. **Document issues immediately**: When you encounter problems, add them to the migration log right away

4. **Test incrementally**: Run tests after each major change, don't wait until the end of a phase

5. **Commit frequently**: Make small, focused commits so rollback is easier if needed

6. **Verify before moving on**: Use the "Verify Phase Completion" prompt before starting next phase

### Prompt Selection Guide

| Situation | Use This Prompt |
|-----------|----------------|
| Starting fresh | #1: Initial Implementation |
| Continuing same session | #2: Continue Progress |
| New conversation | #3: Resume After Context Loss |
| Finished a phase | #4: Verify Phase Completion |
| Hit a problem | #5: Handle Migration Issue |
| Check status | #6: Quick Status Check |
| Need to undo | #7: Roll Back Phase |
| Measuring success | #8: Collect Metrics |
| All done | #9: Create Pull Request |

### Prompt Chaining

You can chain prompts for complex workflows:

**Example: Start new session**
1. Use #3 (Resume After Context Loss) to understand state
2. Use #6 (Quick Status Check) to confirm
3. Use #2 (Continue Progress) to proceed

**Example: Complete and verify**
1. Use #2 (Continue Progress) to finish phase
2. Use #4 (Verify Phase Completion) to check
3. Use #8 (Collect Metrics) to measure

**Example: Hit issue**
1. Use #5 (Handle Migration Issue) to investigate
2. Use #7 (Roll Back Phase) if needed, OR
3. Use #2 (Continue Progress) with fix

### Customizing Prompts

Feel free to modify prompts by:
- Adding specific file paths to focus on
- Requesting more/less verbose output
- Combining multiple prompts
- Adding project-specific requirements

---

## Success Checklist

Use this to verify the migration is truly complete:

### Code Quality
- [ ] No `node:path` imports in main process
- [ ] No `node:fs` imports in main process (except deprecated code)
- [ ] No `node:child_process` imports (except deprecated code)
- [ ] All services have correct dependencies declared
- [ ] Domain errors preserved in all adapters
- [ ] No `any` types introduced

### Testing
- [ ] All unit tests pass (`pnpm test`)
- [ ] Manual testing completed for all features
- [ ] Both tiers build successfully (`pnpm build:all`)
- [ ] Application runs without errors (`pnpm dev`)
- [ ] Git operations work correctly
- [ ] File operations work correctly
- [ ] AI watchers work correctly (if applicable)

### Documentation
- [ ] `CLAUDE.md` updated with platform info
- [ ] `docs/PLATFORM_USAGE.md` created
- [ ] `docs/platform-migration-log.md` finalized
- [ ] `docs/platform-migration-progress.md` shows 100%
- [ ] All metrics collected and documented

### Clean-up
- [ ] Old code archived or deleted
- [ ] Deprecated imports removed
- [ ] Migration branch merged or ready for PR
- [ ] Backup branch created and retained

**When all items checked**: Migration complete! 🎉

---

## Additional Resources

- **Effect Platform Docs**: https://effect.website/docs/platform
- **Migration Plan**: `/docs/platform-migration-plan.md`
- **Progress Tracker**: `/docs/platform-migration-progress.md`
- **Migration Log**: `/docs/platform-migration-log.md` (created during Phase 1)
- **Platform Usage Guide**: `/docs/PLATFORM_USAGE.md` (created during Phase 6)
- **Project Architecture**: `CLAUDE.md`

---

## Quick Reference Commands

```bash
# Check migration status
cat docs/platform-migration-progress.md | grep "Status:"

# See what's changed
git diff --stat

# Run tests
pnpm test

# Build both tiers
pnpm build:all

# Check for deprecated imports
grep -r "from 'node:path'" src/main
grep -r "from 'node:fs" src/main
grep -r "from 'node:child_process'" src/main

# Create backup branch
git checkout -b backup/pre-platform-migration

# Revert uncommitted changes
git restore src/main/path/to/file.ts

# View recent commits
git log --oneline -10
```

---

Happy migrating! 🚀
