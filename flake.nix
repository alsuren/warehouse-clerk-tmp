# hacked from https://github.com/rust-skia/rust-skia/blob/master/flake.nix
{
  description = "nix development shell for vecel";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs";
    utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, utils }:
    utils.lib.eachDefaultSystem (system:
      let pkgs = nixpkgs.legacyPackages."${system}";
      in {
        devShells.default = pkgs.mkShell {

          # necessary to override nix's defaults which cannot be overriden as others are
          shellHook = ''
            '';

          nativeBuildInputs = with pkgs; [ 
            pkgs.nodejs-16_x
            pkgs.yarn
            pkgs.nodePackages.vercel
          ] ++ lib.optionals stdenv.isDarwin (with darwin.apple_sdk.frameworks; [
          ]);
        };
      });
}