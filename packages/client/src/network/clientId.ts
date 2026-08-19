// A persistent per-browser identity — not a user account, just enough to recognize "this is
// the same browser that claimed seat 1 earlier" across a refresh/reconnect. Generated once,
// stored locally, never sent anywhere except as a plain field on the room document we already
// own writing to.
const KEY = 'spadesClientId';

export function getClientId(): string {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(KEY, id);
  }
  return id;
}
