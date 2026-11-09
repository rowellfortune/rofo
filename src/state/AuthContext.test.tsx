import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';

// Demo mode: the real config has no VITE_ values in tests, so Amplify must never load.
const getAuth = vi.hoisted(() => vi.fn());
vi.mock('../api/transport', () => ({ getAuth }));

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

describe('AuthProvider (demo mode)', () => {
  test('sign in is off, nobody is signed in, nothing is loading', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.enabled).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.adminMfa).toBe('na');
    expect(getAuth).not.toHaveBeenCalled();
  });

  test('useAuth outside the provider fails loudly', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useAuth())).toThrow('useAuth must be used inside AuthProvider');
  });
});
