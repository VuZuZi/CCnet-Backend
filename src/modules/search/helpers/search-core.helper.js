import mongoose from "mongoose";

export function normalizeText(input) {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function fuzzyScore(query, target) {
  const q = normalizeText(query);
  const t = normalizeText(target);

  if (!q || !t) return 0;
  if (t.startsWith(q)) return 1000 + q.length;
  if (t.includes(q)) return 700 + q.length;

  let qi = 0;
  let score = 0;
  let streak = 0;

  for (let i = 0; i < t.length && qi < q.length; i += 1) {
    if (t[i] === q[qi]) {
      qi += 1;
      streak += 1;
      score += 10 + streak * 2;
    } else {
      streak = 0;
      score -= 1;
    }
  }

  if (qi !== q.length) return 0;
  return 300 + score;
}

export function pickModel(names = []) {
  for (const name of names) {
    if (mongoose.models[name]) {
      return mongoose.models[name];
    }
  }

  for (const name of names) {
    try {
      return mongoose.model(name);
    } catch {
      // ignore
    }
  }

  return null;
}