import type { Page, Route } from '@playwright/test';

/**
 * In-memory stand-in for the Supabase auth endpoints and the fp_* database
 * functions, mirroring the rules in supabase/migrations/*_fp_cloud_projects.sql
 * (roles, @bestseller.com only, optimistic versions, revocable links).
 * Requests are intercepted with page.route, so tests never touch the real
 * database.
 */

type Role = 'owner' | 'editor' | 'viewer';

interface Project {
  id: string;
  owner_email: string;
  name: string;
  data: unknown;
  version: number;
  updated_at: string;
  updated_by_email: string;
}

const PASSWORD = 'correct horse';

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

/** An unsigned JWT-shaped token carrying the email, enough for supabase-js. */
function tokenFor(email: string): string {
  const now = Math.floor(Date.now() / 1000);
  return [b64url({ alg: 'HS256', typ: 'JWT' }), b64url({ sub: idFor(email), email, role: 'authenticated', exp: now + 3600, iat: now }), 'sig'].join('.');
}

function idFor(email: string): string {
  const hex = Buffer.from(email).toString('hex').padEnd(32, '0').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function emailFromAuth(header: string | undefined): string | null {
  const token = header?.replace(/^Bearer /, '') ?? '';
  const parts = token.split('.');
  if (parts.length !== 3) return null; // the publishable key: signed out
  try {
    return JSON.parse(Buffer.from(parts[1]!, 'base64url').toString()).email ?? null;
  } catch {
    return null;
  }
}

class RpcError extends Error {
  constructor(message: string, public code = 'P0001') {
    super(message);
  }
}

export class FakeCloud {
  projects = new Map<string, Project>();
  members = new Map<string, Map<string, 'editor' | 'viewer'>>();
  links = new Map<string, { project_id: string; created_at: string; created_by_email: string; revoked: boolean }>();
  /** Every RPC call, for assertions. */
  calls: { fn: string; email: string | null; args: Record<string, unknown> }[] = [];
  private seq = 0;

  /** Seed a project as if `owner` had saved it. */
  seed(owner: string, name: string, data: unknown, share: Record<string, 'editor' | 'viewer'> = {}): string {
    const id = `00000000-0000-4000-8000-${String(++this.seq).padStart(12, '0')}`;
    this.projects.set(id, { id, owner_email: owner, name, data, version: 1, updated_at: new Date().toISOString(), updated_by_email: owner });
    this.members.set(id, new Map(Object.entries(share)));
    return id;
  }

  /** Simulate a colleague saving a newer version (the client sends the plan's name along). */
  saveAs(email: string, id: string, data: { name?: string }) {
    const p = this.projects.get(id)!;
    Object.assign(p, {
      data,
      name: data.name?.trim() || p.name,
      version: p.version + 1,
      updated_at: new Date().toISOString(),
      updated_by_email: email,
    });
  }

  private role(email: string | null, id: string): Role | null {
    if (!email || !email.endsWith('@bestseller.com')) return null;
    const p = this.projects.get(id);
    if (!p) return null;
    if (p.owner_email === email) return 'owner';
    return this.members.get(id)?.get(email) ?? null;
  }

  private require(email: string | null, id: string, roles: Role[]): Role {
    if (!email || !email.endsWith('@bestseller.com')) throw new RpcError('Sign in with a confirmed @bestseller.com account.', '42501');
    const r = this.role(email, id);
    if (!r) throw new RpcError('Plan not found, or you have no access to it.', 'P0002');
    if (!roles.includes(r)) throw new RpcError(`Your role on this plan (${r}) does not allow that.`, '42501');
    return r;
  }

  private summary(p: Project, email: string) {
    const { data: _data, ...rest } = p;
    return { ...rest, role: this.role(email, p.id) };
  }

  rpc(fn: string, args: Record<string, any>, email: string | null): unknown {
    this.calls.push({ fn, email, args });
    switch (fn) {
      case 'fp_list_projects': {
        if (!email) throw new RpcError('Sign in with a confirmed @bestseller.com account.', '42501');
        return [...this.projects.values()]
          .filter((p) => this.role(email, p.id))
          .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
          .map((p) => this.summary(p, email));
      }
      case 'fp_get_project': {
        const role = this.require(email, args.p_id, ['owner', 'editor', 'viewer']);
        return { ...this.projects.get(args.p_id)!, role };
      }
      case 'fp_create_project': {
        if (!email) throw new RpcError('Sign in with a confirmed @bestseller.com account.', '42501');
        const id = this.seed(email, args.p_name || 'Untitled plan', args.p_data);
        const p = this.projects.get(id)!;
        return { id, version: p.version, updated_at: p.updated_at, role: 'owner' };
      }
      case 'fp_save_project': {
        this.require(email, args.p_id, ['owner', 'editor']);
        const p = this.projects.get(args.p_id)!;
        if (p.version !== args.p_version) {
          return { ok: false, version: p.version, updated_at: p.updated_at, updated_by_email: p.updated_by_email };
        }
        Object.assign(p, {
          data: args.p_data,
          name: args.p_name?.trim() || p.name,
          version: p.version + 1,
          updated_at: new Date().toISOString(),
          updated_by_email: email,
        });
        return { ok: true, version: p.version, updated_at: p.updated_at, updated_by_email: p.updated_by_email };
      }
      case 'fp_delete_project': {
        this.require(email, args.p_id, ['owner']);
        this.projects.delete(args.p_id);
        return null;
      }
      case 'fp_list_members': {
        this.require(email, args.p_id, ['owner', 'editor', 'viewer']);
        return {
          owner_email: this.projects.get(args.p_id)!.owner_email,
          members: [...(this.members.get(args.p_id) ?? new Map())].sort().map(([e, role]) => ({ email: e, role })),
        };
      }
      case 'fp_set_member': {
        this.require(email, args.p_id, ['owner']);
        const e = String(args.p_email).trim().toLowerCase();
        if (!e.endsWith('@bestseller.com')) throw new RpcError('Only @bestseller.com addresses can be invited.', '22023');
        this.members.get(args.p_id)!.set(e, args.p_role);
        return null;
      }
      case 'fp_remove_member': {
        this.require(email, args.p_id, ['owner']);
        this.members.get(args.p_id)!.delete(String(args.p_email).toLowerCase());
        return null;
      }
      case 'fp_list_links': {
        this.require(email, args.p_id, ['owner', 'editor']);
        return [...this.links]
          .filter(([, l]) => l.project_id === args.p_id && !l.revoked)
          .map(([token, l]) => ({ token, created_at: l.created_at, created_by_email: l.created_by_email }));
      }
      case 'fp_create_link': {
        this.require(email, args.p_id, ['owner', 'editor']);
        const token = `tok${++this.seq}xxxxxxxxxxxxxxxxxxxx`;
        this.links.set(token, { project_id: args.p_id, created_at: new Date().toISOString(), created_by_email: email!, revoked: false });
        return token;
      }
      case 'fp_revoke_link': {
        const l = this.links.get(args.p_token);
        if (!l) throw new RpcError('Link not found.', 'P0002');
        this.require(email, l.project_id, ['owner', 'editor']);
        l.revoked = true;
        return null;
      }
      case 'fp_get_shared_project': {
        const l = this.links.get(args.p_token);
        if (!l || l.revoked) return null;
        const p = this.projects.get(l.project_id);
        return p ? { name: p.name, data: p.data, updated_at: p.updated_at, owner_email: p.owner_email } : null;
      }
      default:
        throw new RpcError(`Unknown function ${fn}`, '42883');
    }
  }

  /** Route Supabase traffic of `page` to this fake. Call after openFresh(). */
  async install(page: Page) {
    const json = (route: Route, status: number, body: unknown) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    await page.route('**/auth/v1/token**', async (route) => {
      const { email, password } = route.request().postDataJSON() as { email: string; password: string };
      if (password !== PASSWORD) {
        return json(route, 400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
      }
      const now = Math.floor(Date.now() / 1000);
      return json(route, 200, {
        access_token: tokenFor(email),
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: now + 3600,
        refresh_token: `refresh-${email}`,
        user: {
          id: idFor(email),
          aud: 'authenticated',
          role: 'authenticated',
          email,
          email_confirmed_at: new Date().toISOString(),
          app_metadata: { provider: 'email' },
          user_metadata: {},
          created_at: new Date().toISOString(),
        },
      });
    });
    await page.route('**/auth/v1/logout**', (route) => route.fulfill({ status: 204 }));
    await page.route('**/auth/v1/user**', (route) => {
      const email = emailFromAuth(route.request().headers().authorization);
      return email
        ? json(route, 200, { id: idFor(email), email, aud: 'authenticated', role: 'authenticated' })
        : json(route, 401, { msg: 'not signed in' });
    });
    await page.route('**/rest/v1/rpc/*', async (route) => {
      const fn = new URL(route.request().url()).pathname.split('/').pop()!;
      const email = emailFromAuth(route.request().headers().authorization);
      const args = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
      try {
        return json(route, 200, this.rpc(fn, args, email));
      } catch (e) {
        const err = e as RpcError;
        return json(route, 400, { code: err.code, message: err.message, details: null, hint: null });
      }
    });
  }
}

export const FAKE_PASSWORD = PASSWORD;

/** Sign in through the UI. */
export async function signIn(page: Page, email: string) {
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Sign in' });
  await dialog.getByLabel('Email').fill(email);
  await dialog.getByLabel('Password').fill(PASSWORD);
  await dialog.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: 'Account' }).waitFor();
}
