import type { VercelRequest, VercelResponse } from '@vercel/node';

// Simple mock data for demo purposes
const mockProfile = {
  id: 'demo-user',
  email: 'demo@maintainpro.com',
  firstName: 'Demo',
  lastName: 'User',
  role: 'supervisor',
  warehouseId: 'demo-warehouse',
  active: true,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { slug } = req.query;
  const path = Array.isArray(slug) ? `/${slug.join('/')}` : `/${slug}`;

  try {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-user-id, x-warehouse-id');

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    // Handle API routes
    if (path === '/profiles/me' || path.startsWith('/profiles/')) {
      return res.status(200).json(mockProfile);
    }

    if (path.startsWith('/work-orders')) {
        if (req.method === 'POST') {
            // Simple mock authentication: require 'Authorization: Bearer demo-token' header
            const authHeader = req.headers['authorization'] || req.headers['Authorization'];
            if (!authHeader || authHeader !== 'Bearer demo-token') {
                return res.status(401).json({ message: 'Invalid or expired token' });
            }
            // Parse request body
            const { warehouse, estimatedHours, notes, attachments, scheduledAt } = req.body || {};
            // Basic validation
            if (!warehouse || !estimatedHours || !scheduledAt) {
                return res.status(400).json({ message: 'Missing required fields' });
            }
            // Create mock work order
            const workOrder = {
                id: 'wo-' + Date.now(),
                warehouse,
                estimatedHours,
                notes: notes || '',
                attachments: attachments || [],
                scheduledAt,
                status: 'new',
                createdAt: new Date().toISOString(),
            };
            return res.status(201).json(workOrder);
        }
        // Default GET handler (empty array)
        return res.status(200).json([]);
    }

    if (path.startsWith('/equipment')) {
      return res.status(200).json([]);
    }

    if (path.startsWith('/parts')) {
      return res.status(200).json([]);
    }

    if (path.startsWith('/notifications')) {
      return res.status(200).json([]);
    }

    // Default response for unknown routes
    return res.status(404).json({ message: 'API route not found' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}
