import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';
import app from '../app.js';
import { validateUser } from '../routes/users.js';

const { db: mockDb, mockExecute, mockHash } = vi.hoisted(() => {
  const executeFn = vi.fn();
  const hashFn = vi.fn();
  return {
    db: { execute: executeFn },
    mockExecute: executeFn,
    mockHash: hashFn,
  };
});

vi.mock('bcrypt', () => ({
  default: {
    hash: mockHash,
    compare: vi.fn(),
    compareSync: vi.fn(),
    hashSync: vi.fn(),
    genSalt: vi.fn(),
    genSaltSync: vi.fn(),
    getRounds: vi.fn(),
  },
}));

vi.mock('../db/index.js', () => ({
  db: mockDb,
}));

let server: http.Server;
let port: number;

beforeAll(async () => {
  server = app.listen(0);
  port = await new Promise<number>((resolve, reject) => {
    server.on('listening', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object' && addr !== null) {
        resolve(addr.port);
      } else {
        reject(new Error('Server failed to listen'));
      }
    });
    server.on('error', reject);
  });
});

afterAll(async () => {
  server.closeAllConnections?.();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  mockExecute.mockReset();
  mockHash.mockReset();
  mockHash.mockResolvedValue('$2b$10$fakehashedvalue');
});

async function postUser(
  body: unknown
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`http://localhost:${port}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const responseBody: unknown = await res.json();
  return { status: res.status, body: responseBody };
}

describe('validateUser', () => {
  it('returns validated user for valid input', () => {
    const result = validateUser({
      name: 'John Doe',
      email: 'john@example.com',
      password: 'password123',
    });
    expect(result).toEqual({
      name: 'John Doe',
      email: 'john@example.com',
      password: 'password123',
    });
  });

  it('trims whitespace from name', () => {
    const result = validateUser({
      name: '  John  ',
      email: 'john@example.com',
      password: 'password123',
    });
    expect(result).toEqual({
      name: 'John',
      email: 'john@example.com',
      password: 'password123',
    });
  });

  it('rejects whitespace-only name', () => {
    const result = validateUser({
      name: '   ',
      email: 'john@example.com',
      password: 'password123',
    });
    expect(result).toBe('Name is required');
  });

  it('rejects missing name', () => {
    const result = validateUser({
      email: 'john@example.com',
      password: 'password123',
    });
    expect(result).toBe('Name must be a string');
  });

  it('rejects non-string name', () => {
    const result = validateUser({
      name: 555,
      email: 'john@example.com',
      password: 'password123',
    });
    expect(result).toBe('Name must be a string');
  });

  it('rejects missing email', () => {
    const result = validateUser({
      name: 'John',
      password: 'password123',
    });
    expect(result).toBe('Email must be a string');
  });

  it('rejects non-string email', () => {
    const result = validateUser({
      name: 'John',
      email: [],
      password: 'password123',
    });
    expect(result).toBe('Email must be a string');
  });

  it('rejects malformed email', () => {
    const result = validateUser({
      name: 'John',
      email: 'not-an-email',
      password: 'password123',
    });
    expect(result).toBe('A valid email is required');
  });

  it('rejects missing password', () => {
    const result = validateUser({
      name: 'John',
      email: 'john@example.com',
    });
    expect(result).toBe('Password must be a string');
  });

  it('rejects non-string password', () => {
    const result = validateUser({
      name: 'John',
      email: 'john@example.com',
      password: {},
    });
    expect(result).toBe('Password must be a string');
  });

  it('rejects short password', () => {
    const result = validateUser({
      name: 'John',
      email: 'john@example.com',
      password: 'short',
    });
    expect(result).toBe('Password must be at least 8 characters');
  });

  it('rejects null body', () => {
    expect(validateUser(null)).toBe('Invalid request body');
  });

  it('rejects array body', () => {
    expect(validateUser([1, 2, 3])).toBe('Invalid request body');
  });

  it('rejects string body', () => {
    expect(validateUser('hello')).toBe('Invalid request body');
  });
});

describe('POST /users', () => {
  it('creates a user with valid input (201)', async () => {
    mockExecute.mockResolvedValue([]);
    const { status, body } = await postUser({
      name: 'John Doe',
      email: 'john@example.com',
      password: 'password123',
    });

    expect(status).toBe(201);
    const resp = body as { user: { name: string; email: string }; message: string };
    expect(resp.user.name).toBe('John Doe');
    expect(resp.user.email).toBe('john@example.com');
    expect(resp.user).not.toHaveProperty('password');
    expect(resp.message).toBe('User registered successfully!');
    expect(mockExecute).toHaveBeenCalledTimes(1);
    const sqlArg = mockExecute.mock.calls[0]?.[0];
    expect(sqlArg).toBeDefined();
    expect(typeof sqlArg).toBe('object');
    expect(JSON.stringify(sqlArg)).toMatch(/INSERT INTO users/i);
    expect(mockHash).toHaveBeenCalledWith('password123', 10);
  });

  it('returns 400 when name is missing', async () => {
    mockExecute.mockResolvedValue([]);
    const { status, body } = await postUser({
      email: 'john@example.com',
      password: 'password123',
    });

    expect(status).toBe(400);
    const resp = body as { message: string };
    expect(resp.message).toBe('Name must be a string');
  });

  it('returns 400 when email is missing', async () => {
    mockExecute.mockResolvedValue([]);
    const { status, body } = await postUser({
      name: 'John',
      password: 'password123',
    });

    expect(status).toBe(400);
    const resp = body as { message: string };
    expect(resp.message).toBe('Email must be a string');
  });

  it('returns 400 when password is missing', async () => {
    mockExecute.mockResolvedValue([]);
    const { status, body } = await postUser({
      name: 'John',
      email: 'john@example.com',
    });

    expect(status).toBe(400);
    const resp = body as { message: string };
    expect(resp.message).toBe('Password must be a string');
  });

  it('returns 400 for invalid input (wrong data types)', async () => {
    mockExecute.mockResolvedValue([]);
    const { status } = await postUser({
      name: 555,
      email: [],
      password: {},
    });

    expect(status).toBe(400);
  });

  it('returns 400 for whitespace-only name', async () => {
    mockExecute.mockResolvedValue([]);
    const { status, body } = await postUser({
      name: '   ',
      email: 'john@example.com',
      password: 'password123',
    });

    expect(status).toBe(400);
    const resp = body as { message: string };
    expect(resp.message).toBe('Name is required');
  });

  it('returns 400 for malformed email', async () => {
    mockExecute.mockResolvedValue([]);
    const { status, body } = await postUser({
      name: 'John',
      email: 'not-an-email',
      password: 'password123',
    });

    expect(status).toBe(400);
    const resp = body as { message: string };
    expect(resp.message).toBe('A valid email is required');
  });

  it('returns 400 for short password', async () => {
    mockExecute.mockResolvedValue([]);
    const { status, body } = await postUser({
      name: 'John',
      email: 'john@example.com',
      password: 'short',
    });

    expect(status).toBe(400);
    const resp = body as { message: string };
    expect(resp.message).toBe('Password must be at least 8 characters');
  });

  it('returns 409 for duplicate email', async () => {
    const err = Object.assign(new Error('duplicate key value'), {
      code: '23505',
    });
    mockExecute.mockRejectedValue(err);
    const { status, body } = await postUser({
      name: 'John',
      email: 'john@example.com',
      password: 'password123',
    });

    expect(status).toBe(409);
    const resp = body as { message: string };
    expect(resp.message).toBe('Email already exists');
  });

  it('returns 500 for unexpected database failure', async () => {
    mockExecute.mockRejectedValue(new Error('Connection refused'));
    const { status, body } = await postUser({
      name: 'John',
      email: 'john@example.com',
      password: 'password123',
    });

    expect(status).toBe(500);
    const resp = body as { message: string };
    expect(resp.message).toBe('Internal server error');
  });

  it('does not expose internal error details to client', async () => {
    mockExecute.mockRejectedValue(new Error('Connection refused'));
    const { status, body } = await postUser({
      name: 'John',
      email: 'john@example.com',
      password: 'password123',
    });

    expect(status).toBe(500);
    const resp = body as { message: string };
    expect(resp.message).toBe('Internal server error');
    expect(JSON.stringify(body)).not.toContain('Connection refused');
  });

  it('returns 500 when bcrypt.hash fails', async () => {
    mockHash.mockRejectedValueOnce(new Error('bcrypt failure'));
    const { status, body } = await postUser({
      name: 'John',
      email: 'john@example.com',
      password: 'password123',
    });

    expect(status).toBe(500);
    const resp = body as { message: string };
    expect(resp.message).toBe('Internal server error');
    expect(mockExecute).not.toHaveBeenCalled();
  });
});
