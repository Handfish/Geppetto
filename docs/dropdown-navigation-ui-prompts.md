# Dropdown Navigation UI Enhancement Implementation Prompts

These prompts help you implement the Dropdown Navigation UI enhancement in incremental, manageable steps. Use them to start, continue, or resume the work.

---

## 1. Initial Implementation Prompt

```
Implement the Dropdown Navigation UI Enhancement following the plan in `/docs/dropdown-navigation-ui-plan.md`. Start with Phase 1: RepositoryDropdown Arrow Key Navigation. Create a reusable keyboard navigation hook following the pattern from `useGraphKeyboardShortcuts`. Then proceed with Phase 2: IssuesModal Issue Navigation with arrow keys, spacebar to toggle selection. Phase 3: Per-Issue AI Agent Selection - CRITICAL: when an issue is shortlisted (checked), left/right arrow keys should cycle the AI agent type (claude-code → codex → cursor) for that specific issue. Display the selected agent as a badge on the issue row. When launching, each issue should use its individually selected agent, not the global provider selector. Finally Phase 4: Documentation and polish. Follow EffectTS best practices - use Schema.parse not validate, handle errors in an Effectful way. Keep hooks clean and reusable. Use proper ref management for focus and scrolling. Update `/docs/dropdown-navigation-ui-progress.md` after completing each phase, checking off items as you finish. Test thoroughly after each phase.
```

**When to use**: Starting the feature implementation from scratch

**What it does**:
- Creates `useDropdownKeyboardNavigation` hook for arrow key navigation in dropdowns
- Updates RepositoryDropdown with focus state and visual indicators
- Creates `useIssueModalKeyboardNavigation` hook for issue navigation
- Updates IssuesModal with issue navigation and spacebar toggle
- **Implements per-issue AI agent selection** - each shortlisted issue can have its own agent type
- **Left/Right arrows cycle agent type** for the focused issue (only if shortlisted)
- Displays agent badge on shortlisted issues
- Launches each issue with its individually selected agent
- Updates help text and documentation
- Updates progress tracker after each phase

**Expected duration**: ~8-11 hours total across 4 phases

**Expected outcome**:
- ✅ RepositoryDropdown navigable with arrow keys
- ✅ IssuesModal navigable with arrow keys
- ✅ Spacebar toggles issue selection
- ✅ **Per-issue AI agent selection with left/right arrows**
- ✅ **Agent badges display on shortlisted issues**
- ✅ **Each issue launches with its own selected agent**
- ✅ Enter launches watchers with per-issue agents
- ✅ Escape closes modal
- ✅ Visual focus indicators clear
- ✅ All phases marked complete in progress tracker

---

## 2. Continue Progress Prompt

```
Continue implementing the Dropdown Navigation UI Enhancement from where you left off. First, read `/docs/dropdown-navigation-ui-progress.md` to see which phases and sections are completed. Then proceed with the next uncompleted phase from `/docs/dropdown-navigation-ui-plan.md`. Work through each checklist item systematically, testing as you go. Follow the keyboard navigation patterns from `useGraphKeyboardShortcuts` - use capture phase event listeners, check for input/textarea focus, handle wrapping behavior. For Phase 3, ensure left/right arrows ONLY work when the focused issue is shortlisted (checked). The agent selection is per-issue - each issue can have a different agent type. Store this in a Map<number, AgentType>. When launching, iterate through shortlisted issues and use each issue's specific agent, not the global provider selector. Update the progress document after completing each section, checking off items and adding notes. If you encounter issues, document them in the progress file.
```

**When to use**: Continuing work in the same or a new session

**What it does**:
- Reads current progress from `dropdown-navigation-ui-progress.md`
- Identifies next incomplete phase/section
- Continues implementation from that point
- Tests each change incrementally
- Updates progress tracker with checkmarks
- Documents issues and discoveries

**Expected behavior**:
- Picks up exactly where previous session left off
- Works through next phase systematically
- Maintains keyboard hook patterns
- Updates progress metrics

**Phases it might continue**:
- Phase 1: RepositoryDropdown Arrow Key Navigation
- Phase 2: IssuesModal Issue Navigation
- Phase 3: Per-Issue AI Agent Selection (left/right arrows)
- Phase 4: Documentation & Polish

**Critical Phase 3 Details**:
- `issueAgents` state is `Map<number, 'claude-code' | 'codex' | 'cursor'>`
- Default agent is `selectedProvider` (global dropdown)
- Per-issue agent overrides default
- Left/Right arrows only work on shortlisted (checked) issues
- Visual badge shows agent on shortlisted issues
- Launch uses per-issue agent, NOT global provider

---

## 3. Resume After Context Loss Prompt

