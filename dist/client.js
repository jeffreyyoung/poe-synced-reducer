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
function createServerNetworkInterface(baseUrl) {
  let ably = new Ably.Realtime(
    "Lz62RQ.sXcOOA:VbdVa18igh7V4fUJkwIixabQeF-I7hJAmEIrFJk7akY"
  );
  const offFns = [];
  return {
    close: async () => {
      try {
        for (const offFn of offFns) {
          offFn();
        }
        await ably.close();
        await ably.connection.once("closed");
      } catch (e) {
        console.error("Error closing ably", e);
      }
    },
    subscribeToPoke: (spaceId, listener) => {
      console.log("subscribing to poke", spaceId);
      const channel = ably.channels.get(spaceId);
      channel.subscribe("poke", (message) => {
        const data = message.data;
        console.log("received", data);
        if (data?.type === "actions") {
          listener(data);
        } else {
          console.error("Unknown message type", data);
        }
      });
      offFns.push(() => {
        channel.unsubscribe();
      });
      return () => {
        channel.unsubscribe();
      };
    },
    push: async (args) => {
      const response = await fetch(baseUrl + "/push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(args)
      });
      if (!response.ok) {
        console.error("Error pushing", response);
        throw new Error("Error pushing");
      }
      const result = await response.json();
      console.log("pushed", result);
      return result;
    },
    pull: async (args) => {
      console.log("pulling", args, baseUrl);
      const response = await fetch(baseUrl + "/pull", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(args)
      });
      if (!response.ok) {
        console.error("Error pulling", response);
        throw new Error("Error pulling");
      }
      const result = await response.json();
      console.log("pulled", result);
      return result;
    }
  };
}

// client.ts
function generateDeterministicId(prefix, seed) {
  return `${prefix}-${simpleHash(seed)}`;
}
function setup(options) {
  const { reducer, initialState, spaceId: spaceIdOption, baseUrl } = options;
  const networkInterface = options.networkInterface ?? createServerNetworkInterface(baseUrl ?? "https://poe-synced-reducer.fly.dev");
  let state = initialState;
  const confirmedActions = [];
  const clientId = generateDeterministicId("client", reducer.toString() + initialState.toString());
  const unconfirmedActions = [];
  const spaceId = spaceIdOption ?? `reducer` + simpleHash(reducer.toString());
  const listeners = /* @__PURE__ */ new Set();
  let actionCounter = 0;
  function getStateWithUnconfirmedActions() {
    let newState = state;
    for (const action of unconfirmedActions) {
      newState = reducer(newState, action.action);
    }
    return newState;
  }
  function notifyListeners() {
    const newState = getStateWithUnconfirmedActions();
    console.table({
      clientId,
      spaceId,
      state,
      confirmedActions: confirmedActions.length,
      unconfirmedActions: unconfirmedActions.length,
      newState
    });
    listeners.forEach((listener) => listener(newState));
  }
  const clientActionIdToStatus = {};
  networkInterface.subscribeToPoke(spaceId, (data) => {
    console.log("received poke", data);
    if (data.type === "actions") {
      processActions(data.actions);
    }
  });
  function processActions(actions) {
    console.log("processing actions", actions);
    for (const action of actions) {
      console.log("processing action", action);
      confirmedActions.push(action);
      state = reducer(state, action.action);
      console.log("state", state);
      const index = unconfirmedActions.findIndex((unconfirmedAction) => action.clientActionId === unconfirmedAction.clientActionId);
      if (index !== -1) {
        unconfirmedActions.splice(index, 1);
      }
    }
    notifyListeners();
  }
  const readyPromise = networkInterface.pull({ spaceId, lastActionId: -1 }).then((result) => {
    console.log("pulled actions", result);
    processActions(result.actions);
  });
  const pushActions = throttle(async () => {
    const actionsToFlush = unconfirmedActions.filter((action) => clientActionIdToStatus[action.clientActionId] === "waiting");
    console.log("pushing", actionsToFlush);
    actionsToFlush.forEach((action) => {
      clientActionIdToStatus[action.clientActionId] = "pending";
    });
    await networkInterface.push({ spaceId, actions: actionsToFlush });
  }, 100);
  return {
    clientId,
    networkInterface,
    isReady: async () => {
      await readyPromise.catch((e) => {
        console.error("error while waiting for initial state", e);
        return false;
      });
      return true;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      listener(state);
      return () => {
        listeners.delete(listener);
      };
    },
    dispatch: (action) => {
      const clientActionId = generateDeterministicId("action", JSON.stringify(action) + actionCounter++);
      unconfirmedActions.push({ action, clientActionId });
      clientActionIdToStatus[clientActionId] = "waiting";
      notifyListeners();
      pushActions();
    },
    getState: () => getStateWithUnconfirmedActions()
  };
}
function throttle(fn, delay) {
  let lastCall = 0;
  let timeoutId;
  let lastArgs;
  return (...args) => {
    lastArgs = args;
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...lastArgs);
      timeoutId = void 0;
    }, delay);
  };
}
export {
  setup
};
