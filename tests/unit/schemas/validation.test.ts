import { describe, it, expect } from 'vitest'
import { 
  equipmentInsertSchema, 
  workOrderInsertSchema, 
  userInsertSchema,
  partInsertSchema,
  notificationInsertSchema 
} from '../../../shared/schema'

describe('Schema Validation Tests', () => {
  describe('Equipment Schema', () => {
    it('should validate valid equipment data', () => {
      const validEquipment = {
        name: 'Test Machine',
        warehouse_id: 'warehouse-1',
        status: 'operational',
        criticality: 'high',
        qr_code: 'QR12345',
        description: 'Test equipment description'
      }

      const result = equipmentInsertSchema.safeParse(validEquipment)
      expect(result.success).toBe(true)
    })

    it('should reject equipment with invalid status', () => {
      const invalidEquipment = {
        name: 'Test Machine',
        warehouse_id: 'warehouse-1',
        status: 'invalid-status',
        criticality: 'high',
        qr_code: 'QR12345'
      }

      const result = equipmentInsertSchema.safeParse(invalidEquipment)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('status')
      }
    })

    it('should reject equipment with invalid criticality', () => {
      const invalidEquipment = {
        name: 'Test Machine',
        warehouse_id: 'warehouse-1',
        status: 'operational',
        criticality: 'invalid-criticality',
        qr_code: 'QR12345'
      }

      const result = equipmentInsertSchema.safeParse(invalidEquipment)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('criticality')
      }
    })

    it('should require mandatory fields', () => {
      const incompleteEquipment = {
        name: 'Test Machine'
        // Missing required fields
      }

      const result = equipmentInsertSchema.safeParse(incompleteEquipment)
      expect(result.success).toBe(false)
      if (!result.success) {
        const missingFields = result.error.issues.map(issue => issue.path[0])
        expect(missingFields).toContain('warehouse_id')
        expect(missingFields).toContain('status')
      }
    })

    it('should validate PM schedule if provided', () => {
      const equipmentWithPM = {
        name: 'Test Machine',
        warehouse_id: 'warehouse-1',
        status: 'operational',
        criticality: 'high',
        qr_code: 'QR12345',
        pm_schedule: {
          frequency: 'daily',
          last_pm_date: new Date(),
          next_pm_date: new Date()
        }
      }

      const result = equipmentInsertSchema.safeParse(equipmentWithPM)
      expect(result.success).toBe(true)
    })
  })

  describe('Work Order Schema', () => {
    it('should validate valid work order data', () => {
      const validWorkOrder = {
        title: 'Fix conveyor belt',
        description: 'Conveyor belt is making unusual noise',
        type: 'corrective',
        priority: 'high',
        status: 'pending',
        equipment_id: 'equipment-1',
        warehouse_id: 'warehouse-1',
        due_date: new Date()
      }

      const result = workOrderInsertSchema.safeParse(validWorkOrder)
      expect(result.success).toBe(true)
    })

    it('should reject work order with invalid type', () => {
      const invalidWorkOrder = {
        title: 'Fix conveyor belt',
        description: 'Conveyor belt is making unusual noise',
        type: 'invalid-type',
        priority: 'high',
        status: 'pending',
        equipment_id: 'equipment-1',
        warehouse_id: 'warehouse-1'
      }

      const result = workOrderInsertSchema.safeParse(invalidWorkOrder)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('type')
      }
    })

    it('should reject work order with invalid priority', () => {
      const invalidWorkOrder = {
        title: 'Fix conveyor belt',
        description: 'Conveyor belt is making unusual noise',
        type: 'corrective',
        priority: 'invalid-priority',
        status: 'pending',
        equipment_id: 'equipment-1',
        warehouse_id: 'warehouse-1'
      }

      const result = workOrderInsertSchema.safeParse(invalidWorkOrder)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('priority')
      }
    })

    it('should validate with optional assigned_to field', () => {
      const workOrderWithAssignment = {
        title: 'Fix conveyor belt',
        description: 'Conveyor belt is making unusual noise',
        type: 'corrective',
        priority: 'high',
        status: 'in-progress',
        equipment_id: 'equipment-1',
        warehouse_id: 'warehouse-1',
        assigned_to: 'technician-1',
        due_date: new Date()
      }

      const result = workOrderInsertSchema.safeParse(workOrderWithAssignment)
      expect(result.success).toBe(true)
    })
  })

  describe('User Schema', () => {
    it('should validate valid user data', () => {
      const validUser = {
        email: 'test@example.com',
        password: 'SecurePassword123!',
        name: 'John Doe',
        role: 'technician',
        warehouse_id: 'warehouse-1'
      }

      const result = userInsertSchema.safeParse(validUser)
      expect(result.success).toBe(true)
    })

    it('should reject invalid email format', () => {
      const invalidUser = {
        email: 'invalid-email',
        password: 'SecurePassword123!',
        name: 'John Doe',
        role: 'technician',
        warehouse_id: 'warehouse-1'
      }

      const result = userInsertSchema.safeParse(invalidUser)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('email')
      }
    })

    it('should reject weak passwords', () => {
      const invalidUser = {
        email: 'test@example.com',
        password: '123',
        name: 'John Doe',
        role: 'technician',
        warehouse_id: 'warehouse-1'
      }

      const result = userInsertSchema.safeParse(invalidUser)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('password')
      }
    })

    it('should reject invalid user role', () => {
      const invalidUser = {
        email: 'test@example.com',
        password: 'SecurePassword123!',
        name: 'John Doe',
        role: 'invalid-role',
        warehouse_id: 'warehouse-1'
      }

      const result = userInsertSchema.safeParse(invalidUser)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('role')
      }
    })
  })

  describe('Part Schema', () => {
    it('should validate valid part data', () => {
      const validPart = {
        name: 'Bearing Assembly',
        part_number: 'BRG-001',
        category: 'mechanical',
        warehouse_id: 'warehouse-1',
        quantity: 50,
        min_quantity: 10,
        cost: 25.99,
        supplier: 'ABC Parts Co'
      }

      const result = partInsertSchema.safeParse(validPart)
      expect(result.success).toBe(true)
    })

    it('should reject negative quantities', () => {
      const invalidPart = {
        name: 'Bearing Assembly',
        part_number: 'BRG-001',
        category: 'mechanical',
        warehouse_id: 'warehouse-1',
        quantity: -5,
        min_quantity: 10,
        cost: 25.99
      }

      const result = partInsertSchema.safeParse(invalidPart)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('quantity')
      }
    })

    it('should reject negative costs', () => {
      const invalidPart = {
        name: 'Bearing Assembly',
        part_number: 'BRG-001',
        category: 'mechanical',
        warehouse_id: 'warehouse-1',
        quantity: 50,
        min_quantity: 10,
        cost: -25.99
      }

      const result = partInsertSchema.safeParse(invalidPart)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('cost')
      }
    })
  })

  describe('Notification Schema', () => {
    it('should validate valid notification data', () => {
      const validNotification = {
        user_id: 'user-1',
        title: 'System Alert',
        message: 'This is a test notification',
        type: 'info',
        priority: 'medium'
      }

      const result = notificationInsertSchema.safeParse(validNotification)
      expect(result.success).toBe(true)
    })

    it('should reject invalid notification type', () => {
      const invalidNotification = {
        user_id: 'user-1',
        title: 'System Alert',
        message: 'This is a test notification',
        type: 'invalid-type',
        priority: 'medium'
      }

      const result = notificationInsertSchema.safeParse(invalidNotification)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('type')
      }
    })

    it('should validate with optional metadata', () => {
      const notificationWithMetadata = {
        user_id: 'user-1',
        title: 'Work Order Alert',
        message: 'Work order has been assigned',
        type: 'info',
        priority: 'medium',
        metadata: {
          work_order_id: 'wo-123',
          action: 'assigned'
        }
      }

      const result = notificationInsertSchema.safeParse(notificationWithMetadata)
      expect(result.success).toBe(true)
    })
  })

  describe('Edge Cases and Data Validation', () => {
    it('should handle empty strings appropriately', () => {
      const equipmentWithEmptyString = {
        name: '',
        warehouse_id: 'warehouse-1',
        status: 'operational',
        criticality: 'high',
        qr_code: 'QR12345'
      }

      const result = equipmentInsertSchema.safeParse(equipmentWithEmptyString)
      expect(result.success).toBe(false)
    })

    it('should handle very long strings', () => {
      const longString = 'a'.repeat(1000)
      const equipmentWithLongName = {
        name: longString,
        warehouse_id: 'warehouse-1',
        status: 'operational',
        criticality: 'high',
        qr_code: 'QR12345'
      }

      const result = equipmentInsertSchema.safeParse(equipmentWithLongName)
      // Should fail if there's a max length constraint
      expect(result.success).toBe(false)
    })

    it('should validate date fields properly', () => {
      const workOrderWithInvalidDate = {
        title: 'Fix conveyor belt',
        description: 'Conveyor belt is making unusual noise',
        type: 'corrective',
        priority: 'high',
        status: 'pending',
        equipment_id: 'equipment-1',
        warehouse_id: 'warehouse-1',
        due_date: 'invalid-date'
      }

      const result = workOrderInsertSchema.safeParse(workOrderWithInvalidDate)
      expect(result.success).toBe(false)
    })

    it('should handle null and undefined values', () => {
      const equipmentWithNull = {
        name: 'Test Machine',
        warehouse_id: null,
        status: 'operational',
        criticality: 'high',
        qr_code: 'QR12345'
      }

      const result = equipmentInsertSchema.safeParse(equipmentWithNull)
      expect(result.success).toBe(false)
    })
  })
})