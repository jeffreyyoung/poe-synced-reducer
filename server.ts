import { DatabaseSync } from 'node:sqlite';

import { CreateSnapshotRequest, NotYetPushedAction, PokeMessage, PullRequest, PullResponse, PushedAction, PushRequest, PushResponse, SnapshotRequest, SnapshotResponse } from "./network.ts";

const version = 3;

const spacesTable = `spaces_v${version}`;
const actionsTable = `actions_v${version}`;
const spaceActionCounterTable = `space_action_counter_v${version}`;
const spaceSnapshotTable = `space_snapshot_v${version}`;

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
    db.exec(`CREATE TABLE IF NOT EXISTS ${spaceSnapshotTable} (
        space_id TEXT PRIMARY KEY,
        state TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        lastIncludedActionId INTEGER
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS ${spaceActionCounterTable} (
        space_id TEXT PRIMARY KEY,
        counter INTEGER DEFAULT 0
    )`);
}

function getNextActionId(db: DatabaseSync, spaceId: string): number {
    
    db.prepare(`INSERT OR IGNORE INTO ${spaceActionCounterTable} (space_id, counter) VALUES (?, 0)`).run(spaceId);
    db.prepare(`UPDATE ${spaceActionCounterTable} SET counter = counter + 1 WHERE space_id = ?`).run(spaceId);
    const result = db.prepare(`SELECT counter FROM ${spaceActionCounterTable} WHERE space_id = ?`).get(spaceId) as { counter: number };
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

function createSnapshot(db: DatabaseSync, spaceId: string, lastActionId: number, state: any) {
    db.prepare(`INSERT OR REPLACE INTO ${spaceSnapshotTable} (space_id, state, lastIncludedActionId) VALUES (?, ?, ?)`).run(spaceId, JSON.stringify(state), lastActionId);
}

export function getSnapshot(db: DatabaseSync, spaceId: string): { state: any, lastIncludedActionId: number } | null {
    const snapshot = db.prepare(`SELECT * FROM ${spaceSnapshotTable} WHERE space_id = ?`).get(spaceId) as {
        state: string;
        lastIncludedActionId: number;
    };
    return snapshot ? {
        state: JSON.parse(snapshot.state),
        lastIncludedActionId: snapshot.lastIncludedActionId
    } : null;
}

const corsHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
}
export function createServer(db: DatabaseSync, publish: (spaceId: string, payload: PokeMessage) => void) {
    createTables(db);
    return async (req: Request) => {
        const url = new URL(req.url);
        console.log("request!!!", req.method, url.pathname);
        
        // Handle preflight requests
        if (req.method === "OPTIONS") {
            return new Response(null, {
                headers: {
                    ...corsHeaders,
                    "Access-Control-Allow-Methods": "POST, OPTIONS",
                    "Access-Control-Max-Age": "86400",
                }
            });
        }
        if (url.pathname === "/getLatestSnapshot" && req.method === "POST") {
            const body: SnapshotRequest = await req.json();
            const snapshot = getSnapshot(db, body.spaceId);
            const actionsSinceLastSnapshot = pullActions(db, body.spaceId, snapshot?.lastIncludedActionId ?? -1);
            const response: SnapshotResponse = {
                state: snapshot?.state ?? null,
                actionsSinceLastSnapshot
            }
            return new Response(JSON.stringify(response), { headers: corsHeaders });
        } else if (url.pathname === "/pull" && req.method === "POST") {
            const body: PullRequest = await req.json();
            const response: PullResponse = {
                actions: pullActions(db, body.spaceId, body.lastActionId ?? -1)
            }
            return new Response(JSON.stringify(response), { headers: corsHeaders });
        } else if (url.pathname === "/push" && req.method === "POST") {
            const body: PushRequest = await req.json();
            if (body.actions.length === 0) {
                const response: PushResponse = {
                    actions: []
                }
                return new Response(JSON.stringify(response), { headers: corsHeaders });
            }
            const actions = pushActions(db, body.spaceId, body.actions);
            publish(body.spaceId, { type: "actions", actions });
            const response: PushResponse = {    
                actions
            }
            return new Response(JSON.stringify(response), { headers: corsHeaders });
        } else if (url.pathname === "/createSnapshot" && req.method === "POST") {
            const body: CreateSnapshotRequest = await req.json();
            console.log("createSnapshot", body);
            createSnapshot(db, body.spaceId, body.lastActionId, body.state);
            return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
        } else {
            return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400, headers: corsHeaders });
        }
    }
}