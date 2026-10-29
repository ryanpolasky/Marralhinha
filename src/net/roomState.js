export function mergeRoomState(prev, next) {
  if (next?.game && !('log' in next.game)) {
    return { ...next, game: { ...next.game, log: prev?.game?.log || [] } };
  }
  return next;
}
