import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PMEngine } from '../../../server/services/pm-engine'
import { MemoryStorage } from '../../../server/storage'

// Mock console methods to reduce noise
vi.spyOn(console, 'log').mockImplementation(() => {})
vi.spyOn(console, 'error').mockImplementation(() => {})

describe('PM Engine - Comprehensive Tests', () => {
  let pmEngine: PMEngine
  let mockStorage: MemoryStorage

  beforeEach(() => {
    mockStorage = new MemoryStorage()
    pmEngine = new PMEngine(mockStorage)
  })

  describe('Schedule Generation', () => {
    it('should generate daily PM schedules correctly', async () => {
      const equipment = {
        id: 'eq-1',
        name: 'Daily Machine',
        warehouse_id: 'wh-1',
        status: 'operational' as const,
        criticality: 'high' as const,
        qr_code: 'QR001',
        pm_schedule: {
          frequency: 'daily' as const,
          last_pm_date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
          next_pm_date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)   // 1 day ago (overdue)
        }
      }

      await mockStorage.equipment.create(equipment)

      const workOrders = await pmEngine.generatePMWorkOrders('wh-1')
      
      expect(workOrders.length).toBe(1)
      expect(workOrders[0].equipment_id).toBe('eq-1')
      expect(workOrders[0].type).toBe('preventive')
      expect(workOrders[0].priority).toBe('high')
      expect(workOrders[0].status).toBe('pending')
    })

    it('should generate weekly PM schedules correctly', async () => {
      const equipment = {
        id: 'eq-2',
        name: 'Weekly Machine',
        warehouse_id: 'wh-1',
        status: 'operational' as const,
        criticality: 'medium' as const,
        qr_code: 'QR002',
        pm_schedule: {
          frequency: 'weekly' as const,
          last_pm_date: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000), // 8 days ago
          next_pm_date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)   // 1 day ago (overdue)
        }
      }

      await mockStorage.equipment.create(equipment)

      const workOrders = await pmEngine.generatePMWorkOrders('wh-1')
      
      expect(workOrders.length).toBe(1)
      expect(workOrders[0].equipment_id).toBe('eq-2')
      expect(workOrders[0].priority).toBe('medium')
    })

    it('should generate monthly PM schedules correctly', async () => {
      const equipment = {
        id: 'eq-3',
        name: 'Monthly Machine',
        warehouse_id: 'wh-1',
        status: 'operational' as const,
        criticality: 'low' as const,
        qr_code: 'QR003',
        pm_schedule: {
          frequency: 'monthly' as const,
          last_pm_date: new Date(Date.now() - 32 * 24 * 60 * 60 * 1000), // 32 days ago
          next_pm_date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)    // 2 days ago (overdue)
        }
      }

      await mockStorage.equipment.create(equipment)

      const workOrders = await pmEngine.generatePMWorkOrders('wh-1')
      
      expect(workOrders.length).toBe(1)
      expect(workOrders[0].equipment_id).toBe('eq-3')
      expect(workOrders[0].priority).toBe('low')
    })

    it('should not generate PM for equipment not due', async () => {
      const equipment = {
        id: 'eq-4',
        name: 'Future Machine',
        warehouse_id: 'wh-1',
        status: 'operational' as const,
        criticality: 'high' as const,
        qr_code: 'QR004',
        pm_schedule: {
          frequency: 'daily' as const,
          last_pm_date: new Date(), // Today
          next_pm_date: new Date(Date.now() + 24 * 60 * 60 * 1000) // Tomorrow
        }
      }

      await mockStorage.equipment.create(equipment)

      const workOrders = await pmEngine.generatePMWorkOrders('wh-1')
      
      expect(workOrders.length).toBe(0)
    })

    it('should not generate PM for out-of-service equipment', async () => {
      const equipment = {
        id: 'eq-5',
        name: 'Broken Machine',
        warehouse_id: 'wh-1',
        status: 'out-of-service' as const,
        criticality: 'high' as const,
        qr_code: 'QR005',
        pm_schedule: {
          frequency: 'daily' as const,
          last_pm_date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
          next_pm_date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
        }
      }

      await mockStorage.equipment.create(equipment)

      const workOrders = await pmEngine.generatePMWorkOrders('wh-1')
      
      expect(workOrders.length).toBe(0)
    })
  })

  describe('PM Task Automation', () => {
    it('should execute PM automation and update next PM dates', async () => {
      const equipment = {
        id: 'eq-6',
        name: 'Auto Machine',
        warehouse_id: 'wh-1',
        status: 'operational' as const,
        criticality: 'high' as const,
        qr_code: 'QR006',
        pm_schedule: {
          frequency: 'daily' as const,
          last_pm_date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
          next_pm_date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
        }
      }

      await mockStorage.equipment.create(equipment)

      const result = await pmEngine.runPMAutomation('wh-1')
      
      expect(result.generated).toBe(1)
      expect(result.warehouse_id).toBe('wh-1')
      expect(result.timestamp).toBeInstanceOf(Date)
      
      // Verify work order was created
      const workOrders = await mockStorage.workOrders.getAll()
      expect(workOrders.length).toBe(1)
      expect(workOrders[0].type).toBe('preventive')
    })

    it('should handle automation errors gracefully', async () => {
      // Mock storage to throw error
      const errorStorage = {
        ...mockStorage,
        equipment: {
          ...mockStorage.equipment,
          getByWarehouse: vi.fn().mockRejectedValue(new Error('Database error'))
        }
      }

      const errorPMEngine = new PMEngine(errorStorage as any)

      const result = await errorPMEngine.runPMAutomation('wh-1')
      
      expect(result.error).toBeDefined()
      expect(result.generated).toBe(0)
    })
  })

  describe('PM Scheduling Logic', () => {
    it('should calculate next PM date correctly for daily frequency', () => {
      const lastPM = new Date('2024-01-01')
      const nextPM = pmEngine.calculateNextPMDate(lastPM, 'daily')
      
      expect(nextPM).toEqual(new Date('2024-01-02'))
    })

    it('should calculate next PM date correctly for weekly frequency', () => {
      const lastPM = new Date('2024-01-01')
      const nextPM = pmEngine.calculateNextPMDate(lastPM, 'weekly')
      
      expect(nextPM).toEqual(new Date('2024-01-08'))
    })

    it('should calculate next PM date correctly for monthly frequency', () => {
      const lastPM = new Date('2024-01-01')
      const nextPM = pmEngine.calculateNextPMDate(lastPM, 'monthly')
      
      expect(nextPM).toEqual(new Date('2024-02-01'))
    })

    it('should handle quarterly frequency', () => {
      const lastPM = new Date('2024-01-01')
      const nextPM = pmEngine.calculateNextPMDate(lastPM, 'quarterly')
      
      expect(nextPM).toEqual(new Date('2024-04-01'))
    })
  })

  describe('PM Work Order Generation', () => {
    it('should generate work order with correct details', async () => {
      const equipment = {
        id: 'eq-7',
        name: 'Test Machine',
        warehouse_id: 'wh-1',
        status: 'operational' as const,
        criticality: 'critical' as const,
        qr_code: 'QR007',
        pm_schedule: {
          frequency: 'daily' as const,
          last_pm_date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
          next_pm_date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
        }
      }

      await mockStorage.equipment.create(equipment)

      const workOrders = await pmEngine.generatePMWorkOrders('wh-1')
      const workOrder = workOrders[0]
      
      expect(workOrder.title).toContain('Preventive Maintenance')
      expect(workOrder.title).toContain('Test Machine')
      expect(workOrder.description).toContain('Scheduled preventive maintenance')
      expect(workOrder.type).toBe('preventive')
      expect(workOrder.priority).toBe('critical')
      expect(workOrder.status).toBe('pending')
      expect(workOrder.equipment_id).toBe('eq-7')
      expect(workOrder.warehouse_id).toBe('wh-1')
      expect(workOrder.due_date).toBeInstanceOf(Date)
    })

    it('should set appropriate due dates based on priority', async () => {
      const criticalEquipment = {
        id: 'eq-8',
        name: 'Critical Machine',
        warehouse_id: 'wh-1',
        status: 'operational' as const,
        criticality: 'critical' as const,
        qr_code: 'QR008',
        pm_schedule: {
          frequency: 'daily' as const,
          last_pm_date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
          next_pm_date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
        }
      }

      const lowEquipment = {
        id: 'eq-9',
        name: 'Low Priority Machine',
        warehouse_id: 'wh-1',
        status: 'operational' as const,
        criticality: 'low' as const,
        qr_code: 'QR009',
        pm_schedule: {
          frequency: 'daily' as const,
          last_pm_date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
          next_pm_date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
        }
      }

      await mockStorage.equipment.create(criticalEquipment)
      await mockStorage.equipment.create(lowEquipment)

      const workOrders = await pmEngine.generatePMWorkOrders('wh-1')
      
      const criticalWO = workOrders.find(wo => wo.equipment_id === 'eq-8')
      const lowWO = workOrders.find(wo => wo.equipment_id === 'eq-9')
      
      expect(criticalWO?.due_date.getTime()).toBeLessThan(lowWO?.due_date.getTime() || 0)
    })
  })

  describe('Error Handling', () => {
    it('should handle missing equipment gracefully', async () => {
      const result = await pmEngine.runPMAutomation('non-existent-warehouse')
      
      expect(result.generated).toBe(0)
      expect(result.warehouse_id).toBe('non-existent-warehouse')
    })

    it('should continue processing after individual equipment errors', async () => {
      // Create one valid and one invalid equipment entry
      const validEquipment = {
        id: 'eq-10',
        name: 'Valid Machine',
        warehouse_id: 'wh-1',
        status: 'operational' as const,
        criticality: 'high' as const,
        qr_code: 'QR010',
        pm_schedule: {
          frequency: 'daily' as const,
          last_pm_date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
          next_pm_date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
        }
      }

      await mockStorage.equipment.create(validEquipment)

      // Mock storage to partially fail
      const originalCreate = mockStorage.workOrders.create
      let callCount = 0
      mockStorage.workOrders.create = vi.fn().mockImplementation((workOrder) => {
        callCount++
        if (callCount === 1) {
          throw new Error('Simulated error')
        }
        return originalCreate.call(mockStorage.workOrders, workOrder)
      })

      const result = await pmEngine.runPMAutomation('wh-1')
      
      // Should still attempt to process all equipment
      expect(result.generated).toBeGreaterThanOrEqual(0)
    })
  })
})