import 'dotenv/config';
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not defined');
}

const sql = neon(process.env.DATABASE_URL);
export const db = drizzle(sql);

// Dummy pool export so the CRUD demo can import { pool } safely.
// With the Neon HTTP driver this will be undefined and is never used.
export const pool = undefined as any;

