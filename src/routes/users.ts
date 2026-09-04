import { Router } from 'express';
import bcrypt from 'bcrypt';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';

const router = Router();

export interface ValidatedUser {
  name: string;
  email: string;
  password: string;
}

export function validateUser(body: unknown): ValidatedUser | string {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return 'Invalid request body';
  }

  const b = body as Record<string, unknown>;

  if (typeof b.name !== 'string') {
    return 'Name must be a string';
  }
  if (b.name.trim().length === 0) {
    return 'Name is required';
  }

  if (typeof b.email !== 'string') {
    return 'Email must be a string';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)) {
    return 'A valid email is required';
  }

  if (typeof b.password !== 'string') {
    return 'Password must be a string';
  }
  if (b.password.length < 8) {
    return 'Password must be at least 8 characters';
  }

  return { name: b.name.trim(), email: b.email, password: b.password };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === '23505'
  );
}

router.post('/users', async (req, res) => {
  const result = validateUser(req.body);

  if (typeof result === 'string') {
    return res.status(400).json({ message: result });
  }

  try {
    const hashedPassword = await bcrypt.hash(result.password, 10);

    await db.execute(sql`
      INSERT INTO users (name, email, password)
      VALUES (${result.name}, ${result.email}, ${hashedPassword})
    `);

    return res.status(201).json({
      message: 'User registered successfully!',
      user: { name: result.name, email: result.email },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: 'Email already exists' });
    }

    console.error('Error creating user:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
