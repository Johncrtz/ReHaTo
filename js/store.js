// ReHaTo data layer.
// ─────────────────────────────────────────────────────────────
// Every view talks ONLY to `store` (the async interface below).
// Phase 1: LocalAdapter  → localStorage in this browser.
// Phase 2: SupabaseAdapter → same method signatures, rows in
//          Postgres (see backend/schema.sql + backend/README.md).
// Swapping backends must never require touching the views.
//
// Interface:
//   getSettings() / patchSettings(patch)
//   listNotes() / getNote(dateKey) / saveNote(dateKey, {text, mood}) / deleteNote(dateKey)
//   listHabits() / addHabit({name, icon}) / deleteHabit(id)
//   getLogs() / toggleLog(habitId, dateKey)
//   listItems() / addItem({text, kind}) / toggleItem(id) / deleteItem(id) / clearDoneItems()

import { CONFIG } from './config.js';

const NS = 'rehato.v1.';

const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

/** Local date key, e.g. "2026-07-27" (local time, not UTC — avoids off-by-one). */
export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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

  // ── settings ──
  async getSettings() {
    return {
      theme: 'auto', lang: null,
      remindersEnabled: false, reminderTime: '20:00', lastReminderDate: null,
      ...this.read('settings', {}),
    };
  }
  async patchSettings(patch) {
    const s = { ...(await this.getSettings()), ...patch };
    this.write('settings', s);
    return s;
  }

  // ── reflections (calendar notes) ──
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

  // ── habits ──
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

  // ── habit check-ins: { habitId: { dateKey: true } } ──
  async getLogs() { return this.read('logs', {}); }
  async toggleLog(habitId, key) {
    const logs = await this.getLogs();
    const forHabit = logs[habitId] || (logs[habitId] = {});
    if (forHabit[key]) delete forHabit[key];
    else forHabit[key] = true;
    this.write('logs', logs);
    return !!forHabit[key];
  }

  // ── notes & to-dos (kind: 'todo' | 'thought') ──
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
}

// In-memory adapter for ?demo=1 — seeded sample data, nothing persisted.
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
  return { habits, logs, notes, items, settings: { theme: 'auto', lang: null, remindersEnabled: false, reminderTime: '20:00', lastReminderDate: null } };
}

export const isDemo = new URLSearchParams(location.search).has('demo');

function createStore() {
  if (isDemo) return new MemoryAdapter(makeDemoSeed());
  if (CONFIG.backend === 'supabase') {
    // Phase 2: return new SupabaseAdapter(CONFIG) — until then fall back gracefully.
    console.warn('[ReHaTo] Supabase adapter not implemented yet (phase 2) – using localStorage.');
  }
  return new LocalAdapter();
}

export const store = createStore();
