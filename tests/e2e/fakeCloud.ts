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

interface Version {
  slot: number;
  kind: 'auto' | 'manual';
  label: string | null;
  name: string;
  data: unknown;
  source_version: number;
  saved_at: string;
  saved_by_email: string;
}

const PASSWORD = 'correct horse';
/** A save this long after the previous one starts a new working session. */
const SESSION_GAP_MS = 30 * 60 * 1000;

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
  versions = new Map<string, Version[]>();
  /** The fp-drawings bucket: object name → bytes and who uploaded them. */
  files = new Map<string, { bytes: Buffer; owner: string; contentType: string }>();
  drawings: { id: string; path: string; file_name: string; shop: string | null; size_bytes: number; uploaded_by_email: string; uploaded_at: string }[] = [];
  comments: {
    id: string; project_id: string; author_name: string; author_email: string | null; via_link: boolean; body: string;
    x: number | null; y: number | null; variant_id: string | null; created_at: string; resolved_at: string | null; resolved_by_email: string | null;
  }[] = [];
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

  /** As fp_put_version: a free slot, else the oldest one this kind may replace. */
  private putVersion(id: string, v: Omit<Version, 'slot'>): boolean {
    const list = this.versions.get(id) ?? [];
    this.versions.set(id, list);
    const used = new Set(list.map((x) => x.slot));
    let slot = [0, 1, 2].find((n) => !used.has(n));
    if (slot === undefined) {
      const victim = [...list]
        .filter((x) => v.kind === 'manual' || x.kind === 'auto')
        .sort((a, b) => a.saved_at.localeCompare(b.saved_at))[0];
      if (!victim) return false;
      slot = victim.slot;
      list.splice(list.indexOf(victim), 1);
    }
    list.push({ ...v, label: v.label?.trim() || null, slot });
    return true;
  }

  /** Make the last save look `ms` old, as if the planner took a break. */
  age(id: string, ms: number) {
    const p = this.projects.get(id)!;
    p.updated_at = new Date(Date.parse(p.updated_at) - ms).toISOString();
  }

  private listVersions(id: string) {
    return [...(this.versions.get(id) ?? [])]
      .sort((a, b) => b.saved_at.localeCompare(a.saved_at))
      .map(({ data: _d, ...rest }) => rest);
  }

  private linkProject(token: string): string {
    const l = this.links.get(token);
    if (!l || l.revoked) throw new RpcError('This link no longer works.', 'P0002');
    return l.project_id;
  }

  private commentsOf(id: string) {
    return this.comments.filter((c) => c.project_id === id).map(({ project_id: _p, ...rest }) => rest);
  }

  private putComment(id: string, name: string, email: string | null, viaLink: boolean, args: Record<string, any>) {
    const body = String(args.p_body ?? '').trim();
    if (!body) throw new RpcError('Write a comment first.', '22023');
    if (!String(name ?? '').trim()) throw new RpcError('Give your name (up to 80 characters).', '22023');
    const pinned = args.p_x !== null && args.p_y !== null && args.p_x !== undefined;
    const c = {
      id: `c${++this.seq}`, project_id: id, author_name: String(name).trim(), author_email: email, via_link: viaLink, body,
      x: pinned ? args.p_x : null, y: pinned ? args.p_y : null, variant_id: args.p_variant || null,
      created_at: new Date(Date.now() + this.seq).toISOString(), resolved_at: null, resolved_by_email: null,
    };
    this.comments.push(c);
    const { project_id: _p, ...rest } = c;
    return rest;
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
        if (
          Date.now() - Date.parse(p.updated_at) > SESSION_GAP_MS &&
          !(this.versions.get(p.id) ?? []).some((v) => v.source_version === p.version)
        ) {
          this.putVersion(p.id, {
            kind: 'auto', label: null, name: p.name, data: p.data,
            source_version: p.version, saved_at: p.updated_at, saved_by_email: p.updated_by_email,
          });
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
      case 'fp_list_versions': {
        this.require(email, args.p_id, ['owner', 'editor', 'viewer']);
        return this.listVersions(args.p_id);
      }
      case 'fp_get_version': {
        this.require(email, args.p_id, ['owner', 'editor', 'viewer']);
        const v = (this.versions.get(args.p_id) ?? []).find((x) => x.slot === args.p_slot);
        if (!v) throw new RpcError('That version is no longer there.', 'P0002');
        return v;
      }
      case 'fp_save_version': {
        this.require(email, args.p_id, ['owner', 'editor']);
        const p = this.projects.get(args.p_id)!;
        // Distinct, increasing timestamps keep "oldest" well defined in fast tests.
        const at = new Date(Math.max(Date.now(), ...(this.versions.get(p.id) ?? []).map((v) => Date.parse(v.saved_at) + 1)));
        this.putVersion(p.id, {
          kind: 'manual', label: args.p_label ?? null, name: p.name, data: p.data,
          source_version: p.version, saved_at: at.toISOString(), saved_by_email: email!,
        });
        return this.listVersions(p.id);
      }
      case 'fp_list_drawings': {
        if (!email) throw new RpcError('Sign in with a confirmed @bestseller.com account.', '42501');
        return [...this.drawings]
          .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))
          .map((d) => ({ ...d, mine: d.uploaded_by_email === email }));
      }
      case 'fp_add_drawing': {
        if (!email) throw new RpcError('Sign in with a confirmed @bestseller.com account.', '42501');
        const f = this.files.get(args.p_path);
        if (!f || f.owner !== email) throw new RpcError('The upload did not arrive. Try again.', 'P0002');
        const d = {
          id: `00000000-0000-4000-9000-${String(++this.seq).padStart(12, '0')}`,
          path: args.p_path,
          file_name: String(args.p_file_name || args.p_path.split('/')[1]).slice(0, 200),
          shop: String(args.p_shop ?? '').trim().slice(0, 120) || null,
          size_bytes: f.bytes.length,
          uploaded_by_email: email,
          uploaded_at: new Date(Date.now() + this.seq).toISOString(),
        };
        this.drawings.push(d);
        return { ...d, mine: true };
      }
      case 'fp_delete_drawing': {
        if (!email) throw new RpcError('Sign in with a confirmed @bestseller.com account.', '42501');
        const d = this.drawings.find((x) => x.id === args.p_id);
        if (!d) throw new RpcError('That drawing is no longer on the drive.', 'P0002');
        if (d.uploaded_by_email !== email) throw new RpcError(`Only ${d.uploaded_by_email} can delete this drawing.`, '42501');
        this.drawings = this.drawings.filter((x) => x !== d);
        return null;
      }
      case 'fp_list_comments': {
        this.require(email, args.p_id, ['owner', 'editor', 'viewer']);
        return this.commentsOf(args.p_id);
      }
      case 'fp_add_comment': {
        this.require(email, args.p_id, ['owner', 'editor', 'viewer']);
        return this.putComment(args.p_id, email!, email, false, args);
      }
      case 'fp_list_shared_comments': {
        return this.commentsOf(this.linkProject(args.p_token));
      }
      case 'fp_add_shared_comment': {
        return this.putComment(this.linkProject(args.p_token), args.p_name, null, true, args);
      }
      case 'fp_set_comment_resolved': {
        const c = this.comments.find((x) => x.id === args.p_comment);
        if (!c) throw new RpcError('Comment not found.', 'P0002');
        this.require(email, c.project_id, ['owner', 'editor']);
        c.resolved_at = args.p_resolved ? new Date().toISOString() : null;
        c.resolved_by_email = args.p_resolved ? email : null;
        const { project_id: _p, ...rest } = c;
        return rest;
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
    // Storage, for the fp-drawings bucket only (same rules as its policies).
    await page.route('**/storage/v1/object/**', async (route) => {
      const req = route.request();
      const email = emailFromAuth(req.headers().authorization);
      const m = new URL(req.url()).pathname.match(/\/storage\/v1\/object\/([^/]+)(?:\/(.*))?$/);
      if (!m || m[1] !== 'fp-drawings') return json(route, 400, { statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' });
      if (!email) return json(route, 400, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
      const name = decodeURIComponent(m[2] ?? '');
      if (req.method() === 'POST') {
        if (!/^[0-9a-f-]{36}\/[^/]+\.(pdf|dwg|dxf|png|jpe?g|webp)$/.test(name.toLowerCase())) {
          return json(route, 400, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
        }
        this.files.set(name, { bytes: req.postDataBuffer() ?? Buffer.alloc(0), owner: email, contentType: req.headers()['content-type'] ?? 'application/octet-stream' });
        return json(route, 200, { Id: name, Key: `fp-drawings/${name}` });
      }
      if (req.method() === 'GET') {
        const f = this.files.get(name);
        if (!f) return json(route, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
        return route.fulfill({ status: 200, contentType: f.contentType, body: f.bytes });
      }
      if (req.method() === 'DELETE') {
        const { prefixes } = req.postDataJSON() as { prefixes: string[] };
        const removed = prefixes.filter((n) => this.files.get(n)?.owner === email);
        removed.forEach((n) => this.files.delete(n));
        return json(route, 200, removed.map((n) => ({ name: n, bucket_id: 'fp-drawings' })));
      }
      return route.fallback();
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
