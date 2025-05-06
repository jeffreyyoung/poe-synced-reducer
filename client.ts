import Ably from "https://esm.sh/ably@2.7.0";
import { simpleHash } from "./simpleHash.ts";


let ably = new Ably.Realtime(
    "frBw7w.OhTF1A:ZQNStvW9BVmKiVwQ3ZqOtTN8T5-QaIlmkQ5a675c2iM"
  );


type SetupOptions = {
    reducer: (state: any, action: any) => any;
    initialState: any;
}

type UnconfirmedAction = {
    action: any;
    clientActionId: string;
}
type ConfirmedAction = {
    type: "confirmed";
    action: any;
    clientActionId: string;
    serverActionId: string;
}

type RequestState = {
    type: "requestState";
}

type StateResponseAction = {
    type: "stateResponse";
    state: any;
}

type AblyDataType = ConfirmedAction | RequestState | StateResponseAction;


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
        if ("type" in data && data.type === "confirmed") {
            const index = unconfirmedActions.findIndex(action => action.clientActionId === data?.clientActionId);
            if (index !== -1) {
                unconfirmedActions.splice(index, 1);
            }
            confirmedActions.push(data as ConfirmedAction);
            state = reducer(state, data.action);
            notifyListeners();
        }
    });

    // request the initial state
    // in case another client is already connected
    channel.publish(spaceId, { type: "requestState" });




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
            unconfirmedActions.push({ action, clientActionId });
            notifyListeners();
            channel.publish(spaceId, { type: "confirmed", action, clientActionId, serverActionId: crypto.randomUUID() });
        }
    }
}