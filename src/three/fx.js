const listeners = new Set();

export const fx = {
  emit: (type, data = {}) => listeners.forEach((fn) => fn(type, data)),
  on: (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
