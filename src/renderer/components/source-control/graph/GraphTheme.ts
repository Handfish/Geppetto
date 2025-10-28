import type { GraphTheme } from './types'

/**
 * GraphTheme.ts
 *
 * Theme configuration for the PixiJS commit graph renderer.
 * All colors are hex numbers (0xRRGGBB) for PixiJS compatibility.
 *
 * This file provides sensible defaults for dark mode and allows
 * customization for different visual preferences.
 */

/**
 * Tailwind color conversions to PixiJS hex numbers
 *
 * Common Tailwind colors converted for reference:
 * - gray-800: 0x1f2937
 * - gray-900: 0x111827
 * - blue-400: 0x60a5fa
 * - blue-500: 0x3b82f6
 * - green-400: 0x4ade80
 * - green-500: 0x22c55e
 * - purple-500: 0xa855f7
 * - orange-500: 0xf97316
 * - pink-500: 0xec4899
 * - cyan-500: 0x06b6d4
 * - yellow-500: 0xeab308
 * - red-500: 0xef4444
 */

/**
 * Default theme for dark mode
 *
 * Provides 8 distinct, accessible colors for lane visualization
 * with good contrast against dark background.
 */
export const defaultTheme: GraphTheme = {
  // Node dimensions
  nodeRadius: 6, // Radius of commit circles in pixels
  commitSpacing: 10, // Vertical spacing between commits

  // Lane dimensions
  laneWidth: 40, // Horizontal width of each lane (column) in pixels
  rowHeight: 50, // Vertical height of each row in pixels

  // Colors (hex numbers for PixiJS)
  laneColors: [
    0x3b82f6, // blue-500 - Primary color
    0x22c55e, // green-500 - Success/growth
    0xa855f7, // purple-500 - Special/feature
    0xf97316, // orange-500 - Warning/attention
    0xec4899, // pink-500 - Highlight/important
    0x06b6d4, // cyan-500 - Info/auxiliary
    0xeab308, // yellow-500 - Caution/staging
    0xef4444, // red-500 - Critical/hotfix
  ],

  // Special colors
  highlightColor: 0x60a5fa, // blue-400 - For selection highlight ring
  headColor: 0x4ade80, // green-400 - For HEAD indicator
  backgroundColor: 0x1f2937, // gray-800 - Stage background (dark mode)

  // Typography
  fontFamily: 'Inter, system-ui, sans-serif', // Modern sans-serif
  fontSize: 12, // Font size for ref labels in pixels
}

/**
 * Compact theme for viewing many commits
 *
 * Smaller dimensions to fit more commits on screen
 */
export const compactTheme: GraphTheme = {
  ...defaultTheme,
  nodeRadius: 4,
  commitSpacing: 5,
  laneWidth: 30,
  rowHeight: 35,
  fontSize: 10,
}

/**
 * Light mode theme
 *
 * Uses lighter background and adjusted colors for light mode
 */
export const lightTheme: GraphTheme = {
  ...defaultTheme,
  backgroundColor: 0xf3f4f6, // gray-100
  highlightColor: 0x2563eb, // blue-600
  headColor: 0x16a34a, // green-600
  // Lane colors remain the same (work well on light background)
}

/**
 * Create a custom theme by merging with defaults
 *
 * @param overrides - Partial theme to override defaults
 * @returns Complete theme with overrides applied
 *
 * @example
 * ```typescript
 * const myTheme = createTheme({
 *   nodeRadius: 8,
 *   laneColors: [0xFF0000, 0x00FF00, 0x0000FF],
 * })
 * ```
 */
export function createTheme(overrides: Partial<GraphTheme>): GraphTheme {
  return {
    ...defaultTheme,
    ...overrides,
  }
}

/**
 * Convert CSS hex string to PixiJS hex number
 *
 * Utility function for converting CSS colors to PixiJS format
 *
 * @param cssHex - CSS hex string (e.g., "#3b82f6" or "3b82f6")
 * @returns PixiJS hex number (e.g., 0x3b82f6)
 *
 * @example
 * ```typescript
 * const color = cssToPixiHex("#3b82f6") // Returns 0x3b82f6
 * ```
 */
export function cssToPixiHex(cssHex: string): number {
  // Remove # if present
  const hex = cssHex.replace('#', '')

  // Parse as hexadecimal and return as number
  return parseInt(hex, 16)
}

/**
 * Convert PixiJS hex number to CSS hex string
 *
 * Utility function for debugging or CSS integration
 *
 * @param pixiHex - PixiJS hex number (e.g., 0x3b82f6)
 * @returns CSS hex string (e.g., "#3b82f6")
 */
export function pixiHexToCss(pixiHex: number): string {
  return `#${pixiHex.toString(16).padStart(6, '0')}`
}
