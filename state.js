const COMPLETE_MS = 8000;
const PRIORITY = { waiting: 60, error: 50, working: 40, complete: 30, idle: 10 };
const TASK_MAX = 40;

function sessionIdOf(session) {
  return String(session?.header?.id ?? session?.id ?? session?.sessionId ?? 'dsh');
}

function taskTitleFromTodo(todo) {
  const text = String(todo?.content ?? '').trim();
  return Array.from(text).slice(0, TASK_MAX).join('');
}

/**
 * DSH host-side pet state. It intentionally mirrors the small semantic model
 * used by the Qoder desktop pet instead of trying to render DSH internals.
 */
export class PetStateStore {
  constructor({ completeMs = COMPLETE_MS, now = () => Date.now() } = {}) {
    this.completeMs = completeMs;
    this.now = now;
    this.sessions = new Map();
    this.timers = new Map();
  }

  record(id) {
    let rec = this.sessions.get(id);
    if (!rec) {
      rec = { id, state: 'idle', task: null, seq: -1, updatedAt: 0 };
      this.sessions.set(id, rec);
    }
    return rec;
  }

  clearTimer(id) {
    const timer = this.timers.get(id);
    if (timer) clearTimeout(timer);
    this.timers.delete(id);
  }

  scheduleComplete(id) {
    this.clearTimer(id);
    const timer = setTimeout(() => {
      const rec = this.sessions.get(id);
      if (!rec || rec.state !== 'complete') return;
      rec.state = 'idle';
      rec.task = null;
      rec.updatedAt = this.now();
      this.timers.delete(id);
    }, this.completeMs);
    timer.unref?.();
    this.timers.set(id, timer);
  }

  set(id, patch, seq = 0) {
    const rec = this.record(id);
    rec.state = patch.state;
    if ('task' in patch) rec.task = patch.task;
    rec.updatedAt = this.now();
    rec.seq = Math.max(rec.seq, Number(seq) || 0);
    if (rec.state === 'complete') this.scheduleComplete(id);
    else this.clearTimer(id);
    return rec;
  }

  update(session, event) {
    if (!event?.type) return;
    const id = sessionIdOf(session);
    const seq = Number(event.seq ?? 0);
    const rec = this.record(id);
    const type = event.type;

    if (type === 'turn/start') {
      this.set(id, { state: 'working', task: null }, seq);
      return;
    }
    if (type === 'user/message') {
      if (rec.state === 'idle') this.set(id, { state: 'working' }, seq);
      return;
    }
    if (type === 'tool/call') {
      const name = String(event?.data?.name ?? '');
      this.set(id, { state: name === 'ask_user_question' ? 'waiting' : 'working' }, seq);
      return;
    }
    if (type === 'tool/result') {
      this.set(id, { state: 'working' }, seq);
      return;
    }
    if (type === 'approval/asked') {
      this.set(id, { state: 'waiting' }, seq);
      return;
    }
    if (type === 'todo/write') {
      const todos = Array.isArray(event?.data?.todos) ? event.data.todos : [];
      const completed = todos.filter(todo => todo?.status === 'completed').length;
      const total = todos.length;
      const selected = todos.filter(todo => todo?.status === 'in_progress').at(-1)
        ?? todos.find(todo => todo?.status === 'pending')
        ?? todos.filter(todo => todo?.status === 'completed').at(-1);
      const task = total > 0 ? {
        title: taskTitleFromTodo(selected),
        completed,
        total,
        progress: completed / total
      } : null;
      // A todo update can arrive before the first turn/start; treat it as work
      // rather than leaving the pet asleep.
      this.set(id, { state: rec.state === 'idle' ? 'working' : rec.state, task }, seq);
      return;
    }
    if (type === 'turn/end') {
      const kind = String(event?.data?.reason?.kind ?? '');
      if (kind === 'completed') {
        this.set(id, { state: 'complete', task: rec.task }, seq);
        return;
      }
      if (kind === 'blocked') {
        this.set(id, { state: 'waiting' }, seq);
        return;
      }
      if (kind === 'error' || kind === 'max-tokens' || kind === 'timeout') {
        this.set(id, { state: 'error' }, seq);
        return;
      }
      this.set(id, { state: 'idle', task: null }, seq);
      return;
    }
  }

  error(payload = {}) {
    const id = String(payload.sessionId ?? payload.session?.id ?? 'dsh');
    this.set(id, { state: 'error' }, 0);
  }

  /**
   * Recovery paths for a stuck alert. DSH may never send another event for a
   * session that was archived/closed after an error, so the host can either
   * drop the record outright (lifecycle event) or the user can acknowledge the
   * error from the bubble (ack). Both demote the session back to idle.
   */
  drop(id) {
    this.clearTimer(id);
    this.timers.delete(id);
    this.sessions.delete(id);
  }

  ack(id) {
    const rec = id ? this.sessions.get(id) : [...this.sessions.values()].find(r => r.state === 'error');
    if (!rec) return false;
    if (rec.state !== 'error') return false;
    this.set(rec.id, { state: 'idle', task: null }, rec.seq + 1);
    this.clearTimer(rec.id);
    return true;
  }

  snapshot() {
    let best = null;
    for (const rec of this.sessions.values()) {
      if (!best || PRIORITY[rec.state] > PRIORITY[best.state] || (PRIORITY[rec.state] === PRIORITY[best.state] && rec.updatedAt > best.updatedAt)) {
        best = rec;
      }
    }
    if (!best) return { state: 'idle', task: null, sessionId: null, updatedAt: this.now(), source: 'dsh' };
    return {
      state: best.state,
      task: best.task,
      sessionId: best.id,
      updatedAt: best.updatedAt,
      source: 'dsh'
    };
  }

  dispose() {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.sessions.clear();
  }
}

export { PRIORITY, sessionIdOf };
