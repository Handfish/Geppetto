import React from 'react'
import { render, screen } from '@testing-library/react'
import { AiUsageBars } from './AiUsageBars'

// Mock the hooks and atoms
jest.mock('../../hooks/useAiProviderAtoms', () => ({
  useAiProviderUsage: jest.fn(() => ({
    usageResult: { _tag: 'Success', value: [] }
  }))
}))

jest.mock('../../atoms/account-atoms', () => ({
  tierLimitsAtom: jest.fn()
}))

describe('AiUsageBars', () => {
  it('renders without crashing', () => {
    render(<AiUsageBars />)
    // Component should render without throwing
  })

  it('returns null when AI providers are disabled', () => {
    const { container } = render(<AiUsageBars />)
    expect(container.firstChild).toBeNull()
  })
})