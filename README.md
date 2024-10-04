# History - RelayBox History Management Service

The history service is one of four core services that keep the core database up to date with the latest data broadcast by the UWS Realtime Service.

## Getting Started

### Prerequisites

- Node.js 20.x
- Docker (optional)

### Configuration

Create a copy of `.env.template` in the root of the project and rename it to `.env`. Adjust the configuration settings to match your local environment. Further information about each environment variable can be found in `.env.template`.

## Installation

To install the necessary packages, simply run...

```
npm install
```

Once complete, the dev environment is ready to go. To start the service, run the following command...

```
npm run dev
```

## Testing

The service unit tests can be found in the `./test` directory. Tests are run using the `vitest` runner.

```
npm run test
```

## About "History"

The "history" service is currently an extremely lightweight service with a cingle task. When a message is saved to the a room's historical messages, the service will lookup the hostory ttl value from the data base and apply it to the key that has been created.

![RelayBox system diagram, highlight History](/assets/system/relaybox-system-history.png)

Room history is stored in Redis as date partitioned sorted sets. Each hour has a unique key consitig of the namesapced room id and the hourly timestamp in the following format;

`YYYY-MM-DDTHHh`

For example, the key for a message saved on 2024-10-03T14:49:14.325Z would be;

`2024-10-03T14h`

By partioning the keys this way, it's possible to apply expiry based on hours at a chosen ttl and maintain a rolling set of messages expiring at the correct time.

The following jobs are handled by the service:

## history:ttl

This job is responsible for looking up the desired history `ttl` for a given application based on the job data being processed. Once located, the process will apply the given `ttl` value to the corresponding key (already created by UWS service).

# Moving Forward

Currently an extremely lightweight process, the history will be extended to manage long term persistance of messages to enable longer term storage of messages.
