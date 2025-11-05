# Dropdown Navigation UI Enhancement Plan

## Overview

Add comprehensive keyboard navigation to RepositoryDropdown and IssuesModal:
1. **Arrow Key Navigation**: Up/Down keys navigate dropdown menu items when dropdown is open
2. **Enter Key Selection**: Enter key selects the focused menu item
3. **Issues Panel Navigation**: Arrow keys navigate issues list when IssuesModal is open
4. **Issue Checkbox Toggle**: Spacebar toggles issue selection
5. **AI Agent Switching**: Left/Right arrows switch AI agent type for checked issues
6. **Launch/Abort**: Enter launches runners, Escape aborts

**Status**: Not Started
**Target Completion**: 1-2 days
**Primary Goal**: Create keyboard-first navigation for dropdown menus and issue panels with AI agent selection per issue

---

## Architecture Principles

### Effect Patterns

**Schema Usage**: ALWAYS use `Schema.parse` (never validate/decode directly)
```typescript
const config = Schema.parse(AiRunnerConfig, rawConfig)  // ✅ CORRECT
```

**Error Handling**: Use tagged errors with Effect
```typescript
class NavigationError extends Data.TaggedError('NavigationError')<{
  message: string
}> {}
```

**State Management**: Use React state for local UI concerns
```typescript
const [focusedIndex, setFocusedIndex] = useState(0)
const [issueAgents, setIssueAgents] = useState<Map<number, AiAgentType>>(new Map())
```

### UI Patterns

**Keyboard Navigation Hook**: Dedicated hook per component
```typescript
useDropdownKeyboardNavigation({
  isOpen: boolean,
  itemCount: number,
  onNavigate: (index: number) => void,
  onSelect: () => void,
  enabled: boolean,
})
```

**Focus Management**: Use refs to track focused elements
```typescript
const menuItemRefs = useRef<(HTMLButtonElement | null)[]>([])
```

**Visual Feedback**: Clear indication of focused state
```typescript
className={`${isFocused ? 'bg-gray-700/60 ring-2 ring-teal-500/50' : ''}`}
```

### Domain-Driven Design

**Per-Issue Agent Selection**: Map of issue number → agent type
```typescript
// State structure
const issueAgents = Map<number, 'claude-code' | 'codex' | 'cursor'>

// Default: claude-code for all
// User can customize per issue with left/right arrows
```

**Separation of Concerns**:
- RepositoryDropdown: Menu navigation only
- IssuesModal: Issue navigation + agent selection + launch orchestration
- Hooks: Keyboard logic isolation

---

## Phase 1: RepositoryDropdown Arrow Key Navigation

**Duration**: 2-3 hours
**Risk**: Low
**Impact**: Enables keyboard-first dropdown navigation

### 1.1 Create Dropdown Keyboard Navigation Hook

**File**: `src/renderer/hooks/useDropdownKeyboardNavigation.ts`
```typescript
import { useEffect, useCallback, useRef } from 'react'

export interface DropdownKeyboardNavigationOptions {
  /** Is dropdown open? */
  isOpen: boolean

  /** Total number of navigable items */
  itemCount: number

  /** Current focused index */
  focusedIndex: number

  /** Callback when navigation occurs */
  onNavigate: (index: number) => void

  /** Callback when Enter is pressed */
  onSelect: () => void

  /** Enable/disable navigation */
  enabled?: boolean
}

/**
 * useDropdownKeyboardNavigation Hook
 *
 * Provides arrow key navigation for dropdown menus.
 * - Up/Down: Navigate between items
 * - Enter: Select focused item
 * - Home/End: Jump to first/last item
 */
export function useDropdownKeyboardNavigation({
  isOpen,
  itemCount,
  focusedIndex,
  onNavigate,
  onSelect,
  enabled = true,
}: DropdownKeyboardNavigationOptions) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Only handle keys when enabled and dropdown is open
      if (!enabled || !isOpen || itemCount === 0) return

      // Don't trigger if typing in input/textarea
      const target = event.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return
      }

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault()
          // Move to next item (wrap to first if at end)
          onNavigate((focusedIndex + 1) % itemCount)
          break

        case 'ArrowUp':
          event.preventDefault()
          // Move to previous item (wrap to last if at beginning)
          onNavigate((focusedIndex - 1 + itemCount) % itemCount)
          break

        case 'Home':
          event.preventDefault()
          onNavigate(0)
          break

        case 'End':
          event.preventDefault()
          onNavigate(itemCount - 1)
          break

        case 'Enter':
          event.preventDefault()
          onSelect()
          break
      }
    },
    [enabled, isOpen, itemCount, focusedIndex, onNavigate, onSelect]
  )

  useEffect(() => {
    if (!enabled || !isOpen) return

    document.addEventListener('keydown', handleKeyDown, { capture: true })

    return () => {
      document.removeEventListener('keydown', handleKeyDown, { capture: true })
    }
  }, [enabled, isOpen, handleKeyDown])
}
```

