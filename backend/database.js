import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const schemaSql = readFileSync(resolve(process.cwd(), 'db', 'schema.sql'), 'utf8');
const schemaStatements = schemaSql
  .split(';')
  .map((statement) => statement.trim())
  .filter(Boolean);
const tableSchemaStatements = schemaStatements.filter((statement) => statement.startsWith('CREATE TABLE'));
const indexSchemaStatements = schemaStatements.filter((statement) => statement.startsWith('CREATE INDEX'));

export const getDatabasePath = () => resolve(process.cwd(), process.env.DB_PATH || './db/padel.sqlite');

const tableExists = (db, tableName) =>
  Boolean(db.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('table', tableName));

const getTableColumns = (db, tableName) => {
  if (!tableExists(db, tableName)) {
    return [];
  }

  return db.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name);
};

const runSchemaStatements = (db, statements, stepLabel) => {
  if (!statements.length) {
    return;
  }

  try {
    db.exec(`${statements.join(';\n')};`);
  } catch (error) {
    throw new Error(`Database bootstrap failed during ${stepLabel}: ${error.message}`);
  }
};

const toIsoIfMissing = (value) => value || new Date().toISOString();

const serializeEventRow = (eventRow) =>
  eventRow
    ? {
        ...eventRow,
        createdAt: eventRow.created_at,
        closedAt: eventRow.closed_at,
        winnerId: eventRow.winner_id,
        scoringWin: eventRow.scoring_win,
        scoringLoss: eventRow.scoring_loss,
        scoringNoShow: eventRow.scoring_no_show,
        rulesVersion: eventRow.rules_version,
      }
    : null;

const serializeCategoryRow = (categoryRow) =>
  categoryRow
    ? {
        ...categoryRow,
        eventId: categoryRow.event_id,
        winnerPairId: categoryRow.winner_pair_id,
        closedAt: categoryRow.closed_at,
        scoringWin: categoryRow.scoring_win,
        scoringLoss: categoryRow.scoring_loss,
        scoringNoShow: categoryRow.scoring_no_show,
        rulesVersion: categoryRow.rules_version,
      }
    : null;

const transformLegacySnapshot = (snapshotJson, eventRow, categoryRow) => {
  let parsedSnapshot = null;

  if (snapshotJson) {
    try {
      parsedSnapshot = JSON.parse(snapshotJson);
    } catch {
      parsedSnapshot = { rawSnapshot: snapshotJson };
    }
  }

  const event = serializeEventRow(eventRow);
  const category = serializeCategoryRow(categoryRow);

  if (parsedSnapshot && parsedSnapshot.event && parsedSnapshot.category) {
    return parsedSnapshot;
  }

  return {
    ...(parsedSnapshot && typeof parsedSnapshot === 'object' ? parsedSnapshot : {}),
    event: parsedSnapshot?.event || event,
    category: parsedSnapshot?.category || category,
    tournament: parsedSnapshot?.tournament || category,
  };
};

