import { createServer } from "./server.ts";
import { DatabaseSync } from "node:sqlite";
import { PokeMessage } from "./network.ts";
import { assertEquals } from "@std/assert/equals";
import { assertExists } from "@std/assert/exists";
import { createTestNetworkInterface } from "./test_utils.ts";

Deno.test("server test", async () => {
    // Create an in-memory database for testing
    const db = new DatabaseSync(":memory:");
    
    // Track published messages
    const publishedMessages: PokeMessage[] = [];
    const publish = (spaceId: string, payload: PokeMessage) => {
        console.log('Publishing message:', payload);
        publishedMessages.push(payload);
    };

    const server = createServer(db, publish);

    // Test initial pull returns no actions
    const initialPullResponse = await server(new Request("http://localhost/pull", {
        method: "POST",
        body: JSON.stringify({
            spaceId: "test-space",
            lastActionId: 0
        })
    }));

    assertEquals<number>(initialPullResponse.status, 200);
    const initialPullResult = await initialPullResponse.json();
    assertExists(initialPullResult.actions);
    assertEquals<number>(initialPullResult.actions.length, 0);

    // Test push endpoint
    const pushResponse = await server(new Request("http://localhost/push", {
        method: "POST",
        body: JSON.stringify({
            spaceId: "test-space",
            actions: [
                { clientActionId: "1", action: { type: "test", data: "test1" } },
                { clientActionId: "2", action: { type: "test", data: "test2" } }
            ]
        })
    }));

    assertEquals<number>(pushResponse.status, 200);
    const pushResult = await pushResponse.json();
    assertExists(pushResult.actions);
    assertEquals<number>(pushResult.actions.length, 2);
    assertEquals<number>(publishedMessages.length, 1);
    assertEquals<number>(publishedMessages[0].actions.length, 2);
    assertEquals<string>(publishedMessages[0].type, "actions");

    // Verify action IDs are sequential
    assertEquals<number>(pushResult.actions[0].serverActionId, 1);
    assertEquals<number>(pushResult.actions[1].serverActionId, 2);

    // Test pull after push returns both actions
    const pullResponse = await server(new Request("http://localhost/pull", {
        method: "POST",
        body: JSON.stringify({
            spaceId: "test-space",
            lastActionId: 0
        })
    }));

    assertEquals<number>(pullResponse.status, 200);
    const pullResult = await pullResponse.json();
    assertExists(pullResult.actions);
    assertEquals<number>(pullResult.actions.length, 2);
    assertEquals<number>(publishedMessages.length, 1);

    // Verify action IDs and data in pull response
    assertEquals<number>(pullResult.actions[0].serverActionId, 1);
    assertEquals<string>(pullResult.actions[0].action.data, "test1");
    assertEquals<number>(pullResult.actions[1].serverActionId, 2);
    assertEquals<string>(pullResult.actions[1].action.data, "test2");

    // Test pull with lastActionId filter
    const pullResponse2 = await server(new Request("http://localhost/pull", {
        method: "POST",
        body: JSON.stringify({
            spaceId: "test-space",
            lastActionId: 1
        })
    }));

    assertEquals<number>(pullResponse2.status, 200);
    const pullResult2 = await pullResponse2.json();
    assertExists(pullResult2.actions);
    assertEquals<number>(pullResult2.actions.length, 1);
    assertEquals<number>(pullResult2.actions[0].serverActionId, 2);
    assertEquals<string>(pullResult2.actions[0].action.data, "test2");

    // Test pull with lastActionId equal to latest action
    const pullResponse3 = await server(new Request("http://localhost/pull", {
        method: "POST",
        body: JSON.stringify({
            spaceId: "test-space",
            lastActionId: 2
        })
    }));

    assertEquals<number>(pullResponse3.status, 200);
    const pullResult3 = await pullResponse3.json();
    assertExists(pullResult3.actions);
    assertEquals<number>(pullResult3.actions.length, 0);

    // Test action IDs are scoped to spaces
    const pushResponse2 = await server(new Request("http://localhost/push", {
        method: "POST",
        body: JSON.stringify({
            spaceId: "test-space-2",
            actions: [
                { clientActionId: "3", action: { type: "test", data: "test3" } }
            ]
        })
    }));

    assertEquals<number>(pushResponse2.status, 200);
    const pushResult2 = await pushResponse2.json();
    assertExists(pushResult2.actions);
    assertEquals<number>(pushResult2.actions.length, 1);
    // Verify action ID starts at 1 for new space
    assertEquals<number>(pushResult2.actions[0].serverActionId, 1);

    // Test invalid endpoint
    const invalidResponse = await server(new Request("http://localhost/invalid", {
        method: "POST",
        body: JSON.stringify({})
    }));

    assertEquals<number>(invalidResponse.status, 400);
    const invalidResult = await invalidResponse.json();
    assertEquals<string>(invalidResult.error, "Invalid request");
});



Deno.test("get latest snapshot works", async () => {
    const networkInterface = createTestNetworkInterface();

    const response = await networkInterface.getLatestSnapshot({ spaceId: "test-space" });
    assertEquals<number>(response.actionsSinceLastSnapshot.length, 0);
    assertEquals<any>(response.state, null);

    await networkInterface.push({ spaceId: "test-space", actions: [{ clientActionId: "1", action: { type: "test", data: "test1" } }] });
    const response2 = await networkInterface.getLatestSnapshot({ spaceId: "test-space" });
    assertEquals<number>(response2.actionsSinceLastSnapshot.length, 1);
    assertEquals<any>(response2.state, null);
    assertEquals<string>(response2.actionsSinceLastSnapshot[0].action.data, "test1");

    await networkInterface.push({ spaceId: "test-space", actions: [{ clientActionId: "2", action: { type: "test", data: "test2" } }] });
    const response3 = await networkInterface.getLatestSnapshot({ spaceId: "test-space" });
    assertEquals<number>(response3.actionsSinceLastSnapshot.length, 2);
    assertEquals<string>(response3.actionsSinceLastSnapshot[1].action.data, "test2");
    assertEquals<number>(response3.actionsSinceLastSnapshot[0].serverActionId, 1);
    assertEquals<number>(response3.actionsSinceLastSnapshot[1].serverActionId, 2);

    await networkInterface.createSnapshot({ spaceId: "test-space", lastActionId: 1, state: { hello: "world" } });
    const response4 = await networkInterface.getLatestSnapshot({ spaceId: "test-space" });
    assertEquals<number>(response4.actionsSinceLastSnapshot.length, 1);
    assertEquals<any>(response4.state, { hello: "world" });
    assertEquals<number>(response4.actionsSinceLastSnapshot[0].serverActionId, 2);

    const response5 = await networkInterface.createSnapshot({ spaceId: "test-space", lastActionId: 2, state: { hello: "world2" } });
    assertEquals<boolean>(response5.success, true);

    const response6 = await networkInterface.getLatestSnapshot({ spaceId: "test-space" });
    assertEquals<number>(response6.actionsSinceLastSnapshot.length, 0);
    assertEquals<any>(response6.state, { hello: "world2" });

    await networkInterface.push({ spaceId: "test-space", actions: [{ clientActionId: "3", action: { type: "test", data: "test3" } }] });
    const response7 = await networkInterface.getLatestSnapshot({ spaceId: "test-space" });
    assertEquals<number>(response7.actionsSinceLastSnapshot.length, 1);
    assertEquals<string>(response7.actionsSinceLastSnapshot[0].action.data, "test3");
    assertEquals<number>(response7.actionsSinceLastSnapshot[0].serverActionId, 3);
})