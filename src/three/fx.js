export const makeFxBus = () => {
  const listeners = new Set();
  let now = 0;
  let timers = [];
  return {
    emit: (type, data = {}) => listeners.forEach((fn) => fn(type, data)),
    on: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    later: (seconds, fn) => timers.push({ at: now + seconds, fn }),
    tick: (dt) => {
      now += dt;
      if (!timers.length || !timers.some((t) => t.at <= now)) return;
      const due = timers.filter((t) => t.at <= now).sort((a, b) => a.at - b.at);
      timers = timers.filter((t) => t.at > now);
      due.forEach((t) => t.fn());
    },
  };
};

export const fx = makeFxBus();
