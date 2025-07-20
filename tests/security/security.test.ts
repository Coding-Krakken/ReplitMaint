import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import { createApp } from '../../server/index'
import { MemoryStorage } from '../../server/storage'

describe('Security Tests', () => {
  let app: express.Application
  let storage: MemoryStorage

  beforeEach(async () => {
    storage = new MemoryStorage()
    app = await createApp(storage)
  })

  describe('Authentication Security', () => {
    it('should require authentication for protected routes', async () => {
      const protectedRoutes = [
        { method: 'get', path: '/api/work-orders' },
        { method: 'post', path: '/api/work-orders' },
        { method: 'get', path: '/api/equipment' },
        { method: 'post', path: '/api/equipment' },
        { method: 'get', path: '/api/users' },
        { method: 'get', path: '/api/notifications' }
      ]

      for (const route of protectedRoutes) {
        const response = await request(app)[route.method](route.path)
        expect([401, 403]).toContain(response.status)
      }
    })

    it('should reject invalid JWT tokens', async () => {
      const invalidTokens = [
        'invalid-jwt-token',
        'Bearer invalid-token',
        'Bearer ',
        'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature',
        ''
      ]

      for (const token of invalidTokens) {
        const response = await request(app)
          .get('/api/work-orders')
          .set('Authorization', token)
        
        expect([401, 403]).toContain(response.status)
      }
    })

    it('should validate JWT token format', async () => {
      const malformedTokens = [
        'Bearer malformed',
        'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
        'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ',
        'NotBearer token'
      ]

      for (const token of malformedTokens) {
        const response = await request(app)
          .get('/api/work-orders')
          .set('Authorization', token)
        
        expect(response.status).toBe(401)
      }
    })
  })

  describe('Input Validation Security', () => {
    it('should prevent SQL injection attempts in query parameters', async () => {
      const sqlInjectionAttempts = [
        "'; DROP TABLE users; --",
        "' OR '1'='1",
        "' UNION SELECT * FROM users --",
        "'; INSERT INTO users VALUES ('hacker', 'password'); --"
      ]

      for (const injection of sqlInjectionAttempts) {
        const response = await request(app)
          .get(`/api/equipment?search=${encodeURIComponent(injection)}`)
        
        // Should not return 500 error (which might indicate SQL injection worked)
        expect(response.status).not.toBe(500)
      }
    })

    it('should prevent NoSQL injection attempts', async () => {
      const nosqlInjectionAttempts = [
        { $ne: null },
        { $gt: '' },
        { $where: 'function() { return true; }' },
        { $regex: '.*' }
      ]

      for (const injection of nosqlInjectionAttempts) {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            email: injection,
            password: injection
          })
        
        expect(response.status).toBe(400) // Should be validation error, not 500
      }
    })

    it('should sanitize HTML input to prevent XSS', async () => {
      const xssAttempts = [
        '<script>alert("xss")</script>',
        '<img src="x" onerror="alert(1)">',
        'javascript:alert(1)',
        '<svg onload="alert(1)">',
        '"><script>alert(1)</script>'
      ]

      // Create a test user first
      await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'SecurePassword123!',
          name: 'Test User',
          role: 'technician',
          warehouse_id: 'warehouse-1'
        })

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'SecurePassword123!'
        })

      const token = loginResponse.body.token

      for (const xss of xssAttempts) {
        const response = await request(app)
          .post('/api/equipment')
          .set('Authorization', `Bearer ${token}`)
          .send({
            name: xss,
            warehouse_id: 'warehouse-1',
            status: 'operational',
            criticality: 'medium',
            qr_code: 'QR001'
          })

        // Should either reject the input or sanitize it
        if (response.status === 201) {
          expect(response.body.name).not.toContain('<script>')
          expect(response.body.name).not.toContain('javascript:')
          expect(response.body.name).not.toContain('onerror=')
          expect(response.body.name).not.toContain('onload=')
        }
      }
    })

    it('should enforce input length limits', async () => {
      const longString = 'a'.repeat(10000)
      
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'SecurePassword123!',
          name: longString,
          role: 'technician',
          warehouse_id: 'warehouse-1'
        })

      expect(response.status).toBe(400) // Should reject overly long input
    })
  })

  describe('Rate Limiting Security', () => {
    it('should rate limit authentication attempts', async () => {
      const credentials = {
        email: 'test@example.com',
        password: 'wrongpassword'
      }

      // Make multiple failed login attempts
      const attempts = []
      for (let i = 0; i < 10; i++) {
        attempts.push(
          request(app)
            .post('/api/auth/login')
            .send(credentials)
        )
      }

      const responses = await Promise.all(attempts)
      
      // Should eventually start rate limiting (429 status)
      const rateLimitedResponses = responses.filter(r => r.status === 429)
      expect(rateLimitedResponses.length).toBeGreaterThan(0)
    })

    it('should rate limit API requests per user', async () => {
      // Create and login a user
      await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'SecurePassword123!',
          name: 'Test User',
          role: 'technician',
          warehouse_id: 'warehouse-1'
        })

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'SecurePassword123!'
        })

      const token = loginResponse.body.token

      // Make many requests quickly
      const requests = []
      for (let i = 0; i < 100; i++) {
        requests.push(
          request(app)
            .get('/api/equipment')
            .set('Authorization', `Bearer ${token}`)
        )
      }

      const responses = await Promise.all(requests)
      
      // Should eventually rate limit
      const rateLimitedResponses = responses.filter(r => r.status === 429)
      expect(rateLimitedResponses.length).toBeGreaterThan(0)
    })
  })

  describe('Authorization Security', () => {
    it('should enforce role-based access control', async () => {
      // Create users with different roles
      const users = [
        { email: 'technician@example.com', role: 'technician' },
        { email: 'supervisor@example.com', role: 'supervisor' },
        { email: 'admin@example.com', role: 'admin' }
      ]

      const tokens = {}

      for (const user of users) {
        await request(app)
          .post('/api/auth/register')
          .send({
            email: user.email,
            password: 'SecurePassword123!',
            name: `${user.role} User`,
            role: user.role,
            warehouse_id: 'warehouse-1'
          })

        const loginResponse = await request(app)
          .post('/api/auth/login')
          .send({
            email: user.email,
            password: 'SecurePassword123!'
          })

        tokens[user.role] = loginResponse.body.token
      }

      // Test admin-only endpoints
      const adminEndpoints = [
        { method: 'get', path: '/api/users' },
        { method: 'post', path: '/api/users' },
        { method: 'delete', path: '/api/users/user-1' }
      ]

      for (const endpoint of adminEndpoints) {
        // Technician should be denied
        const techResponse = await request(app)[endpoint.method](endpoint.path)
          .set('Authorization', `Bearer ${tokens.technician}`)
        
        expect([403, 404]).toContain(techResponse.status)

        // Admin should be allowed
        const adminResponse = await request(app)[endpoint.method](endpoint.path)
          .set('Authorization', `Bearer ${tokens.admin}`)
        
        expect(adminResponse.status).not.toBe(403)
      }
    })

    it('should prevent access to other users data', async () => {
      // Create two users
      const user1 = {
        email: 'user1@example.com',
        password: 'SecurePassword123!',
        name: 'User 1',
        role: 'technician',
        warehouse_id: 'warehouse-1'
      }

      const user2 = {
        email: 'user2@example.com',
        password: 'SecurePassword123!',
        name: 'User 2',
        role: 'technician',
        warehouse_id: 'warehouse-2'
      }

      await request(app).post('/api/auth/register').send(user1)
      await request(app).post('/api/auth/register').send(user2)

      const login1 = await request(app)
        .post('/api/auth/login')
        .send({ email: user1.email, password: user1.password })

      const login2 = await request(app)
        .post('/api/auth/login')
        .send({ email: user2.email, password: user2.password })

      const token1 = login1.body.token
      const token2 = login2.body.token

      // User 1 should not see User 2's warehouse data
      const response1 = await request(app)
        .get('/api/equipment?warehouse_id=warehouse-2')
        .set('Authorization', `Bearer ${token1}`)

      expect([403, 404]).toContain(response1.status)

      // User 2 should not see User 1's warehouse data
      const response2 = await request(app)
        .get('/api/equipment?warehouse_id=warehouse-1')
        .set('Authorization', `Bearer ${token2}`)

      expect([403, 404]).toContain(response2.status)
    })
  })

  describe('Data Protection Security', () => {
    it('should not expose sensitive data in API responses', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'SecurePassword123!',
          name: 'Test User',
          role: 'technician',
          warehouse_id: 'warehouse-1'
        })

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'SecurePassword123!'
        })

      // User object should not contain password
      expect(loginResponse.body.user).not.toHaveProperty('password')
      expect(loginResponse.body.user).not.toHaveProperty('password_hash')
      
      // Profile endpoint should not expose sensitive data
      const profileResponse = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${loginResponse.body.token}`)

      expect(profileResponse.body).not.toHaveProperty('password')
      expect(profileResponse.body).not.toHaveProperty('session_token')
    })

    it('should hash passwords securely', async () => {
      const password = 'SecurePassword123!'
      
      await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: password,
          name: 'Test User',
          role: 'technician',
          warehouse_id: 'warehouse-1'
        })

      const users = await storage.users.getAll()
      const user = users.find(u => u.email === 'test@example.com')

      expect(user?.password).not.toBe(password)
      expect(user?.password).toMatch(/^\$2[aby]\$/) // bcrypt format
      expect(user?.password.length).toBeGreaterThan(50)
    })
  })

  describe('HTTP Security Headers', () => {
    it('should include security headers in responses', async () => {
      const response = await request(app).get('/api/health')

      // Check for common security headers
      expect(response.headers['x-content-type-options']).toBe('nosniff')
      expect(response.headers['x-frame-options']).toBeDefined()
      expect(response.headers['x-xss-protection']).toBeDefined()
      expect(response.headers['content-security-policy']).toBeDefined()
    })

    it('should prevent MIME type sniffing', async () => {
      const response = await request(app).get('/api/health')
      expect(response.headers['x-content-type-options']).toBe('nosniff')
    })

    it('should prevent clickjacking', async () => {
      const response = await request(app).get('/api/health')
      expect(['DENY', 'SAMEORIGIN']).toContain(response.headers['x-frame-options'])
    })
  })

  describe('Error Handling Security', () => {
    it('should not expose internal details in error messages', async () => {
      // Test various error conditions
      const response = await request(app)
        .get('/api/nonexistent-endpoint')

      expect(response.body).not.toHaveProperty('stack')
      expect(response.body).not.toHaveProperty('trace')
      expect(JSON.stringify(response.body)).not.toContain('node_modules')
      expect(JSON.stringify(response.body)).not.toContain('internal')
    })

    it('should handle database errors securely', async () => {
      // Mock a database error
      const originalGetAll = storage.equipment.getAll
      storage.equipment.getAll = vi.fn().mockRejectedValue(new Error('Database connection failed'))

      await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'SecurePassword123!',
          name: 'Test User',
          role: 'technician',
          warehouse_id: 'warehouse-1'
        })

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'SecurePassword123!'
        })

      const response = await request(app)
        .get('/api/equipment')
        .set('Authorization', `Bearer ${loginResponse.body.token}`)

      expect(response.status).toBe(500)
      expect(response.body.message).not.toContain('Database connection failed')
      expect(response.body.message).not.toContain('stack')

      // Restore original method
      storage.equipment.getAll = originalGetAll
    })
  })
})