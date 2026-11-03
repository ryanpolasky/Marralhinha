// Year-agnostic UTC windows like { from: '10-01', to: '10-31' }, inclusive; from > to wraps past New Year
const monthDay = (now) => {
  const d = new Date(now);
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};

const inSeason = (season, now = Date.now()) => {
  if (!season) return true;
  const today = monthDay(now);
  return season.from <= season.to ? today >= season.from && today <= season.to : today >= season.from || today <= season.to;
};

module.exports = { inSeason };
