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
    getLatestSnapshot: async (args) => {
      const response = await fetch(new Request(baseUrl + "/getLatestSnapshot", {
        method: "POST",
        body: JSON.stringify(args)
      }));
      if (!response.ok) {
        console.error("Error getting latest snapshot", response);
        throw new Error("Error getting latest snapshot");
      }
      const result = await response.json();
      return result;
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
      const response = await fetch(new Request(baseUrl + "/push", {
        method: "POST",
        body: JSON.stringify(args)
      }));
      if (!response.ok) {
        console.error("Error pushing", response);
        throw new Error("Error pushing");
      }
      const result = await response.json();
      console.log("pushed", result);
      return result;
    },
    createSnapshot: async (args) => {
      const response = await fetch(new Request(baseUrl + "/createSnapshot", {
        method: "POST",
        body: JSON.stringify(args)
      }));
      if (!response.ok) {
        console.error("Error creating snapshot", response);
        throw new Error("Error creating snapshot");
      }
      const result = await response.json();
      console.log("created snapshot", result);
      return result;
    },
    pull: async (args) => {
      console.log("pulling", args, baseUrl);
      const response = await fetch(new Request(baseUrl + "/pull", {
        method: "POST",
        body: JSON.stringify(args)
      }));
      if (!response.ok) {
        const text = await response.text();
        console.error("Error pulling", response, text);
        throw new Error("Error pulling");
      }
      const result = await response.json();
      console.log("pulled", result);
      return result;
    }
  };
}

// reducer_core.ts
var ReducerCore = class {
  constructor(reducer, initialState, onStateChange) {
    this.reducer = reducer;
    this.initialState = initialState;
    this.onStateChange = onStateChange;
    this.state = initialState;
    this.onStateChange = onStateChange;
  }
  state;
  confirmedActions = [];
  unconfirmedActions = [];
  processPullResult(result) {
    this.processActions(result.actions);
  }
  processSnapshot(result) {
    this.state = result.state ?? this.initialState;
    const actionsToProcess = this.#mergeActions(result.actionsSinceLastSnapshot, this.confirmedActions);
    this.confirmedActions = [];
    this.processActions(actionsToProcess);
  }
  #mergeActions(groundTruth, currentActions) {
    const mergedActions = groundTruth.slice();
    for (const action of currentActions) {
      if (action.serverActionId === mergedActions.at(-1).serverActionId + 1) {
        mergedActions.push(action);
      }
    }
    return mergedActions;
  }
  // returns true if the actions should be pulled
  shouldPull(actions) {
    if (actions.length === 0) {
      return true;
    }
    const lastAction = actions.at(-1);
    if (!lastAction) {
      return true;
    }
    if (!this.getHighestConfirmedActionId()) {
      return true;
    }
    if (this.getHighestConfirmedActionId() === lastAction.serverActionId - 1) {
      return true;
    }
    return false;
  }
  getConfirmedState() {
    return this.state;
  }
  getHighestConfirmedActionId() {
    return this.confirmedActions.at(-1)?.serverActionId;
  }
  addUnconfirmedAction(action) {
    this.unconfirmedActions.push(action);
    this.onStateChange(this.getState());
  }
  processActions(actions) {
    for (const action of actions) {
      this.confirmedActions.push(action);
      const index = this.unconfirmedActions.findIndex((unconfirmedAction) => unconfirmedAction.clientActionId === action.clientActionId);
      if (index !== -1) {
        this.unconfirmedActions.splice(index, 1);
      }
      this.state = this.reducer(this.state, action.action);
    }
    this.onStateChange(this.getState());
  }
  getState() {
    let newState = this.state;
    for (const action of this.unconfirmedActions) {
      newState = this.reducer(newState, action.action);
    }
    return newState;
  }
};

// client.ts
function setup(options) {
  const { spaceId: spaceIdOption, baseUrl } = options;
  const listeners = /* @__PURE__ */ new Set();
  const core = new ReducerCore(options.reducer, options.initialState, (state) => {
    listeners.forEach((listener) => listener(state));
  });
  const networkInterface = options.networkInterface ?? createServerNetworkInterface(baseUrl ?? "https://poe-synced-reducer.fly.dev");
  const clientId = crypto.randomUUID();
  const spaceId = spaceIdOption ?? `reducer` + simpleHash(options.reducer.toString());
  const clientActionIdToStatus = {};
  const schedulePull = throttle(() => {
    return networkInterface.pull({ spaceId, lastActionId: core.getHighestConfirmedActionId() ?? -1 }).then((result) => {
      core.processPullResult(result);
    });
  }, 500);
  const readyPromise = networkInterface.getLatestSnapshot({ spaceId }).then((result) => {
    console.log("received initial snapshot", result);
    core.processSnapshot(result);
  }).catch((e) => {
    console.error("error while waiting for initial state", e);
    return true;
  });
  function createSnapshot() {
    const lastActionId = core.getHighestConfirmedActionId() ?? -1;
    if (lastActionId > 50) {
      return networkInterface.createSnapshot({
        spaceId,
        lastActionId,
        state: core.getConfirmedState()
      });
    }
  }
  networkInterface.subscribeToPoke(spaceId, async (data) => {
    console.log("received poke", data);
    await readyPromise;
    if (data.type === "actions") {
      const lastAction = data.actions.at(-1);
      if (!lastAction) {
        console.error("received poke with no actions");
        return;
      }
      if (!core.getHighestConfirmedActionId() || core.getHighestConfirmedActionId() === lastAction.serverActionId - 1) {
        core.processActions(data.actions);
        const lastActionId = core.getHighestConfirmedActionId() ?? -1;
        if (Math.random() > 0.99 && lastActionId > 50) {
          networkInterface.createSnapshot({
            spaceId,
            lastActionId,
            state: core.getConfirmedState()
          });
        }
      } else {
        schedulePull();
      }
    }
  });
  const pushActions = throttle(async () => {
    const actionsToFlush = core.unconfirmedActions.filter((action) => clientActionIdToStatus[action.clientActionId] === "waiting");
    actionsToFlush.forEach((action) => {
      clientActionIdToStatus[action.clientActionId] = "pending";
    });
    await networkInterface.push({ spaceId, actions: actionsToFlush });
  }, 100);
  return {
    clientId,
    networkInterface,
    isReady: async () => {
      await readyPromise;
      return true;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      listener(core.getState());
      return () => {
        listeners.delete(listener);
      };
    },
    dispatch: (action) => {
      const clientActionId = crypto.randomUUID();
      core.addUnconfirmedAction({ action, clientActionId });
      clientActionIdToStatus[clientActionId] = "waiting";
      pushActions();
    },
    getState: () => core.getState(),
    createSnapshot
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
