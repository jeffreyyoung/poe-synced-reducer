import { NotYetPushedAction, PullResponse, PushedAction, SnapshotResponse } from "./network.ts";


export class ReducerCore<State = any, Action = any> {
    private state: State;

    confirmedActions: PushedAction[] = [];
    unconfirmedActions: NotYetPushedAction[] = [];


    constructor(private reducer: (state: State, action: Action) => State, private initialState: State, private onStateChange: (state: State) => void) {
        this.state = initialState;
        this.onStateChange = onStateChange;
    }

    processPullResult(result: PullResponse) {
        this.processActions(result.actions);
    }

    processSnapshot(result: SnapshotResponse) {
        this.state = result.state;
        const actionsToProcess = this.#mergeActions(result.actionsSinceLastSnapshot, this.confirmedActions);
        this.confirmedActions = [];
        this.processActions(actionsToProcess);
    }

    #mergeActions(groundTruth: PushedAction[], currentActions: PushedAction[]) {
        const mergedActions: PushedAction[] = groundTruth.slice();
        for (const action of currentActions) {
            if (action.serverActionId === mergedActions.at(-1)!.serverActionId + 1) {
                mergedActions.push(action);
            }
        }
        return mergedActions;
    }

    // returns true if the actions should be pulled
    shouldPull(actions: PushedAction[]) {
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

    addUnconfirmedAction(action: NotYetPushedAction) {
        this.unconfirmedActions.push(action);
        this.onStateChange(this.getState());
    }

    processActions(actions: PushedAction[]) {
        // todo: add some check somewhere that serverActionId is monotonically increasing
        for (const action of actions) {
            this.confirmedActions.push(action);
            const index = this.unconfirmedActions.findIndex(unconfirmedAction => unconfirmedAction.clientActionId === action.clientActionId);
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
}
