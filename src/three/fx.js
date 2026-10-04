export const makeFxBus = () => {
  const listeners = new Set();
  return {
    emit: (type, data = {}) => listeners.forEach((fn) => fn(type, data)),
    on: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
};

export const fx = makeFxBus();
