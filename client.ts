import { simpleHash } from "./simpleHash.ts";
import { NetworkInterface, PokeMessage, createServerNetworkInterface } from "./network.ts";
import { ReducerCore } from "./reducer_core.ts";

type SetupOptions = {
    reducer: (state: any, action: any) => any;
    initialState: any;
    networkInterface?: NetworkInterface;
    baseUrl?: string;
    spaceId?: string;
}

type Listener = (state: any) => void;
export function setup(options: SetupOptions) {
    const { spaceId: spaceIdOption, baseUrl } = options;
    
    const listeners: Set<Listener> = new Set();

    const core = new ReducerCore(options.reducer, options.initialState, (state) => {
        // this is called whenever an action is added
        listeners.forEach(listener => listener(state));
    });
    const networkInterface = options.networkInterface ?? createServerNetworkInterface(baseUrl ?? "https://poe-synced-reducer.fly.dev");
    const clientId = crypto.randomUUID();
    const spaceId = spaceIdOption ?? `reducer`+simpleHash(options.reducer.toString());
    // this is used to track which actions have already been pushed
    const clientActionIdToStatus: Record<string, "waiting" | "pending"> = {};
    

    const schedulePull = throttle(() => {
        return networkInterface.pull({ spaceId, lastActionId: core.getHighestConfirmedActionId() ?? -1 }).then((result) => {
            core.processPullResult(result);
        });
    }, 500)
        // initial pull of actions
    const readyPromise = networkInterface
        .getLatestSnapshot({ spaceId })
        .then((result) => {
            core.processSnapshot(result);
        })
        .catch((e) => {
            console.error("error while waiting for initial state", e);
            return true;
        });

    // subscribe to poke messages
    function createSnapshot() {
        const lastActionId = core.getHighestConfirmedActionId() ?? -1;
        if (lastActionId > 50) {
            return networkInterface.createSnapshot({
                spaceId,
                lastActionId,
                state: core.getConfirmedState()
            })
        }
    }
    networkInterface.subscribeToPoke(spaceId, async (data: PokeMessage) => {
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
                    })
                }
            } else {
                schedulePull()
            }
        }
    });

    const pushActions = throttle(async () => {
        const actionsToFlush = core.unconfirmedActions.filter(action => clientActionIdToStatus[action.clientActionId] === "waiting");
        actionsToFlush.forEach(action => {
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
        subscribe: (listener: Listener) => {
            listeners.add(listener);
            listener(core.getState());
            return () => {
                listeners.delete(listener);
            }
        },
        dispatch: (action: any) => {
            const clientActionId = crypto.randomUUID();
            core.addUnconfirmedAction({ action, clientActionId });
            clientActionIdToStatus[clientActionId] = "waiting";
            pushActions();
        },
        getState: () => core.getState(),
        createSnapshot
    }
}


function throttle(fn: (...args: any[]) => void, delay: number) {
    let lastCall = 0;
    let timeoutId: number | undefined;
    let lastArgs: any[] | undefined;

    return (...args: any[]) => {
        const now = Date.now();
        lastArgs = args;

        if (now - lastCall > delay) {
            // If we're past the delay, execute immediately
            lastCall = now;
            fn(...args);
        } else {
            // Schedule the last call to happen after the delay
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            timeoutId = setTimeout(() => {
                lastCall = Date.now();
                fn(...lastArgs!);
                timeoutId = undefined;
            }, delay - (now - lastCall));
        }
    }
}