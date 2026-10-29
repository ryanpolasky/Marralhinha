export function mergeRoomState(prev, next) {
  if (next?.game?.logPatch) {
    const { logPatch, ...game } = next.game;
    return {
      ...next,
      game: {
        ...game,
        log: (prev?.game?.log || []).slice(logPatch.drop).concat(logPatch.add),
      },
    };
  }
  if (next?.game && !('log' in next.game)) {
    return { ...next, game: { ...next.game, log: prev?.game?.log || [] } };
  }
  return next;
}
