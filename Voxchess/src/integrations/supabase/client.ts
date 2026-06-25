import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

class MockQueryBuilder {
  table: string;
  filters: Array<{ field: string; value: any }> = [];
  isSingle = false;
  isDelete = false;
  upsertData: any = null;
  updateData: any = null;

  constructor(table: string) {
    this.table = table;
  }

  select() { return this; }
  insert(data: any) { this.upsertData = data; return this; }
  upsert(data: any) { this.upsertData = data; return this; }
  update(data: any) { this.updateData = data; return this; }
  delete() { this.isDelete = true; return this; }
  eq(field: string, value: any) { this.filters.push({ field, value }); return this; }
  single() { this.isSingle = true; return this; }
  order() { return this; }

  private execute() {
    if (typeof window === "undefined") return { data: null, error: null };
    const key = `voxchess_db_${this.table}`;
    let items = JSON.parse(localStorage.getItem(key) || "[]");

    if (this.upsertData) {
      const dataArray = Array.isArray(this.upsertData) ? this.upsertData : [this.upsertData];
      for (const item of dataArray) {
        const idx = items.findIndex((x: any) => x.id && x.id === item.id);
        if (idx >= 0) {
          items[idx] = { ...items[idx], ...item };
        } else {
          if (!item.id) item.id = Math.random().toString(36).substring(2, 9);
          items.push(item);
        }
      }
      localStorage.setItem(key, JSON.stringify(items));
      return { data: this.upsertData, error: null };
    }

    if (this.updateData) {
      items = items.map((x: any) => {
        const matches = this.filters.every(f => x[f.field] === f.value);
        return matches ? { ...x, ...this.updateData } : x;
      });
      localStorage.setItem(key, JSON.stringify(items));
      return { data: this.updateData, error: null };
    }

    if (this.isDelete) {
      items = items.filter((x: any) => {
        return !this.filters.every(f => x[f.field] === f.value);
      });
      localStorage.setItem(key, JSON.stringify(items));
      return { data: null, error: null };
    }

    let filtered = items.filter((x: any) => {
      return this.filters.every(f => x[f.field] === f.value);
    });

    if (this.isSingle) {
      if (this.table === "users" && filtered.length === 0) {
        return { data: { preferences: { boardThemeIndex: 1, boardSize: 600 } }, error: null };
      }
      return { data: filtered[0] || null, error: null };
    }

    return { data: filtered, error: null };
  }

  then(onfulfilled: any) {
    return Promise.resolve(this.execute()).then(onfulfilled);
  }
}

class MockSupabaseAuth {
  listeners: Array<any> = [];

  trigger(event: string, session: any) {
    this.listeners.forEach(cb => cb(event, session));
  }

  getUser() {
    if (typeof window === "undefined") return Promise.resolve({ data: { user: null }, error: null });
    const session = JSON.parse(localStorage.getItem('voxchess_session') || 'null');
    return Promise.resolve({ data: { user: session?.user || null }, error: null });
  }

  getSession() {
    if (typeof window === "undefined") return Promise.resolve({ data: { session: null }, error: null });
    const session = JSON.parse(localStorage.getItem('voxchess_session') || 'null');
    return Promise.resolve({ data: { session }, error: null });
  }

  signUp({ email, password, options }: any) {
    if (typeof window === "undefined") return Promise.resolve({ data: { user: null, session: null }, error: null });
    const user = { id: 'mock-user-id', email, user_metadata: options?.data || {} };
    const session = { user, access_token: 'mock-token', expires_at: Date.now() + 3600000 };
    localStorage.setItem('voxchess_session', JSON.stringify(session));

    const users = JSON.parse(localStorage.getItem('voxchess_db_users') || '[]');
    users.push({ id: user.id, email, display_name: options?.data?.display_name || email, preferences: {} });
    localStorage.setItem('voxchess_db_users', JSON.stringify(users));

    this.trigger('SIGNED_IN', session);
    return Promise.resolve({ data: { user, session }, error: null });
  }

  signInWithPassword({ email, password }: any) {
    if (typeof window === "undefined") return Promise.resolve({ data: { user: null, session: null }, error: null });
    const user = { id: 'mock-user-id', email };
    const session = { user, access_token: 'mock-token', expires_at: Date.now() + 3600000 };
    localStorage.setItem('voxchess_session', JSON.stringify(session));
    this.trigger('SIGNED_IN', session);
    return Promise.resolve({ data: { user, session }, error: null });
  }

  signOut() {
    if (typeof window === "undefined") return Promise.resolve({ error: null });
    localStorage.removeItem('voxchess_session');
    this.trigger('SIGNED_OUT', null);
    return Promise.resolve({ error: null });
  }

  onAuthStateChange(callback: any) {
    this.listeners.push(callback);
    if (typeof window !== "undefined") {
      const session = JSON.parse(localStorage.getItem('voxchess_session') || 'null');
      callback(session ? 'SIGNED_IN' : 'SIGNED_OUT', session);
    }
    return {
      data: {
        subscription: {
          unsubscribe: () => {
            this.listeners = this.listeners.filter(x => x !== callback);
          }
        }
      }
    };
  }
}

class MockSupabaseClient {
  auth = new MockSupabaseAuth();

  from(table: string) {
    return new MockQueryBuilder(table);
  }
}

function createSupabaseClient() {
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    console.warn("[Supabase] Missing environment variables. Falling back to local mock client.");
    return new MockSupabaseClient() as any;
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: typeof window !== "undefined" ? localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

let _supabase: ReturnType<typeof createSupabaseClient> | undefined;

export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});
