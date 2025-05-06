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
  "frBw7w.OhTF1A:ZQNStvW9BVmKiVwQ3ZqOtTN8T5-QaIlmkQ5a675c2iM"
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
    if ("type" in data && data.type === "confirmed") {
      const index = unconfirmedActions.findIndex((action) => action.clientActionId === data?.clientActionId);
      if (index !== -1) {
        unconfirmedActions.splice(index, 1);
      }
      confirmedActions.push(data);
      state = reducer(state, data.action);
      notifyListeners();
    }
  });
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
      unconfirmedActions.push({ action, clientActionId });
      notifyListeners();
      channel.publish(spaceId, { type: "confirmed", action, clientActionId, serverActionId: crypto.randomUUID() });
    }
  };
}
export {
  setup
};
