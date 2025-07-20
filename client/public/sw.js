/**
 * MaintainPro CMMS Service Worker
 * Provides offline capabilities, background sync, and push notifications
 */

const CACHE_NAME = 'maintainpro-v1.2.0';
const API_CACHE = 'maintainpro-api-v1.2.0';
const STATIC_CACHE = 'maintainpro-static-v1.2.0';

// Resources to cache immediately
const STATIC_RESOURCES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  // Core app files will be added dynamically by Vite
];

// API endpoints to cache with network-first strategy
const API_ENDPOINTS = [
  '/api/work-orders',
  '/api/equipment',
  '/api/parts',
  '/api/preventive-maintenance',
  '/api/dashboard/stats'
];

// Install event - cache static resources
self.addEventListener('install', event => {
  console.log('[SW] Installing service worker');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('[SW] Caching static resources');
        return cache.addAll(STATIC_RESOURCES);
      })
      .then(() => {
        console.log('[SW] Installation complete');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('[SW] Installation failed:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('[SW] Activating service worker');
  
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        const validCaches = [CACHE_NAME, API_CACHE, STATIC_CACHE];
        return Promise.all(
          cacheNames.map(cacheName => {
            if (!validCaches.includes(cacheName)) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] Activation complete');
        return self.clients.claim();
      })
  );
});

// Fetch event - implement caching strategies
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Handle API requests with network-first strategy
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleAPIRequest(request));
    return;
  }
  
  // Handle static resources with cache-first strategy
  if (request.method === 'GET') {
    event.respondWith(handleStaticRequest(request));
    return;
  }
});

// Network-first strategy for API requests
async function handleAPIRequest(request) {
  const cacheName = API_CACHE;
  
  try {
    // Try network first
    const networkResponse = await fetch(request.clone());
    
    if (networkResponse.ok) {
      // Cache successful responses for critical endpoints
      if (shouldCacheAPI(request.url)) {
        const cache = await caches.open(cacheName);
        cache.put(request.clone(), networkResponse.clone());
      }
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed, trying cache for:', request.url);
    
    // Fallback to cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      // Add offline header to indicate stale data
      const headers = new Headers(cachedResponse.headers);
      headers.set('X-Served-By', 'service-worker');
      headers.set('X-Cache-Status', 'offline');
      
      return new Response(cachedResponse.body, {
        status: cachedResponse.status,
        statusText: cachedResponse.statusText,
        headers
      });
    }
    
    // Return offline fallback for critical data
    return getOfflineFallback(request.url);
  }
}

// Cache-first strategy for static resources
async function handleStaticRequest(request) {
  const cachedResponse = await caches.match(request);
  
  if (cachedResponse) {
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[SW] Failed to fetch static resource:', request.url);
    
    // Return offline page for navigation requests
    if (request.mode === 'navigate') {
      const offlineResponse = await caches.match('/');
      return offlineResponse || new Response('Offline', { status: 503 });
    }
    
    throw error;
  }
}

// Determine if API endpoint should be cached
function shouldCacheAPI(url) {
  return API_ENDPOINTS.some(endpoint => url.includes(endpoint));
}

// Generate offline fallback responses
function getOfflineFallback(url) {
  if (url.includes('/api/work-orders')) {
    return new Response(JSON.stringify({
      data: [],
      message: 'Offline - showing cached work orders',
      offline: true
    }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'X-Cache-Status': 'offline-fallback'
      }
    });
  }
  
  if (url.includes('/api/equipment')) {
    return new Response(JSON.stringify({
      data: [],
      message: 'Offline - showing cached equipment',
      offline: true
    }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'X-Cache-Status': 'offline-fallback'
      }
    });
  }
  
  // Default offline response
  return new Response(JSON.stringify({
    error: 'Service unavailable offline',
    message: 'This feature requires an internet connection',
    offline: true
  }), {
    status: 503,
    headers: { 
      'Content-Type': 'application/json',
      'X-Cache-Status': 'offline-error'
    }
  });
}

// Background sync for offline actions
self.addEventListener('sync', event => {
  console.log('[SW] Background sync triggered:', event.tag);
  
  if (event.tag === 'work-order-sync') {
    event.waitUntil(syncWorkOrders());
  }
  
  if (event.tag === 'equipment-sync') {
    event.waitUntil(syncEquipment());
  }
  
  if (event.tag === 'offline-actions-sync') {
    event.waitUntil(syncOfflineActions());
  }
});

// Sync offline work order actions
async function syncWorkOrders() {
  try {
    console.log('[SW] Syncing work orders...');
    
    // Get offline actions from IndexedDB or localStorage
    const offlineActions = await getOfflineActions('work_orders');
    
    for (const action of offlineActions) {
      try {
        await fetch(`/api/work-orders${action.id ? `/${action.id}` : ''}`, {
          method: action.method || 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Sync-Action': 'background'
          },
          body: JSON.stringify(action.data)
        });
        
        // Remove synced action
        await removeOfflineAction('work_orders', action.id);
      } catch (error) {
        console.error('[SW] Failed to sync work order:', error);
      }
    }
  } catch (error) {
    console.error('[SW] Work order sync failed:', error);
    throw error;
  }
}

// Sync offline equipment actions  
async function syncEquipment() {
  try {
    console.log('[SW] Syncing equipment...');
    // Similar implementation for equipment sync
  } catch (error) {
    console.error('[SW] Equipment sync failed:', error);
    throw error;
  }
}

// Sync all offline actions
async function syncOfflineActions() {
  try {
    console.log('[SW] Syncing all offline actions...');
    
    // Notify main thread about sync status
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_STATUS',
        status: 'syncing'
      });
    });
    
    await Promise.all([
      syncWorkOrders(),
      syncEquipment()
    ]);
    
    // Notify sync completion
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_STATUS', 
        status: 'completed'
      });
    });
    
  } catch (error) {
    console.error('[SW] Offline actions sync failed:', error);
    
    // Notify sync failure
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_STATUS',
        status: 'failed',
        error: error.message
      });
    });
  }
}

// Helper functions for offline action management
async function getOfflineActions(table) {
  // In a real implementation, this would read from IndexedDB
  // For now, return empty array as placeholder
  return [];
}

async function removeOfflineAction(table, actionId) {
  // Remove synced action from offline storage
  console.log(`[SW] Removing synced action: ${table}/${actionId}`);
}

// Push notification handling
self.addEventListener('push', event => {
  console.log('[SW] Push notification received');
  
  const options = {
    body: 'New maintenance alert',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    data: {
      url: '/work-orders'
    },
    actions: [
      {
        action: 'view',
        title: 'View Details'
      },
      {
        action: 'dismiss', 
        title: 'Dismiss'
      }
    ]
  };
  
  if (event.data) {
    try {
      const payload = event.data.json();
      options.body = payload.body || options.body;
      options.data = payload.data || options.data;
    } catch (error) {
      console.error('[SW] Failed to parse push payload:', error);
    }
  }
  
  event.waitUntil(
    self.registration.showNotification('MaintainPro CMMS', options)
  );
});

// Notification click handling
self.addEventListener('notificationclick', event => {
  console.log('[SW] Notification clicked:', event.action);
  
  event.notification.close();
  
  if (event.action === 'view') {
    const url = event.notification.data?.url || '/';
    event.waitUntil(
      clients.openWindow(url)
    );
  }
});

console.log('[SW] Service worker loaded successfully');