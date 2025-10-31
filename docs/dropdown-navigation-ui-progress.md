# Dropdown Navigation UI Enhancement Progress

**Last Updated**: 2025-10-31
**Status**: ⏳ Not Started
**Current Phase**: Phase 1

---

## Phase Completion Overview

- [ ] Phase 1: RepositoryDropdown Arrow Key Navigation (2-3 hours) ⏳
- [ ] Phase 2: IssuesModal Issue Navigation (2-3 hours) ⏳
- [ ] Phase 3: Per-Issue AI Agent Selection (3-4 hours) ⏳
- [ ] Phase 4: Keyboard Navigation Documentation & Polish (1 hour) ⏳

**Total Estimated Time**: 8-11 hours
**Time Spent**: 0 hours
**Progress**: 0%

---

## Phase 1: RepositoryDropdown Arrow Key Navigation ⏳

**Status**: Not Started
**Duration**: TBD
**Target**: 2-3 hours
**Completed**: TBD

### 1.1 Create Dropdown Keyboard Navigation Hook ⏳
- [ ] Create `src/renderer/hooks/useDropdownKeyboardNavigation.ts`
- [ ] Implement arrow key navigation (Up/Down)
- [ ] Implement Enter key selection
- [ ] Implement Home/End navigation
- [ ] Add wrapping behavior at boundaries
- [ ] Add proper TypeScript types
- [ ] Handle disabled state

### 1.2 Update RepositoryDropdown Component ⏳
- [ ] Add state for `focusedItemIndex`
- [ ] Create `menuItemRefs` ref array
- [ ] Define `menuItems` array with useMemo
- [ ] Filter disabled items from navigation
- [ ] Reset focus when dropdown opens
- [ ] Implement scroll-to-focused behavior
- [ ] Integrate keyboard navigation hook
- [ ] Update MenuItem component to accept `isFocused` prop
- [ ] Add visual focus indicator (ring)

### 1.3 Testing ⏳
- [ ] Run `pnpm compile:app` - verify no type errors
- [ ] Run `pnpm dev`
- [ ] Test arrow key navigation
- [ ] Test Enter key selection
- [ ] Test disabled items are skipped
- [ ] Test visual focus indicator
- [ ] Test wrapping at top/bottom
- [ ] Test Home/End keys

**Success Criteria**:
- [ ] Arrow keys navigate menu items
- [ ] Enter selects focused item
- [ ] Disabled items are skipped
- [ ] Visual focus indicator clear
- [ ] Wrapping works correctly
- [ ] No type errors

---

## Phase 2: IssuesModal Issue Navigation ⏳

**Status**: Not Started
**Duration**: TBD
**Target**: 2-3 hours
**Completed**: TBD

### 2.1 Add Issue Navigation State to IssuesModal ⏳
- [ ] Add `focusedIssueIndex` state
- [ ] Create `issueRowRefs` ref array
- [ ] Reset focus when modal opens
- [ ] Implement scroll-to-focused behavior

### 2.2 Create Issue Navigation Hook ⏳
- [ ] Create `src/renderer/hooks/useIssueModalKeyboardNavigation.ts`
- [ ] Implement arrow key navigation (Up/Down)
- [ ] Implement Spacebar toggle selection
- [ ] Implement Enter launch
- [ ] Implement Escape close
- [ ] Add proper TypeScript types

### 2.3 Update IssuesModal Component ⏳
- [ ] Import and integrate navigation hook
- [ ] Get issues array from Result
- [ ] Wire up navigation callbacks
- [ ] Wire up toggle selection
- [ ] Wire up launch callback
- [ ] Update IssueRow to forward ref
- [ ] Pass `isFocused` prop to IssueRow

### 2.4 Update IssueRow Component ⏳
- [ ] Update to forwardRef
- [ ] Accept `isFocused` prop
- [ ] Add focus ring when focused
- [ ] Maintain memo optimization

### 2.5 Testing ⏳
- [ ] Run `pnpm compile:app` - verify no type errors
- [ ] Run `pnpm dev`
- [ ] Test arrow key navigation
- [ ] Test Spacebar toggles selection
- [ ] Test Enter launches watchers
- [ ] Test Escape closes modal
- [ ] Test visual focus indicator
- [ ] Test smooth scrolling

**Success Criteria**:
- [ ] Arrow keys navigate issues
- [ ] Spacebar toggles selection
- [ ] Enter launches watchers
- [ ] Escape closes modal
- [ ] Visual focus indicator clear
- [ ] Smooth scrolling to focused item

---

## Phase 3: Per-Issue AI Agent Selection ⏳

**Status**: Not Started
**Duration**: TBD
**Target**: 3-4 hours
**Completed**: TBD

### 3.1 Add Per-Issue Agent State ⏳
- [ ] Add `issueAgents` state (Map<number, AgentType>)
- [ ] Reset per-issue agents when modal closes
- [ ] Create `getIssueAgent` helper
- [ ] Create `cycleIssueAgent` helper

### 3.2 Update Keyboard Navigation Hook ⏳
- [ ] Add `onCycleAgentLeft` callback
- [ ] Add `onCycleAgentRight` callback
- [ ] Implement Left arrow handler
- [ ] Implement Right arrow handler

### 3.3 Wire Up Agent Cycling in IssuesModal ⏳
- [ ] Wire `onCycleAgentLeft` to navigation hook
- [ ] Wire `onCycleAgentRight` to navigation hook
- [ ] Only allow cycling for shortlisted issues

