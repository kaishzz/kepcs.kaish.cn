function parseProviderTimestamp(input) {
  if (!input) {
    return null;
  }

  const raw = String(input).trim();

  if (/^\d{13}$/.test(raw)) {
    return new Date(Number(raw));
  }

  if (/^\d{10}$/.test(raw)) {
    return new Date(Number(raw) * 1000);
  }

  const parsed = new Date(raw);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function isWithinTolerance(date, toleranceSeconds) {
  if (!date) {
    return false;
  }

  const deltaMs = Math.abs(Date.now() - date.getTime());
  return deltaMs <= toleranceSeconds * 1000;
}

module.exports = {
  isWithinTolerance,
  parseProviderTimestamp,
};
