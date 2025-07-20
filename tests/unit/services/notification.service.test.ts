import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NotificationService } from '../../../server/services/notification.service'
import { MemoryStorage } from '../../../server/storage'

// Mock console methods
vi.spyOn(console, 'log').mockImplementation(() => {})
vi.spyOn(console, 'error').mockImplementation(() => {})

describe('NotificationService', () => {
  let notificationService: NotificationService
  let mockStorage: MemoryStorage

  beforeEach(() => {
    mockStorage = new MemoryStorage()
    notificationService = new NotificationService(mockStorage)
  })

  describe('createNotification', () => {
    it('should create a notification successfully', async () => {
      const notification = await notificationService.createNotification({
        user_id: 'user-1',
        title: 'Test Notification',
        message: 'This is a test message',
        type: 'info',
        priority: 'medium'
      })

      expect(notification.id).toBeDefined()
      expect(notification.title).toBe('Test Notification')
      expect(notification.message).toBe('This is a test message')
      expect(notification.type).toBe('info')
      expect(notification.priority).toBe('medium')
      expect(notification.read).toBe(false)
      expect(notification.created_at).toBeInstanceOf(Date)
    })

    it('should create high priority notification with urgent flag', async () => {
      const notification = await notificationService.createNotification({
        user_id: 'user-1',
        title: 'Urgent Alert',
        message: 'Critical system failure',
        type: 'error',
        priority: 'high'
      })

      expect(notification.priority).toBe('high')
      expect(notification.type).toBe('error')
    })
  })

  describe('getUserNotifications', () => {
    it('should retrieve notifications for a specific user', async () => {
      await notificationService.createNotification({
        user_id: 'user-1',
        title: 'User 1 Notification',
        message: 'Message for user 1',
        type: 'info',
        priority: 'medium'
      })

      await notificationService.createNotification({
        user_id: 'user-2',
        title: 'User 2 Notification',
        message: 'Message for user 2',
        type: 'warning',
        priority: 'low'
      })

      const notifications = await notificationService.getUserNotifications('user-1')

      expect(notifications.length).toBe(1)
      expect(notifications[0].user_id).toBe('user-1')
      expect(notifications[0].title).toBe('User 1 Notification')
    })

    it('should return empty array for user with no notifications', async () => {
      const notifications = await notificationService.getUserNotifications('non-existent-user')
      expect(notifications).toEqual([])
    })
  })

  describe('markAsRead', () => {
    it('should mark notification as read', async () => {
      const notification = await notificationService.createNotification({
        user_id: 'user-1',
        title: 'Test Notification',
        message: 'Test message',
        type: 'info',
        priority: 'medium'
      })

      const updatedNotification = await notificationService.markAsRead(notification.id)

      expect(updatedNotification.read).toBe(true)
      expect(updatedNotification.read_at).toBeInstanceOf(Date)
    })

    it('should handle marking non-existent notification', async () => {
      await expect(
        notificationService.markAsRead('non-existent-id')
      ).rejects.toThrow()
    })
  })

  describe('deleteNotification', () => {
    it('should delete notification successfully', async () => {
      const notification = await notificationService.createNotification({
        user_id: 'user-1',
        title: 'To be deleted',
        message: 'This will be deleted',
        type: 'info',
        priority: 'low'
      })

      await notificationService.deleteNotification(notification.id)

      const notifications = await notificationService.getUserNotifications('user-1')
      expect(notifications.length).toBe(0)
    })
  })

  describe('sendWorkOrderNotification', () => {
    it('should send work order assignment notification', async () => {
      const notification = await notificationService.sendWorkOrderNotification(
        'technician-1',
        'work-order-123',
        'assigned'
      )

      expect(notification.user_id).toBe('technician-1')
      expect(notification.title).toContain('Work Order Assigned')
      expect(notification.message).toContain('work-order-123')
      expect(notification.type).toBe('info')
      expect(notification.metadata?.work_order_id).toBe('work-order-123')
      expect(notification.metadata?.action).toBe('assigned')
    })

    it('should send work order completion notification', async () => {
      const notification = await notificationService.sendWorkOrderNotification(
        'supervisor-1',
        'work-order-123',
        'completed'
      )

      expect(notification.title).toContain('Work Order Completed')
      expect(notification.type).toBe('success')
      expect(notification.metadata?.action).toBe('completed')
    })

    it('should send overdue work order notification', async () => {
      const notification = await notificationService.sendWorkOrderNotification(
        'manager-1',
        'work-order-123',
        'overdue'
      )

      expect(notification.title).toContain('Work Order Overdue')
      expect(notification.type).toBe('warning')
      expect(notification.priority).toBe('high')
      expect(notification.metadata?.action).toBe('overdue')
    })
  })

  describe('sendEquipmentAlert', () => {
    it('should send equipment failure alert', async () => {
      const notification = await notificationService.sendEquipmentAlert(
        'maintenance-team',
        'equipment-456',
        'failure'
      )

      expect(notification.user_id).toBe('maintenance-team')
      expect(notification.title).toContain('Equipment Failure')
      expect(notification.type).toBe('error')
      expect(notification.priority).toBe('high')
      expect(notification.metadata?.equipment_id).toBe('equipment-456')
      expect(notification.metadata?.alert_type).toBe('failure')
    })

    it('should send preventive maintenance reminder', async () => {
      const notification = await notificationService.sendEquipmentAlert(
        'technician-1',
        'equipment-456',
        'pm_due'
      )

      expect(notification.title).toContain('Preventive Maintenance Due')
      expect(notification.type).toBe('info')
      expect(notification.priority).toBe('medium')
      expect(notification.metadata?.alert_type).toBe('pm_due')
    })
  })

  describe('getUnreadCount', () => {
    it('should return correct unread count', async () => {
      await notificationService.createNotification({
        user_id: 'user-1',
        title: 'Unread 1',
        message: 'Message 1',
        type: 'info',
        priority: 'medium'
      })

      await notificationService.createNotification({
        user_id: 'user-1',
        title: 'Unread 2',
        message: 'Message 2',
        type: 'info',
        priority: 'medium'
      })

      const readNotification = await notificationService.createNotification({
        user_id: 'user-1',
        title: 'Read notification',
        message: 'This will be read',
        type: 'info',
        priority: 'medium'
      })

      await notificationService.markAsRead(readNotification.id)

      const unreadCount = await notificationService.getUnreadCount('user-1')
      expect(unreadCount).toBe(2)
    })

    it('should return 0 for user with no notifications', async () => {
      const unreadCount = await notificationService.getUnreadCount('user-no-notifications')
      expect(unreadCount).toBe(0)
    })
  })

  describe('bulkMarkAsRead', () => {
    it('should mark multiple notifications as read', async () => {
      const notification1 = await notificationService.createNotification({
        user_id: 'user-1',
        title: 'Notification 1',
        message: 'Message 1',
        type: 'info',
        priority: 'medium'
      })

      const notification2 = await notificationService.createNotification({
        user_id: 'user-1',
        title: 'Notification 2',
        message: 'Message 2',
        type: 'info',
        priority: 'medium'
      })

      await notificationService.bulkMarkAsRead([notification1.id, notification2.id])

      const notifications = await notificationService.getUserNotifications('user-1')
      expect(notifications.every(n => n.read)).toBe(true)
    })
  })

  describe('cleanupOldNotifications', () => {
    it('should remove old notifications', async () => {
      // Create an old notification
      const oldNotification = await notificationService.createNotification({
        user_id: 'user-1',
        title: 'Old notification',
        message: 'This is old',
        type: 'info',
        priority: 'low'
      })

      // Manually set created_at to be older than 30 days
      const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
      await mockStorage.notifications.update(oldNotification.id, { 
        created_at: thirtyOneDaysAgo 
      })

      // Create a recent notification
      await notificationService.createNotification({
        user_id: 'user-1',
        title: 'Recent notification',
        message: 'This is recent',
        type: 'info',
        priority: 'low'
      })

      const deletedCount = await notificationService.cleanupOldNotifications(30)

      expect(deletedCount).toBe(1)

      const remainingNotifications = await notificationService.getUserNotifications('user-1')
      expect(remainingNotifications.length).toBe(1)
      expect(remainingNotifications[0].title).toBe('Recent notification')
    })
  })
})