import { NetworkInterface, PokeMessage, PullRequest } from "./network.ts";
import { createServer } from "./server.ts";
import { DatabaseSync } from "node:sqlite";

export function createTestNetworkInterface(): NetworkInterface {
    const listeners: Set<(state: PokeMessage) => void> = new Set();
    const server = createServer(new DatabaseSync(":memory:"), (spaceId, payload) => {
        console.log("received", payload);
        listeners.forEach(listener => listener(payload));
    });
    return {
        createSnapshot: async (args) => {
            const response = await server(new Request("http://localhost/createSnapshot", {
                method: "POST",
                body: JSON.stringify(args),
            }));
            return response.json();
        },
        close: () => {
        },
        getLatestSnapshot: async (args) => {
            const response = await server(new Request("http://localhost/getLatestSnapshot", {
                method: "POST",
                body: JSON.stringify(args),
            }));
            return response.json();
        },
        subscribeToPoke: (spaceId: string, listener: (state: PokeMessage) => void) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        pull: async (args) => {
            const response = await server(new Request("http://localhost/pull", {
                method: "POST",
                body: JSON.stringify(args),
            }));
            return response.json();
        },
        push: async (args) => {
            const response = await server(new Request("http://localhost/push", {
                method: "POST",
                body: JSON.stringify(args),
            }));
            return response.json();
        }
    }
}