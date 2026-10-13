const durationUnits = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
};

export const durationToMilliseconds = (duration) => {
  const match = String(duration)
    .trim()
    .match(/^(\d+)\s*(ms|s|m|h|d|w)$/i);
  if (!match || Number(match[1]) < 1)
    throw new Error("Token expiry must be a positive duration such as 7d");
  return Number(match[1]) * durationUnits[match[2].toLowerCase()];
};

export const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const clampLimit = (value, fallback = 30, maximum = 100) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(1, Math.trunc(parsed)));
};
