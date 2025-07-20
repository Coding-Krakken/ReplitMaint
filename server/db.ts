import dotenv from 'dotenv';
dotenv.config();

import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
const { Pool } = pkg;
import * as schema from '../shared/schema';

// Check if DATABASE_URL is set for production PostgreSQL usage
let db: any = null;
let Database: any = null;

if (!process.env.DATABASE_URL) {
  console.log('DATABASE_URL not set - using in-memory storage for development');
  // For development mode, we'll use in-memory storage in storage.ts
  db = null;
} else {
  console.log('Initializing database connection...');
  console.log('DATABASE_URL:', process.env.DATABASE_URL);

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  db = drizzle(pool, { schema });
  Database = typeof db;

  console.log('Database connection initialized successfully');
}

export { db };
export type Database = typeof db;