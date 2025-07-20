import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuth } from '../../../client/src/hooks/useAuth'
import React from 'react'

// Mock fetch globally
global.fetch = vi.fn()
const mockFetch = fetch as any

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}
global.localStorage = localStorageMock as any

const Wrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return React.createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useAuth Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.getItem.mockReturnValue(null)
  })

  it('should initialize with no user when no token exists', () => {
    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper })
    
    expect(result.current.user).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.isLoading).toBe(false)
  })

  it('should login successfully with valid credentials', async () => {
    const mockUser = {
      id: '1',
      email: 'test@example.com',
      name: 'Test User',
      role: 'technician'
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        token: 'valid-jwt-token',
        user: mockUser
      })
    })

    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.login('test@example.com', 'password123')
    })

    expect(result.current.user).toEqual(mockUser)
    expect(result.current.isAuthenticated).toBe(true)
    expect(localStorageMock.setItem).toHaveBeenCalledWith('auth_token', 'valid-jwt-token')
  })

  it('should handle login failure correctly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Invalid credentials' })
    })

    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper })

    await expect(async () => {
      await act(async () => {
        await result.current.login('test@example.com', 'wrongpassword')
      })
    }).rejects.toThrow()

    expect(result.current.user).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
  })

  it('should logout successfully', async () => {
    // First login
    const mockUser = {
      id: '1',
      email: 'test@example.com',
      name: 'Test User',
      role: 'technician'
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        token: 'valid-jwt-token',
        user: mockUser
      })
    })

    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.login('test@example.com', 'password123')
    })

    // Then logout
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'Logged out successfully' })
    })

    await act(async () => {
      await result.current.logout()
    })

    expect(result.current.user).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('auth_token')
  })

  it('should restore user from token on initialization', async () => {
    const mockUser = {
      id: '1',
      email: 'test@example.com',
      name: 'Test User',
      role: 'technician'
    }

    localStorageMock.getItem.mockReturnValue('existing-token')
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockUser
    })

    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper })

    await waitFor(() => {
      expect(result.current.user).toEqual(mockUser)
      expect(result.current.isAuthenticated).toBe(true)
    })
  })

  it('should handle invalid token gracefully', async () => {
    localStorageMock.getItem.mockReturnValue('invalid-token')
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Invalid token' })
    })

    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper })

    await waitFor(() => {
      expect(result.current.user).toBeNull()
      expect(result.current.isAuthenticated).toBe(false)
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('auth_token')
    })
  })

  it('should update user profile successfully', async () => {
    const mockUser = {
      id: '1',
      email: 'test@example.com',
      name: 'Test User',
      role: 'technician'
    }

    // First login
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        token: 'valid-jwt-token',
        user: mockUser
      })
    })

    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.login('test@example.com', 'password123')
    })

    // Update profile
    const updatedUser = { ...mockUser, name: 'Updated Name' }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => updatedUser
    })

    await act(async () => {
      await result.current.updateProfile({ name: 'Updated Name' })
    })

    expect(result.current.user?.name).toBe('Updated Name')
  })
})