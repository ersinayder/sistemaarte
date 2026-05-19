function criarSseConnectionTracker({ maxGlobal, maxPerUser }) {
  let activeGlobal = 0;
  const activeByUser = new Map();

  function release(userKey) {
    if (activeGlobal > 0) activeGlobal--;

    const nextForUser = (activeByUser.get(userKey) || 1) - 1;
    if (nextForUser <= 0) activeByUser.delete(userKey);
    else activeByUser.set(userKey, nextForUser);
  }

  function tryAcquire(userId) {
    if (activeGlobal >= maxGlobal) {
      return {
        ok: false,
        reason: "global",
        message: `Limite de streams atingido (max ${maxGlobal})`,
      };
    }

    const userKey = String(userId ?? "anon");
    const activeForUser = activeByUser.get(userKey) || 0;
    if (activeForUser >= maxPerUser) {
      return {
        ok: false,
        reason: "user",
        message: `Limite de streams por usuario atingido (max ${maxPerUser})`,
      };
    }

    activeGlobal++;
    activeByUser.set(userKey, activeForUser + 1);

    let released = false;
    return {
      ok: true,
      release: () => {
        if (released) return;
        released = true;
        release(userKey);
      },
    };
  }

  return { tryAcquire };
}

module.exports = {
  criarSseConnectionTracker,
};
