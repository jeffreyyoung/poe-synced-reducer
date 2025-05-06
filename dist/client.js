// client.ts
import Ably from "https://esm.sh/ably@2.7.0";

// simpleHash.ts
function simpleHash(str) {
  let hash = 0;
  if (str.length === 0) return hash;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

// client.ts
var ably = new Ably.Realtime(
  "Lz62RQ.sXcOOA:VbdVa18igh7V4fUJkwIixabQeF-I7hJAmEIrFJk7akY"
);
function setup(options) {
  const { reducer, initialState } = options;
  const channel = ably.channels.get("setup");
  let state = initialState;
  const confirmedActions = [];
  const unconfirmedActions = [];
  const spaceId = `reducer` + simpleHash(reducer.toString());
  const listeners = /* @__PURE__ */ new Set();
  function notifyListeners() {
    let newState = state;
    for (const action of unconfirmedActions) {
      newState = reducer(newState, action.action);
    }
    listeners.forEach((listener) => listener(newState));
  }
  channel.subscribe(spaceId, (message) => {
    const data = message.data;
    if ("type" in data && data.type === "requestState") {
      channel.publish(spaceId, { type: "stateResponse", state });
    }
    if ("type" in data && data.type === "stateResponse") {
      state = data.state;
      notifyListeners();
    }
    if ("type" in data && data.type === "actionBatch") {
      for (const action of data.actions) {
        const index = unconfirmedActions.findIndex((unconfirmedAction) => action.clientActionId === unconfirmedAction?.clientActionId);
        if (index !== -1) {
          unconfirmedActions.splice(index, 1);
        }
        confirmedActions.push(action);
        state = reducer(state, action);
      }
      notifyListeners();
    }
  });
  channel.publish(spaceId, { type: "requestState" });
  const flushActions = throttle(() => {
    const actionsToFlush = unconfirmedActions.filter((action) => action.status === "waiting");
    actionsToFlush.forEach((action) => {
      action.status = "pending";
    });
    channel.publish(spaceId, { type: "actionBatch", actions: actionsToFlush });
  }, 100);
  return {
    subscribe: (listener) => {
      listeners.add(listener);
      listener(state);
      return () => {
        listeners.delete(listener);
      };
    },
    dispatch: (action) => {
      const clientActionId = crypto.randomUUID();
      unconfirmedActions.push({ action, clientActionId, status: "waiting" });
      notifyListeners();
      flushActions();
    }
  };
}
function throttle(fn, delay) {
  let lastCall = 0;
  return (...args) => {
    const now = Date.now();
    if (now - lastCall > delay) {
      lastCall = now;
      fn(...args);
    }
  };
}
export {
  setup
};
