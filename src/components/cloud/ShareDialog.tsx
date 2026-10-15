'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePlannerStore } from '@/store/plannerStore';
import { cloud, isAllowedEmail, shareUrl, type Members, type ShareLink } from '@/lib/cloud/api';
import { ALLOWED_DOMAIN } from '@/lib/cloud/config';
import { Dialog, ErrorText, inputClass } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { RoleBadge, when } from './ProjectsDialog';

type MemberRole = 'editor' | 'viewer';

export function ShareDialog({ onClose }: { onClose: () => void }) {
  const link = usePlannerStore((s) => s.cloud);
  const name = usePlannerStore((s) => s.project.name);
  const [members, setMembers] = useState<Members | null>(null);
  const [links, setLinks] = useState<ShareLink[] | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MemberRole>('editor');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const projectId = link?.projectId;
  const isOwner = link?.role === 'owner';
  const canLink = link?.role === 'owner' || link?.role === 'editor';

  const refresh = useCallback(async () => {
    if (!projectId) return;
    try {
      setMembers(await cloud.listMembers(projectId));
      if (canLink) setLinks(await cloud.listLinks(projectId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load sharing.');
    }
  }, [projectId, canLink]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!projectId) return null;

  const act = async (task: () => Promise<unknown>) => {
    setError(null);
    try {
      await task();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work.');
    }
  };

  const invite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAllowedEmail(email)) {
      setError(`Only @${ALLOWED_DOMAIN} addresses can be invited.`);
      return;
    }
    void act(async () => {
      await cloud.setMember(projectId, email, role);
      setEmail('');
    });
  };

  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(shareUrl(token));
      setCopied(token);
    } catch {
      window.prompt('Copy this link:', shareUrl(token));
    }
  };

  return (
    <Dialog title={`Share “${name}”`} onClose={onClose} width={520}>
      <div className="flex flex-col gap-6">
        {error && <ErrorText>{error}</ErrorText>}

        <section className="flex flex-col gap-3">
          <h3 className="text-[10px] font-medium uppercase tracking-widest2 text-ink-500">People with access</h3>
          {isOwner && (
            <form onSubmit={invite} className="flex items-end gap-2">
              <input
                type="email"
                placeholder={`name@${ALLOWED_DOMAIN}`}
                aria-label="Invite by email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
              <select
                aria-label="Role for the invite"
                value={role}
                onChange={(e) => setRole(e.target.value as MemberRole)}
                className="border-b border-wall-300 bg-transparent py-1 text-[12px] text-ink-900 outline-none"
              >
                <option value="editor">Can edit</option>
                <option value="viewer">View only</option>
              </select>
              <Button type="submit" variant="primary">Invite</Button>
            </form>
          )}
          {!members ? (
            <p className="text-[12px] text-ink-500">Loading…</p>
          ) : (
            <ul className="flex flex-col divide-y divide-wall-200" data-testid="share-members">
              <li className="flex items-center gap-2 py-2">
                <span className="flex-1 text-[13px] text-ink-900">{members.owner_email}</span>
                <RoleBadge role="owner" />
              </li>
              {members.members.map((m) => (
                <li key={m.email} className="flex items-center gap-2 py-2">
                  <span className="flex-1 truncate text-[13px] text-ink-900">{m.email}</span>
                  {isOwner ? (
                    <>
                      <select
                        aria-label={`Role for ${m.email}`}
                        value={m.role}
                        onChange={(e) => act(() => cloud.setMember(projectId, m.email, e.target.value as MemberRole))}
                        className="bg-transparent text-[12px] text-ink-900 outline-none"
                      >
                        <option value="editor">Can edit</option>
                        <option value="viewer">View only</option>
                      </select>
                      <Button variant="danger" onClick={() => act(() => cloud.removeMember(projectId, m.email))} title={`Remove ${m.email}`}>
                        Remove
                      </Button>
                    </>
                  ) : (
                    <RoleBadge role={m.role} />
                  )}
                </li>
              ))}
            </ul>
          )}
          {!isOwner && <p className="text-[11px] text-ink-500">Only the owner can change who has access.</p>}
        </section>

        {canLink && (
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-medium uppercase tracking-widest2 text-ink-500">View-only links</h3>
              <Button variant="subtle" onClick={() => act(async () => copy(await cloud.createLink(projectId)))}>
                Create link
              </Button>
            </div>
            <p className="text-[11px] leading-relaxed text-ink-500">
              Anyone with a link can view this plan without signing in — e.g. the store or the installer. Revoke
              it when they no longer need it.
            </p>
            {links && links.length > 0 && (
              <ul className="flex flex-col divide-y divide-wall-200" data-testid="share-links">
                {links.map((l) => (
                  <li key={l.token} className="flex items-center gap-2 py-2">
                    <span className="flex-1 truncate font-mono text-[11px] text-ink-700" title={shareUrl(l.token)}>
                      …{l.token.slice(-8)} · {when(l.created_at)}
                    </span>
                    <Button variant="ghost" onClick={() => copy(l.token)}>
                      {copied === l.token ? 'Copied' : 'Copy link'}
                    </Button>
                    <Button variant="danger" onClick={() => act(() => cloud.revokeLink(l.token))}>
                      Revoke
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </Dialog>
  );
}
