import { DatabaseSync } from 'node:sqlite';

import { NotYetPushedAction, PokeMessage, PullRequest, PushedAction, PushRequest } from "./network.ts";

const version = 3;

const spacesTable = `spaces_v${version}`;
const actionsTable = `actions_v${version}`;

function createTables(db: DatabaseSync) {
    db.exec(`CREATE TABLE IF NOT EXISTS ${spacesTable} (
        id TEXT PRIMARY KEY,
        state TEXT
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS ${actionsTable} (
        serverActionId INTEGER,
        space_id TEXT,
        clientActionId TEXT,
        action TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (space_id, serverActionId)
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS space_action_counter (
        space_id TEXT PRIMARY KEY,
        counter INTEGER DEFAULT 0
    )`);
}

function getNextActionId(db: DatabaseSync, spaceId: string): number {
    db.prepare(`INSERT OR IGNORE INTO space_action_counter (space_id, counter) VALUES (?, 0)`).run(spaceId);
    db.prepare(`UPDATE space_action_counter SET counter = counter + 1 WHERE space_id = ?`).run(spaceId);
    const result = db.prepare(`SELECT counter FROM space_action_counter WHERE space_id = ?`).get(spaceId) as { counter: number };
    console.log('Next action ID for space', spaceId, ':', result.counter);
    return result.counter;
}

function pullActions(db: DatabaseSync, spaceId: string, lastActionId: number) {
    const actions = db.prepare(`SELECT * FROM ${actionsTable} WHERE space_id = ? AND serverActionId > ?`);
    const results = actions.all(spaceId, lastActionId) as Array<{
        clientActionId: string;
        serverActionId: number;
        action: string;
    }>;
    return results.map(row => ({
        clientActionId: row.clientActionId,
        serverActionId: row.serverActionId,
        action: JSON.parse(row.action)
    }));
}

function pushActions(db: DatabaseSync, spaceId: string, actions: NotYetPushedAction[]): PushedAction[] {
    const stmt = db.prepare(`INSERT INTO ${actionsTable} (serverActionId, space_id, clientActionId, action) VALUES (?, ?, ?, ?)`);
    const pushedActions: PushedAction[] = [];
    for (const action of actions) {
        const serverActionId = getNextActionId(db, spaceId);
        console.log('Inserting action with ID:', serverActionId);
        stmt.run(serverActionId, spaceId, action.clientActionId, JSON.stringify(action.action));
        pushedActions.push({
            clientActionId: action.clientActionId,
            serverActionId,
            action: action.action
        });
    }
    console.log('Pushed actions:', pushedActions);
    return pushedActions;
}

export function createServer(db: DatabaseSync, publish: (spaceId: string, payload: PokeMessage) => void) {
    createTables(db);
    return async (req: Request) => {
        const url = new URL(req.url);
        console.log("request!!!", req.method, url.pathname);
        if (url.pathname === "/pull" && req.method === "POST") {
            const body: PullRequest = await req.json();
            const actions = pullActions(db, body.spaceId, body.lastActionId);
            return new Response(JSON.stringify({ actions }));
        } else if (url.pathname === "/push" && req.method === "POST") {
            const body: PushRequest = await req.json();
            const actions = pushActions(db, body.spaceId, body.actions);
            publish(body.spaceId, { type: "actions", actions });
            return new Response(JSON.stringify({ actions }));
        } else {
            return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400 });
        }
    }
}