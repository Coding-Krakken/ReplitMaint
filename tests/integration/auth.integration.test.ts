import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import { createApp } from '../../server/index'
import { MemoryStorage } from '../../server/storage'
import bcrypt from 'bcryptjs'

describe('Authentication Integration Tests', () => {
  let app: express.Application
  let storage: MemoryStorage

  beforeEach(async () => {
    storage = new MemoryStorage()
    app = await createApp(storage)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'SecurePassword123!',
        name: 'Test User',
        role: 'technician',
        warehouse_id: 'warehouse-1'
      }

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201)

      expect(response.body).toHaveProperty('token')
      expect(response.body).toHaveProperty('user')
      expect(response.body.user.email).toBe(userData.email)
      expect(response.body.user.name).toBe(userData.name)
      expect(response.body.user).not.toHaveProperty('password')
    })

    it('should reject registration with duplicate email', async () => {
      const userData = {
        email: 'duplicate@example.com',
        password: 'SecurePassword123!',
        name: 'First User',
        role: 'technician',
        warehouse_id: 'warehouse-1'
      }

      // First registration
      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201)

      // Duplicate registration
      const duplicateUserData = {
        ...userData,
        name: 'Second User'
      }

      const response = await request(app)
        .post('/api/auth/register')
        .send(duplicateUserData)
        .expect(400)

      expect(response.body).toHaveProperty('message')
      expect(response.body.message).toContain('already exists')
    })

    it('should reject registration with invalid email', async () => {
      const userData = {
        email: 'invalid-email',
        password: 'SecurePassword123!',
        name: 'Test User',
        role: 'technician',
        warehouse_id: 'warehouse-1'
      }

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400)

      expect(response.body).toHaveProperty('message')
    })

    it('should reject registration with weak password', async () => {
      const userData = {
        email: 'test@example.com',
        password: '123',
        name: 'Test User',
        role: 'technician',
        warehouse_id: 'warehouse-1'
      }

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400)

      expect(response.body).toHaveProperty('message')
    })

    it('should hash password before storing', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'SecurePassword123!',
        name: 'Test User',
        role: 'technician',
        warehouse_id: 'warehouse-1'
      }

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201)

      const users = await storage.users.getAll()
      const user = users.find(u => u.email === userData.email)
      
      expect(user).toBeDefined()
      expect(user!.password).not.toBe(userData.password)
      expect(user!.password.length).toBeGreaterThan(50) // Bcrypt hash length
    })
  })

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // Create a test user
      const hashedPassword = await bcrypt.hash('SecurePassword123!', 10)
      await storage.users.create({
        id: 'user-1',
        email: 'test@example.com',
        password: hashedPassword,
        name: 'Test User',
        role: 'technician',
        warehouse_id: 'warehouse-1',
        created_at: new Date(),
        last_login: null
      })
    })

    it('should login with valid credentials', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'SecurePassword123!'
      }

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(200)

      expect(response.body).toHaveProperty('token')
      expect(response.body).toHaveProperty('user')
      expect(response.body.user.email).toBe(loginData.email)
      expect(response.body.user).not.toHaveProperty('password')
    })

    it('should reject login with invalid email', async () => {
      const loginData = {
        email: 'nonexistent@example.com',
        password: 'SecurePassword123!'
      }

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(401)

      expect(response.body).toHaveProperty('message')
      expect(response.body.message).toContain('Invalid credentials')
    })

    it('should reject login with invalid password', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'WrongPassword!'
      }

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(401)

      expect(response.body).toHaveProperty('message')
      expect(response.body.message).toContain('Invalid credentials')
    })

    it('should update last_login timestamp', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'SecurePassword123!'
      }

      await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(200)

      const users = await storage.users.getAll()
      const user = users.find(u => u.email === loginData.email)
      
      expect(user?.last_login).toBeInstanceOf(Date)
    })
  })

  describe('POST /api/auth/logout', () => {
    let authToken: string

    beforeEach(async () => {
      // Create and login a user
      const hashedPassword = await bcrypt.hash('SecurePassword123!', 10)
      await storage.users.create({
        id: 'user-1',
        email: 'test@example.com',
        password: hashedPassword,
        name: 'Test User',
        role: 'technician',
        warehouse_id: 'warehouse-1',
        created_at: new Date(),
        last_login: null
      })

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'SecurePassword123!'
        })

      authToken = loginResponse.body.token
    })

    it('should logout successfully with valid token', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      expect(response.body).toHaveProperty('message')
      expect(response.body.message).toContain('logged out')
    })

    it('should reject logout without token', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .expect(401)

      expect(response.body).toHaveProperty('message')
      expect(response.body.message).toContain('No token provided')
    })

    it('should reject logout with invalid token', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401)

      expect(response.body).toHaveProperty('message')
      expect(response.body.message).toContain('Invalid token')
    })
  })

  describe('GET /api/auth/me', () => {
    let authToken: string

    beforeEach(async () => {
      // Create and login a user
      const hashedPassword = await bcrypt.hash('SecurePassword123!', 10)
      await storage.users.create({
        id: 'user-1',
        email: 'test@example.com',
        password: hashedPassword,
        name: 'Test User',
        role: 'technician',
        warehouse_id: 'warehouse-1',
        created_at: new Date(),
        last_login: null
      })

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'SecurePassword123!'
        })

      authToken = loginResponse.body.token
    })

    it('should return current user with valid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      expect(response.body).toHaveProperty('email', 'test@example.com')
      expect(response.body).toHaveProperty('name', 'Test User')
      expect(response.body).toHaveProperty('role', 'technician')
      expect(response.body).not.toHaveProperty('password')
    })

    it('should reject request without token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .expect(401)

      expect(response.body).toHaveProperty('message')
      expect(response.body.message).toContain('No token provided')
    })

    it('should reject request with invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401)

      expect(response.body).toHaveProperty('message')
      expect(response.body.message).toContain('Invalid token')
    })
  })

  describe('PUT /api/auth/profile', () => {
    let authToken: string

    beforeEach(async () => {
      // Create and login a user
      const hashedPassword = await bcrypt.hash('SecurePassword123!', 10)
      await storage.users.create({
        id: 'user-1',
        email: 'test@example.com',
        password: hashedPassword,
        name: 'Test User',
        role: 'technician',
        warehouse_id: 'warehouse-1',
        created_at: new Date(),
        last_login: null
      })

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'SecurePassword123!'
        })

      authToken = loginResponse.body.token
    })

    it('should update user profile successfully', async () => {
      const updateData = {
        name: 'Updated Name',
        phone: '+1234567890'
      }

      const response = await request(app)
        .put('/api/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200)

      expect(response.body).toHaveProperty('name', 'Updated Name')
      expect(response.body).toHaveProperty('phone', '+1234567890')
    })

    it('should not allow email update through profile endpoint', async () => {
      const updateData = {
        email: 'newemail@example.com',
        name: 'Updated Name'
      }

      const response = await request(app)
        .put('/api/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200)

      expect(response.body.email).toBe('test@example.com') // Original email
      expect(response.body.name).toBe('Updated Name')
    })

    it('should reject profile update without token', async () => {
      const updateData = {
        name: 'Updated Name'
      }

      const response = await request(app)
        .put('/api/auth/profile')
        .send(updateData)
        .expect(401)

      expect(response.body).toHaveProperty('message')
    })
  })

  describe('POST /api/auth/change-password', () => {
    let authToken: string

    beforeEach(async () => {
      // Create and login a user
      const hashedPassword = await bcrypt.hash('SecurePassword123!', 10)
      await storage.users.create({
        id: 'user-1',
        email: 'test@example.com',
        password: hashedPassword,
        name: 'Test User',
        role: 'technician',
        warehouse_id: 'warehouse-1',
        created_at: new Date(),
        last_login: null
      })

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'SecurePassword123!'
        })

      authToken = loginResponse.body.token
    })

    it('should change password with valid current password', async () => {
      const passwordData = {
        currentPassword: 'SecurePassword123!',
        newPassword: 'NewSecurePassword456!'
      }

      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send(passwordData)
        .expect(200)

      expect(response.body).toHaveProperty('message')
      expect(response.body.message).toContain('Password updated')
    })

    it('should reject password change with invalid current password', async () => {
      const passwordData = {
        currentPassword: 'WrongPassword!',
        newPassword: 'NewSecurePassword456!'
      }

      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send(passwordData)
        .expect(400)

      expect(response.body).toHaveProperty('message')
      expect(response.body.message).toContain('Invalid current password')
    })

    it('should reject weak new password', async () => {
      const passwordData = {
        currentPassword: 'SecurePassword123!',
        newPassword: '123'
      }

      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send(passwordData)
        .expect(400)

      expect(response.body).toHaveProperty('message')
    })
  })
})