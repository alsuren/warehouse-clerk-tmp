import { NextApiRequest, NextApiResponse } from "next";
import Redis from "ioredis";
import fetch from "node-fetch";

const SUPPORTED_ARCHITECTURES = [
  "x86_64-pc-windows-msvc",
  "x86_64-apple-darwin",
  "x86_64-unknown-linux-gnu",
  "aarch64-apple-darwin",
  "aarch64-unknown-linux-gnu"
];

// This is the output of `rustup target list`.
// We might not support building for all platforms yet,
// but it's useful to gather stats.
const ALL_ARCHITECTURES = [
  "aarch64-apple-darwin",
  "aarch64-apple-ios",
  "aarch64-apple-ios-sim",
  "aarch64-fuchsia",
  "aarch64-linux-android",
  "aarch64-pc-windows-msvc",
  "aarch64-unknown-linux-gnu",
  "aarch64-unknown-linux-musl",
  "aarch64-unknown-none",
  "aarch64-unknown-none-softfloat",
  "arm-linux-androideabi",
  "arm-unknown-linux-gnueabi",
  "arm-unknown-linux-gnueabihf",
  "arm-unknown-linux-musleabi",
  "arm-unknown-linux-musleabihf",
  "armebv7r-none-eabi",
  "armebv7r-none-eabihf",
  "armv5te-unknown-linux-gnueabi",
  "armv5te-unknown-linux-musleabi",
  "armv7-linux-androideabi",
  "armv7-unknown-linux-gnueabi",
  "armv7-unknown-linux-gnueabihf",
  "armv7-unknown-linux-musleabi",
  "armv7-unknown-linux-musleabihf",
  "armv7a-none-eabi",
  "armv7r-none-eabi",
  "armv7r-none-eabihf",
  "asmjs-unknown-emscripten",
  "i586-pc-windows-msvc",
  "i586-unknown-linux-gnu",
  "i586-unknown-linux-musl",
  "i686-linux-android",
  "i686-pc-windows-gnu",
  "i686-pc-windows-msvc",
  "i686-unknown-freebsd",
  "i686-unknown-linux-gnu",
  "i686-unknown-linux-musl",
  "mips-unknown-linux-gnu",
  "mips-unknown-linux-musl",
  "mips64-unknown-linux-gnuabi64",
  "mips64-unknown-linux-muslabi64",
  "mips64el-unknown-linux-gnuabi64",
  "mips64el-unknown-linux-muslabi64",
  "mipsel-unknown-linux-gnu",
  "mipsel-unknown-linux-musl",
  "nvptx64-nvidia-cuda",
  "powerpc-unknown-linux-gnu",
  "powerpc64-unknown-linux-gnu",
  "powerpc64le-unknown-linux-gnu",
  "riscv32i-unknown-none-elf",
  "riscv32imac-unknown-none-elf",
  "riscv32imc-unknown-none-elf",
  "riscv64gc-unknown-linux-gnu",
  "riscv64gc-unknown-none-elf",
  "riscv64imac-unknown-none-elf",
  "s390x-unknown-linux-gnu",
  "sparc64-unknown-linux-gnu",
  "sparcv9-sun-solaris",
  "thumbv6m-none-eabi",
  "thumbv7em-none-eabi",
  "thumbv7em-none-eabihf",
  "thumbv7m-none-eabi",
  "thumbv7neon-linux-androideabi",
  "thumbv7neon-unknown-linux-gnueabihf",
  "thumbv8m.base-none-eabi",
  "thumbv8m.main-none-eabi",
  "thumbv8m.main-none-eabihf",
  "wasm32-unknown-emscripten",
  "wasm32-unknown-unknown",
  "wasm32-wasi",
  "x86_64-apple-darwin",
  "x86_64-apple-ios",
  "x86_64-fortanix-unknown-sgx",
  "x86_64-fuchsia",
  "x86_64-linux-android",
  "x86_64-pc-solaris",
  "x86_64-pc-windows-gnu",
  "x86_64-pc-windows-msvc",
  "x86_64-sun-solaris",
  "x86_64-unknown-freebsd",
  "x86_64-unknown-illumos",
  "x86_64-unknown-linux-gnu",
  "x86_64-unknown-linux-gnux32",
  "x86_64-unknown-linux-musl",
  "x86_64-unknown-netbsd",
  "x86_64-unknown-redox",
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
  const day = now.getUTCDate();

  const agent = request.headers["user-agent"] || "null";
  const count = await report_request({
    year,
    month,
    day,
    crate,
    version,
    arch,
    agent,
  });
  response.status(200).send(
    // This response message will only be shown to the user if we failed to
    // fetch the pre-built tarball.
    `We have reported your installation request for ${crate} ${version} on ${arch} so it should be built soon.\n` +
    `It has been requested ${count} times since ${year}-${month}-${day}T00:00:00.000Z.\n`
  );
};

const get_arch = (key: string): string | null => {
  for (const arch of ALL_ARCHITECTURES) {
    if (key.endsWith(arch)) {
      return arch;
    }
  }
  return null;
};

const report_request = async ({
  year,
  month,
  day,
  crate,
  version,
  arch,
  agent,
}: {
  year: number;
  month: number;
  day: number;
  crate: string;
  version: string;
  arch: string;
  agent: string;
}): Promise<number> => {
  let client = new Redis(process.env.REDIS_URL);
  // Forward to rust-based stats server in the background.
  let downstream_promise = fetch('https://cargo-quickinstall-stats-server.fly.dev/record-install?' + new URLSearchParams({
    crate,
    version,
    target: arch,
    agent,
  }), { method: 'POST' });

  let count = 0;

  try {
    await client.hincrby(`agents/${year}/${month}/${day}`, agent, 1);
    count = await client.hincrby(
      `${year}/${month}/${day}`,
      `${crate}/${version}/${arch}`,
      1
    );
  } catch (e) {
    console.warn("redis incr failed:", e)
  }

  try {
    let result = await downstream_promise
    console.log("downstream:", result.status, await (result).text());
  } catch (err) {
    console.log("downstream error:", err)
  }

  return count;
};