### 1.2 Update RepositoryDropdown Component

**File**: `src/renderer/components/ui/RepositoryDropdown.tsx`

**Changes**:
1. Add state for focused menu item index
2. Track navigable menu items (non-disabled only)
3. Add refs for menu items
4. Integrate keyboard navigation hook
5. Add visual focus indicator
6. Handle Enter key selection

```typescript
// Add imports
import { useDropdownKeyboardNavigation } from '../../hooks/useDropdownKeyboardNavigation'

// Inside RepositoryDropdown component:
const [focusedItemIndex, setFocusedItemIndex] = useState(0)
const menuItemRefs = useRef<(HTMLButtonElement | null)[]>([])

// Define navigable menu items
const menuItems = useMemo(() => {
  const items: Array<{ label: string; onClick: () => void; disabled?: boolean }> = [
    {
      label: isCheckingWorkspace
        ? 'Checking Workspace...'
        : cloneResult.waiting
          ? 'Cloning...'
          : isInWorkspace
            ? 'Already in Workspace'
            : 'Clone to Workspace',
      onClick: handleClone,
      disabled: isInWorkspace || cloneResult.waiting || isCheckingWorkspace,
    },
    {
      label: isCheckingWorkspace
        ? 'Checking...'
        : !isInWorkspace
          ? 'View Issues (Clone First)'
          : 'View Issues',
      onClick: () => {
        if (issuesButtonRef.current) {
          savedButtonPositionRef.current = issuesButtonRef.current.getBoundingClientRect()
        }
        setShowIssuesModal(true)
        onOpenChange(false)
      },
      disabled: !isInWorkspace || isCheckingWorkspace,
    },
    // Add other menu items...
  ]

  // Filter out disabled items for navigation
  return items.filter(item => !item.disabled)
}, [isCheckingWorkspace, isInWorkspace, cloneResult.waiting])

// Reset focus when dropdown opens
useEffect(() => {
  if (isOpen) {
    setFocusedItemIndex(0)
  }
}, [isOpen])

// Scroll focused item into view
useEffect(() => {
  if (isOpen && menuItemRefs.current[focusedItemIndex]) {
    menuItemRefs.current[focusedItemIndex]?.scrollIntoView({
      block: 'nearest',
      behavior: 'smooth',
    })
  }
}, [focusedItemIndex, isOpen])

// Keyboard navigation hook
useDropdownKeyboardNavigation({
  isOpen,
  itemCount: menuItems.length,
  focusedIndex: focusedItemIndex,
  onNavigate: setFocusedItemIndex,
  onSelect: () => {
    // Trigger onClick for focused item
    menuItems[focusedItemIndex]?.onClick()
  },
  enabled: isOpen,
})
```

**Update MenuItem Component**:
```typescript
const MenuItem = React.forwardRef<
  HTMLButtonElement,
  MenuItemProps & { isFocused?: boolean }
>(({ icon: IconComponent, label, badge, disabled, onClick, isFocused }, ref) => {
  return (
    <button
      ref={ref}
      className={`
        w-full px-3 py-2 flex items-center justify-between gap-3 text-sm text-gray-200
        hover:bg-gray-700/40 hover:text-white
        transition-colors cursor-pointer group
        disabled:opacity-50 disabled:cursor-not-allowed
        ${isFocused ? 'bg-gray-700/60 ring-2 ring-inset ring-teal-500/50' : ''}
      `}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {/* ... existing content ... */}
    </button>
  )
})
```

### 1.3 Testing

```bash
# Compile and verify types
pnpm compile:app

# Run app
pnpm dev

# Manual verification:
# - Open repository dropdown
# - Press Down arrow - verify focus moves to next item
# - Press Up arrow - verify focus moves to previous item
# - Press Enter - verify focused item is selected
# - Verify disabled items are skipped
# - Verify visual focus indicator appears
# - Verify wrapping at top/bottom
```

