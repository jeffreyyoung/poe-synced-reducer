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

// network.ts
import Ably from "https://esm.sh/ably@2.7.0";
function createAblyNetworkInterface() {
  let ably = new Ably.Realtime(
    "Lz62RQ.sXcOOA:VbdVa18igh7V4fUJkwIixabQeF-I7hJAmEIrFJk7akY"
  );
  return {
    subscribe: (spaceId, listener) => {
      const channel = ably.channels.get(spaceId);
      channel.subscribe((message) => {
        listener(message.data);
      });
      return () => {
        channel.unsubscribe();
      };
    },
    publish: (spaceId, data) => {
      const channel = ably.channels.get(spaceId);
      channel.publish(data);
    }
  };
}

// client.ts
function setup(options) {
  const { reducer, initialState } = options;
  const networkInterface = options.networkInterface ?? createAblyNetworkInterface();
  let state = initialState;
  const confirmedActions = [];
  const unconfirmedActions = [];
  const spaceId = `reducer` + simpleHash(reducer.toString());
  const listeners = /* @__PURE__ */ new Set();
  function getStateWithUnconfirmedActions() {
    let newState = state;
    for (const action of unconfirmedActions) {
      newState = reducer(newState, action.action);
    }
    return newState;
  }
  function notifyListeners() {
    const newState = getStateWithUnconfirmedActions();
    console.log("notifyListeners", newState, state, confirmedActions, unconfirmedActions);
    listeners.forEach((listener) => listener(newState));
  }
  const clientId = crypto.randomUUID();
  networkInterface.subscribe(spaceId, (data) => {
    console.log("received", data);
    if ("type" in data && data.type === "requestState" && data.fromClientId !== clientId) {
      networkInterface.publish(spaceId, { type: "stateResponse", state, forClientId: data.fromClientId });
    }
    if ("type" in data && data.type === "stateResponse") {
      if (data.forClientId === clientId) {
        state = data.state;
        notifyListeners();
      }
    }
    if ("type" in data && data.type === "actionBatch") {
      for (const action of data.actions) {
        const index = unconfirmedActions.findIndex((unconfirmedAction) => action.clientActionId === unconfirmedAction?.clientActionId);
        if (index !== -1) {
          unconfirmedActions.splice(index, 1);
        }
        confirmedActions.push(action);
        state = reducer(state, action.action);
      }
      notifyListeners();
    }
  });
  console.log("setup!!!!");
  networkInterface.publish(spaceId, { type: "requestState", fromClientId: clientId });
  const flushActions = throttle(() => {
    const actionsToFlush = unconfirmedActions.filter((action) => action.status === "waiting");
    actionsToFlush.forEach((action) => {
      action.status = "pending";
    });
    networkInterface.publish(spaceId, { type: "actionBatch", actions: actionsToFlush });
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
    },
    getState: () => getStateWithUnconfirmedActions()
  };
}
function throttle(fn, delay) {
  let lastCall = 0;
  let timeoutId;
  let lastArgs;
  return (...args) => {
    const now = Date.now();
    lastArgs = args;
    if (now - lastCall > delay) {
      lastCall = now;
      fn(...args);
    } else {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        fn(...lastArgs);
        timeoutId = void 0;
      }, delay - (now - lastCall));
    }
  };
}
export {
  setup
};
