/**
 * Component: Admin User Password Reset API
 * Documentation: documentation/backend/services/auth.md
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '@/lib/middleware/auth';
import { prisma } from '@/lib/db';
import bcrypt from 'bcrypt';
import { getEncryptionService } from '@/lib/services/encryption.service';
import { RMABLogger } from '@/lib/utils/logger';

const logger = RMABLogger.create('API.Admin.Users.Password');

/**
 * POST /api/admin/users/[id]/password
 * Admin sets a new password for a local user (no current-password check).
 * Invalidates the target user's existing sessions.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return requireAuth(request, async (req: AuthenticatedRequest) => {
    return requireAdmin(req, async () => {
      try {
        const { id } = await params;
        const { newPassword } = await request.json();

        if (!newPassword || typeof newPassword !== 'string') {
          return NextResponse.json({ error: 'New password is required' }, { status: 400 });
        }

        const allowWeakPassword = process.env.ALLOW_WEAK_PASSWORD === 'true';
        if (!allowWeakPassword && newPassword.length < 8) {
          return NextResponse.json(
            { error: 'Password must be at least 8 characters' },
            { status: 400 }
          );
        }

        const targetUser = await prisma.user.findUnique({
          where: { id },
          select: { plexUsername: true, authProvider: true, deletedAt: true },
        });

        if (!targetUser) {
          return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        if (targetUser.deletedAt) {
          return NextResponse.json(
            { error: 'Cannot reset password for a deleted user' },
            { status: 403 }
          );
        }

        if (targetUser.authProvider !== 'local') {
          return NextResponse.json(
            { error: 'Password reset is only available for local users' },
            { status: 403 }
          );
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        const encryptedHash = getEncryptionService().encrypt(hashedPassword);

        await prisma.user.update({
          where: { id },
          data: {
            authToken: encryptedHash,
            sessionsInvalidatedAt: new Date(),
            updatedAt: new Date(),
          },
        });

        logger.info('Admin reset password for user', {
          targetUser: targetUser.plexUsername,
          resetBy: req.user!.username,
        });

        return NextResponse.json({ success: true, message: 'Password reset successfully' });
      } catch (error) {
        logger.error('Failed to reset password', {
          error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json({ error: 'Failed to reset password' }, { status: 500 });
      }
    });
  });
}