**Success Criteria**:
- ✅ Arrow keys navigate menu items
- ✅ Enter selects focused item
- ✅ Disabled items are skipped
- ✅ Visual focus indicator clear
- ✅ Wrapping works correctly
- ✅ No type errors

---

## Phase 2: IssuesModal Issue Navigation

**Duration**: 2-3 hours
**Risk**: Low
**Impact**: Keyboard navigation for issues list

### 2.1 Add Issue Navigation State to IssuesModal

**File**: `src/renderer/components/ai-runners/IssuesModal.tsx`

```typescript
// Add state for focused issue
const [focusedIssueIndex, setFocusedIssueIndex] = useState(0)
const issueRowRefs = useRef<(HTMLButtonElement | null)[]>([])

// Reset focus when modal opens
useEffect(() => {
  if (isOpen) {
    setFocusedIssueIndex(0)
  }
}, [isOpen])

// Scroll focused issue into view
useEffect(() => {
  const issuesCount = Result.getOrElse(issuesResult, () => [] as GitHubIssue[]).length
  if (isOpen && issuesCount > 0 && issueRowRefs.current[focusedIssueIndex]) {
    issueRowRefs.current[focusedIssueIndex]?.scrollIntoView({
      block: 'nearest',
      behavior: 'smooth',
    })
  }
}, [focusedIssueIndex, isOpen, issuesResult])
```

### 2.2 Create Issue Navigation Hook

**File**: `src/renderer/hooks/useIssueModalKeyboardNavigation.ts`

```typescript
import { useEffect, useCallback } from 'react'

export interface IssueModalKeyboardNavigationOptions {
  /** Is modal open? */
  isOpen: boolean

  /** Total number of issues */
  issueCount: number

  /** Current focused issue index */
  focusedIndex: number

  /** Callback when navigation occurs */
  onNavigate: (index: number) => void

  /** Callback when spacebar is pressed (toggle selection) */
  onToggleSelection: () => void

  /** Callback when Enter is pressed (launch runners) */
  onLaunch: () => void

  /** Callback when Escape is pressed (close modal) */
  onClose: () => void

  /** Enable/disable navigation */
  enabled?: boolean
}

export function useIssueModalKeyboardNavigation({
  isOpen,
  issueCount,
  focusedIndex,
  onNavigate,
  onToggleSelection,
  onLaunch,
  onClose,
  enabled = true,
}: IssueModalKeyboardNavigationOptions) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled || !isOpen || issueCount === 0) return

      // Don't trigger if typing in input/textarea/select
      const target = event.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return
      }

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault()
          onNavigate((focusedIndex + 1) % issueCount)
          break

        case 'ArrowUp':
          event.preventDefault()
          onNavigate((focusedIndex - 1 + issueCount) % issueCount)
          break

        case ' ': // Spacebar
          event.preventDefault()
          onToggleSelection()
          break

        case 'Enter':
          event.preventDefault()
          onLaunch()
          break

        case 'Escape':
          event.preventDefault()
          onClose()
          break
      }
    },
    [enabled, isOpen, issueCount, focusedIndex, onNavigate, onToggleSelection, onLaunch, onClose]
  )

  useEffect(() => {
    if (!enabled || !isOpen) return

    document.addEventListener('keydown', handleKeyDown, { capture: true })

    return () => {
      document.removeEventListener('keydown', handleKeyDown, { capture: true })
    }
  }, [enabled, isOpen, handleKeyDown])
}
```

### 2.3 Update IssuesModal Component

```typescript
// Import hook
import { useIssueModalKeyboardNavigation } from '../../hooks/useIssueModalKeyboardNavigation'

// Inside IssuesModalContent:
const issues = Result.getOrElse(issuesResult, () => [] as GitHubIssue[])

// Keyboard navigation
useIssueModalKeyboardNavigation({
  isOpen,
  issueCount: issues.length,
  focusedIndex: focusedIssueIndex,
  onNavigate: setFocusedIssueIndex,
  onToggleSelection: () => {
    if (issues[focusedIssueIndex]) {
      toggleShortlist(issues[focusedIssueIndex].number)
    }
  },
  onLaunch: handleLaunch,
  onClose: onClose,
  enabled: isOpen,
})

// Update IssueRow to receive ref and focus state
<IssueRow
  ref={(el) => (issueRowRefs.current[index] = el)}
  isFocused={index === focusedIssueIndex}
  isShortlisted={shortlist.has(issue.number)}
  issue={issue}
  key={issue.number}
  onToggle={toggleShortlist}
/>
```

