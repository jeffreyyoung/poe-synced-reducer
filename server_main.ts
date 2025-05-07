import { DatabaseSync } from "node:sqlite";
import { createServer } from "./server.ts";
import Ably from "npm:ably@2.8.0";

const ably = new Ably.Realtime(
    "Lz62RQ.sXcOOA:VbdVa18igh7V4fUJkwIixabQeF-I7hJAmEIrFJk7akY"
);

const db = new DatabaseSync(Deno.env.get("SQLITE_DB_PATH") ?? ":memory:");

const server = createServer(db, async (spaceId, payload) => {
    const channel = ably.channels.get(spaceId);
    console.log("publishing", payload);
    await channel.publish("poke", payload);
});

Deno.serve(server);