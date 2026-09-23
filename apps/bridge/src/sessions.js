'use strict';

const { randomUUID } = require('crypto');

const sessions = new Map();
const TTL_AFTER_END_MS = 5 * 60 * 1000;

function createSession(meta = {}) {
  const id = randomUUID();
  const session = {
    id,
    meta,
    createdAt: Date.now(),
    endedAt: null,
    ended: false,
    error: null,
    buffer: [],
    subscribers: new Set(),
    _gcTimer: null,
  };

  session.push = (event, data) => {
    const msg = { event, data, at: Date.now() };
    session.buffer.push(msg);
    for (const fn of session.subscribers) {
      try { fn(msg); } catch (_) {}
    }
  };

  session.subscribe = (fn) => {
    for (const msg of session.buffer) fn(msg);
    session.subscribers.add(fn);
    return () => session.subscribers.delete(fn);
  };

  session.end = (err = null) => {
    if (session.ended) return;
    session.ended = true;
    session.endedAt = Date.now();
    session.error = err ? err.message : null;
    const finalEvent = err ? 'error' : 'done';
    const finalData = err ? { message: err.message } : { at: session.endedAt };
    session.push(finalEvent, finalData);
    for (const fn of session.subscribers) {
      try { fn({ event: '_close', data: {}, at: Date.now() }); } catch (_) {}
    }
    session._gcTimer = setTimeout(() => { sessions.delete(session.id); }, TTL_AFTER_END_MS);
    if (session._gcTimer.unref) session._gcTimer.unref();
  };

  sessions.set(id, session);
  return session;
}

function getSession(id) { return sessions.get(id) || null; }

function listSessions() {
  return [...sessions.values()].map((s) => ({
    id: s.id,
    createdAt: s.createdAt,
    ended: s.ended,
    error: s.error,
    bufferSize: s.buffer.length,
    subscribers: s.subscribers.size,
  }));
}

module.exports = { createSession, getSession, listSessions };
