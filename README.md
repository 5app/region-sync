# region sync

[![Known Vulnerabilities](https://snyk.io/test/github/5app/region-sync/badge.svg)](https://snyk.io/test/github/5app/region-sync)
[![CircleCI](https://circleci.com/gh/5app/region-sync.svg?style=shield)](https://circleci.com/gh/5app/region-sync)

Wraps SNS/SQS with some boilerplate logic we use for syncing data between regions:

SNS+SQS:

1. structure all messages with `date`, `fromRegion` and JSON encoded `payload`.

SQS:

1. prevents handlers being called if source + dest regions are the same
1. deletes messages after handler has handled (if successful)
1. sets up the continuous long poll

## SQS usage:

```javascript
const {createHandler} = require('@5app/region-sync');
const queueUrl = 'http://localhost:4576/000000000000/fooq';
const handler = createHandler({
	backoffSeconds: 4,
	longPollSeconds: 1,
	currentRegion: 'us-east-1',
});

handler.addQueueHandler(queueUrl, async function (msg) {
	// handle it, but if promise rejects, the message wont be removed.
});
```

## SNS usage:

```javascript
const {createPublisher} = require('@5app/region-sync');
const payload = {foo: 'bar'};
const publisher = createPublisher({
	currentRegion: 'us-east-1',
	snsRegion: 'us-east-1',
});
await publisher.publish(topicArn, payload);
```

## testing

```
LOGS_LEVEL=info npm test
```