### 2.4 Update IssueRow Component

```typescript
const IssueRow = memo(
  React.forwardRef<
    HTMLButtonElement,
    IssueRowProps & { isFocused?: boolean }
  >(function IssueRow({ issue, isShortlisted, isFocused, onToggle }, ref) {
    return (
      <button
        ref={ref}
        className={`
          w-full p-3 rounded-lg border transition-all text-left
          ${
            isShortlisted
              ? 'border-teal-500/50 bg-teal-500/10'
              : 'border-gray-700/50 bg-gray-800/30 hover:bg-gray-700/40'
          }
          ${isFocused ? 'ring-2 ring-teal-500/50' : ''}
        `}
        onClick={() => onToggle(issue.number)}
        type="button"
      >
        {/* ... existing content ... */}
      </button>
    )
  })
)
```

### 2.5 Testing

```bash
# Run app
pnpm dev

# Manual verification:
# - Open issues modal
# - Press Down arrow - verify focus moves down
# - Press Up arrow - verify focus moves up
# - Press Spacebar - verify issue toggles selection
# - Verify visual focus ring appears
# - Press Enter - verify runners launch
# - Press Escape - verify modal closes
```

**Success Criteria**:
- ✅ Arrow keys navigate issues
- ✅ Spacebar toggles selection
- ✅ Enter launches runners
- ✅ Escape closes modal
- ✅ Visual focus indicator clear
- ✅ Smooth scrolling to focused item

---

## Phase 3: Per-Issue AI Agent Selection

**Duration**: 3-4 hours
**Risk**: Medium
**Impact**: Left/Right arrows switch AI agent per checked issue

### 3.1 Add Per-Issue Agent State

**File**: `src/renderer/components/ai-runners/IssuesModal.tsx`

```typescript
// Add state for per-issue agent selection
// Map of issue number → AI agent type
// Default: all issues use global selectedProvider
const [issueAgents, setIssueAgents] = useState<Map<number, 'claude-code' | 'codex' | 'cursor'>>(
  new Map()
)

// Reset per-issue agents when modal closes
useEffect(() => {
  if (!isOpen) {
    setShortlist(new Set())
    setIssueAgents(new Map())
  }
}, [isOpen])

// Helper to get effective agent for an issue
const getIssueAgent = useCallback(
  (issueNumber: number): 'claude-code' | 'codex' | 'cursor' => {
    return issueAgents.get(issueNumber) ?? selectedProvider
  },
  [issueAgents, selectedProvider]
)

// Helper to cycle agent for an issue
const cycleIssueAgent = useCallback(
  (issueNumber: number, direction: 'left' | 'right') => {
    const agents: Array<'claude-code' | 'codex' | 'cursor'> = [
      'claude-code',
      'codex',
      'cursor',
    ]

    const currentAgent = getIssueAgent(issueNumber)
    const currentIndex = agents.indexOf(currentAgent)

    let nextIndex: number
    if (direction === 'right') {
      nextIndex = (currentIndex + 1) % agents.length
    } else {
      nextIndex = (currentIndex - 1 + agents.length) % agents.length
    }

    setIssueAgents((prev) => {
      const next = new Map(prev)
      next.set(issueNumber, agents[nextIndex])
      return next
    })
  },
  [getIssueAgent]
)
```

### 3.2 Update Keyboard Navigation Hook

**File**: `src/renderer/hooks/useIssueModalKeyboardNavigation.ts`

Add left/right arrow callbacks:
```typescript
export interface IssueModalKeyboardNavigationOptions {
  // ... existing options

  /** Callback when left arrow is pressed on selected issue */
  onCycleAgentLeft?: () => void

  /** Callback when right arrow is pressed on selected issue */
  onCycleAgentRight?: () => void
}

// In handleKeyDown:
case 'ArrowLeft':
  event.preventDefault()
  onCycleAgentLeft?.()
  break

case 'ArrowRight':
  event.preventDefault()
  onCycleAgentRight?.()
  break
```

### 3.3 Wire Up Agent Cycling in IssuesModal

