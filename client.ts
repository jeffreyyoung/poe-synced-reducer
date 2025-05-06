import Ably from "https://esm.sh/ably@2.7.0";
import { simpleHash } from "./simpleHash.ts";


let ably = new Ably.Realtime(
    "Lz62RQ.sXcOOA:VbdVa18igh7V4fUJkwIixabQeF-I7hJAmEIrFJk7akY"
  );


type SetupOptions = {
    reducer: (state: any, action: any) => any;
    initialState: any;
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
}

type StateResponseAction = {
    type: "stateResponse";
    state: any;
}

type AblyDataType = ActionBatch | RequestState | StateResponseAction;


type Listener = (state: any) => void;
export function setup(options: SetupOptions) {
    const { reducer, initialState } = options;
    const channel = ably.channels.get("setup");
    // state is the true server state
    let state = initialState;
    const confirmedActions: ConfirmedAction[] = [];
    // we always rebase these actions on top of the server state
    const unconfirmedActions: UnconfirmedAction[] = [];
    const spaceId = `reducer`+simpleHash(reducer.toString());
    const listeners: Set<Listener> = new Set();

    function notifyListeners() {
        let newState = state;
        for (const action of unconfirmedActions) {
            newState = reducer(newState, action.action);
        }
        listeners.forEach(listener => listener(newState));
    }
    
    channel.subscribe(spaceId, (message) => {
        const data = message.data as AblyDataType;
        if ("type" in data && data.type === "requestState") {
            channel.publish(spaceId, { type: "stateResponse", state });
        }
        if ("type" in data && data.type === "stateResponse") {
            state = data.state;
            notifyListeners();
        }
        if ("type" in data && data.type === "actionBatch") {
            for (const action of data.actions) {
                const index = unconfirmedActions.findIndex(unconfirmedAction => action.clientActionId === unconfirmedAction?.clientActionId);
                if (index !== -1) {
                    unconfirmedActions.splice(index, 1);
                }
                confirmedActions.push(action);
                state = reducer(state, action);
            }
            notifyListeners();
        }
    });

    // request the initial state
    // in case another client is already connected
    channel.publish(spaceId, { type: "requestState" });

    const flushActions = throttle(() => {
        const actionsToFlush = unconfirmedActions.filter(action => action.status === "waiting");
        actionsToFlush.forEach(action => {
            action.status = "pending";
        });
        channel.publish(spaceId, { type: "actionBatch", actions: actionsToFlush });
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
        }
    }
}


function throttle(fn: (...args: any[]) => void, delay: number) {
    let lastCall = 0;
    return (...args: any[]) => {
        const now = Date.now();
        if (now - lastCall > delay) {
            lastCall = now;
            fn(...args);
        }
    }
}