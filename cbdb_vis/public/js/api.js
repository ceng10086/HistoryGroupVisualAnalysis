/* Thin wrapper around the CBDB-VIS API. Each call returns a Promise. */
window.api = (() => {
  const base = "";
  const cache = new Map();
  function memoFetch(url, ttl = 60_000) {
    const e = cache.get(url);
    const now = Date.now();
    if (e && now - e.t < ttl) return Promise.resolve(e.v);
    return fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} on ${url}`);
        return r.json();
      })
      .then((v) => {
        cache.set(url, { v, t: now });
        return v;
      });
  }
  return {
    search: (q) => fetch(`/api/search?q=${encodeURIComponent(q)}`).then((r) => r.json()),
    person: (id) => memoFetch(`/api/person/${id}`),
    llmSupplement: (id) => fetch(`/api/person/${id}/llm-supplement`).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status} on /api/person/${id}/llm-supplement`);
      return r.json();
    }),
    llmPerson: (q) => fetch(`/api/llm/person?q=${encodeURIComponent(q)}`).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status} on /api/llm/person`);
      return r.json();
    }),
    network: (seeds, depth = 1, maxNodes = 120) =>
      fetch(`/api/network?seeds=${seeds.join(",")}&depth=${depth}&maxNodes=${maxNodes}`).then((r) => r.json()),
    identity: (ids) =>
      fetch(`/api/identity-distribution?ids=${ids.join(",")}`).then((r) => r.json()),
    geo: (ids) => fetch(`/api/geo?ids=${ids.join(",")}`).then((r) => r.json()),
    timeline: (id) => memoFetch(`/api/timeline/${id}`),
    presets: () => memoFetch(`/api/presets`),
  };
})();
