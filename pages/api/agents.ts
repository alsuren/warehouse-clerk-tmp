import { NextApiRequest, NextApiResponse } from "next";
import Redis from "ioredis";

export default async (request: NextApiRequest, response: NextApiResponse) => {
  let year = parseInt(request.query.year?.toString(), 10);
  let month = parseInt(request.query.month?.toString(), 10);
  let day = parseInt(request.query.day?.toString(), 10);
  if (isNaN(year) || year <= 0) {
    const now = new Date();
    year = now.getUTCFullYear();
  }
  if (isNaN(month) || month <= 0) {
    const now = new Date();
    month = now.getUTCMonth() + 1;
  }
  if (isNaN(day) || day <= 0) {
    const now = new Date();
    day = now.getUTCDate();
  }
  const counts = await get_stats(year, month, day);
  response.status(200).send(JSON.stringify(counts));
};

// FIXME: this is copy-pasta from stats.ts. Make a shared helper somewhere instead.
const get_stats = async (
  year: number,
  month: number,
  day: number,
): Promise<Record<string, number>> => {
  const result: Record<string, number> = {};
  let client = new Redis(process.env.REDIS_URL);
  let cursor = "0";
  let values;
  while (true) {
    [cursor, values] = await client.hscan(`agents/${year}/${month}/${day}`, cursor);
    for (let i = 0; i < values.length; i += 2) {
      result[values[i]] = Number(values[i + 1]);
    }
    if (cursor === "0") {
      break;
    }
  }
  return result;
};