```typescript
useIssueModalKeyboardNavigation({
  isOpen,
  issueCount: issues.length,
  focusedIndex: focusedIssueIndex,
  onNavigate: setFocusedIssueIndex,
  onToggleSelection: () => {
    if (issues[focusedIssueIndex]) {
      toggleShortlist(issues[focusedIssueIndex].number)
    }
  },
  onCycleAgentLeft: () => {
    const issue = issues[focusedIssueIndex]
    if (issue && shortlist.has(issue.number)) {
      cycleIssueAgent(issue.number, 'left')
    }
  },
  onCycleAgentRight: () => {
    const issue = issues[focusedIssueIndex]
    if (issue && shortlist.has(issue.number)) {
      cycleIssueAgent(issue.number, 'right')
    }
  },
  onLaunch: handleLaunch,
  onClose: onClose,
  enabled: isOpen,
})
```

### 3.4 Update IssueRow to Display Selected Agent

```typescript
interface IssueRowProps {
  issue: GitHubIssue
  isShortlisted: boolean
  isFocused?: boolean
  selectedAgent?: 'claude-code' | 'codex' | 'cursor'
  onToggle: (issueNumber: number) => void
}

// In IssuesModalContent, pass agent to IssueRow:
<IssueRow
  ref={(el) => (issueRowRefs.current[index] = el)}
  isFocused={index === focusedIssueIndex}
  isShortlisted={shortlist.has(issue.number)}
  issue={issue}
  key={issue.number}
  onToggle={toggleShortlist}
  selectedAgent={getIssueAgent(issue.number)}
/>

// In IssueRow component, display agent badge when shortlisted:
{isShortlisted && selectedAgent && (
  <div className="mt-2 flex items-center gap-2">
    <span className="text-xs text-gray-400">Agent:</span>
    <span className="px-2 py-0.5 rounded text-xs font-medium bg-teal-500/20 text-teal-300">
      {selectedAgent === 'claude-code' ? 'Claude Code' : selectedAgent === 'codex' ? 'Codex' : 'Cursor'}
    </span>
    {isFocused && (
      <span className="text-xs text-gray-500 ml-1">← → to change</span>
    )}
  </div>
)}
```

### 3.5 Update Launch Handler

```typescript
const handleLaunch = async () => {
  if (shortlist.size === 0) return

  const issues = Result.getOrElse(issuesResult, () => [] as GitHubIssue[])
  const shortlistedIssues = issues.filter(issue => shortlist.has(issue.number))

  if (shortlistedIssues.length === 0) return

  try {
    // Launch each issue with its specific agent
    for (const issue of shortlistedIssues) {
      const agent = getIssueAgent(issue.number)

      await launchRunnerForIssue(
        issue,
        agent,
        repositoryId,
        owner,
        repo
      )
    }

    if (onLaunchRunners) {
      onLaunchRunners(Array.from(shortlist))
    }

    onClose()
  } catch (error) {
    console.error('[IssuesModal] Failed to launch runners:', error)
  }
}
```

### 3.6 Update useAiRunnerLauncher Hook

**File**: `src/renderer/hooks/useAiRunnerLauncher.ts`

Remove `launchRunnersForIssues` - launch one at a time from modal with specific agent per issue.

### 3.7 Testing

```bash
# Run app
pnpm dev

# Manual verification:
# - Open issues modal
# - Navigate to an issue (arrow keys)
# - Press Spacebar to select it
# - Verify default agent badge shows (Claude Code)
# - Press Right arrow - verify agent changes to Codex
# - Press Right arrow - verify agent changes to Cursor
# - Press Right arrow - verify agent wraps to Claude Code
# - Press Left arrow - verify agent cycles backwards
# - Select multiple issues with different agents
# - Press Enter - verify each launches with correct agent
```

**Success Criteria**:
- ✅ Left/Right arrows only work on shortlisted issues
- ✅ Agent badge displays on shortlisted issues
- ✅ Agent cycles through all three options
- ✅ Agent wraps correctly
- ✅ Launch uses per-issue agent
- ✅ Visual hint shows when focused on shortlisted issue

---

## Phase 4: Keyboard Navigation Documentation & Polish

**Duration**: 1 hour
**Risk**: Low
**Impact**: Clear user documentation and visual hints

### 4.1 Update Modal Help Text

**File**: `src/renderer/components/ai-runners/IssuesModal.tsx`

Update header help text:
```typescript
<p className="text-xs text-gray-400 mt-1">
  ↑↓ Navigate • Space Select • ←→ Change Agent • Enter Launch • Esc Close
</p>
```

### 4.2 Add Keyboard Shortcut Legend (Optional)

