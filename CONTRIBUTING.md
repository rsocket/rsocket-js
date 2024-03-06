# Contributing to rsocket-js
We want to make contributing to this project as easy and transparent as
possible, but there are still some kinks to work out. We hope that this guide
answers common questions you may have.

## [Code of Conduct](https://code.facebook.com/codeofconduct)

Facebook has adopted a Code of Conduct that we expect project participants to
adhere to. Please read [the full text](https://code.facebook.com/codeofconduct)
so that you can understand what actions will and will not be tolerated.

## Our Development Process

Some of the core team will be working directly on GitHub. These changes will be
public from the beginning. Other changesets will come via a bridge with
Facebook's internal source control. This is a necessity as it allows engineers
at Facebook outside of the core team to move fast and contribute from an
environment they are comfortable in.

### `master` is unsafe

We will do our best to keep `master` in good shape, with tests passing at all
times. But in order to move fast, we will make API changes that your application
might not be compatible with. We will do our best to communicate these changes
and always version appropriately so you can lock into a specific version if need
be.


## Pull Requests
We actively welcome your pull requests. Changes will be imported and reviewed
internally before being merged. To submit a PR:

1. Fork the repo and create your branch from `master`.
2. If you've added code that should be tested, add tests.
3. If you've changed APIs, update the documentation.
4. Ensure the test suite passes.
5. Make sure your code lints.
6. If you haven't already, complete the Contributor License Agreement ("CLA").

## Contributor License Agreement ("CLA")
In order to accept your pull request, we need you to submit a CLA. You only need
to do this once to work on any of Facebook's open source projects.

Complete your CLA here: <https://code.facebook.com/cla>

## Issues
We use GitHub issues to track public bugs. Please ensure your description is
clear and has sufficient instructions to be able to reproduce the issue.

Facebook has a [bounty program](https://www.facebook.com/whitehat/) for the safe
disclosure of security bugs. In those cases, please go through the process
outlined on that page and do not file a public issue.

## Style Guide

We will eventually have a linter that will catch most styling issues that may
exist in your code. Until then, looking at
[Airbnb's Style Guide](https://github.com/airbnb/javascript) will guide you in
the right direction.

### Code Conventions

* 2 spaces for indentation (no tabs).
* 80 character line length strongly preferred.
* Prefer `'` over `"`.
* ES2015 syntax when possible.
* `'use strict';`.
* Use [Flow types](http://flowtype.org/).
* Use semicolons;
* Trailing commas,
* Avd abbr wrds.

## Development Workflow

All commands listed in this section should be run in the root of the directory.
Ensure that [yarn](https://yarnpkg.com/en/) or `npm` is installed. Example
commands below are for `yarn`.

### Install Dependencies

Install dependencies with:

```
yarn
```

### Test & Type Checks

The following runs Jest (unit tests) and Flow (type checks):

```
yarn test
```

During development you may also run Jest in watch mode, re-executing tests
automatically on file change (this requires Jest to be installed globally):

```
jest --watchAll
```

### Lint

```
yarn run lint
```

### Code Formatting

The project is configured to format code to a uniform style (via
`prettier`) with:

```
yarn run prettier
```

Note that this command reformats files *in place*.


### Build

```
yarn run build
```

Transforms all .js files in `src/` and writes the output file-by-file to
`lib/`, from which you can require them (or execute). This is necessary to
rewrite newer language features to be compatible in older browsers/node
versions.

The build is a work in progress.

### TCK Tests

With a TCK server running, the TCK client tests can be executed with default
options via:

```
yarn run tck
```

The tests can also be run manually with:

```
yarn run build
node packages/rsocket-tck/build/index.js
```

Pass `--help` to see configuration options.

## Releasing

### Step 1: Build

To release a new version you first need to build the various packages.

```bash
yarn run build
```

Before continuing you should validate the build output is as expected.

### Step 2: Bump versions

You can bump versions using the `lerna version` command, and selecting an appropriate next version.

Note: `lerna version` will create and push new git tags.

## Step 3: Publishing

You can publish the locally built packages to npm using the following command.

From the Lerna docs:

> Lerna will compare the version of every package in the repository with the version of it that is published to npm. For
> each package that has a version that is greater than the published version, Lerna will publish that package to npm.

```bash
lerna publish from-package
```

## License
By contributing to rsocket-js, you agree that your contributions will be
licensed under the LICENSE file in the root directory of this source tree.
