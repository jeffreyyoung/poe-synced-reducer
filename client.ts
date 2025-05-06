import { simpleHash } from "./simpleHash.ts";
import { NetworkInterface, createAblyNetworkInterface } from "./network.ts";

type SetupOptions = {
    reducer: (state: any, action: any) => any;
    initialState: any;
    networkInterface?: NetworkInterface;
}

type UnconfirmedAction = {
    action: any;
    clientActionId: string;
    status: "waiting" | "pending";
}
type ConfirmedAction = {
    action: any;
    clientActionId: string;
    serverActionId: string;
}

type ActionBatch = {
    type: "actionBatch";
    actions: ConfirmedAction[];
}

type RequestState = {
    type: "requestState";
    fromClientId: string;
}

type StateResponseAction = {
    type: "stateResponse";
    state: any;
    forClientId: string;
}

type PublishedMessage = ActionBatch | RequestState | StateResponseAction;


type Listener = (state: any) => void;
export function setup(options: SetupOptions) {
    const { reducer, initialState } = options;
    const networkInterface = options.networkInterface ?? createAblyNetworkInterface();
    // state is the true server state
    let state = initialState;
    const confirmedActions: ConfirmedAction[] = [];
    // we always rebase these actions on top of the server state
    const unconfirmedActions: UnconfirmedAction[] = [];
    const spaceId = `reducer`+simpleHash(reducer.toString());
    const listeners: Set<Listener> = new Set();

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
        listeners.forEach(listener => listener(newState));
    }
    const clientId = crypto.randomUUID();

    networkInterface.subscribe(spaceId, (data: PublishedMessage) => {
        console.log("received", data);
        if ("type" in data && data.type === "requestState" && data.fromClientId !== clientId) {
            networkInterface.publish(spaceId, { type: "stateResponse", state, forClientId: data.fromClientId } as StateResponseAction);
        }
        if ("type" in data && data.type === "stateResponse") {
            if (data.forClientId === clientId) {
                state = data.state;
                notifyListeners();
            }
        }
        if ("type" in data && data.type === "actionBatch") {
            for (const action of data.actions) {
                const index = unconfirmedActions.findIndex(unconfirmedAction => action.clientActionId === unconfirmedAction?.clientActionId);
                if (index !== -1) {
                    unconfirmedActions.splice(index, 1);
                }
                confirmedActions.push(action);
                state = reducer(state, action.action);
            }
            notifyListeners();
        }
    });
    console.log("setup!!!!")
    // request the initial state
    // in case another client is already connected
    networkInterface.publish(spaceId, { type: "requestState", fromClientId: clientId } as RequestState);

    const flushActions = throttle(() => {
        const actionsToFlush = unconfirmedActions.filter(action => action.status === "waiting");
        actionsToFlush.forEach(action => {
            action.status = "pending";
        });
        networkInterface.publish(spaceId, { type: "actionBatch", actions: actionsToFlush });
    }, 100);


    return {
        subscribe: (listener: Listener) => {
            listeners.add(listener);
            listener(state);
            return () => {
                listeners.delete(listener);
            }
        },
        dispatch: (action: any) => {
            const clientActionId = crypto.randomUUID();
            unconfirmedActions.push({ action, clientActionId, status: "waiting" });
            notifyListeners();
            flushActions();
        },
        getState: () => getStateWithUnconfirmedActions()
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