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

export type PullResponse = {
    actions: PushedAction[];
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

export type NetworkInterface = {
    subscribeToPoke: (spaceId: string, listener: (state: PokeMessage) => void) => () => void;
    pull: (args: PullRequest) => Promise<PullResponse>;
    push: (args: PushRequest) => Promise<PushResponse>;
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
            
            const response = await fetch(baseUrl + "/push", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(args),
            });
            if (!response.ok) {
                console.error("Error pushing", response);
                throw new Error("Error pushing");
            }
            const result = await response.json();
            console.log("pushed", result);
            return result;
        },
        pull: async (args: PullRequest) => {
            console.log("pulling", args, baseUrl);
            const response = await fetch(baseUrl + "/pull", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(args),
            });
            if (!response.ok) {
                console.error("Error pulling", response);
                throw new Error("Error pulling");
            }
            const result = await response.json();
            console.log("pulled", result);
            return result;
        }
    }
}
