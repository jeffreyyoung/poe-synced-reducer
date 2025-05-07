import { simpleHash } from "./simpleHash.ts";
import { NetworkInterface, PokeMessage, PushedAction, NotYetPushedAction, createServerNetworkInterface } from "./network.ts";

type SetupOptions = {
    reducer: (state: any, action: any) => any;
    initialState: any;
    networkInterface?: NetworkInterface;
    baseUrl?: string;
    spaceId?: string;
}

type Listener = (state: any) => void;

// Deterministic ID generation
function generateDeterministicId(prefix: string, seed: string): string {
    return `${prefix}-${simpleHash(seed)}`;
}

export function setup(options: SetupOptions) {
    const { reducer, initialState, spaceId: spaceIdOption, baseUrl } = options;
    const networkInterface = options.networkInterface ?? createServerNetworkInterface(baseUrl ?? "https://poe-synced-reducer.fly.dev");
    // state is the true server state
    let state = initialState;
    const confirmedActions: PushedAction[] = [];
    const clientId = generateDeterministicId('client', reducer.toString() + initialState.toString());
    // we always rebase these actions on top of the server state
    const unconfirmedActions: NotYetPushedAction[] = [];
    const spaceId = spaceIdOption ?? `reducer`+simpleHash(reducer.toString());
    const listeners: Set<Listener> = new Set();
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
        // log as table
        console.table({
            clientId,
            spaceId,
            state,
            confirmedActions: confirmedActions.length,
            unconfirmedActions: unconfirmedActions.length,
            newState
        })
        listeners.forEach(listener => listener(newState));
    }
    const clientActionIdToStatus: Record<string, "waiting" | "pending"> = {};
    networkInterface.subscribeToPoke(spaceId, (data: PokeMessage) => {
        console.log("received poke", data);
        if (data.type === "actions") {
            processActions(data.actions);
        }
    });

    function processActions(actions: PushedAction[]) {
        console.log("processing actions", actions);
        for (const action of actions) {
            console.log("processing action", action);
            confirmedActions.push(action);
            state = reducer(state, action.action);
            console.log("state", state);
            const index = unconfirmedActions.findIndex(unconfirmedAction => action.clientActionId === unconfirmedAction.clientActionId);
            if (index !== -1) {
                unconfirmedActions.splice(index, 1);
            }
        }
        notifyListeners();
    }
    // request the initial state
    // in case another client is already connected
    const readyPromise = networkInterface.pull({ spaceId, lastActionId: -1 }).then((result) => {
        console.log("pulled actions", result);
        processActions(result.actions);
    });

    const pushActions = throttle(async () => {
        const actionsToFlush = unconfirmedActions.filter(action => clientActionIdToStatus[action.clientActionId] === "waiting");
        console.log("pushing", actionsToFlush);
        actionsToFlush.forEach(action => {
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
        subscribe: (listener: Listener) => {
            listeners.add(listener);
            listener(state);
            return () => {
                listeners.delete(listener);
            }
        },
        dispatch: (action: any) => {
            const clientActionId = generateDeterministicId('action', JSON.stringify(action) + actionCounter++);
            unconfirmedActions.push({ action, clientActionId });
            clientActionIdToStatus[clientActionId] = "waiting";
            notifyListeners();
            pushActions();
        },
        getState: () => getStateWithUnconfirmedActions()
    }
}


function throttle(fn: (...args: any[]) => void, delay: number) {
    let lastCall = 0;
    let timeoutId: number | undefined;
    let lastArgs: any[] | undefined;

    return (...args: any[]) => {
        lastArgs = args;

        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        
        timeoutId = setTimeout(() => {
            fn(...lastArgs!);
            timeoutId = undefined;
        }, delay);
    }
}