import { assert } from "@std/assert/assert";
import { setup } from "./client.ts";
import { createTestNetworkInterface } from "./network.ts";

Deno.test("main test", async () => {
    const networkInterface = createTestNetworkInterface(100);
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
    });
    const client2 = setup({
        reducer,
        initialState: 0,
        networkInterface,
    });
    await sleep(1000);
    client1.dispatch({ type: "increment" });
    client2.dispatch({ type: "increment" });
    client1.dispatch({ type: "increment" });
    client2.dispatch({ type: "increment" });

    await sleep(1000);
    console.log(client1.getState());
    console.log(client2.getState());
    assert(client1.getState() === 4);
    assert(client2.getState() === 4);

});

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}