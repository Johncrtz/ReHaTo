// ReHaTo data layer.
// ─────────────────────────────────────────────────────────────
// Every view talks ONLY to `store` (the facade at the bottom).
// Adapters behind it:
//   LocalAdapter    → localStorage (default, always available)
//   MemoryAdapter   → ?demo=1 sample data, nothing persisted
//   SupabaseAdapter → cloud rows via anonymous auth (opt-in,
//                     enabled with sync.enable(); see backend/)
// Settings ALWAYS stay local — they include the sync switch itself.
//
// Interface:
//   getSettings() / patchSettings(patch)
//   listNotes() / getNote(dateKey) / saveNote(dateKey, {text, mood}) / deleteNote(dateKey)
//   listHabits() / addHabit({name, icon}) / deleteHabit(id)
//   getLogs() / toggleLog(habitId, dateKey)
//   listItems() / addItem({text, kind}) / toggleItem(id) / deleteItem(id) / clearDoneItems()

import { CONFIG } from './config.js';
import { showToast } from './ui.js';
import { t } from './i18n.js';

const NS = 'rehato.v1.';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

/** Local date key, e.g. "2026-07-27" (local time, not UTC — avoids off-by-one). */
export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ── local storage ─────────────────────────────────────────── */

class LocalAdapter {
  read(key, fallback) {
    try {
      const raw = localStorage.getItem(NS + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  }
  write(key, value) {
    try { localStorage.setItem(NS + key, JSON.stringify(value)); } catch { /* storage full/blocked */ }
  }

  async getSettings() {
    return {
      theme: 'auto', lang: null,
      remindersEnabled: false, reminderTime: '20:00', lastReminderDate: null,
      syncEnabled: false,
      ...this.read('settings', {}),
    };
  }
  async patchSettings(patch) {
    const s = { ...(await this.getSettings()), ...patch };
    this.write('settings', s);
    return s;
  }

  async listNotes() { return this.read('notes', {}); }
  async getNote(key) { return (await this.listNotes())[key] || null; }
  async saveNote(key, { text = '', mood = null }) {
    const notes = await this.listNotes();
    if (!text.trim() && mood == null) delete notes[key];
    else notes[key] = { text, mood, updatedAt: Date.now() };
    this.write('notes', notes);
    return notes[key] || null;
  }
  async deleteNote(key) {
    const notes = await this.listNotes();
    delete notes[key];
    this.write('notes', notes);
  }

  async listHabits() { return this.read('habits', []); }
  async addHabit({ name, icon }) {
    const habit = { id: uid(), name, icon, createdAt: Date.now() };
    const habits = await this.listHabits();
    habits.push(habit);
    this.write('habits', habits);
    return habit;
  }
  async deleteHabit(id) {
    this.write('habits', (await this.listHabits()).filter(h => h.id !== id));
    const logs = await this.getLogs();
    delete logs[id];
    this.write('logs', logs);
  }

  async getLogs() { return this.read('logs', {}); }
  async toggleLog(habitId, key) {
    const logs = await this.getLogs();
    const forHabit = logs[habitId] || (logs[habitId] = {});
    if (forHabit[key]) delete forHabit[key];
    else forHabit[key] = true;
    this.write('logs', logs);
    return !!forHabit[key];
  }

  async listItems() { return this.read('items', []); }
  async addItem({ text, kind }) {
    const item = { id: uid(), text, kind, done: false, createdAt: Date.now() };
    const items = await this.listItems();
    items.unshift(item);
    this.write('items', items);
    return item;
  }
  async toggleItem(id) {
    const items = await this.listItems();
    const it = items.find(i => i.id === id);
    if (it) it.done = !it.done;
    this.write('items', items);
  }
  async deleteItem(id) {
    this.write('items', (await this.listItems()).filter(i => i.id !== id));
  }
  async clearDoneItems() {
    this.write('items', (await this.listItems()).filter(i => !(i.kind === 'todo' && i.done)));
  }

  async listBooks() { return this.read('books', []); }
  async addBook({ title, author = '', totalPages = null }) {
    const book = { id: uid(), title, author, totalPages, currentPage: 0, createdAt: Date.now() };
    const books = await this.listBooks();
    books.push(book);
    this.write('books', books);
    return book;
  }
  async updateBook(id, patch) {
    const books = await this.listBooks();
    const book = books.find(b => b.id === id);
    if (book) Object.assign(book, patch);
    this.write('books', books);
    return book || null;
  }
  async deleteBook(id) {
    this.write('books', (await this.listBooks()).filter(b => b.id !== id));
    this.write('bookEntries', (await this.listBookEntries()).filter(e => e.bookId !== id));
  }

  async listBookEntries() { return this.read('bookEntries', []); }
  async addBookEntry({ bookId, kind, text, page = null }) {
    const entry = { id: uid(), bookId, kind, text, page, createdAt: Date.now() };
    const entries = await this.listBookEntries();
    entries.unshift(entry);
    this.write('bookEntries', entries);
    return entry;
  }
  async deleteBookEntry(id) {
    this.write('bookEntries', (await this.listBookEntries()).filter(e => e.id !== id));
  }
}

/* ── demo mode ─────────────────────────────────────────────── */

class MemoryAdapter extends LocalAdapter {
  constructor(seed = {}) { super(); this.mem = { ...seed }; }
  read(key, fallback) { return key in this.mem ? this.mem[key] : fallback; }
  write(key, value) { this.mem[key] = value; }
}

function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return dateKey(d); }

function makeDemoSeed() {
  const habits = [
    { id: 'h1', name: 'Lesen', icon: '📖', createdAt: Date.now() },
    { id: 'h2', name: 'Wasser trinken', icon: '💧', createdAt: Date.now() },
    { id: 'h3', name: 'Meditation', icon: '🧘', createdAt: Date.now() },
  ];
  const logs = {
    h1: Object.fromEntries([0, 1, 2, 3, 4, 6, 7, 8].map(n => [daysAgo(n), true])),
    h2: Object.fromEntries([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(n => [daysAgo(n), true])),
    h3: Object.fromEntries([1, 2, 5].map(n => [daysAgo(n), true])),
  };
  const notes = {
    [daysAgo(0)]: { text: 'Heute den ersten Entwurf von ReHaTo gesehen – motiviert, dranzubleiben. Abends noch spazieren gewesen.', mood: 4, updatedAt: Date.now() },
    [daysAgo(2)]: { text: 'Stressiger Tag, aber die Meditation am Morgen hat geholfen, ruhig zu bleiben.', mood: 2, updatedAt: Date.now() },
    [daysAgo(5)]: { text: 'Gutes Gespräch mit Lena über das Studienprojekt. Dankbar für ehrliches Feedback.', mood: 3, updatedAt: Date.now() },
  };
  const items = [
    { id: 't1', text: 'Kapitel 5 lesen', kind: 'todo', done: false, createdAt: Date.now() },
    { id: 't2', text: 'Wocheneinkauf planen', kind: 'todo', done: false, createdAt: Date.now() },
    { id: 't3', text: 'Zahnarzttermin ausmachen', kind: 'todo', done: true, createdAt: Date.now() },
    { id: 't4', text: 'Idee: Abendspaziergang als festes Ritual etablieren', kind: 'thought', done: false, createdAt: Date.now() },
    { id: 't5', text: '„Wir sind, was wir wiederholt tun.“ – schönes Zitat für die Startseite?', kind: 'thought', done: false, createdAt: Date.now() },
  ];
  const books = [
    { id: 'b1', title: 'Der Alchimist', author: 'Paulo Coelho', totalPages: 208, currentPage: 132, createdAt: Date.now() },
    { id: 'b2', title: 'Atomic Habits', author: 'James Clear', totalPages: 320, currentPage: 320, createdAt: Date.now() },
  ];
  const bookEntries = [
    { id: 'q1', bookId: 'b1', kind: 'quote', text: 'Wenn du etwas ganz fest willst, dann wird das ganze Universum dazu beitragen, dass du es auch erreichst.', page: 40, createdAt: Date.now() - 86400000 },
    { id: 'q2', bookId: 'b2', kind: 'quote', text: 'You do not rise to the level of your goals. You fall to the level of your systems.', page: 27, createdAt: Date.now() - 172800000 },
    { id: 'q3', bookId: 'b2', kind: 'quote', text: 'Every action you take is a vote for the type of person you wish to become.', page: 38, createdAt: Date.now() - 259200000 },
    { id: 'n1', bookId: 'b2', kind: 'note', text: 'Habit Stacking direkt in ReHaTo ausprobieren: nach dem Kaffee → 10 Min. lesen.', page: null, createdAt: Date.now() - 90000000 },
  ];
  return { habits, logs, notes, items, books, bookEntries, settings: { theme: 'auto', lang: null, remindersEnabled: false, reminderTime: '20:00', lastReminderDate: null, syncEnabled: false } };
}

/* ── supabase (cloud) ──────────────────────────────────────── */
// Maps the store interface onto the tables in backend/schema.sql.
// Keeps an in-memory cache per collection, updated on each mutation,
// so views stay snappy and we avoid refetch storms.

class SupabaseAdapter {
  constructor(client, local) {
    this.sb = client;
    this.local = local; // settings stay local
    this.cache = {};
  }
  fail(e) {
    console.error('[ReHaTo] sync error', e);
    showToast(t('sync.error'));
  }
  // Write-through mirror: every confirmed cloud state is copied into
  // localStorage, so going offline (or disabling sync) never shows an
  // empty app — you always keep the last-known data.
  mirror(key, value) { this.local.write(key, value); }

  getSettings() { return this.local.getSettings(); }
  patchSettings(p) { return this.local.patchSettings(p); }

  async listNotes() {
    if (!this.cache.notes) {
      try {
        const { data, error } = await this.sb.from('reflections').select('date,text,mood,updated_at');
        if (error) throw error;
        this.cache.notes = Object.fromEntries(
          data.map(r => [r.date, { text: r.text, mood: r.mood, updatedAt: Date.parse(r.updated_at) }])
        );
        this.mirror('notes', this.cache.notes);
      } catch (e) { this.fail(e); return this.cache.notes || {}; }
    }
    return this.cache.notes;
  }
  async getNote(key) { return (await this.listNotes())[key] || null; }
  async saveNote(key, { text = '', mood = null }) {
    if (!text.trim() && mood == null) { await this.deleteNote(key); return null; }
    try {
      const { error } = await this.sb.from('reflections')
        .upsert({ date: key, text, mood, updated_at: new Date().toISOString() }, { onConflict: 'user_id,date' });
      if (error) throw error;
      (await this.listNotes())[key] = { text, mood, updatedAt: Date.now() };
      this.mirror('notes', this.cache.notes);
      return this.cache.notes[key];
    } catch (e) { this.fail(e); return null; }
  }
  async deleteNote(key) {
    try {
      const { error } = await this.sb.from('reflections').delete().eq('date', key);
      if (error) throw error;
      if (this.cache.notes) { delete this.cache.notes[key]; this.mirror('notes', this.cache.notes); }
    } catch (e) { this.fail(e); }
  }

  async listHabits() {
    if (!this.cache.habits) {
      try {
        const { data, error } = await this.sb.from('habits')
          .select('id,name,icon,created_at').eq('archived', false).order('created_at');
        if (error) throw error;
        this.cache.habits = data.map(r => ({ id: r.id, name: r.name, icon: r.icon, createdAt: Date.parse(r.created_at) }));
        this.mirror('habits', this.cache.habits);
      } catch (e) { this.fail(e); return this.cache.habits || []; }
    }
    return this.cache.habits;
  }
  async addHabit({ name, icon }) {
    try {
      const { data, error } = await this.sb.from('habits').insert({ name, icon }).select().single();
      if (error) throw error;
      const habit = { id: data.id, name: data.name, icon: data.icon, createdAt: Date.parse(data.created_at) };
      (await this.listHabits()).push(habit);
      this.mirror('habits', this.cache.habits);
      return habit;
    } catch (e) { this.fail(e); return null; }
  }
  async deleteHabit(id) {
    try {
      const { error } = await this.sb.from('habits').delete().eq('id', id);
      if (error) throw error;
      if (this.cache.habits) { this.cache.habits = this.cache.habits.filter(h => h.id !== id); this.mirror('habits', this.cache.habits); }
      if (this.cache.logs) { delete this.cache.logs[id]; this.mirror('logs', this.cache.logs); }
    } catch (e) { this.fail(e); }
  }

  async getLogs() {
    if (!this.cache.logs) {
      try {
        const { data, error } = await this.sb.from('habit_logs').select('habit_id,date');
        if (error) throw error;
        const logs = {};
        for (const r of data) (logs[r.habit_id] || (logs[r.habit_id] = {}))[r.date] = true;
        this.cache.logs = logs;
        this.mirror('logs', logs);
      } catch (e) { this.fail(e); return this.cache.logs || {}; }
    }
    return this.cache.logs;
  }
  async toggleLog(habitId, key) {
    const logs = await this.getLogs();
    const has = !!logs[habitId]?.[key];
    try {
      if (has) {
        const { error } = await this.sb.from('habit_logs').delete().eq('habit_id', habitId).eq('date', key);
        if (error) throw error;
        delete logs[habitId][key];
      } else {
        const { error } = await this.sb.from('habit_logs').insert({ habit_id: habitId, date: key });
        if (error) throw error;
        (logs[habitId] || (logs[habitId] = {}))[key] = true;
      }
      this.mirror('logs', logs);
      return !has;
    } catch (e) { this.fail(e); return has; }
  }

  async listItems() {
    if (!this.cache.items) {
      try {
        const { data, error } = await this.sb.from('items')
          .select('id,kind,text,done,created_at').order('created_at', { ascending: false });
        if (error) throw error;
        this.cache.items = data.map(r => ({ id: r.id, kind: r.kind, text: r.text, done: r.done, createdAt: Date.parse(r.created_at) }));
        this.mirror('items', this.cache.items);
      } catch (e) { this.fail(e); return this.cache.items || []; }
    }
    return this.cache.items;
  }
  async addItem({ text, kind }) {
    try {
      const { data, error } = await this.sb.from('items').insert({ text, kind }).select().single();
      if (error) throw error;
      const item = { id: data.id, kind: data.kind, text: data.text, done: data.done, createdAt: Date.parse(data.created_at) };
      (await this.listItems()).unshift(item);
      this.mirror('items', this.cache.items);
      return item;
    } catch (e) { this.fail(e); return null; }
  }
  async toggleItem(id) {
    const items = await this.listItems();
    const it = items.find(i => i.id === id);
    if (!it) return;
    try {
      const { error } = await this.sb.from('items').update({ done: !it.done }).eq('id', id);
      if (error) throw error;
      it.done = !it.done;
      this.mirror('items', items);
    } catch (e) { this.fail(e); }
  }
  async deleteItem(id) {
    try {
      const { error } = await this.sb.from('items').delete().eq('id', id);
      if (error) throw error;
      if (this.cache.items) { this.cache.items = this.cache.items.filter(i => i.id !== id); this.mirror('items', this.cache.items); }
    } catch (e) { this.fail(e); }
  }
  async clearDoneItems() {
    try {
      const { error } = await this.sb.from('items').delete().eq('kind', 'todo').eq('done', true);
      if (error) throw error;
      if (this.cache.items) { this.cache.items = this.cache.items.filter(i => !(i.kind === 'todo' && i.done)); this.mirror('items', this.cache.items); }
    } catch (e) { this.fail(e); }
  }


  async listBooks() {
    if (!this.cache.books) {
      try {
        const { data, error } = await this.sb.from('books')
          .select('id,title,author,total_pages,current_page,created_at').order('created_at');
        if (error) throw error;
        this.cache.books = data.map(r => ({
          id: r.id, title: r.title, author: r.author || '',
          totalPages: r.total_pages, currentPage: r.current_page,
          createdAt: Date.parse(r.created_at),
        }));
        this.mirror('books', this.cache.books);
      } catch (e) { this.fail(e); return this.cache.books || []; }
    }
    return this.cache.books;
  }
  async addBook({ title, author = '', totalPages = null }) {
    try {
      const { data, error } = await this.sb.from('books')
        .insert({ title, author, total_pages: totalPages }).select().single();
      if (error) throw error;
      const book = {
        id: data.id, title: data.title, author: data.author || '',
        totalPages: data.total_pages, currentPage: data.current_page,
        createdAt: Date.parse(data.created_at),
      };
      (await this.listBooks()).push(book);
      this.mirror('books', this.cache.books);
      return book;
    } catch (e) { this.fail(e); return null; }
  }
  async updateBook(id, patch) {
    const row = {};
    if ('title' in patch) row.title = patch.title;
    if ('author' in patch) row.author = patch.author;
    if ('totalPages' in patch) row.total_pages = patch.totalPages;
    if ('currentPage' in patch) row.current_page = patch.currentPage;
    try {
      const { error } = await this.sb.from('books').update(row).eq('id', id);
      if (error) throw error;
      const book = (await this.listBooks()).find(b => b.id === id);
      if (book) Object.assign(book, patch);
      this.mirror('books', this.cache.books);
      return book || null;
    } catch (e) { this.fail(e); return null; }
  }
  async deleteBook(id) {
    try {
      const { error } = await this.sb.from('books').delete().eq('id', id);
      if (error) throw error;
      if (this.cache.books) { this.cache.books = this.cache.books.filter(b => b.id !== id); this.mirror('books', this.cache.books); }
      if (this.cache.bookEntries) { this.cache.bookEntries = this.cache.bookEntries.filter(e => e.bookId !== id); this.mirror('bookEntries', this.cache.bookEntries); }
    } catch (e) { this.fail(e); }
  }

  async listBookEntries() {
    if (!this.cache.bookEntries) {
      try {
        const { data, error } = await this.sb.from('book_entries')
          .select('id,book_id,kind,text,page,created_at').order('created_at', { ascending: false });
        if (error) throw error;
        this.cache.bookEntries = data.map(r => ({
          id: r.id, bookId: r.book_id, kind: r.kind, text: r.text, page: r.page,
          createdAt: Date.parse(r.created_at),
        }));
        this.mirror('bookEntries', this.cache.bookEntries);
      } catch (e) { this.fail(e); return this.cache.bookEntries || []; }
    }
    return this.cache.bookEntries;
  }
  async addBookEntry({ bookId, kind, text, page = null }) {
    try {
      const { data, error } = await this.sb.from('book_entries')
        .insert({ book_id: bookId, kind, text, page }).select().single();
      if (error) throw error;
      const entry = { id: data.id, bookId: data.book_id, kind: data.kind, text: data.text, page: data.page, createdAt: Date.parse(data.created_at) };
      (await this.listBookEntries()).unshift(entry);
      this.mirror('bookEntries', this.cache.bookEntries);
      return entry;
    } catch (e) { this.fail(e); return null; }
  }
  async deleteBookEntry(id) {
    try {
      const { error } = await this.sb.from('book_entries').delete().eq('id', id);
      if (error) throw error;
      if (this.cache.bookEntries) { this.cache.bookEntries = this.cache.bookEntries.filter(e => e.id !== id); this.mirror('bookEntries', this.cache.bookEntries); }
    } catch (e) { this.fail(e); }
  }

  // ── helpers used by the one-time migration ──
  async isEmpty() {
    for (const table of ['habits', 'reflections', 'items', 'books', 'book_entries']) {
      const { data, error } = await this.sb.from(table).select('id').limit(1);
      if (error) throw error;
      if (data.length) return false;
    }
    return true;
  }
  async bulkInsert(table, rows) {
    if (!rows.length) return;
    const { error } = await this.sb.from(table).insert(rows);
    if (error) throw error;
  }
}

/* ── sync manager (opt-in) ─────────────────────────────────── */

export const isDemo = new URLSearchParams(location.search).has('demo');

const localAdapter = new LocalAdapter();
let adapter = isDemo ? new MemoryAdapter(makeDemoSeed()) : localAdapter;
let client = null;

async function getClient() {
  if (client) return client;
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  client = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);
  return client;
}

async function signIn(sb) {
  const { data: { session } } = await sb.auth.getSession();
  if (session) return session;
  const { data, error } = await sb.auth.signInAnonymously();
  if (error) throw error;
  return data.session;
}

// Upload local data the first time sync turns on — only into an empty cloud,
// so re-enabling later never duplicates rows.
async function migrate(remote) {
  if (!(await remote.isEmpty())) return;
  const [habits, logs, notes, items] = await Promise.all([
    localAdapter.listHabits(), localAdapter.getLogs(), localAdapter.listNotes(), localAdapter.listItems(),
  ]);
  const idMap = {};
  for (const h of habits) {
    const row = { name: h.name, icon: h.icon };
    if (UUID_RE.test(h.id)) row.id = h.id;
    const { data, error } = await remote.sb.from('habits').insert(row).select().single();
    if (error) throw error;
    idMap[h.id] = data.id;
  }
  const logRows = [];
  for (const [hid, days] of Object.entries(logs)) {
    if (!idMap[hid]) continue;
    for (const day of Object.keys(days)) logRows.push({ habit_id: idMap[hid], date: day });
  }
  await remote.bulkInsert('habit_logs', logRows);
  await remote.bulkInsert('reflections',
    Object.entries(notes).map(([date, n]) => ({ date, text: n.text || '', mood: n.mood })));
  await remote.bulkInsert('items',
    items.map(it => ({
      ...(UUID_RE.test(it.id) ? { id: it.id } : {}),
      kind: it.kind, text: it.text, done: it.done,
      created_at: new Date(it.createdAt || Date.now()).toISOString(),
    })));
  const [books, bookEntries] = await Promise.all([
    localAdapter.listBooks(), localAdapter.listBookEntries(),
  ]);
  const bookIdMap = {};
  for (const b of books) {
    const row = { title: b.title, author: b.author || '', total_pages: b.totalPages, current_page: b.currentPage || 0 };
    if (UUID_RE.test(b.id)) row.id = b.id;
    const { data, error } = await remote.sb.from('books').insert(row).select().single();
    if (error) throw error;
    bookIdMap[b.id] = data.id;
  }
  await remote.bulkInsert('book_entries',
    bookEntries.filter(e => bookIdMap[e.bookId]).map(e => ({
      ...(UUID_RE.test(e.id) ? { id: e.id } : {}),
      book_id: bookIdMap[e.bookId], kind: e.kind, text: e.text, page: e.page,
      created_at: new Date(e.createdAt || Date.now()).toISOString(),
    })));
  remote.cache = {}; // refetch fresh state after upload
}

export const sync = {
  available: !isDemo && !!(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey),
  status: 'off', // 'off' | 'connecting' | 'on' | 'error'

  // Reconnect on boot if the user had sync enabled.
  async init() {
    if (!this.available) return;
    const s = await localAdapter.getSettings();
    if (!s.syncEnabled) return;
    try {
      this.status = 'connecting';
      const sb = await getClient();
      await signIn(sb);
      adapter = new SupabaseAdapter(sb, localAdapter);
      this.status = 'on';
    } catch (e) {
      console.error('[ReHaTo] sync init failed — staying local', e);
      this.status = 'error';
      adapter = localAdapter;
    }
  },

  async enable() {
    this.status = 'connecting';
    try {
      const sb = await getClient();
      await signIn(sb);
      const remote = new SupabaseAdapter(sb, localAdapter);
      await migrate(remote);
      adapter = remote;
      this.status = 'on';
      await localAdapter.patchSettings({ syncEnabled: true });
      return true;
    } catch (e) {
      console.error('[ReHaTo] sync enable failed', e);
      this.status = 'error';
      adapter = localAdapter;
      return false;
    }
  },

  // Turn sync off: snapshot cloud state into localStorage so nothing
  // "disappears", then go back to local. The anonymous session is kept
  // (never signed out) so re-enabling finds the same account and data.
  async disable() {
    if (adapter instanceof SupabaseAdapter) {
      try {
        const [habits, logs, notes, items] = await Promise.all([
          adapter.listHabits(), adapter.getLogs(), adapter.listNotes(), adapter.listItems(),
        ]);
        localAdapter.write('habits', habits);
        localAdapter.write('logs', logs);
        localAdapter.write('notes', notes);
        localAdapter.write('items', items);
      } catch (e) { console.error('[ReHaTo] snapshot on disable failed', e); }
    }
    adapter = localAdapter;
    this.status = 'off';
    await localAdapter.patchSettings({ syncEnabled: false });
  },
};

/* ── facade: views import this and never see adapters ──────── */

export const store = {
  getSettings: (...a) => adapter.getSettings(...a),
  patchSettings: (...a) => adapter.patchSettings(...a),
  listNotes: (...a) => adapter.listNotes(...a),
  getNote: (...a) => adapter.getNote(...a),
  saveNote: (...a) => adapter.saveNote(...a),
  deleteNote: (...a) => adapter.deleteNote(...a),
  listHabits: (...a) => adapter.listHabits(...a),
  addHabit: (...a) => adapter.addHabit(...a),
  deleteHabit: (...a) => adapter.deleteHabit(...a),
  getLogs: (...a) => adapter.getLogs(...a),
  toggleLog: (...a) => adapter.toggleLog(...a),
  listItems: (...a) => adapter.listItems(...a),
  addItem: (...a) => adapter.addItem(...a),
  toggleItem: (...a) => adapter.toggleItem(...a),
  deleteItem: (...a) => adapter.deleteItem(...a),
  clearDoneItems: (...a) => adapter.clearDoneItems(...a),
  listBooks: (...a) => adapter.listBooks(...a),
  addBook: (...a) => adapter.addBook(...a),
  updateBook: (...a) => adapter.updateBook(...a),
  deleteBook: (...a) => adapter.deleteBook(...a),
  listBookEntries: (...a) => adapter.listBookEntries(...a),
  addBookEntry: (...a) => adapter.addBookEntry(...a),
  deleteBookEntry: (...a) => adapter.deleteBookEntry(...a),
};
