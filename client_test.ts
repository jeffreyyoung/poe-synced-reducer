import { setup } from "./client.ts";
import { createTestNetworkInterface } from "./test_utils.ts";
import { assertEquals } from "@std/assert/equals";

Deno.test("main test", async () => {
    const networkInterface = createTestNetworkInterface();
    const spaceId = "test"+Math.random();
    function reducer(state: any, action: any) {
        if (action.type === "increment") {
            return state + 1;
        }
        return state;
    }
    const client1 = setup({
        reducer,
        initialState: 0,
        networkInterface,
        spaceId,
    });
    const client2 = setup({
        reducer,
        initialState: 0,
        networkInterface,
        spaceId,
    });
    await client1.isReady();
    await client2.isReady();
    client1.dispatch({ type: "increment" });
    client2.dispatch({ type: "increment" });
    client1.dispatch({ type: "increment" });
    client2.dispatch({ type: "increment" });

    await sleep(300);
    console.log(client1.getState());
    console.log(client2.getState());
    assertEquals(client1.getState(), 4);
    assertEquals(client2.getState(), 4);
    console.log("client3 start!!!")
    const client3 = setup({
        reducer,
        initialState: 0,
        networkInterface,
        spaceId,
    });
    await client3.isReady();
    await sleep(300);
    assertEquals(client3.getState(), 4);
    client3.dispatch({ type: "increment" });
    await sleep(300);
    assertEquals(client3.getState(), 5);
    assertEquals(client1.getState(), 5);
    assertEquals(client2.getState(), 5);
});

Deno.test("create snapshot works", async () => {
    const networkInterface = createTestNetworkInterface();
    const spaceId = "test"+Math.random();
    function reducer(state: any, action: any) {
        if (action.type === "increment") {
            return state + 1;
        }
        return state;
    }
    const client = setup({
        reducer,
        initialState: 0,
        networkInterface,
        spaceId,
    });
    await client.isReady();
    client.dispatch({ type: "increment" });
    client.dispatch({ type: "increment" });
    client.dispatch({ type: "increment" });
    client.dispatch({ type: "increment" });
    await sleep(300);
    assertEquals(client.getState(), 4);
    await client.createSnapshot();
    await sleep(300);
    assertEquals(client.getState(), 4);
    const client2 = setup({
        reducer,
        initialState: 0,
        networkInterface,
        spaceId,
    });
    await client2.isReady();
    await sleep(300);
    assertEquals(client2.getState(), 4);
    client2.dispatch({ type: "increment" });
    await sleep(300);
    assertEquals(client2.getState(), 5);
    assertEquals(client.getState(), 5);
});

Deno.test("load test", async () => {
    const networkInterface = createTestNetworkInterface();
    const spaceId = "test"+Math.random();
    function reducer(state: any, action: any) {
        if (action.type === "increment") {
            return state + 1;
        }
        if (action.type === "decrement") {
            return state - 1;
        }
        return state;
    }
    const client1 = setup({
        reducer,
        initialState: 0,
        networkInterface,
        spaceId,
    });
    const client2 = setup({ 
        reducer,
        initialState: 0,
        networkInterface,
        spaceId,
    });
    await client1.isReady();
    await client2.isReady();
    for (let i = 0; i < 1000; i++) {
        client1.dispatch({ type: "increment" });
        client2.dispatch({ type: "decrement" });
    }
    client1.dispatch({ type: "increment" });
    await sleep(1000);
    assertEquals(client1.getState(), 1);
    assertEquals(client2.getState(), 1);

    const client3 = setup({
        reducer,
        initialState: 0,
        networkInterface,
        spaceId,
    });
    await client3.isReady();
    assertEquals(client3.getState(), 1);
})

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}