```
Resume the Dropdown Navigation UI Enhancement implementation. First, analyze the current state by: 1) Reading `/docs/dropdown-navigation-ui-progress.md` to see what phases are marked complete, 2) Checking which files from the plan exist by running `git status` and looking for new files in `src/renderer/hooks/` (useDropdownKeyboardNavigation.ts, useIssueModalKeyboardNavigation.ts), 3) Running `git log --oneline --all -20` to see recent commits related to this feature, 4) Scanning key files to verify actual implementation: check RepositoryDropdown for focusedItemIndex state and menuItemRefs, check IssuesModal for focusedIssueIndex state and issueAgents Map, check if IssueRow displays agent badges on shortlisted issues, and verify the navigation hooks handle arrow keys correctly. Compare the actual code state against what's marked complete in the progress document. Pay special attention to Phase 3 - verify that issueAgents is a Map storing per-issue agent selection, verify left/right arrows only work on shortlisted issues, verify agent badges display, and verify handleLaunch uses per-issue agents. Then continue from the next uncompleted item in `/docs/dropdown-navigation-ui-plan.md`. Follow keyboard navigation patterns from useGraphKeyboardShortcuts - capture phase listeners, proper cleanup, wrapping behavior.
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
   - **Validates per-issue agent selection implementation**

3. **Resume**:
   - Continues from correct point
   - Completes any partial work
   - Proceeds with next phase

**Key files to check**:
- `src/renderer/hooks/useDropdownKeyboardNavigation.ts` - Arrow navigation hook
- `src/renderer/hooks/useIssueModalKeyboardNavigation.ts` - Issue navigation hook (with left/right)
- `src/renderer/components/ui/RepositoryDropdown.tsx` - Focus state, menuItemRefs
- `src/renderer/components/ai-watchers/IssuesModal.tsx` - **issueAgents Map, cycleIssueAgent helper**
- `src/renderer/components/ai-watchers/IssuesModal.tsx` IssueRow - **Agent badge display**
- `src/renderer/hooks/useAiWatcherLauncher.ts` - Single issue launch

**Critical Phase 3 Validation**:
- Check `issueAgents` state exists: `Map<number, 'claude-code' | 'codex' | 'cursor'>`
- Check `getIssueAgent` helper exists
- Check `cycleIssueAgent` helper exists
- Check navigation hook has `onCycleAgentLeft` and `onCycleAgentRight`
- Check IssueRow displays agent badge when `isShortlisted && selectedAgent`
- Check `handleLaunch` iterates issues and uses `getIssueAgent(issue.number)`

**Expected outcome**:
- Accurate understanding of current state
- Clean continuation from correct point
- No duplicate or skipped work
- Per-issue agent selection validated

---

## Tips for Using These Prompts

### For Best Results

1. **Always check progress first**: Review the progress document before starting work
2. **Update progress frequently**: Check off items as you complete them
3. **Test incrementally**: Run the app after each major change to catch issues early
4. **Follow keyboard hook patterns**: Use capture phase, check input focus, handle wrapping
5. **Proper ref management**: Forward refs, maintain ref arrays, scroll into view
6. **Per-issue state**: Use Map for per-issue agent selection, not array

### Prompt Selection Guide

| Situation | Use This Prompt |
|-----------|----------------|
| Starting fresh | #1: Initial Implementation |
| Continuing same session | #2: Continue Progress |
| New conversation | #3: Resume After Context Loss |

### Architecture Reminders

**Keyboard Hook Pattern** (from useGraphKeyboardShortcuts):
- Use capture phase: `{ capture: true }`
- Check for input/textarea focus
- Handle wrapping with modulo
- Proper dependency arrays
- Cleanup in useEffect return

**Focus Management**:
- Use `useRef` for element arrays
- Forward refs to components
- Scroll focused element into view
- Reset focus when opening/closing

**Per-Issue Agent Selection**:
- State: `Map<number, AgentType>` where key is issue number
- Default: Falls back to global `selectedProvider`
- Override: Set in map when user presses left/right
- Launch: Use `getIssueAgent(issue.number)` for each issue

**Visual Feedback**:
- Focus ring: `ring-2 ring-teal-500/50`
- Agent badge: Only show when shortlisted
- Hint text: Show when focused and shortlisted
- Color coding: Teal for selected agent

---

## Quick Reference Commands

```bash
# Run development server
pnpm dev

# Compile and check types
pnpm compile:app

# Check progress
cat docs/dropdown-navigation-ui-progress.md | grep "Status:"

# See recent changes
git status
git diff --stat

# Check for new files
ls -la src/renderer/hooks/
ls -la src/renderer/components/ui/
ls -la src/renderer/components/ai-watchers/

# Search for specific implementations
grep -r "useDropdownKeyboardNavigation" src/renderer
grep -r "useIssueModalKeyboardNavigation" src/renderer
grep -r "issueAgents" src/renderer
grep -r "cycleIssueAgent" src/renderer
```

---

## Phase 3 Implementation Checklist

Since Phase 3 is the most complex, here's a detailed checklist:

### State Setup
- [ ] Add `issueAgents: Map<number, AgentType>` state
- [ ] Reset map when modal closes
- [ ] Create `getIssueAgent(issueNumber)` helper
- [ ] Create `cycleIssueAgent(issueNumber, direction)` helper

### Hook Updates
- [ ] Add `onCycleAgentLeft` to hook options
- [ ] Add `onCycleAgentRight` to hook options
- [ ] Handle `ArrowLeft` in keydown handler
- [ ] Handle `ArrowRight` in keydown handler

### Component Integration
- [ ] Wire `onCycleAgentLeft` to navigation hook
- [ ] Wire `onCycleAgentRight` to navigation hook
- [ ] Only allow cycling for shortlisted issues
- [ ] Pass `selectedAgent` prop to IssueRow

### IssueRow Updates
- [ ] Accept `selectedAgent` prop
- [ ] Display agent badge when shortlisted
- [ ] Show hint text when focused and shortlisted
- [ ] Style badge with agent-specific color

### Launch Integration
- [ ] Update `handleLaunch` to use per-issue agents
- [ ] Iterate shortlisted issues
- [ ] Call `launchWatcherForIssue` with `getIssueAgent(issue.number)`
- [ ] Verify each issue launches with correct agent

---

Happy implementing! 🚀
