import { setup } from "./client.ts";
import { assertEquals } from "@std/assert";
import { createServerNetworkInterface } from "./network.ts";

const url = Deno.env.get("POE_SYNCED_REDUCER_URL") ?? "http://poe-synced-reducer.fly.dev";

const e2eOps = {
    sanitizeResources: false,
    sanitizeOps: false,
}


Deno.test("one client", e2eOps, async () => {
    const initialState = {
        count: 0
    };
    const spaceId = "test-space" + crypto.randomUUID();
    const reducer = (state: any, action: any) => {
        if (action.type === "increment") {
            return { count: state.count + 1 };
        }
        return state;
    };
    const client1 = setup({ reducer, initialState, spaceId, networkInterface: createServerNetworkInterface(url) });
    await client1.isReady();
    assertEquals(client1.getState().count, 0);
    client1.dispatch({ type: "increment" });
    assertEquals(client1.getState().count, 1);
    await sleep(1000);
    assertEquals(client1.getState().count, 1);
    const client2 = setup({ reducer, initialState, spaceId, networkInterface: createServerNetworkInterface(url) });
    await client2.isReady();
    assertEquals(client2.getState().count, 1);
})

Deno.test("e2e test", e2eOps, async () => {
    const initialState = {
        count: 0
    };
    const spaceId = "test-space" + crypto.randomUUID();
    const reducer = (state: any, action: any) => {
        if (action.type === "increment") {
            return { count: state.count + 1 };
        }
        return state;
    };
    const client1 = await setup({ reducer, initialState, spaceId, networkInterface: createServerNetworkInterface(url) });
    const client2 = await setup({ reducer, initialState, spaceId, networkInterface: createServerNetworkInterface(url) });
    assertEquals(client1.getState().count, 0);
    assertEquals(client2.getState().count, 0);
    await client1.isReady();
    await client2.isReady();
    await sleep(200);
    assertEquals(client1.getState().count, 0);
    assertEquals(client2.getState().count, 0);

    const client3 = await setup({ reducer, initialState, spaceId, networkInterface: createServerNetworkInterface(url) });
    await client3.isReady();
    await sleep(200);
    assertEquals(client3.getState().count, 0);
    client1.dispatch({ type: "increment" });
    await sleep(1000);
    assertEquals(client1.getState().count, 1);
    assertEquals(client2.getState().count, 1);
    assertEquals(client3.getState().count, 1);
});


function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

Deno.test("e2e test 2", e2eOps, async () => {
    assertEquals(true, true);    
})