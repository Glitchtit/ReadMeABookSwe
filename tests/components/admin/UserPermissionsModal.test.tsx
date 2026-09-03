/**
 * Component: User Permissions Modal Tests (password reset row)
 * Documentation: documentation/admin-dashboard.md
 */

// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ToastProvider } from '@/components/ui/Toast';
import { UserPermissionsModal } from '@/components/admin/users/UserPermissionsModal';

const baseUser = {
  id: 'u1',
  plexUsername: 'localuser',
  plexEmail: 'local@example.com',
  avatarUrl: null,
  role: 'user' as const,
  authProvider: 'local',
  autoApproveRequests: null,
  interactiveSearchAccess: null,
  downloadAccess: null,
  hasLoginToken: false,
};

function renderModal(overrides: Partial<typeof baseUser> = {}, onResetPassword = vi.fn()) {
  render(
    <ToastProvider>
      <UserPermissionsModal
        isOpen
        onClose={vi.fn()}
        user={{ ...baseUser, ...overrides }}
        globalAutoApprove={false}
        globalInteractiveSearch={false}
        globalDownloadAccess={false}
        generatedToken={null}
        onToggleAutoApprove={vi.fn()}
        onToggleInteractiveSearch={vi.fn()}
        onToggleDownloadAccess={vi.fn()}
        onToggleToken={vi.fn()}
        onResetPassword={onResetPassword}
      />
    </ToastProvider>
  );
  return { onResetPassword };
}

describe('UserPermissionsModal password reset', () => {
  it('shows the reset password section for local users', () => {
    renderModal();
    expect(screen.getByLabelText('New Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset Password' })).toBeInTheDocument();
  });

  it('hides the reset password section for non-local users', () => {
    renderModal({ authProvider: 'plex' });
    expect(screen.queryByLabelText('New Password')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reset Password' })).not.toBeInTheDocument();
  });

  it('rejects mismatched passwords without calling onResetPassword', () => {
    const { onResetPassword } = renderModal();

    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'secret123' } });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), { target: { value: 'other456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }));

    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    expect(onResetPassword).not.toHaveBeenCalled();
  });

  it('calls onResetPassword with the new password and clears the fields on success', async () => {
    const onResetPassword = vi.fn().mockResolvedValue(true);
    renderModal({}, onResetPassword);

    const newInput = screen.getByLabelText('New Password') as HTMLInputElement;
    const confirmInput = screen.getByLabelText('Confirm New Password') as HTMLInputElement;
    fireEvent.change(newInput, { target: { value: 'secret123' } });
    fireEvent.change(confirmInput, { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }));

    await waitFor(() => {
      expect(onResetPassword).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'u1' }),
        'secret123'
      );
    });
    await waitFor(() => {
      expect(newInput.value).toBe('');
      expect(confirmInput.value).toBe('');
    });
  });

  it('keeps the entered password when the reset fails', async () => {
    const onResetPassword = vi.fn().mockResolvedValue(false);
    renderModal({}, onResetPassword);

    const newInput = screen.getByLabelText('New Password') as HTMLInputElement;
    fireEvent.change(newInput, { target: { value: 'secret123' } });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }));

    await waitFor(() => expect(onResetPassword).toHaveBeenCalled());
    expect(newInput.value).toBe('secret123');
  });
});
