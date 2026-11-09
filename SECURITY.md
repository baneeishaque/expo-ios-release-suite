# Security

Report vulnerabilities privately through this repository's GitHub security advisory
mechanism or by contacting the maintainer. Do not include API tokens, Apple keys,
or private app content in public issues.

Pin consumers to full release commit SHAs. Use trusted disposable CI checkouts.
Never pass server credentials through `public-env`; those values are bundled into
the client application.

An app's signing, Apple agreements, and EAS permissions remain the responsibility
of its account owners. The suite checks identities and preserves failure status;
it does not bypass provider authorization or review requirements.
