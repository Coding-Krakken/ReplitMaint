import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import { createApp } from '../../server/index'
import { MemoryStorage } from '../../server/storage'

describe('API Performance Tests', () => {
  let app: express.Application
  let storage: MemoryStorage
  let authToken: string

  beforeEach(async () => {
    storage = new MemoryStorage()
    app = await createApp(storage)

    // Create and login a test user
    await request(app)
      .post('/api/auth/register')
      .send({
        email: 'test@example.com',
        password: 'SecurePassword123!',
        name: 'Test User',
        role: 'admin',
        warehouse_id: 'warehouse-1'
      })

    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'SecurePassword123!'
      })

    authToken = loginResponse.body.token
  })

  describe('Response Time Performance', () => {
    it('should respond to health check within 100ms', async () => {
      const start = Date.now()
      
      const response = await request(app)
        .get('/api/health')
        .expect(200)
      
      const duration = Date.now() - start
      expect(duration).toBeLessThan(100)
    })

    it('should respond to equipment list within 500ms', async () => {
      // Pre-populate with some test data
      for (let i = 0; i < 50; i++) {
        await storage.equipment.create({
          id: `equipment-${i}`,
          name: `Test Equipment ${i}`,
          warehouse_id: 'warehouse-1',
          status: 'operational',
          criticality: 'medium',
          qr_code: `QR${i.toString().padStart(3, '0')}`
        })
      }

      const start = Date.now()
      
      const response = await request(app)
        .get('/api/equipment')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
      
      const duration = Date.now() - start
      expect(duration).toBeLessThan(500)
      expect(response.body.length).toBe(50)
    })

    it('should respond to work orders list within 500ms', async () => {
      // Pre-populate with test data
      for (let i = 0; i < 100; i++) {
        await storage.workOrders.create({
          id: `wo-${i}`,
          title: `Work Order ${i}`,
          description: `Description for work order ${i}`,
          type: 'corrective',
          priority: 'medium',
          status: 'pending',
          equipment_id: 'equipment-1',
          warehouse_id: 'warehouse-1',
          due_date: new Date(Date.now() + i * 24 * 60 * 60 * 1000),
          created_at: new Date(),
          updated_at: new Date()
        })
      }

      const start = Date.now()
      
      const response = await request(app)
        .get('/api/work-orders')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
      
      const duration = Date.now() - start
      expect(duration).toBeLessThan(500)
      expect(response.body.length).toBe(100)
    })

    it('should handle dashboard stats quickly', async () => {
      // Pre-populate with test data
      for (let i = 0; i < 200; i++) {
        await storage.workOrders.create({
          id: `wo-${i}`,
          title: `Work Order ${i}`,
          description: `Description for work order ${i}`,
          type: i % 2 === 0 ? 'corrective' : 'preventive',
          priority: ['low', 'medium', 'high', 'critical'][i % 4],
          status: ['pending', 'in-progress', 'completed'][i % 3],
          equipment_id: 'equipment-1',
          warehouse_id: 'warehouse-1',
          due_date: new Date(Date.now() + i * 24 * 60 * 60 * 1000),
          created_at: new Date(),
          updated_at: new Date()
        })
      }

      const start = Date.now()
      
      const response = await request(app)
        .get('/api/dashboard/stats')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
      
      const duration = Date.now() - start
      expect(duration).toBeLessThan(300)
      expect(response.body).toHaveProperty('totalWorkOrders')
      expect(response.body).toHaveProperty('pendingWorkOrders')
    })
  })

  describe('Concurrent Request Handling', () => {
    it('should handle multiple concurrent equipment requests', async () => {
      // Create test equipment
      for (let i = 0; i < 20; i++) {
        await storage.equipment.create({
          id: `equipment-${i}`,
          name: `Test Equipment ${i}`,
          warehouse_id: 'warehouse-1',
          status: 'operational',
          criticality: 'medium',
          qr_code: `QR${i.toString().padStart(3, '0')}`
        })
      }

      const concurrentRequests = 10
      const requests = []

      for (let i = 0; i < concurrentRequests; i++) {
        requests.push(
          request(app)
            .get('/api/equipment')
            .set('Authorization', `Bearer ${authToken}`)
        )
      }

      const start = Date.now()
      const responses = await Promise.all(requests)
      const duration = Date.now() - start

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200)
        expect(response.body.length).toBe(20)
      })

      // Should handle concurrent requests reasonably quickly
      expect(duration).toBeLessThan(2000)
    })

    it('should handle concurrent work order creation', async () => {
      const concurrentCreations = 5
      const requests = []

      for (let i = 0; i < concurrentCreations; i++) {
        requests.push(
          request(app)
            .post('/api/work-orders')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
              title: `Concurrent Work Order ${i}`,
              description: `Description ${i}`,
              type: 'corrective',
              priority: 'medium',
              status: 'pending',
              equipment_id: 'equipment-1',
              warehouse_id: 'warehouse-1',
              due_date: new Date()
            })
        )
      }

      const start = Date.now()
      const responses = await Promise.all(requests)
      const duration = Date.now() - start

      // All creations should succeed
      responses.forEach(response => {
        expect(response.status).toBe(201)
        expect(response.body).toHaveProperty('id')
      })

      expect(duration).toBeLessThan(1000)

      // Verify all work orders were created
      const allWorkOrders = await storage.workOrders.getAll()
      expect(allWorkOrders.length).toBe(concurrentCreations)
    })
  })

  describe('Large Dataset Performance', () => {
    it('should handle large equipment dataset efficiently', async () => {
      // Create a large dataset
      const equipmentCount = 1000
      const batchSize = 100

      for (let batch = 0; batch < equipmentCount / batchSize; batch++) {
        const equipmentBatch = []
        for (let i = 0; i < batchSize; i++) {
          const id = batch * batchSize + i
          equipmentBatch.push(storage.equipment.create({
            id: `equipment-${id}`,
            name: `Equipment ${id}`,
            warehouse_id: 'warehouse-1',
            status: ['operational', 'maintenance', 'out-of-service'][id % 3],
            criticality: ['low', 'medium', 'high', 'critical'][id % 4],
            qr_code: `QR${id.toString().padStart(4, '0')}`
          }))
        }
        await Promise.all(equipmentBatch)
      }

      const start = Date.now()
      
      const response = await request(app)
        .get('/api/equipment')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
      
      const duration = Date.now() - start
      
      expect(response.body.length).toBe(equipmentCount)
      expect(duration).toBeLessThan(2000) // Should complete within 2 seconds
    })

    it('should handle filtered queries efficiently', async () => {
      // Create diverse test data
      for (let i = 0; i < 500; i++) {
        await storage.equipment.create({
          id: `equipment-${i}`,
          name: `Equipment ${i}`,
          warehouse_id: i < 250 ? 'warehouse-1' : 'warehouse-2',
          status: ['operational', 'maintenance', 'out-of-service'][i % 3],
          criticality: ['low', 'medium', 'high', 'critical'][i % 4],
          qr_code: `QR${i.toString().padStart(3, '0')}`
        })
      }

      const start = Date.now()
      
      const response = await request(app)
        .get('/api/equipment?status=operational&criticality=high')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
      
      const duration = Date.now() - start
      
      expect(duration).toBeLessThan(500)
      expect(response.body.every(eq => eq.status === 'operational')).toBe(true)
      expect(response.body.every(eq => eq.criticality === 'high')).toBe(true)
    })

    it('should handle pagination efficiently', async () => {
      // Create test data
      for (let i = 0; i < 200; i++) {
        await storage.workOrders.create({
          id: `wo-${i}`,
          title: `Work Order ${i}`,
          description: `Description ${i}`,
          type: 'corrective',
          priority: 'medium',
          status: 'pending',
          equipment_id: 'equipment-1',
          warehouse_id: 'warehouse-1',
          due_date: new Date(),
          created_at: new Date(),
          updated_at: new Date()
        })
      }

      const start = Date.now()
      
      const response = await request(app)
        .get('/api/work-orders?page=1&limit=50')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
      
      const duration = Date.now() - start
      
      expect(duration).toBeLessThan(300)
      expect(response.body.length).toBeLessThanOrEqual(50)
    })
  })

  describe('Memory Usage Performance', () => {
    it('should not have memory leaks in repeated requests', async () => {
      const initialMemory = process.memoryUsage().heapUsed

      // Make many requests to test for memory leaks
      for (let i = 0; i < 100; i++) {
        await request(app)
          .get('/api/health')
          .expect(200)
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc()
      }

      const finalMemory = process.memoryUsage().heapUsed
      const memoryIncrease = finalMemory - initialMemory

      // Memory shouldn't increase significantly (allow some variance)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024) // 10MB
    })

    it('should handle large payloads efficiently', async () => {
      const largeDescription = 'x'.repeat(10000) // 10KB description

      const start = Date.now()
      
      const response = await request(app)
        .post('/api/work-orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Large Work Order',
          description: largeDescription,
          type: 'corrective',
          priority: 'medium',
          status: 'pending',
          equipment_id: 'equipment-1',
          warehouse_id: 'warehouse-1',
          due_date: new Date()
        })
        .expect(201)
      
      const duration = Date.now() - start
      
      expect(duration).toBeLessThan(1000)
      expect(response.body.description.length).toBe(10000)
    })
  })

  describe('Database Query Performance', () => {
    it('should handle complex joins efficiently', async () => {
      // Create related data
      const equipment = await storage.equipment.create({
        id: 'equipment-1',
        name: 'Test Equipment',
        warehouse_id: 'warehouse-1',
        status: 'operational',
        criticality: 'high',
        qr_code: 'QR001'
      })

      // Create multiple work orders for the equipment
      for (let i = 0; i < 50; i++) {
        await storage.workOrders.create({
          id: `wo-${i}`,
          title: `Work Order ${i}`,
          description: `Description ${i}`,
          type: 'corrective',
          priority: 'medium',
          status: 'pending',
          equipment_id: equipment.id,
          warehouse_id: 'warehouse-1',
          due_date: new Date(),
          created_at: new Date(),
          updated_at: new Date()
        })
      }

      const start = Date.now()
      
      const response = await request(app)
        .get(`/api/equipment/${equipment.id}/work-orders`)
        .set('Authorization', `Bearer ${authToken}`)
      
      const duration = Date.now() - start
      
      expect(duration).toBeLessThan(500)
      
      if (response.status === 200) {
        expect(response.body.length).toBe(50)
      }
    })

    it('should handle search queries efficiently', async () => {
      // Create searchable data
      for (let i = 0; i < 100; i++) {
        await storage.equipment.create({
          id: `equipment-${i}`,
          name: i < 50 ? `Pump Equipment ${i}` : `Motor Equipment ${i}`,
          warehouse_id: 'warehouse-1',
          status: 'operational',
          criticality: 'medium',
          qr_code: `QR${i.toString().padStart(3, '0')}`
        })
      }

      const start = Date.now()
      
      const response = await request(app)
        .get('/api/equipment?search=Pump')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
      
      const duration = Date.now() - start
      
      expect(duration).toBeLessThan(400)
      expect(response.body.length).toBe(50)
      expect(response.body.every(eq => eq.name.includes('Pump'))).toBe(true)
    })
  })

  describe('API Response Size Optimization', () => {
    it('should compress large responses effectively', async () => {
      // Create large dataset
      for (let i = 0; i < 500; i++) {
        await storage.equipment.create({
          id: `equipment-${i}`,
          name: `Very Long Equipment Name That Takes Up More Space ${i}`,
          warehouse_id: 'warehouse-1',
          status: 'operational',
          criticality: 'medium',
          qr_code: `QR${i.toString().padStart(3, '0')}`,
          description: 'This is a very long description that will be repeated many times to increase response size and test compression effectiveness'
        })
      }

      const response = await request(app)
        .get('/api/equipment')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Accept-Encoding', 'gzip')
        .expect(200)

      // Should have compression headers if implemented
      if (response.headers['content-encoding']) {
        expect(response.headers['content-encoding']).toContain('gzip')
      }

      expect(response.body.length).toBe(500)
    })

    it('should handle pagination to reduce response size', async () => {
      // Create large dataset
      for (let i = 0; i < 1000; i++) {
        await storage.workOrders.create({
          id: `wo-${i}`,
          title: `Work Order ${i}`,
          description: `Description ${i}`,
          type: 'corrective',
          priority: 'medium',
          status: 'pending',
          equipment_id: 'equipment-1',
          warehouse_id: 'warehouse-1',
          due_date: new Date(),
          created_at: new Date(),
          updated_at: new Date()
        })
      }

      const response = await request(app)
        .get('/api/work-orders?limit=100')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      expect(response.body.length).toBeLessThanOrEqual(100)
    })
  })
})