### 3.4 Update IssueRow to Display Selected Agent ⏳
- [ ] Add `selectedAgent` prop
- [ ] Display agent badge when shortlisted
- [ ] Show visual hint when focused and shortlisted
- [ ] Style agent badge with color

### 3.5 Update Launch Handler ⏳
- [ ] Modify `handleLaunch` to use per-issue agents
- [ ] Launch each issue with its specific agent
- [ ] Verify agent selection preserved

### 3.6 Update useAiWatcherLauncher Hook ⏳
- [ ] Remove batch `launchWatchersForIssues` method
- [ ] Keep single `launchWatcherForIssue` method
- [ ] Ensure sequential launching works from modal

### 3.7 Testing ⏳
- [ ] Run `pnpm compile:app` - verify no type errors
- [ ] Run `pnpm dev`
- [ ] Test Left/Right only work on shortlisted issues
- [ ] Test agent badge displays
- [ ] Test agent cycles through all options
- [ ] Test agent wraps correctly
- [ ] Test launch uses per-issue agent
- [ ] Test multiple issues with different agents
- [ ] Verify visual hint appears

**Success Criteria**:
- [ ] Left/Right arrows only work on shortlisted issues
- [ ] Agent badge displays on shortlisted issues
- [ ] Agent cycles through all three options
- [ ] Agent wraps correctly
- [ ] Launch uses per-issue agent
- [ ] Visual hint shows when focused on shortlisted issue

---

## Phase 4: Keyboard Navigation Documentation & Polish ⏳

**Status**: Not Started
**Duration**: TBD
**Target**: 1 hour
**Completed**: TBD

### 4.1 Update Modal Help Text ⏳
- [ ] Update header with keyboard shortcuts
- [ ] Use arrow symbols (↑↓←→)
- [ ] Keep concise and clear

### 4.2 Add Keyboard Shortcut Legend (Optional) ⏳
- [ ] Add toggle button for shortcuts
- [ ] Create keyboard shortcut legend popup
- [ ] Style with glassmorphism
- [ ] Use `<kbd>` elements for keys
- [ ] List all shortcuts with descriptions

### 4.3 Update CLAUDE.md ⏳
- [ ] Add Keyboard Navigation section
- [ ] Document RepositoryDropdown shortcuts
- [ ] Document IssuesModal shortcuts
- [ ] Document implementation pattern
- [ ] Reference hooks by name

### 4.4 Testing ⏳
- [ ] Run full end-to-end test
- [ ] Test complete workflow from dropdown to launch
- [ ] Verify all shortcuts documented
- [ ] Verify visual hints clear
- [ ] Test accessibility (keyboard-only navigation)

**Success Criteria**:
- [ ] All keyboard shortcuts documented
- [ ] Visual hints clear and helpful
- [ ] No accessibility issues
- [ ] Smooth user experience
- [ ] CLAUDE.md updated

---

## Code Quality Checklist

### Architecture
- [ ] Keyboard hooks follow useGraphKeyboardShortcuts pattern
- [ ] Clean separation of concerns (hooks vs components)
- [ ] Proper ref management
- [ ] State updates optimized

### Type Safety
- [ ] No `any` types introduced
- [ ] All hook options properly typed
- [ ] Ref types correct
- [ ] Event types correct

### Best Practices
- [ ] Schema.parse used consistently
- [ ] useCallback for event handlers
- [ ] useMemo for derived state
- [ ] useEffect cleanup functions
- [ ] Proper dependency arrays

### UI/UX
- [ ] Visual feedback immediate
- [ ] Focus rings visible
- [ ] Smooth scrolling
- [ ] No focus traps
- [ ] Keyboard-only navigation works

---

## Issues Encountered

Document any issues discovered during implementation:

### Issue 1: [Title]
- **Phase**: [Phase number]
- **Description**: [What went wrong]
- **Solution**: [How it was fixed]
- **Impact**: [Effect on implementation]

---

## Lessons Learned

Document insights and patterns discovered:

1. **[Lesson Title]**
   - What we learned
   - Why it matters
   - How to apply it

---

## Feature Metrics

Track actual vs. expected outcomes:

| Metric | Expected | Actual | Status |
|--------|----------|--------|--------|
| Dropdown Navigation | Arrow keys + Enter | ? | ⏳ |
| Issues Navigation | Arrow keys + Space | ? | ⏳ |
| AI Agent Selection | Left/Right per issue | ? | ⏳ |
| Launch/Abort | Enter/Escape | ? | ⏳ |
| Visual Feedback | Focus rings | ? | ⏳ |
| Code Additions | ~400 lines | ? | ⏳ |

---

## Next Steps After Completion

- [ ] Update CLAUDE.md with keyboard patterns
- [ ] Add keyboard navigation to other dropdowns
- [ ] Consider vim-style navigation (j/k)
- [ ] Add search filtering in issues modal
- [ ] Add bulk agent assignment
- [ ] Consider accessibility audit

---

## Rollback Information

**Backup Branch**: `backup/pre-dropdown-navigation-ui`
**Rollback Commands**:
```bash
# Full rollback
git checkout main
git reset --hard backup/pre-dropdown-navigation-ui
```

---

## Implementation Completion Checklist

### Pre-Completion
- [ ] All 4 phases completed
- [ ] No type errors (`pnpm compile:app`)
- [ ] App runs without errors (`pnpm dev`)
- [ ] All features tested manually

### Verification
- [ ] Dropdown navigation works
- [ ] Issue navigation works
- [ ] Per-issue agent selection works
- [ ] Visual feedback clear
- [ ] Keyboard shortcuts documented

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
