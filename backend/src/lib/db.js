import pg from "pg";
import { config } from "../config.js";

const { Pool } = pg;

export const db = new Pool({
    connectionString: config.postgresUrl
});

export async function withTransaction(fn) {
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        const result = await fn(client);
        await client.query("COMMIT");
        return result;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}
