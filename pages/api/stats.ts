import { NextApiRequest, NextApiResponse } from "next";
import Redis from "ioredis";

export default async (request: NextApiRequest, response: NextApiResponse) => {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const counts = await get_stats(year, month);
  response.status(200).send(JSON.stringify(counts));
};

const get_stats = async (
  year: number,
  month: number
): Promise<Record<string, number>> => {
  const result: Record<string, number> = {};
  let client = new Redis(process.env.REDIS_URL);
  let cursor = "0";
  let values;
  while (true) {
    [cursor, values] = await client.hscan(`${year}/${month}`, cursor);
    for (let i = 0; i < values.length; i += 2) {
      result[values[i]] = Number(values[i + 1]);
    }
    if (cursor === "0") {
      break;
    }
  }
  return result;
};
