# AI Runner Implementation Prompts

## 1. Initial Implementation Prompt

Implement the AI Runner Tmux Integration following the plan in `/docs/ai-runner-tmux-plan.md`. Start with Phase 1: Foundation Architecture. Create the directory structure, ports, domain types, and TmuxSessionManager as specified. Follow the Effect-TS patterns and type-safety requirements from CLAUDE.md exactly. Update `/docs/ai-runner-progress.md` after completing each phase section.

## 2. Continue Progress Prompt

Continue implementing the AI Runner Tmux Integration from where you left off. Check `/docs/ai-runner-progress.md` for completed items, then proceed with the next uncompleted phase from `/docs/ai-runner-tmux-plan.md`. Update the progress document after each section. Maintain strict type safety and Effect patterns as specified in CLAUDE.md.

## 3. Resume After Context Loss Prompt

Resume the AI Runner Tmux Integration implementation. First, analyze the current state by: 1) Reading `/docs/ai-runner-progress.md` to see what's completed, 2) Checking which files from the plan exist in `src/main/ai-runners/` and related directories, 3) Running `git status` and `git log -5 --oneline` to see recent changes. Then continue from the next uncompleted item in `/docs/ai-runner-tmux-plan.md`. Update the progress document as you complete sections. Follow CLAUDE.md patterns exactly.