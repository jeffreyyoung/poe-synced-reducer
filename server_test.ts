import { createServer } from "./server.ts";
import { DatabaseSync } from "node:sqlite";
import { PokeMessage } from "./network.ts";
import { assertEquals } from "@std/assert/equals";
import { assertExists } from "@std/assert/exists";

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