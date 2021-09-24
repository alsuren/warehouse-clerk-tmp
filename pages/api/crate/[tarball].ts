import { NextApiRequest, NextApiResponse } from "next";

const SUPPORTED_ARCHETECTURES = [
  "x86_64-pc-windows-msvc",
  "x86_64-apple-darwin",
  "x86_64-unknown-linux-gnu",
];

export default (request: NextApiRequest, response: NextApiResponse) => {
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
        `Could not extract architecture from ${key}. Supported architectures are: ${SUPPORTED_ARCHETECTURES.join(
          ", "
        )}`
      );
    return;
  }
  const version = key.replace(crate + "-", "").replace("-" + arch, "");

  // This response message will only be shown to the user if we failed to
  // fetch the pre-built tarball.
  response
    .status(200)
    .send(
      `We have reported your installation request for ${crate} ${version} on ${arch} so it should be built soon.`
    );
};

const get_arch = (key: string): string | null => {
  for (const arch of SUPPORTED_ARCHETECTURES) {
    if (key.endsWith(arch)) {
      return arch;
    }
  }
  return null;
};