const migrateLegacyTournamentModel = (db) => {
  const pairColumns = getTableColumns(db, 'pairs');
  if (!pairColumns.includes('tournament_id') || pairColumns.includes('category_id')) {
    return;
  }

  const events = tableExists(db, 'tournaments') ? db.prepare('SELECT * FROM tournaments ORDER BY created_at ASC, id ASC').all() : [];
  const pairs = db.prepare('SELECT * FROM pairs ORDER BY id ASC').all();
  const groups = db.prepare('SELECT * FROM groups ORDER BY id ASC').all();
  const groupPairs = db.prepare('SELECT * FROM group_pairs ORDER BY group_id ASC, pair_id ASC').all();
  const matches = db.prepare('SELECT * FROM matches ORDER BY id ASC').all();
  const history = db.prepare('SELECT * FROM history ORDER BY archived_at ASC, id ASC').all();

  db.exec('BEGIN IMMEDIATE');

  try {
    db.exec(`
      DROP TABLE IF EXISTS history;
      DROP TABLE IF EXISTS matches;
      DROP TABLE IF EXISTS group_pairs;
      DROP TABLE IF EXISTS groups;
      DROP TABLE IF EXISTS pairs;
      DROP TABLE IF EXISTS categories;
    `);

    runSchemaStatements(db, tableSchemaStatements, 'recreate migrated tables');

    const insertCategory = db.prepare(
      `
        INSERT INTO categories (
          id,
          event_id,
          name,
          status,
          winner_pair_id,
          closed_at,
          scoring_win,
          scoring_loss,
          scoring_no_show,
          rules_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    );

    const insertPair = db.prepare(
      `
        INSERT INTO pairs (id, category_id, name, player_one_id, player_two_id)
        VALUES (?, ?, ?, ?, ?)
      `,
    );

    const insertGroup = db.prepare(
      `
        INSERT INTO groups (id, category_id, name)
        VALUES (?, ?, ?)
      `,
    );

    const insertGroupPair = db.prepare(
      `
        INSERT INTO group_pairs (group_id, pair_id)
        VALUES (?, ?)
      `,
    );

    const insertMatch = db.prepare(
      `
        INSERT INTO matches (
          id,
          category_id,
          stage,
          pair_a_id,
          pair_b_id,
          date,
          time,
          venue,
          score_a,
          score_b,
          sets_a,
          sets_b,
          games_a,
          games_b,
          played,
          winner_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    );

    const insertHistory = db.prepare(
      `
        INSERT INTO history (id, event_id, category_id, archived_at, snapshot_json)
        VALUES (?, ?, ?, ?, ?)
      `,
    );

    const eventById = new Map(events.map((event) => [event.id, event]));

    events.forEach((event) => {
      insertCategory.run(
        event.id,
        event.id,
        event.name,
        event.status || 'Torneo activo',
        event.winner_id || null,
        event.closed_at || null,
        event.scoring_win ?? 1,
        event.scoring_loss ?? 0,
        event.scoring_no_show ?? 0,
        event.rules_version ?? 1,
      );
    });

    pairs.forEach((pair) => {
      insertPair.run(pair.id, pair.tournament_id, pair.name, pair.player_one_id, pair.player_two_id);
    });

    groups.forEach((group) => {
      insertGroup.run(group.id, group.tournament_id, group.name);
    });

    groupPairs.forEach((groupPair) => {
      insertGroupPair.run(groupPair.group_id, groupPair.pair_id);
    });

    matches.forEach((match) => {
      insertMatch.run(
        match.id,
        match.tournament_id,
        match.stage,
        match.pair_a_id,
        match.pair_b_id,
        match.date,
        match.time,
        match.venue,
        match.score_a,
        match.score_b,
        match.sets_a,
        match.sets_b,
        match.games_a,
        match.games_b,
        match.played ?? 0,
        match.winner_id || null,
      );
    });

    history.forEach((row) => {
      const eventRow = eventById.get(row.tournament_id) || null;
      const categoryRow = eventRow
        ? {
            id: eventRow.id,
            event_id: eventRow.id,
            name: eventRow.name,
            status: row.snapshot_json ? 'Torneo archivado' : eventRow.status,
            winner_pair_id: eventRow.winner_id || null,
            closed_at: row.archived_at || eventRow.closed_at || null,
            scoring_win: eventRow.scoring_win ?? 1,
            scoring_loss: eventRow.scoring_loss ?? 0,
            scoring_no_show: eventRow.scoring_no_show ?? 0,
            rules_version: eventRow.rules_version ?? 1,
          }
        : null;

      insertHistory.run(
        row.id,
        row.tournament_id,
        row.tournament_id,
        row.archived_at || toIsoIfMissing(),
        JSON.stringify(transformLegacySnapshot(row.snapshot_json, eventRow, categoryRow)),
      );
    });

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
};

export const openDatabase = () => {
  const dbPath = getDatabasePath();
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new DatabaseSync(dbPath);

  try {
    db.exec('PRAGMA foreign_keys = ON');
    db.exec('PRAGMA journal_mode = WAL');
    runSchemaStatements(db, tableSchemaStatements, 'create tables');

    try {
      migrateLegacyTournamentModel(db);
    } catch (error) {
      throw new Error(`Database bootstrap failed during legacy migration: ${error.message}`);
    }

    runSchemaStatements(db, indexSchemaStatements, 'create indexes');
    return db;
  } catch (error) {
    if (error.message.startsWith('Database bootstrap failed')) {
      throw error;
    }

    throw new Error(`Database bootstrap failed during openDatabase: ${error.message}`);
  }
};
