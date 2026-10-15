'use client';

import { useState } from 'react';
import { auth } from '@/lib/cloud/api';
import { ALLOWED_DOMAIN } from '@/lib/cloud/config';
import { Dialog, ErrorText, FieldLabel, inputClass } from '../ui/Dialog';
import { Button } from '../ui/Button';

type Mode = 'sign-in' | 'sign-up' | 'reset';

export function SignInDialog({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === 'sign-in') {
        await auth.signIn(email, password);
        onClose();
      } else if (mode === 'sign-up') {
        const { needsConfirmation } = await auth.signUp(email, password);
        if (needsConfirmation) {
          setInfo('Check your inbox and confirm your address, then sign in here.');
          setMode('sign-in');
        } else {
          onClose();
        }
      } else {
        await auth.resetPassword(email);
        setInfo('If that address has an account, a reset link is on its way.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  const title = mode === 'sign-in' ? 'Sign in' : mode === 'sign-up' ? 'Create account' : 'Reset password';

  return (
    <Dialog title={title} onClose={onClose} width={380}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-[12px] leading-relaxed text-ink-500">
          {mode === 'sign-up'
            ? `Use your @${ALLOWED_DOMAIN} address.`
            : `Same account as the other Selected tools (@${ALLOWED_DOMAIN}).`}
        </p>
        <label className="flex flex-col gap-1">
          <FieldLabel>Email</FieldLabel>
          <input
            type="email"
            autoComplete="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </label>
        {mode !== 'reset' && (
          <label className="flex flex-col gap-1">
            <FieldLabel>Password</FieldLabel>
            <input
              type="password"
              autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
              required
              minLength={mode === 'sign-up' ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </label>
        )}
        {error && <ErrorText>{error}</ErrorText>}
        {info && <p className="text-[12px] text-ink-700">{info}</p>}
        <Button type="submit" variant="primary" disabled={busy} className="justify-center">
          {busy ? 'Working…' : title}
        </Button>
        <div className="flex justify-between text-[11px] text-ink-500">
          {mode === 'sign-in' ? (
            <>
              <button type="button" className="hover:underline" onClick={() => setMode('sign-up')}>
                Create account
              </button>
              <button type="button" className="hover:underline" onClick={() => setMode('reset')}>
                Forgot password?
              </button>
            </>
          ) : (
            <button type="button" className="hover:underline" onClick={() => setMode('sign-in')}>
              Back to sign in
            </button>
          )}
        </div>
      </form>
    </Dialog>
  );
}
