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

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}