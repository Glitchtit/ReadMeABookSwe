/**
 * Component: Admin User Password Reset Tests
 * Documentation: documentation/backend/services/auth.md
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrismaMock } from '../helpers/prisma';

let authRequest: any;

const prismaMock = createPrismaMock();
const requireAuthMock = vi.hoisted(() => vi.fn());
const requireAdminMock = vi.hoisted(() => vi.fn());
const bcryptMock = vi.hoisted(() => ({
  hash: vi.fn(),
}));
const encryptionMock = vi.hoisted(() => ({
  encrypt: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: prismaMock,
}));

vi.mock('@/lib/middleware/auth', () => ({
  requireAuth: requireAuthMock,
  requireAdmin: requireAdminMock,
}));

vi.mock('bcrypt', () => ({
  default: bcryptMock,
  ...bcryptMock,
}));

vi.mock('@/lib/services/encryption.service', () => ({
  getEncryptionService: () => encryptionMock,
}));

const makeRequest = (body: Record<string, any>) => ({
  json: vi.fn().mockResolvedValue(body),
});

const localUser = {
  id: 'u1',
  plexUsername: 'localuser',
  authProvider: 'local',
  deletedAt: null,
};

describe('POST /api/admin/users/[id]/password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ALLOW_WEAK_PASSWORD;
    authRequest = { user: { id: 'admin-1', username: 'admin', role: 'admin' } };
    requireAuthMock.mockImplementation((_req: any, handler: any) => handler(authRequest));
    requireAdminMock.mockImplementation((_req: any, handler: any) => handler());
    bcryptMock.hash.mockResolvedValue('hashed-password');
    encryptionMock.encrypt.mockReturnValue('encrypted-hash');
  });

  it('resets the password for a local user and invalidates sessions', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(localUser);
    prismaMock.user.update.mockResolvedValueOnce({});

    const { POST } = await import('@/app/api/admin/users/[id]/password/route');
    const response = await POST(makeRequest({ newPassword: 'newsecret123' }) as any, {
      params: Promise.resolve({ id: 'u1' }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(bcryptMock.hash).toHaveBeenCalledWith('newsecret123', 10);
    expect(encryptionMock.encrypt).toHaveBeenCalledWith('hashed-password');
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u1' },
        data: expect.objectContaining({
          authToken: 'encrypted-hash',
          sessionsInvalidatedAt: expect.any(Date),
        }),
      })
    );
  });

  it('returns 400 when newPassword is missing', async () => {
    const { POST } = await import('@/app/api/admin/users/[id]/password/route');
    const response = await POST(makeRequest({}) as any, {
      params: Promise.resolve({ id: 'u1' }),
    });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toMatch(/required/i);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('returns 400 when password is shorter than 8 characters', async () => {
    const { POST } = await import('@/app/api/admin/users/[id]/password/route');
    const response = await POST(makeRequest({ newPassword: 'short' }) as any, {
      params: Promise.resolve({ id: 'u1' }),
    });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toMatch(/8 characters/);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('allows short passwords when ALLOW_WEAK_PASSWORD is enabled', async () => {
    process.env.ALLOW_WEAK_PASSWORD = 'true';
    prismaMock.user.findUnique.mockResolvedValueOnce(localUser);
    prismaMock.user.update.mockResolvedValueOnce({});

    const { POST } = await import('@/app/api/admin/users/[id]/password/route');
    const response = await POST(makeRequest({ newPassword: 'short' }) as any, {
      params: Promise.resolve({ id: 'u1' }),
    });

    expect(response.status).toBe(200);
    expect(bcryptMock.hash).toHaveBeenCalledWith('short', 10);
  });

  it('returns 404 when the user does not exist', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null);

    const { POST } = await import('@/app/api/admin/users/[id]/password/route');
    const response = await POST(makeRequest({ newPassword: 'newsecret123' }) as any, {
      params: Promise.resolve({ id: 'missing' }),
    });
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toMatch(/not found/i);
  });

  it('returns 403 when the user is deleted', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ ...localUser, deletedAt: new Date() });

    const { POST } = await import('@/app/api/admin/users/[id]/password/route');
    const response = await POST(makeRequest({ newPassword: 'newsecret123' }) as any, {
      params: Promise.resolve({ id: 'u1' }),
    });
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toMatch(/deleted/i);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('returns 403 when the user is not a local user', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ ...localUser, authProvider: 'plex' });

    const { POST } = await import('@/app/api/admin/users/[id]/password/route');
    const response = await POST(makeRequest({ newPassword: 'newsecret123' }) as any, {
      params: Promise.resolve({ id: 'u1' }),
    });
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toMatch(/local users/i);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('returns 500 when the database update fails', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(localUser);
    prismaMock.user.update.mockRejectedValueOnce(new Error('db down'));

    const { POST } = await import('@/app/api/admin/users/[id]/password/route');
    const response = await POST(makeRequest({ newPassword: 'newsecret123' }) as any, {
      params: Promise.resolve({ id: 'u1' }),
    });
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.error).toMatch(/failed to reset password/i);
  });
});
