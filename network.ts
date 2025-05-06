import Ably from "https://esm.sh/ably@2.7.0";

export type NetworkInterface = {
    subscribe: (spaceId: string, listener: (state: any) => void) => () => void;
    publish: (spaceId: string, data: any) => void;
}

export function createAblyNetworkInterface(): NetworkInterface {
    let ably = new Ably.Realtime(
        "Lz62RQ.sXcOOA:VbdVa18igh7V4fUJkwIixabQeF-I7hJAmEIrFJk7akY"
    );

    // create ably network interface
    return {
        subscribe: (spaceId: string, listener: (state: any) => void) => {
            const channel = ably.channels.get(spaceId);
            channel.subscribe((message) => {
                listener(message.data);
            });
            return () => {
                channel.unsubscribe();
            }
        },
        publish: (spaceId: string, data: any) => {
            const channel = ably.channels.get(spaceId);
            channel.publish(data);
        }
    }
}


export function createTestNetworkInterface(delay: number): NetworkInterface {
    let listeners: Set<(data: any) => void> = new Set();

    return {
        subscribe: (spaceId: string, listener: (state: any) => void) => {
            listeners.add(listener);
            console.log("subscribe", listener);
            return () => {
                listeners.delete(listener);
            }
        },
        publish: (spaceId: string, data: any) => {
            console.log("publish", data);
            setTimeout(() => {
                listeners.forEach(listener => listener(data));
            }, delay);
        }
    }
}
