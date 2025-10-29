import { useState, useEffect, useCallback } from 'react'
import type { GraphOptions } from '../../shared/schemas/source-control'

/**
 * Graph Display Settings
 *
 * Extended settings beyond GraphOptions that control visual display
 */
export interface GraphDisplaySettings {
  /** Show branch/tag labels on commits */
  showRefs: boolean

  /** Show merge commits in graph */
  showMergeCommits: boolean

  /** Show commit messages inline */
  showMessages: boolean
}

/**
 * Combined Graph Settings
 *
 * Includes both filter options (GraphOptions) and display settings
 */
export interface GraphSettings extends Partial<GraphOptions> {
  display: GraphDisplaySettings
}

/**
 * Default Graph Settings
 */
export const DEFAULT_GRAPH_SETTINGS: GraphSettings = {
  maxCommits: 20,
  layoutAlgorithm: 'topological',
  display: {
    showRefs: true,
    showMergeCommits: true,
    showMessages: false,
  },
}

const STORAGE_KEY = 'geppetto:graph-settings'

/**
 * useGraphSettings Hook
 *
 * Manages graph settings with localStorage persistence.
 *
 * Features:
 * - Automatic localStorage save/load
 * - Type-safe settings with defaults
 * - Reset to defaults function
 * - Separate update functions for filters and display settings
 *
 * Usage:
 * ```tsx
 * const { settings, updateFilters, updateDisplay, resetToDefaults } = useGraphSettings()
 *
 * // Update filter options
 * updateFilters({ maxCommits: 50 })
 *
 * // Update display settings
 * updateDisplay({ showRefs: false })
 *
 * // Reset everything
 * resetToDefaults()
 * ```
 */
export function useGraphSettings() {
  // Initialize from localStorage or defaults
  const [settings, setSettings] = useState<GraphSettings>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as GraphSettings

        // Merge with defaults to ensure all fields exist (handle schema evolution)
        return {
          ...DEFAULT_GRAPH_SETTINGS,
          ...parsed,
          display: {
            ...DEFAULT_GRAPH_SETTINGS.display,
            ...(parsed.display || {}),
          },
        }
      }
    } catch (error) {
      console.error('[useGraphSettings] Failed to load settings from localStorage:', error)
    }

    return DEFAULT_GRAPH_SETTINGS
  })

  // Save to localStorage whenever settings change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
      console.log('[useGraphSettings] Settings saved to localStorage:', settings)
    } catch (error) {
      console.error('[useGraphSettings] Failed to save settings to localStorage:', error)
    }
  }, [settings])

  /**
   * Update filter options (GraphOptions fields)
   */
  const updateFilters = useCallback((filters: Partial<GraphOptions>) => {
    setSettings((prev) => ({
      ...prev,
      ...filters,
    }))
  }, [])

  /**
   * Update display settings
   */
  const updateDisplay = useCallback((display: Partial<GraphDisplaySettings>) => {
    setSettings((prev) => ({
      ...prev,
      display: {
        ...prev.display,
        ...display,
      },
    }))
  }, [])

  /**
   * Reset all settings to defaults
   */
  const resetToDefaults = useCallback(() => {
    setSettings(DEFAULT_GRAPH_SETTINGS)
    console.log('[useGraphSettings] Settings reset to defaults')
  }, [])

  return {
    settings,
    updateFilters,
    updateDisplay,
    resetToDefaults,
  }
}
