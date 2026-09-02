#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";

const [, , inputPath, outputPath] = process.argv;

if (!inputPath || !outputPath) {
  console.error("Usage: node scripts/build-d1-import.mjs <fasts.json> <output.sql>");
  process.exit(1);
}

const fasts = JSON.parse(await readFile(inputPath, "utf8"));

if (!Array.isArray(fasts) || fasts.length === 0) {
  throw new Error("Expected a non-empty array of fasting records");
}

const escapeSql = (value) => `'${String(value).replaceAll("'", "''")}'`;
const ids = new Set();
const statements = [];

for (const fast of fasts) {
  const id = Number(fast.id);
  const targetDuration = Number(fast.targetDuration);
  const startTime = new Date(fast.startTime);
  const endTime = fast.endTime == null ? null : new Date(fast.endTime);

  if (!Number.isSafeInteger(id) || id <= 0 || ids.has(id)) {
    throw new Error(`Invalid or duplicate id: ${fast.id}`);
  }
  if (!Number.isInteger(targetDuration) || targetDuration < 60 || targetDuration > 10_080) {
    throw new Error(`Invalid target duration for id ${id}`);
  }
  if (Number.isNaN(startTime.getTime()) || (endTime && Number.isNaN(endTime.getTime()))) {
    throw new Error(`Invalid timestamp for id ${id}`);
  }
  if (endTime && endTime < startTime) {
    throw new Error(`End time precedes start time for id ${id}`);
  }

  ids.add(id);
  statements.push(
    `INSERT OR REPLACE INTO fasts (id, start_time, end_time, target_duration) VALUES (${id}, ${escapeSql(startTime.toISOString())}, ${endTime ? escapeSql(endTime.toISOString()) : "NULL"}, ${targetDuration});`,
  );
}

const output = [
  "-- Generated from the private Replit export. Do not commit the generated file.",
  ...statements,
  "",
].join("\n");

await writeFile(outputPath, output, { mode: 0o600 });
console.log(`Prepared ${fasts.length} fasting records for D1 import.`);
