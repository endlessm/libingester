# How to release #

Note: in order to release a new version you need publish permission in
NPM, and push permission in the git repository.

Run `npm run release -- SEMVER`. For example: `npm run release --
patch`. Check `npm version --help` for other possible values of
SEMVER.

This will:
- Bump the library version
- Build the documentation
- Push previous changes to master
- Push a new tag to the "origin" remote
- Publish the library in NPM
