import Ably from "https://esm.sh/ably@2.7.0";

export type NotYetPushedAction = {
    clientActionId: string;
    action: any;
}

export type PushedAction = {
    clientActionId: string;
    serverActionId: number;
    action: any;
}

export type SnapshotRequest = {
    spaceId: string;
    lastActionId: number;
}
export type SnapshotResponse = {
    state: any;
}

export type PullRequest = {
    spaceId: string;
    lastActionId: number;
}

type Snapshot = {
    state: any;
    lastActionId: number;
}

export type PullResponse = {
    actions: PushedAction[];
    snapshot?: Snapshot;
}


export type PushRequest = {
    spaceId: string;
    actions: NotYetPushedAction[];
}
export type PushResponse = {
    actions: PushedAction[];
}

export type PokeMessage = {
    type: "actions";
    actions: PushedAction[];
}

export type CreateSnapshotRequest = {
    spaceId: string;
    lastActionId: number;
    state: any;
}

export type CreateSnapshotResponse = {
    success: boolean;
}

export type NetworkInterface = {
    subscribeToPoke: (spaceId: string, listener: (state: PokeMessage) => void) => () => void;
    pull: (args: PullRequest) => Promise<PullResponse>;
    push: (args: PushRequest) => Promise<PushResponse>;
    createSnapshot: (args: CreateSnapshotRequest) => Promise<CreateSnapshotResponse>;
    close: () => void;
}

export function createServerNetworkInterface(baseUrl: string): NetworkInterface {
    let ably = new Ably.Realtime(
        "Lz62RQ.sXcOOA:VbdVa18igh7V4fUJkwIixabQeF-I7hJAmEIrFJk7akY"
    );
    const offFns: (() => void)[] = [];

    // create ably network interface
    return {
        close: async () => {
            try {
                for (const offFn of offFns) {
                    offFn();
                }
                await ably.close();
                await ably.connection.once("closed")
            } catch (e) {
                console.error("Error closing ably", e);
            }
        },
        subscribeToPoke: (spaceId: string, listener: (state: PokeMessage) => void) => {
            console.log("subscribing to poke", spaceId);
            const channel = ably.channels.get(spaceId);
            channel.subscribe("poke", (message) => {
                const data: PokeMessage = message.data;
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
            }
        },
        push: async (args: PushRequest) => {
            
            const response = await fetch(new Request(baseUrl + "/push", {
                method: "POST",
                body: JSON.stringify(args),
            }));
            if (!response.ok) {
                console.error("Error pushing", response);
                throw new Error("Error pushing");
            }
            const result = await response.json();
            console.log("pushed", result);
            return result;
        },
        createSnapshot: async (args: CreateSnapshotRequest) => {
            const response = await fetch(new Request(baseUrl + "/createSnapshot", {
                method: "POST",
                body: JSON.stringify(args),
            }));
            if (!response.ok) {
                console.error("Error creating snapshot", response);
                throw new Error("Error creating snapshot");
            }
            const result = await response.json();
            console.log("created snapshot", result);
            return result;
        },
        
        pull: async (args: PullRequest) => {
            console.log("pulling", args, baseUrl);
            const response = await fetch(new Request(baseUrl + "/pull", {
                method: "POST",
                body: JSON.stringify(args),
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
    }
}
