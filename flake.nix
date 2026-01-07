{
  description = "WorDuel Development Environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/release-25.11";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = {
    self,
    nixpkgs,
    flake-utils,
  }:
    flake-utils.lib.eachDefaultSystem (
      system: let

        pkgs = import nixpkgs{
          inherit system;
          config.allowUnfree = true;
        };

        ciPackages = with pkgs; [
            nodejs_24
            typescript

            pnpm
            npm-check

            openssl
        ];

        devPackages = with pkgs; [
            nodemon
            typescript-language-server
            eslint

            python314
        ];

      in {
        devShells = {
          ci = pkgs.mkShell {
            packages = ciPackages;
          };

          default = pkgs.mkShell {
            packages = ciPackages ++ devPackages;

            shellHook = ''
              echo "Welcome to your WorDuel Development Environment!"
              echo "Node version: $(node --version)"
            '';
          };
        };
      }
    );
}
