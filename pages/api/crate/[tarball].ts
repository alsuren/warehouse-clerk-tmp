import { NextApiRequest, NextApiResponse } from "next";
import Redis from "ioredis";

const SUPPORTED_ARCHITECTURES = [
  "x86_64-pc-windows-msvc",
  "x86_64-apple-darwin",
  "x86_64-unknown-linux-gnu",
];

export default async (request: NextApiRequest, response: NextApiResponse) => {
  const tarball = request.query.tarball;
  if (typeof tarball !== "string") {
    response
      .status(403)
      .send(`Could not extract crate information from request`);
    return;
  }
  // FIXME: make the cargo-quickinstall client report crate versions
  // in a more sensible way, and remove this hack.
  const crate = tarball.replace(/-[0-9].*/, "");
  const key = tarball.replace(".tar.gz", "");
  const arch = get_arch(key);
  if (arch === null) {
    response
      .status(403)
      .send(
        `Could not extract architecture from ${key}. Supported architectures are: ${SUPPORTED_ARCHITECTURES.join(
          ", "
        )}`
      );
    return;
  }
  const version = key.replace(crate + "-", "").replace("-" + arch, "");

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const count = await report_request(year, month, crate, version, arch);
  response.status(200).send(
    // This response message will only be shown to the user if we failed to
    // fetch the pre-built tarball.
    `We have reported your installation request for ${crate} ${version} on ${arch} so it should be built soon.\n` +
      `It has been requested ${count} times since ${year}/${month}/1.`
  );
};

const get_arch = (key: string): string | null => {
  for (const arch of SUPPORTED_ARCHITECTURES) {
    if (key.endsWith(arch)) {
      return arch;
    }
  }
  return null;
};

const report_request = (
  year: number,
  month: number,
  crate: string,
  version: string,
  arch: string
): Promise<number> => {
  let client = new Redis(process.env.REDIS_URL);
  return client.hincrby(`${year}/${month}`, `${crate}/${version}/${arch}`, 1);
};