Add collapsible shortcut legend at bottom of modal:
```typescript
const [showShortcuts, setShowShortcuts] = useState(false)

// In footer, before Launch button:
<button
  className="text-xs text-gray-500 hover:text-gray-400 underline"
  onClick={() => setShowShortcuts(!showShortcuts)}
  type="button"
>
  {showShortcuts ? 'Hide' : 'Show'} Keyboard Shortcuts
</button>

{showShortcuts && (
  <div className="absolute bottom-full left-0 mb-2 p-3 bg-gray-800/95 border border-gray-700/50 rounded-lg backdrop-blur-xl shadow-xl text-xs">
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <kbd className="px-1.5 py-0.5 bg-gray-700 rounded">↑</kbd>
        <kbd className="px-1.5 py-0.5 bg-gray-700 rounded">↓</kbd>
        <span className="text-gray-400">Navigate issues</span>
      </div>
      <div className="flex items-center gap-2">
        <kbd className="px-1.5 py-0.5 bg-gray-700 rounded">Space</kbd>
        <span className="text-gray-400">Toggle selection</span>
      </div>
      <div className="flex items-center gap-2">
        <kbd className="px-1.5 py-0.5 bg-gray-700 rounded">←</kbd>
        <kbd className="px-1.5 py-0.5 bg-gray-700 rounded">→</kbd>
        <span className="text-gray-400">Change AI agent (selected only)</span>
      </div>
      <div className="flex items-center gap-2">
        <kbd className="px-1.5 py-0.5 bg-gray-700 rounded">Enter</kbd>
        <span className="text-gray-400">Launch runners</span>
      </div>
      <div className="flex items-center gap-2">
        <kbd className="px-1.5 py-0.5 bg-gray-700 rounded">Esc</kbd>
        <span className="text-gray-400">Close modal</span>
      </div>
    </div>
  </div>
)}
```

### 4.3 Update CLAUDE.md

Add section about keyboard navigation patterns:
```markdown
### Keyboard Navigation

The application provides comprehensive keyboard navigation:

**Repository Dropdown**:
- `↑` / `↓`: Navigate menu items
- `Enter`: Select focused item
- `Esc`: Close dropdown

**Issues Modal**:
- `↑` / `↓`: Navigate issues
- `Space`: Toggle issue selection
- `←` / `→`: Cycle AI agent (selected issues only)
- `Enter`: Launch AI runners
- `Esc`: Close modal

**Implementation**: Use dedicated keyboard hooks per component (`useDropdownKeyboardNavigation`, `useIssueModalKeyboardNavigation`) following the pattern from `useGraphKeyboardShortcuts`.
```

### 4.4 Testing

```bash
# Final end-to-end testing
pnpm dev

# Test complete workflow:
# 1. Open repository dropdown with keyboard
# 2. Navigate with arrows
# 3. Select "View Issues" with Enter
# 4. Navigate issues with arrows
# 5. Select multiple issues with Space
# 6. Change agents with Left/Right
# 7. Launch with Enter
# 8. Verify all runners launch with correct agents
```

**Success Criteria**:
- ✅ All keyboard shortcuts documented
- ✅ Visual hints clear and helpful
- ✅ No accessibility issues
- ✅ Smooth user experience
- ✅ CLAUDE.md updated

---

## Success Metrics

### Feature Completeness

| Component | Expected | Delivered |
|-----------|----------|-----------|
| Dropdown Navigation | Arrow keys + Enter | ? |
| Issues Navigation | Arrow keys + Space | ? |
| AI Agent Selection | Left/Right per issue | ? |
| Launch/Abort | Enter/Escape | ? |
| Visual Feedback | Focus rings | ? |

### Code Quality

- [ ] No `any` types introduced
- [ ] Schema.parse used consistently
- [ ] Keyboard hooks follow established patterns
- [ ] Proper ref management
- [ ] Clean separation of concerns

### User Experience

- [ ] Keyboard navigation intuitive
- [ ] Visual feedback clear
- [ ] No focus traps
- [ ] Smooth animations
- [ ] Accessible to keyboard-only users

---

## Rollback Procedure

```bash
# Create backup branch
git checkout -b backup/pre-dropdown-navigation-ui

# If issues found, revert to backup
git checkout main
git reset --hard backup/pre-dropdown-navigation-ui
```

---

## Next Steps After Completion

- [ ] Update CLAUDE.md with keyboard patterns
- [ ] Add keyboard navigation to other dropdowns
- [ ] Consider vim-style navigation (j/k)
- [ ] Add search filtering in issues modal
- [ ] Add bulk agent assignment
- [ ] Consider accessibility audit
